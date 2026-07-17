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

    // keyup — added 2026-07-17 after the first real run. NOT decoration.
    //
    // U12-b's ordering test needs to know whether a `compositionend` and an `Enter` are THE SAME
    // PHYSICAL KEY PRESS. Without keyup there is no way to bracket a press, so the first version of
    // analyse() fell back to "find the nearest Enter" — which is a PROXIMITY search, and proximity
    // is not causation. See the correction block in analyseU12b().
    if (name === 'window') {
      node.addEventListener('keyup', (ev) => {
        push({ kind: 'keyup', at: name, key: ev.key, isComposing: ev.isComposing, keyCode: ev.keyCode });
      }, { capture: true });
    }
    node.addEventListener('click', (ev) => {
      // doc 05 §2.3: "Every send path, and the ones that are not keystrokes." The Send BUTTON is a
      // send path and a gate that only watches Enter fails open on it — silently, which is doc 00
      // §6's worst case.
      const path = (typeof ev.composedPath === 'function') ? ev.composedPath() : [];
      const o = path[0];
      const looksLikeSend = o && o.closest && o.closest(
        'button[data-testid*="send" i], button[aria-label*="send" i], button[type="submit"]'
      );
      if (!looksLikeSend) return;
      const rec = push({ kind: 'click-send', at: name, phase: ev.eventPhase,
                         pathOrigin: describe(o), armed: STATE.armed, stopped: false });

      // 🔴 ARMING THE CLICK PATH — added 2026-07-17 after the first real run, and it is a REAL GAP
      // the first version left, not a nicety.
      //
      // The first version recorded click-send and never stopped it, so an armed run still submitted
      // on a mouse click. The founder read that correctly — harness behaviour, not a
      // stopImmediatePropagation() failure. But the CONSEQUENCE is what matters: U12-a's claim is
      // that "stopImmediatePropagation() from the isolated world crosses the world boundary", and
      // the first run proved that for KEYDOWN DISPATCH ONLY. A click on the Send button is a
      // different dispatch into a different React handler, and nothing had tested it.
      //
      // So U12-a was PASS-for-Enter and UNTESTED-for-click, and the harness was the reason. Doc 05
      // §1.1 insists U12's sub-tests be reported separately because their blast radii differ; the
      // same discipline applies one level down — "U12-a passes" must not mean "U12-a passes on the
      // path we happened to arm."
      if (STATE.armed && name === 'window' && ev.eventPhase === 1) {
        ev.stopImmediatePropagation();
        ev.preventDefault();
        rec.stopped = true;
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

  // ── U12-b ─────────────────────────────────────────────────────────────────────────────────────
  //
  // 🔴 REWRITTEN 2026-07-17, AFTER THE FIRST REAL RUN, BECAUSE THE FIRST VERSION WAS WRONG.
  //
  // What it did: for each `compositionend`, find the NEAREST `Enter` keydown anywhere in the log and
  // call that pair an ordering. That is a PROXIMITY search, and proximity is not causation.
  //
  // Why it broke: MOST COMPOSITIONS DO NOT COMMIT WITH ENTER. Microsoft Pinyin commits on space, on
  // a number key, on punctuation, or on a mouse click on a candidate. So most `compositionend`s have
  // no commit-Enter at all — and the old code paired them with whatever Enter existed, which in a
  // real session is a SEND Enter, seconds later. The founder's first run reported
  // `compositionend_then_keydown` — the 🔴 dangerous verdict, the one that says isComposing is
  // insufficient and a suppression window is required — with gaps of 3.6s to 40.8s.
  //
  // 🔴 AND THE LESSON IS BIGGER THAN THE BUG. It was caught because 40.8s is ABSURD. A version of the
  // same bug that grabbed an Enter 80ms away — still not the commit — would have produced a
  // perfectly plausible "dangerous ordering, window ~80ms" AND BEEN BELIEVED, and we would have built
  // a product parameter out of noise. CLAUDE.md §9: "plausible numbers do not get checked.
  // Implausible ones do." An analyser whose failure mode is mis-pairing produces its most dangerous
  // output when it is only slightly wrong.
  //
  // 🔴 SO THE OBVIOUS FIX IS A TRAP. Bounding the search to a time window does not fix the
  // mis-pairing — it converts an absurd number into a plausible one, i.e. it HIDES the bug. The fix
  // has to be causal.
  //
  // The causal rule, which needs no threshold: a compositionend and its committing keydown are THE
  // SAME PHYSICAL KEY PRESS. So the question is not "is there an Enter nearby?" but
  //
  //     "is the NEXT KEY EVENT OF ANY KIND after this compositionend a `keydown: Enter`?"
  //
  // That requires keyup, which the first version did not record. It falls out correctly:
  //
  //   committed by Enter (DANGEROUS):  compositionend → keydown(Enter) → keyup(Enter)
  //                                    next key event IS keydown:Enter        → paired ✅
  //   safe ordering:                   keydown(Enter) → compositionend → keyup(Enter)
  //                                    next key event is keyUP:Enter          → not paired ✅
  //                                    (counted directly via isComposing — no pairing needed)
  //   committed by space:              keydown(Space) → compositionend → keyup(Space) → … Enter
  //                                    next key event is keyup:Space          → not paired ✅
  //   committed by mouse click:        compositionend → (no key events) → … keydown(Enter) later
  //                                    next key event IS keydown:Enter        → paired ❌ WRONG
  //
  // That last row is why `focusedCapture` exists and why the verdict refuses to fire without it: a
  // capture with exactly one composition and one Enter has no attribution ambiguity left to have.
  // The protocol change (PROTOCOL.md step 6) is the real fix; this is the instrument that makes it
  // unambiguous.
  function analyseU12b() {
    // window only — document sees the same events and would double-count the stream.
    const stream = LOG.filter((r) =>
      r.at === 'window' &&
      ['keydown', 'keyup', 'compositionstart', 'compositionend'].includes(r.kind));

    // The SAFE ordering is directly observable and needs no pairing at all: the committing Enter
    // arrived while the IME was still composing, so we can read isComposing and pass it through.
    const safe = stream
      .filter((r) => r.kind === 'keydown' && r.key === 'Enter'
                     && (r.isComposing === true || r.keyCode === 229))
      .map((r) => ({ seq: r.seq, t: r.t, isComposing: r.isComposing, keyCode: r.keyCode }));

    const candidates = [];   // compositionend whose next key event is keydown:Enter
    const unpaired = [];     // compositionend committed some other way — THE EXPECTED MAJORITY
    for (let i = 0; i < stream.length; i++) {
      if (stream[i].kind !== 'compositionend') continue;
      const next = stream.slice(i + 1).find((r) => r.kind === 'keydown' || r.kind === 'keyup');
      if (next && next.kind === 'keydown' && next.key === 'Enter') {
        candidates.push({
          compositionEndSeq: stream[i].seq,
          enterSeq: next.seq,
          gapMs: +(next.t - stream[i].t).toFixed(3),
          isComposing: next.isComposing,
          keyCode: next.keyCode,
        });
      } else {
        unpaired.push({
          compositionEndSeq: stream[i].seq,
          committedBy: next ? `${next.kind}:${next.key}` : 'no subsequent key event (mouse?)',
        });
      }
    }

    const compositions = stream.filter((r) => r.kind === 'compositionend').length;
    const enters = stream.filter((r) => r.kind === 'keydown' && r.key === 'Enter').length;
    // Attribution is only unambiguous when there is nothing to confuse. PROTOCOL.md step 6.
    const focused = compositions === 1 && enters === 1;

    let verdict;
    if (compositions === 0) {
      verdict = 'NOT TESTED — no composition observed. This is the HIGHEST-RISK sub-test and an '
        + 'untested result is NOT a pass. Needs a real IME: Microsoft Pinyin on Windows (doc 05 §1.3 '
        + 'ranks it highest — it is the beachhead\'s Chinese user).';
    } else if (candidates.length === 0 && safe.length > 0) {
      verdict = 'isComposing SUFFICIENT on this IME/platform — the committing Enter arrived with '
        + 'isComposing true, so doc 05 §1.3\'s gate rule works AS WRITTEN and NO suppression window '
        + 'is needed here.';
    } else if (candidates.length === 0 && safe.length === 0) {
      verdict = 'COMPOSITIONS OBSERVED BUT NONE COMMITTED WITH ENTER (' + compositions + ' commits, '
        + 'all via ' + [...new Set(unpaired.map((u) => u.committedBy))].join(' / ') + '). '
        + '🔴 THE CASE UNDER TEST WAS NOT EXERCISED. This is NOT a pass. Redo as a focused capture: '
        + 'Reset → type pinyin → press ENTER to commit the candidate → stop. PROTOCOL.md step 6.';
    } else if (!focused) {
      verdict = '🔴 AMBIGUOUS CAPTURE — ' + candidates.length + ' candidate pairing(s), but this log '
        + 'holds ' + compositions + ' compositions and ' + enters + ' Enters, so a compositionend '
        + 'committed BY MOUSE cannot be distinguished from one committed by the Enter that follows '
        + 'it. NO VERDICT AND NO WINDOW FROM THIS CAPTURE. Redo focused: Reset → ONE composition → '
        + 'ONE Enter → stop. PROTOCOL.md step 6.';
    } else {
      verdict = '🔴 compositionend PRECEDES the committing keydown, in a FOCUSED capture → the '
        + 'committing Enter arrives with isComposing=' + candidates[0].isComposing + ' → it is '
        + 'INDISTINGUISHABLE from a send-intent Enter → doc 05 §1.3\'s post-compositionend '
        + 'suppression window is REQUIRED, and its value comes from gapMs BELOW. Do not invent one.';
    }

    return {
      compositionsObserved: compositions,
      entersObserved: enters,
      focusedCapture: focused,
      // Directly observed, no pairing involved. This is the signal the gate rule actually reads.
      enterWithIsComposingTrue: safe.length,
      safeOrderings: safe,
      // Adjacency-paired, NOT proximity-paired.
      compositionEndFollowedByEnter: candidates.length,
      candidates,
      // 🔴 The number the old analyser silently ate. Most compositions commit via space / number key
      // / mouse — they SHOULD be here, and their presence is not evidence of anything.
      compositionEndsCommittedOtherwise: unpaired.length,
      unpaired,
      verdict,
      gapDistributionMs: candidates.map((c) => c.gapMs).sort((a, b) => a - b),
      note: 'Pairing is by CAUSAL ADJACENCY (next key event), never by proximity. The previous '
          + 'version searched for the nearest Enter anywhere in the log and reported 3.6s–40.8s '
          + '"orderings" that were send Enters, not commits. A time-bounded search would not have '
          + 'fixed that — it would have made the same mis-pairing look plausible.',
    };
  }

  function analyse() {
    const out = { surface: STATE.surface, ua: navigator.userAgent, recorded: LOG.length };

    // U12-a — did our isolated-world capture listener fire before the page's handler?
    const mainRoot = LOG.filter((r) => r.kind === 'main:react-standin-keydown');
    const isoWin = LOG.filter((r) => r.kind === 'keydown' && r.at === 'window' && r.phase === 1);
    const isoDoc = LOG.filter((r) => r.kind === 'keydown' && r.at === 'document' && r.phase === 1);
    const stops = LOG.filter((r) => r.stopped);
    const clickSends = LOG.filter((r) => r.kind === 'click-send');

    out.u12a = {
      isolatedWindowCaptureFired: isoWin.length,
      isolatedDocumentCaptureFired: isoDoc.length,
      // Per-path, because "U12-a passes" must not mean "passes on the path we happened to arm."
      byPath: {
        keydownEnter: {
          observed: isoWin.filter((r) => r.key === 'Enter').length,
          stoppedWhileArmed: stops.filter((r) => r.kind === 'keydown').length,
        },
        clickSendButton: {
          observed: clickSends.length,
          stoppedWhileArmed: stops.filter((r) => r.kind === 'click-send').length,
          note: clickSends.length === 0
            ? 'Send button never clicked in this capture — UNTESTED, not passed.'
            : 'The Send button is a DIFFERENT dispatch from keydown. Doc 05 §2.3: an Enter-only gate '
            + 'fails OPEN on it, silently — doc 00 §6\'s worst case.',
        },
      },
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

    out.u12b = analyseU12b();

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

    // ── U20 — which transport carried the prompt's bytes? ─────────────────────────────────────
    //
    // Added 2026-07-17. The first run produced ChatGPT `websocket-send` records of 62 bytes and no
    // way to attribute them — the founder correctly declined to close U20 on that. The fix is not a
    // tighter timing correlation. It is to stop arguing from timing at all:
    //
    //   A prompt is hundreds to thousands of bytes. 62 bytes cannot carry one, at any compression.
    //   So the question is which transport shows a body the size of the prompt you just sent.
    //
    // PROTOCOL.md step 7 pastes a LONG, INCOMPRESSIBLE prompt precisely so this is decisive rather
    // than suggestive.
    const ws = LOG.filter((r) => r.kind === 'main:websocket-send');
    const http = LOG.filter((r) => r.kind === 'main:http-send');
    const maxWs = ws.reduce((m, r) => Math.max(m, r.bytes || 0), 0);
    const maxHttp = http.reduce((m, r) => Math.max(m, r.bodyBytes || 0), 0);
    out.u20 = {
      webSocketFrames: ws.length,
      maxWebSocketFrameBytes: maxWs,
      httpBodies: http.length,
      maxHttpBodyBytes: maxHttp,
      largestHttpSends: http.slice().sort((a, b) => (b.bodyBytes || 0) - (a.bodyBytes || 0)).slice(0, 5),
      verdict: (ws.length === 0 && http.length === 0)
        ? 'NOT TESTED — no outbound traffic recorded. Send a prompt with the harness loaded.'
        : (maxHttp > maxWs && maxHttp > 200
            ? 'PROMPT TRANSPORT LOOKS LIKE HTTP → ADR 0012\'s webRequest observer SEES it → U20 '
            + 'RESOLVED for this surface. Confirm maxHttpBodyBytes is ≈ the length of the long '
            + 'prompt you pasted (PROTOCOL.md step 7).'
            : (maxWs > 200
                ? '🔴 A WebSocket frame is large enough to carry a prompt → U20 MAY BE REAL for this '
                + 'surface → webRequest sees the handshake, NEVER the frames → the observer would be '
                + 'STRUCTURALLY BLIND here and would need a MAIN-world WebSocket.send patch IN '
                + 'ADDITION — the one thing ADR 0012 was avoiding. Confirm against the long prompt.'
                : 'INCONCLUSIVE — no body large enough to be a prompt was seen on either transport '
                + '(max WS ' + maxWs + 'B, max HTTP ' + maxHttp + 'B). Small WS frames are almost '
                + 'certainly telemetry, and "almost certainly" is not this package\'s standard. '
                + 'Redo with PROTOCOL.md step 7\'s long prompt.')),
      note: 'Argue from SIZE, not from timing. 62-byte frames cannot carry a prompt at any '
          + 'compression; a body ≈ the prompt\'s length can only be the prompt.',
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
