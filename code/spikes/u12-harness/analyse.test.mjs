// Tests for analyseU12b — `node analyse.test.mjs` (no deps).
//
// 🔴 WHY THIS FILE EXISTS. The first version of the analyser shipped a FALSE 🔴 VERDICT on the first
// real run: it paired each `compositionend` with the NEAREST `Enter` anywhere in the log, and
// reported "compositionend precedes the committing keydown -> a suppression window is REQUIRED" off
// gaps of 3.6s to 40.8s. Those were SEND Enters. Most compositions never commit with Enter at all
// (space, number key, punctuation, mouse click), so the majority were mis-paired.
//
// The founder caught it by reading the MAGNITUDES rather than the verdict — 40 seconds is not one
// key press. Had the same mis-pairing grabbed an Enter 80ms away, it would have looked plausible and
// been believed, and doc 05 §1.3's suppression window — the number that decides whether Chinese
// input works — would have been built out of noise.
//
// CLAUDE.md §2 ledger #10, and it is the first instance that is CODE rather than prose: an
// instrument has connectives too. Every `if` that turns data into a verdict is a "therefore", and
// nobody audits a function the way they audit a sentence. So the analyser gets tests, and case 1 is
// the founder's actual capture.
//
// It loads the REAL iso-gate.js into a stubbed DOM. It does not reimplement the logic — that would
// test the copy, not the code.
import fs from 'node:fs';
import vm from 'node:vm';

const SRC = new URL('./iso-gate.js', import.meta.url);

function load() {
  const listeners = [];
  const clock = { t: 0 };
  const mkTarget = (nodeName) => ({
    addEventListener: (type, fn, o) => listeners.push({ nodeName, type, fn, o }),
  });
  const win = mkTarget('window');
  const sandbox = {
    window: win,
    document: mkTarget('document'),
    performance: { now: () => clock.t },
    navigator: { userAgent: 'test' },
    location: { hostname: 'test.local' },
    console: { info() {}, debug() {} },
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(SRC, 'utf8'), sandbox);
  const API = sandbox.window.__VANGUARD_U12;
  API.STATE.verbose = false;
  // Fire a real event at the real listeners on `window`. Used by the dispatch-driven cases below.
  API.__fire = (type, ev) => {
    clock.t = ev.t ?? clock.t;
    for (const l of listeners) {
      if (l.nodeName !== 'window' || l.type !== type) continue;
      // `source: win` by default — the message listener's first guard is `ev.source !== window`,
      // which is how the MAIN-world probe's records reach the log.
      l.fn({ type, eventPhase: 1, composedPath: () => [], target: undefined, source: win,
             defaultPrevented: false, stopImmediatePropagation() {}, preventDefault() {}, ...ev });
    }
  };
  return API;
}

// Drive the analyser by pushing directly into its log, then reading analyse().u12b.
function run(name, events, expect) {
  const API = load();
  let seq = 0;
  for (const e of events) API.log.push({ at: 'window', seq: seq++, ...e });
  const b = API.analyse().u12b;
  const ok = expect(b);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) console.log('       ', JSON.stringify({
    safe: b.enterWithIsComposingTrue, cand: b.compositionEndFollowedByEnter,
    other: b.compositionEndsCommittedOtherwise, focused: b.focusedCapture,
    verdict: b.verdict.slice(0, 90),
  }, null, 2));
  return ok;
}

let all = true;

// ── 1. THE FOUNDER'S ACTUAL CASE ─────────────────────────────────────────────────────────────
// Composition committed by SPACE, then a real send Enter ~40s later.
// Old analyser: paired them -> "compositionend_then_keydown, gap 40800ms" -> FALSE 🔴 VERDICT.
// New analyser must call this UNPAIRED (committed otherwise) and emit NO dangerous verdict.
all &= run('founder case: space-commit + send Enter 40s later => NOT dangerous', [
  { kind: 'compositionstart', t: 1000 },
  { kind: 'keydown', key: ' ', t: 1900, isComposing: true, keyCode: 229 },
  { kind: 'compositionend', t: 2000 },
  { kind: 'keyup', key: ' ', t: 2050 },
  { kind: 'keydown', key: 'Enter', t: 42800, isComposing: false, keyCode: 13 },
  { kind: 'keyup', key: 'Enter', t: 42850 },
], (b) => b.compositionEndFollowedByEnter === 0
       && b.compositionEndsCommittedOtherwise === 1
       && !/🔴 compositionend PRECEDES/.test(b.verdict));

// ── 2. SAFE ORDERING ─────────────────────────────────────────────────────────────────────────
// keydown(Enter, isComposing=true) -> compositionend -> keyup. We can read isComposing.
all &= run('safe: keydown(isComposing=true) then compositionend => isComposing sufficient', [
  { kind: 'compositionstart', t: 1000 },
  { kind: 'keydown', key: 'Enter', t: 1500, isComposing: true, keyCode: 229 },
  { kind: 'compositionend', t: 1502 },
  { kind: 'keyup', key: 'Enter', t: 1560 },
], (b) => b.enterWithIsComposingTrue === 1
       && b.compositionEndFollowedByEnter === 0
       && /isComposing SUFFICIENT/.test(b.verdict));

