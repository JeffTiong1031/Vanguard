import { pickAdapter } from '../src/adapters/registry';
import { recordFindings, recordIgnore } from '../src/audit/audit';
import { sha256Hex } from '../src/detection/hash';
import { scanInto } from '../src/detection/scan';
import { VerdictCache } from '../src/detection/verdict-cache';
import { ApprovalStore } from '../src/gate/approval-token';
import { installGate } from '../src/gate/gate';
import { SessionNumbering } from '../src/mask/placeholder';
import { createComposerHints } from '../src/ui/composer-hints';
import {
  hideModal,
  hideProtectionDegraded,
  showModal,
  showProtectionDegraded,
} from '../src/ui/mount';
import { debounce } from '../src/util/debounce';

const COLD_HASH = '\0cold';
// First-run weight download (quantized mBERT NER) routinely exceeds a few seconds on a
// cold cache. 4s caused lasting "protection degraded" with no CSP error — the race lost
// to the download, then every follow-up scan also timed out until a lucky fast hit.
// (estimate) team-test value; U6-b still measures the real curve later.
const L2_TIMEOUT_MS = 120_000;

export default defineContentScript({
  matches: ['https://chatgpt.com/*', 'https://claude.ai/*'],
  runAt: 'document_start',
  world: 'ISOLATED',
  main() {
    const adapter = pickAdapter(location.hostname);
    if (!adapter) return;

    const cache = new VerdictCache();
    const approvals = new ApprovalStore();
    const numbering = new SessionNumbering();
    const hashes = new Map<string, string>();

    const hints = createComposerHints({
      numbering,
      onRewrite: (rewritten) => {
        adapter.writeText(rewritten);
        approvals.invalidate();
        const text = adapter.readText() ?? rewritten;
        hints.update(text);
        void scan(text);
      },
    });

    const scan = async (text: string) => {
      const verdict = await scanInto(cache, text, { l2TimeoutMs: L2_TIMEOUT_MS });
      hashes.set(text, await sha256Hex(text));
      if (verdict.complete) hideProtectionDegraded();
      else showProtectionDegraded();
      if (verdict.state === 'DIRTY') await recordFindings(verdict.findings);
    };
    const debouncedScan = debounce((text: string) => void scan(text), 250);

    installGate({
      cache,
      getComposerText: (_path) => adapter.readText(),
      isSendIntent: (event, path) =>
        (event instanceof KeyboardEvent && event.key === 'Enter' && !event.shiftKey)
        || adapter.isSendControl(path),
      hashOf: (text) => hashes.get(text) ?? COLD_HASH,
      approvedHash: () => approvals.currentHash(),
      onBlocked: async (text) => {
        if (cache.getSync(hashes.get(text) ?? '') == null) await scan(text);
        const verdict = cache.getSync(hashes.get(text) ?? '');
        if (!verdict || verdict.state !== 'DIRTY') return;

        showModal({
          text,
          findings: verdict.findings,
          numbering,
          onProceed: async ({ finalText, ignored }) => {
            for (const row of ignored) {
              await recordIgnore([row.finding], row.reason);
            }
            adapter.writeText(finalText);
            const approvedText = adapter.readText() ?? finalText;
            const hash = await sha256Hex(approvedText);
            approvals.approve(hash, 60_000);
            hashes.set(approvedText, hash);
            // Approval covers ignored originals still present (gate matches hash).
            void scan(approvedText);
            hints.update(approvedText);
            hideModal();
          },
        });
      },
    });

    let boundComposer: HTMLElement | null = null;
    const onInput = () => {
      approvals.invalidate();
      const text = adapter.readText();
      if (text) {
        // L1 hints: sync, no L2 (ADR 0024). Gate scan stays debounced.
        hints.update(text);
        debouncedScan(text);
      } else {
        hints.clear();
      }
    };
    const bindComposer = () => {
      const composer = adapter.getComposer();
      if (composer === boundComposer) return;
      boundComposer?.removeEventListener('input', onInput);
      boundComposer = composer;
      hints.attach(composer);
      boundComposer?.addEventListener('input', onInput);
      const text = adapter.readText();
      if (text) hints.update(text);
      else hints.clear();
    };
    bindComposer();
    new MutationObserver(bindComposer).observe(document, { childList: true, subtree: true });

    adapter.onPaste((text) => {
      hints.update(text);
      void scan(text);
    });
  },
});

