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
  const mkTarget = () => ({ addEventListener: (t, fn, o) => listeners.push({ t, fn, o }) });
  const win = mkTarget();
  const sandbox = {
    window: win,
    document: mkTarget(),
    performance: { now: () => 0 },
    navigator: { userAgent: 'test' },
    location: { hostname: 'test.local' },
    console: { info() {}, debug() {} },
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(SRC, 'utf8'), sandbox);
  return sandbox.window.__VANGUARD_U12;
}

// Drive the analyser by pushing directly into its log, then reading analyse().u12b.
function run(name, events, expect) {
  const API = load();
  API.STATE.verbose = false;
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

console.log(all ? '\nall pass' : '\nFAILURES');
process.exit(all ? 0 : 1);
