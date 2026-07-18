import { pickAdapter } from '../src/adapters/registry';
import { recordFindings, recordIgnore } from '../src/audit/audit';
import { sha256Hex } from '../src/detection/hash';
import { scanInto } from '../src/detection/scan';
import { VerdictCache } from '../src/detection/verdict-cache';
import { ApprovalStore } from '../src/gate/approval-token';
import { installGate } from '../src/gate/gate';
import { rewrite, SessionNumbering } from '../src/mask/placeholder';
import {
  hideModal,
  hideProtectionDegraded,
  showModal,
  showProtectionDegraded,
} from '../src/ui/mount';
import { debounce } from '../src/util/debounce';

const COLD_HASH = '\0cold';
const L2_TIMEOUT_MS = 4_000; // (estimate) team-test value; U6-b measures the curve

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

        const { rewritten } = rewrite(text, verdict.findings, numbering);
        showModal({
          rewritten,
          summary: summarise(verdict.findings),
          onApprove: async () => {
            adapter.writeText(rewritten);
            const approvedText = adapter.readText() ?? rewritten;
            const hash = await sha256Hex(approvedText);
            approvals.approve(hash, 60_000);
            hashes.set(approvedText, hash);
            hideModal();
          },
          onIgnore: async (reason) => {
            await recordIgnore(verdict.findings, reason);
            hideModal();
          },
        });
      },
    });

    let boundComposer: HTMLElement | null = null;
    const onInput = () => {
      approvals.invalidate();
      const text = adapter.readText();
      if (text) debouncedScan(text);
    };
    const bindComposer = () => {
      const composer = adapter.getComposer();
      if (composer === boundComposer) return;
      boundComposer?.removeEventListener('input', onInput);
      boundComposer = composer;
      boundComposer?.addEventListener('input', onInput);
    };
    bindComposer();
    new MutationObserver(bindComposer).observe(document, { childList: true, subtree: true });

    adapter.onPaste((text) => void scan(text));
  },
});

function summarise(findings: Array<{ cls: string }>) {
  const counts = new Map<string, number>();
  for (const finding of findings) {
    counts.set(finding.cls, (counts.get(finding.cls) ?? 0) + 1);
  }
  return [...counts].map(([cls, count]) => ({ cls, count }));
}
