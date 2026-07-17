import type { ScanRequest, ScanResponse } from '../src/detection/l2/messages';

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

export default defineBackground(() => {
  console.info('[vanguard] background alive');

  chrome.runtime.onMessage.addListener((msg: ScanRequest, _s, sendResponse) => {
    if (msg?.kind !== 'l2-scan') return;
    (async () => {
      await ensureOffscreen();
      const res = (await chrome.runtime.sendMessage(msg)) as ScanResponse;
      sendResponse(res);
    })();
    return true;
  });
});
