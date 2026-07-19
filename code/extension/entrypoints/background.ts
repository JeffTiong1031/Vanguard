import { buildRunRequest, type ScanRequest, type ScanResponse } from '../src/detection/l2/messages';
import { loadConfig, type SensitivityConfig } from '../src/detection/l2/sensitivity';
import { recordStatus } from '../src/detection/l2/status-store';

// [verify] WXT output path for entrypoints/offscreen/index.html — confirmed by inspecting a real
// build (dist/chrome-mv3/); see .superpowers/sdd/task-3-report.md for the check.
const OFFSCREEN_URL = 'offscreen.html';

async function ensureOffscreen(): Promise<void> {
  const has = await chrome.offscreen.hasDocument?.();
  if (has) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: [chrome.offscreen.Reason.WORKERS],
    justification: 'Run on-device NER inference in a WASM worker; no data leaves the device.',
  });
}

// 🔴 The service worker owns ALL configuration (ADR 0030). The offscreen document has no
// chrome.storage — measured 2026-07-20 — so it cannot read its own settings, and a read there
// throws in a way the old code reported as "feature off". Cached because scans run at
// keystroke rate; invalidated on change so the options page takes effect without a reload.
let cfgCache: SensitivityConfig | null = null;
async function config(): Promise<SensitivityConfig> {
  if (!cfgCache) cfgCache = await loadConfig();
  return cfgCache;
}

export default defineBackground(() => {
  console.info('[vanguard] background alive');

  chrome.storage.onChanged.addListener(() => { cfgCache = null; });

  chrome.runtime.onMessage.addListener((msg: ScanRequest, _s, sendResponse) => {
    if (msg?.kind !== 'l2-scan') return;
    (async () => {
      try {
        await ensureOffscreen();
        const res = (await chrome.runtime.sendMessage(
          buildRunRequest(msg, await config()),
        )) as ScanResponse;
        // The offscreen document cannot write storage either, so the SW records the engine
        // state for the options page on its behalf.
        if (res.ok) void recordStatus(res.sensitivity);
        sendResponse(res);
      } catch (e) {
        // Without this, a throw becomes an unhandled rejection and the content side only
        // sees a timeout → 'degraded'. Surface the real failure as an l2-result error.
        sendResponse({ kind: 'l2-result', id: msg.id, ok: false, error: String(e) } satisfies ScanResponse);
      }
    })();
    return true;
  });
});
