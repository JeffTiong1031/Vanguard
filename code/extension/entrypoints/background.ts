import type { ScanRequest, ScanResponse } from '../src/detection/l2/messages';
import { enrol, refreshPolicy, sendAccessRequest } from '../src/policy/client';
import { queueEvent, flushNow } from '../src/policy/events';
import { isPolicyRequest, type PolicyRequest, type PolicyResponse } from '../src/policy/messages';
import { getCachedPolicy, getEnrolment } from '../src/policy/store';

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
      try {
        await ensureOffscreen();
        const res = (await chrome.runtime.sendMessage(msg)) as ScanResponse;
        sendResponse(res);
      } catch (e) {
        // Without this, a throw becomes an unhandled rejection and the content side only
        // sees a timeout → 'degraded'. Surface the real failure as an l2-result error.
        sendResponse({ kind: 'l2-result', id: msg.id, ok: false, error: String(e) } satisfies ScanResponse);
      }
    })();
    return true;
  });

  // Policy traffic lives HERE, not in the content script. A content script on
  // https://chatgpt.com cannot fetch http:// on a LAN address -- see
  // src/policy/client.ts and spec section 5.4.
  chrome.runtime.onMessage.addListener((msg: PolicyRequest, _s, sendResponse) => {
    if (!isPolicyRequest(msg)) return;
    (async () => {
      try {
        switch (msg.kind) {
          case 'policy-get': {
            const policy = await refreshPolicy();
            void flushNow();
            sendResponse({
              kind: 'policy-result', ok: true,
              policy, enrolment: await getEnrolment(),
            } satisfies PolicyResponse);
            return;
          }
          case 'policy-enrol': {
            const enrolment = await enrol(msg.token);
            sendResponse({
              kind: 'policy-result', ok: true,
              policy: await getCachedPolicy(), enrolment,
            } satisfies PolicyResponse);
            return;
          }
          case 'policy-request-access': {
            await sendAccessRequest(msg.llmId, msg.reason);
            sendResponse({
              kind: 'policy-result', ok: true,
              policy: await getCachedPolicy(), enrolment: await getEnrolment(),
            } satisfies PolicyResponse);
            return;
          }
          case 'policy-event': {
            queueEvent(msg.event);
            sendResponse({
              kind: 'policy-result', ok: true,
              policy: null, enrolment: null,
            } satisfies PolicyResponse);
            return;
          }
        }
      } catch (e) {
        sendResponse({
          kind: 'policy-result', ok: false, error: String(e instanceof Error ? e.message : e),
        } satisfies PolicyResponse);
      }
    })();
    return true;   // keep the message channel open for the async reply
  });
});
