// U12 harness — ISOLATED world.
//
// This is the context the real gate lives in (ADR 0005), and the reason it does is that the verdict
// cache is here, so the gate can read it SYNCHRONOUSLY (doc 01 §0). Everything below exists to
// falsify three claims, not to demonstrate them.
//
//   U12-a  a capture listener here preempts React, and stopImmediatePropagation() crosses into the
//          MAIN world.                                   → doc 05 §1.2.  FAILS = REWORK.
//   U12-b  a composition-commit Enter is distinguishable from a send-intent Enter.
//                                                        → doc 05 §1.3.  FAILS = the wedge breaks.
//   U12-c  nothing above us on the capture path suppresses the event.
//                                                        → doc 05 §1.4.  Mitigated by ADR 0010.
//
// Per doc 05 §1.1 these have three different blast radii and MUST be reported separately.
// "U12 passes" is a sentence with no information in it.
//
// This file asserts nothing. It records. Read RESULTS.u12a.verdict etc. via the HUD.

(() => {
  'use strict';

  const T0 = performance.now();
  const now = () => +(performance.now() - T0).toFixed(3);

  // ── The record ────────────────────────────────────────────────────────────────────────────────
  // One flat, ordered event log. Ordering IS the measurement for U12-a and U12-b, so anything that
  // reorders or coalesces would destroy the result. Push only; never sort.
  const LOG = [];
  const push = (rec) => {
    rec.t = now();
    rec.seq = LOG.length;
    LOG.push(rec);
    if (STATE.verbose) console.debug('[U12]', rec.kind, rec);
    STATE.onChange && STATE.onChange();
    return rec;
  };

  const STATE = {
    armed: false,        // U12-a step 3. OFF by default — arming suppresses real sends.
    verbose: true,
    onChange: null,
    surface: location.hostname,
  };

  const describe = (el) => {
    if (!el || el === window) return 'window';
    if (el === document) return 'document';
    if (!el.tagName) return String(el);
    const id = el.id ? `#${el.id}` : '';
    const cls = (typeof el.className === 'string' && el.className)
      ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.')
      : '';
    const ce = el.isContentEditable ? '[contenteditable]' : '';
    return `${el.tagName.toLowerCase()}${id}${cls}${ce}`;
  };

  // ── U12-a / U12-c — capture listeners ─────────────────────────────────────────────────────────
  //
  // ADR 0010 moved the gate from `document` to `window`. We register at BOTH, so the harness
  // measures the ADR rather than assuming it: if `window` does not in fact fire before `document`
  // on these surfaces, ADR 0010's premise is wrong and we want that in the log, not in a comment.
  //
  // composedPath() and NOT event.target — ADR 0005, non-negotiable: shadow DOM retargets `target`
  // to the host, so `target` lies about whether the event started in the composer. The harness uses
  // it here for the same reason the gate will.

  function record(node, nodeName, ev) {
    const path = (typeof ev.composedPath === 'function') ? ev.composedPath() : [];
    const rec = {
      kind: 'keydown',
      at: nodeName,                        // where OUR listener is
      phase: ev.eventPhase,                // 1 = CAPTURING (what U12-a needs), 2 = AT_TARGET, 3 = BUBBLING
      key: ev.key,
      code: ev.code,
      // U12-b's three signals (doc 05 §1.3). isComposing is the correct one; keyCode 229 is
      // corroborating, not authoritative, and is deprecated.
      isComposing: ev.isComposing,
      keyCode: ev.keyCode,
      // ADR 0005: composedPath()[0] is the REAL origin. target may be a shadow host.
      pathOrigin: describe(path[0]),
      target: describe(ev.target),
      retargeted: path.length > 0 && path[0] !== ev.target,
      defaultPrevented: ev.defaultPrevented,   // did something above us already act?
      armed: STATE.armed,
      stopped: false,
    };

    // ── U12-a step 3 — the real test ──────────────────────────────────────────────────────────
    // Doc 05 §1.2: "Step 3's pass criterion is the real one, and it is stricter than 'the event
    // stopped'... A test that shows the send suppressed but leaves a spinner turning has FALSIFIED
    // the actual claim while appearing to pass." So arming is not the end of the test — the human
    // has to look at the page afterward. PROTOCOL.md step 5 is that instruction.
    //
    // The composition guard is doc 05 §1.3's decided rule, applied here so that arming the harness
    // on a Chinese IME does not simply eat the user's composition and call it a pass.
    if (STATE.armed && ev.key === 'Enter' && nodeName === 'window' && ev.eventPhase === 1) {
      const composing = ev.isComposing || ev.keyCode === 229;
      if (composing) {
        rec.passedThroughAsComposition = true;   // doc 05 §1.3: pass it through. Do NOT stop.
      } else {
        ev.stopImmediatePropagation();
        ev.preventDefault();
        rec.stopped = true;
      }
    }
    return push(rec);
  }

  for (const [node, name] of [[window, 'window'], [document, 'document']]) {
    node.addEventListener('keydown', (ev) => record(node, name, ev), { capture: true });
    node.addEventListener('click', (ev) => {
      // doc 05 §2.3: "Every send path, and the ones that are not keystrokes." The Send BUTTON is a
      // send path and a gate that only watches Enter fails open on it — silently, which is doc 00
      // §6's worst case. Recorded, never stopped: a click-stop would need its own protocol run.
      const path = (typeof ev.composedPath === 'function') ? ev.composedPath() : [];
      const o = path[0];
      const looksLikeSend = o && o.closest && o.closest(
        'button[data-testid*="send" i], button[aria-label*="send" i], button[type="submit"]'
      );
      if (looksLikeSend) {
        push({ kind: 'click-send', at: name, phase: ev.eventPhase, pathOrigin: describe(o) });
      }
    }, { capture: true });
  }

  // ── U12-b — the composition lifecycle ─────────────────────────────────────────────────────────
  //
  // Doc 05 §1.3: "The failure this test exists to find is an ORDERING question, not a capability
  // question." The signals are all available. What is unverified — per IME, per platform — is
  // whether `compositionend` fires BEFORE or AFTER the committing keydown:
  //
  //   keydown(isComposing=true) → compositionend   ✅ we can read isComposing → pass it through.
  //   compositionend → keydown(isComposing=false)  🔴 indistinguishable from send-intent Enter →
  //                                                   we stop it → the composition is SWALLOWED.
  //
  // So we log both with timestamps and let §analyse() state the order it actually observed.
  // No window value is derived here. Doc 05 §1.3: "No window value appears here. It is derived from
  // the U12-b measurement or it does not exist."
  for (const type of ['compositionstart', 'compositionupdate', 'compositionend']) {
    window.addEventListener(type, (ev) => {
      push({ kind: type, data: ev.data ? `<${ev.data.length} chars>` : '', target: describe(ev.target) });
    }, { capture: true });
  }

  // ── U12-c — what the MAIN-world probe found ───────────────────────────────────────────────────
  window.addEventListener('message', (ev) => {
    if (ev.source !== window || !ev.data || ev.data.__vanguard !== 'u12') return;
    push({ kind: 'main:' + ev.data.kind, ...ev.data.payload });
  });

  // ── Analysis ──────────────────────────────────────────────────────────────────────────────────
  // Every verdict below is derived from the log and is allowed to say "inconclusive". A harness that
  // cannot return "inconclusive" is a harness that will return a pass.

  function analyse() {
    const out = { surface: STATE.surface, ua: navigator.userAgent, recorded: LOG.length };

    // U12-a — did our isolated-world capture listener fire before the page's handler?
    const mainRoot = LOG.filter((r) => r.kind === 'main:react-standin-keydown');
    const isoWin = LOG.filter((r) => r.kind === 'keydown' && r.at === 'window' && r.phase === 1);
    const isoDoc = LOG.filter((r) => r.kind === 'keydown' && r.at === 'document' && r.phase === 1);
    const stops = LOG.filter((r) => r.stopped);

    out.u12a = {
      isolatedWindowCaptureFired: isoWin.length,
      isolatedDocumentCaptureFired: isoDoc.length,
      // ADR 0010's premise, measured rather than assumed.
      windowFiresBeforeDocument: (isoWin.length && isoDoc.length)
        ? isoWin[0].seq < isoDoc[0].seq
        : null,
      reactStandinObserved: mainRoot.length,
      // The one arrow the whole architecture rests on (doc 05 §1.2's diagram: ① before ③).
      isolatedBeatsPageHandler: (isoWin.length && mainRoot.length)
        ? isoWin[0].seq < mainRoot[0].seq
        : null,
      armedStops: stops.length,
      // Doc 05 §1.2 step 3: suppression must reach the MAIN world.
      stopCrossedWorldBoundary: stops.length
        ? !LOG.some((r) => r.kind === 'main:react-standin-keydown' && r.afterArmedStop === true)
        : null,
      verdict: 'SEE PROTOCOL.md STEP 5 — the machine cannot judge this one',
      note: 'stopImmediatePropagation() suppressing the send is NECESSARY, not SUFFICIENT. Doc 05 '
          + '§1.2: a run that suppresses the send but leaves a spinner turning has falsified the '
          + 'claim while appearing to pass. A human must look at the page.',
    };

    // U12-b — the ordering, which is the entire test.
    const orderings = [];
    for (let i = 0; i < LOG.length; i++) {
      if (LOG[i].kind !== 'compositionend') continue;
      // the nearest Enter keydown on either side of this commit
      const before = [...LOG.slice(0, i)].reverse()
        .find((r) => r.kind === 'keydown' && r.key === 'Enter' && r.at === 'window');
      const after = LOG.slice(i)
        .find((r) => r.kind === 'keydown' && r.key === 'Enter' && r.at === 'window');
      const dBefore = before ? LOG[i].t - before.t : Infinity;
      const dAfter = after ? after.t - LOG[i].t : Infinity;
      if (dBefore === Infinity && dAfter === Infinity) continue;
      orderings.push(dBefore <= dAfter
        ? { order: 'keydown_then_compositionend', gapMs: +dBefore.toFixed(3), isComposing: before.isComposing, keyCode: before.keyCode }
        : { order: 'compositionend_then_keydown', gapMs: +dAfter.toFixed(3), isComposing: after.isComposing, keyCode: after.keyCode });
    }
    const dangerous = orderings.filter((o) => o.order === 'compositionend_then_keydown');
    out.u12b = {
      compositionCommitsObserved: orderings.length,
      orderings,
      // The 🔴 case: the committing Enter arrives with isComposing === false, so it is
      // indistinguishable from a send-intent Enter. This is the one that breaks Chinese input.
      dangerousOrderings: dangerous.length,
      anyCommitWithIsComposingFalse: orderings.some((o) => o.isComposing === false),
      keyCode229SeenAsFallback: orderings.some((o) => o.keyCode === 229),
      verdict: orderings.length === 0
        ? 'NOT TESTED — no composition observed. This is the highest-risk sub-test and an untested '
        + 'result is not a pass. You need a real IME (Microsoft Pinyin on Windows — doc 05 §1.3 '
        + 'ranks it HIGHEST because it is the beachhead\'s Chinese user).'
        : (dangerous.length === 0
            ? 'isComposing SUFFICIENT so far on this IME/platform — the gate rule works as written'
            : 'compositionend PRECEDES the committing keydown → isComposing is NOT sufficient here → '
            + 'doc 05 §1.3\'s post-compositionend suppression window is REQUIRED, and its value comes '
            + 'from THIS log (see gapMs). Do not invent one.'),
      // Doc 05 §1.3 says the window value is derived from this measurement or does not exist.
      // We report the distribution and refuse to pick.
      gapDistributionMs: orderings.map((o) => o.gapMs).sort((a, b) => a - b),
    };

    // U12-c — the inventory. Doc 05 §1.4 step 1: "This is data, not a pass/fail."
    const inv = LOG.filter((r) => r.kind === 'main:listener-registered');
    out.u12c = {
      pageListenersAtWindowCapture: inv.filter((r) => r.node === 'window' && r.capture).length,
      pageListenersAtDocumentCapture: inv.filter((r) => r.node === 'document' && r.capture).length,
      inventory: inv,
      verdict: inv.length === 0
        ? 'INCONCLUSIVE — the MAIN-world probe registered nothing. Either the surface truly adds no '
        + 'window/document listeners (possible) or the probe did not land before the page scripts '
        + '(see PROTOCOL.md step 0). Do not read this as a pass.'
        : 'See inventory. ADR 0010 puts us at window at document_start; a page script structurally '
        + 'cannot precede a document_start content script — [unverified] as an absolute, and this '
        + 'inventory is what measures it.',
    };

    out.log = LOG;
    return out;
  }

  // Exposed on the ISOLATED world's global. In DevTools you must switch the console's JS context
  // from "top" to this extension — PROTOCOL.md step 1 says how. The HUD's Copy button exists so
  // that step is optional.
  window.__VANGUARD_U12 = {
    STATE,
    log: LOG,
    analyse,
    arm: (v = true) => { STATE.armed = v; push({ kind: 'armed', value: v }); return STATE.armed; },
    dump: () => JSON.stringify(analyse(), null, 2),
    reset: () => { LOG.length = 0; },
  };

  console.info(
    '%c[U12 harness]%c loaded in ISOLATED world on ' + STATE.surface
    + '\nObserving. NOT armed — arming suppresses real sends (U12-a step 3).'
    + '\nHUD is bottom-right. Or: __VANGUARD_U12.dump()',
    'background:#1f6f3f;color:#fff;padding:2px 4px;border-radius:2px', ''
  );
})();