// ── 3. GENUINELY DANGEROUS, FOCUSED ──────────────────────────────────────────────────────────
// compositionend -> keydown(Enter, isComposing=false). Same physical press. Verdict must fire.
all &= run('dangerous + focused: compositionend then Enter(isComposing=false) => window REQUIRED', [
  { kind: 'compositionstart', t: 1000 },
  { kind: 'compositionend', t: 1500 },
  { kind: 'keydown', key: 'Enter', t: 1502, isComposing: false, keyCode: 13 },
  { kind: 'keyup', key: 'Enter', t: 1560 },
], (b) => b.compositionEndFollowedByEnter === 1
       && b.focusedCapture === true
       && b.gapDistributionMs[0] === 2
       && /🔴 compositionend PRECEDES/.test(b.verdict));

// ── 4. DANGEROUS BUT UNFOCUSED => NO VERDICT ─────────────────────────────────────────────────
// A mouse-committed candidate is indistinguishable from an Enter-committed one in a messy log.
// The analyser must REFUSE rather than guess.
all &= run('dangerous but unfocused => refuses to emit a verdict or a window', [
  { kind: 'compositionstart', t: 1000 },
  { kind: 'compositionend', t: 1500 },
  { kind: 'keydown', key: 'Enter', t: 1502, isComposing: false, keyCode: 13 },
  { kind: 'keyup', key: 'Enter', t: 1560 },
  { kind: 'compositionstart', t: 3000 },
  { kind: 'compositionend', t: 3500 },
  { kind: 'keydown', key: 'Enter', t: 9000, isComposing: false, keyCode: 13 },
], (b) => b.focusedCapture === false && /AMBIGUOUS CAPTURE/.test(b.verdict));

// ── 5. NOT TESTED ────────────────────────────────────────────────────────────────────────────
all &= run('no compositions => NOT TESTED, not a pass', [
  { kind: 'keydown', key: 'Enter', t: 100, isComposing: false, keyCode: 13 },
], (b) => b.compositionsObserved === 0 && /NOT TESTED/.test(b.verdict));

// ── 6. COMPOSITIONS BUT NONE VIA ENTER => case not exercised ─────────────────────────────────
all &= run('compositions but none committed via Enter => case NOT exercised, not a pass', [
  { kind: 'compositionstart', t: 1000 },
  { kind: 'keydown', key: ' ', t: 1400, isComposing: true, keyCode: 229 },
  { kind: 'compositionend', t: 1500 },
  { kind: 'keyup', key: ' ', t: 1560 },
], (b) => /NOT EXERCISED/.test(b.verdict));

// ═════════════════════════════════════════════════════════════════════════════════════════════════
// DISPATCH-DRIVEN CASES — added 2026-07-17, and the gap they close is the point.
//
// 🔴 Cases 1–6 push straight into the log, so they test the ANALYSER and nothing else. The founder's
// focused ChatGPT capture found TWO bugs and the FIRST ONE WAS IN THE RECORDER: composition events
// were pushed without `at: 'window'`, so the analyser's `r.at === 'window'` filter dropped every one
// of them and U12-b reported `compositionsObserved: 0 → NOT TESTED` on a capture containing a clean,
// complete composition.
//
// Cases 1–6 could never have caught that. They SUPPLIED the missing field themselves — `{ at:
// 'window', ...e }` on line 48 — so the tests were passing precisely the input the recorder failed
// to produce. A test fixture that hand-writes the field under test is testing the fixture.
//
// So these cases go through the real listeners: fire the event, read the verdict. The seam moves out
// to the browser's edge, which is the only place a harness's correctness is actually decided.
// ═════════════════════════════════════════════════════════════════════════════════════════════════

function fire(name, script, expect) {
  const API = load();
  for (const [type, ev] of script) API.__fire(type, ev);
  const out = API.analyse();
  const ok = expect(out.u12b, out);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) console.log('       ', JSON.stringify(out.u12b, null, 2));
  return ok;
}

// ── 7. REGRESSION: the `at` bug ──────────────────────────────────────────────────────────────
// Recorded through the listeners. Fails against the version that omitted `at: 'window'`.
all &= fire('recorder: composition events reach the analyser (at: window)', [
  ['compositionstart', { t: 1000, data: 'ni' }],
  ['compositionend', { t: 1500, data: 'nihao' }],
], (b) => b.compositionsObserved === 1);

// ── 8. THE FOUNDER'S FOCUSED CHATGPT CAPTURE, key: "Process" ─────────────────────────────────
// Microsoft Pinyin, ChatGPT, 2026-07-17:
//   compositionstart -> updates -> keydown(code:"Enter", key:"Process", isComposing:true,
//   keyCode:229) -> compositionend -> keyup
// Fails against BOTH bugs: the `at` bug drops the compositions, and the `key === 'Enter'` matcher
// never sees an Enter whose key value is "Process".
all &= fire('founder\'s focused capture: Process/Enter, safe ordering => isComposing SUFFICIENT', [
  ['compositionstart', { t: 1000, data: 'n' }],
  ['compositionupdate', { t: 1100, data: 'ni' }],
  ['compositionupdate', { t: 1200, data: 'niha' }],
  ['keydown', { t: 1500, key: 'Process', code: 'Enter', isComposing: true, keyCode: 229 }],
  ['compositionend', { t: 1502, data: 'nihao' }],
  ['keyup', { t: 1560, key: 'Enter', code: 'Enter', isComposing: false, keyCode: 13 }],
], (b) => b.compositionsObserved === 1
       && b.entersObserved === 1
       && b.enterWithIsComposingTrue === 1
       && b.compositionEndFollowedByEnter === 0
       && b.focusedCapture === true
       && b.enterKeyValuesSeen.join() === 'Process (Enter)'
       && /isComposing SUFFICIENT/.test(b.verdict));

// ── 9. THE SAME CAPTURE, DANGEROUS ORDERING ──────────────────────────────────────────────────
// The verdict must still fire when `key` is "Process" — i.e. the fix must not have moved the
// blindness rather than removed it.
all &= fire('dangerous ordering survives key:"Process" => window REQUIRED', [
  ['compositionstart', { t: 1000, data: 'n' }],
  ['compositionend', { t: 1500, data: 'nihao' }],
  ['keydown', { t: 1502, key: 'Process', code: 'Enter', isComposing: false, keyCode: 229 }],
  ['keyup', { t: 1560, key: 'Enter', code: 'Enter', isComposing: false, keyCode: 13 }],
], (b) => b.compositionEndFollowedByEnter === 1
       && b.focusedCapture === true
       && b.gapDistributionMs[0] === 2
       && /🔴 compositionend PRECEDES/.test(b.verdict));

// ── 10. A LETTER KEY DURING COMPOSITION IS NOT AN ENTER ──────────────────────────────────────
// `code` discriminates: key:"Process" is reported for EVERY key the IME consumes, so matching on
// key:"Process" alone would count the whole composition as Enters.
all &= fire('key:"Process" on a non-Enter code is not an Enter', [
  ['compositionstart', { t: 1000, data: 'n' }],
  ['keydown', { t: 1100, key: 'Process', code: 'KeyI', isComposing: true, keyCode: 229 }],
  ['keydown', { t: 1200, key: 'Process', code: 'Space', isComposing: true, keyCode: 229 }],
  ['compositionend', { t: 1300, data: 'nihao' }],
  ['keyup', { t: 1360, key: ' ', code: 'Space', isComposing: false, keyCode: 32 }],
], (b) => b.entersObserved === 0
       && b.compositionEndsCommittedOtherwise === 1
       && /NOT EXERCISED/.test(b.verdict));

// ── 11. U20 MUST NOT NAME THE PROMPT ITSELF ──────────────────────────────────────────────────
// The founder's real ChatGPT run: largest body is ANALYTICS (2669B /ces/v1/t); the prompt is
// SMALLER (1882B /backend-api/f/conversation). The old verdict fired "PROMPT TRANSPORT LOOKS LIKE
// HTTP → confirm maxHttpBodyBytes ≈ your prompt" — right conclusion, off a statistic that is not
// the prompt, via a confirmation that FAILS on a correct result.
all &= fire('u20: largest body is analytics => analyser refuses to name the prompt', [
  ['message', { data: { __vanguard: 'u12', kind: 'http-send',
    payload: { transport: 'fetch', method: 'post', path: '/ces/v1/t', bodyBytes: 2669 } } }],
  ['message', { data: { __vanguard: 'u12', kind: 'http-send',
    payload: { transport: 'fetch', method: 'POST', path: '/backend-api/f/conversation', bodyBytes: 1882 } } }],
], (_b, out) => out.u20.maxHttpBodyBytes === 2669
             && out.u20.maxWebSocketFrameBytes === 0
             && /CANNOT TELL WHICH BODY IS YOURS/.test(out.u20.verdict)
             && !/LOOKS LIKE HTTP/.test(out.u20.verdict)
             && out.u20.largestHttpSends[0].path === '/ces/v1/t');

// ── 12. A PROMPT-SIZED WS FRAME STILL FIRES 🔴 ───────────────────────────────────────────────
all &= fire('u20: a prompt-sized WebSocket frame still raises the ADR 0012 blind spot', [
  ['message', { data: { __vanguard: 'u12', kind: 'websocket-send',
    payload: { bytes: 1900 } } }],
], (_b, out) => /STRUCTURALLY BLIND/.test(out.u20.verdict));

console.log(all ? '\nall pass' : '\nFAILURES');
process.exit(all ? 0 : 1);
