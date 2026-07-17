// U12 harness — HUD. ISOLATED world, shadow DOM.
//
// Exists so the protocol does not depend on the founder finding DevTools' JS-context dropdown.
// Per doc 05 §1 the spike is worth running because it is cheap; a spike whose results are awkward
// to extract is a spike that gets run once and reported vaguely.
//
// Shadow DOM is non-negotiable per doc 01 §6 — "our styles must not leak into a page we don't own,
// and the page's must not leak into ours." That applies to a throwaway HUD too: a spike that
// restyles ChatGPT is a spike that has changed the thing it is measuring.
//
// Vanilla, not Preact. Doc 01 §6 chose Preact for the real in-page UI because "the modal has real
// state." A log counter does not. The real modal will be Preact; this is not the real modal.

(() => {
  'use strict';
  const API = window.__VANGUARD_U12;
  if (!API) return;

  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;bottom:0;right:0;z-index:2147483647;';
  const root = host.attachShadow({ mode: 'closed' });

  root.innerHTML = `
    <style>
      :host { all: initial; }
      .p { font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace; background:#11161c;
           color:#d6deeb; border:1px solid #2b3440; border-radius:6px 0 0 0; padding:8px 10px;
           min-width:250px; box-shadow:0 -2px 16px rgba(0,0,0,.4); }
      .h { display:flex; justify-content:space-between; align-items:center; gap:10px;
           font-weight:700; color:#7ee787; margin-bottom:6px; }
      .r { display:flex; justify-content:space-between; gap:10px; }
      .k { color:#8b949e; }
      .v { color:#d6deeb; }
      .warn { color:#f0883e; }
      .bad  { color:#ff7b72; }
      .ok   { color:#7ee787; }
      button { font:inherit; cursor:pointer; border-radius:4px; border:1px solid #2b3440;
               background:#1c2430; color:#d6deeb; padding:3px 8px; }
      button:hover { background:#263041; }
      .arm[data-on="true"] { background:#7a1f1f; border-color:#a33; color:#fff; }
      .row { display:flex; gap:6px; margin-top:7px; }
      .note { color:#8b949e; margin-top:6px; font-size:11px; max-width:250px; }
    </style>
    <div class="p">
      <div class="h"><span>U12 harness</span><span id="surf" class="k"></span></div>
      <div class="r"><span class="k">events</span><span class="v" id="n">0</span></div>
      <div class="r"><span class="k">iso@window cap</span><span class="v" id="a">0</span></div>
      <div class="r"><span class="k">react stand-in</span><span class="v" id="b">–</span></div>
      <div class="r"><span class="k">compositions</span><span class="v" id="c">0</span></div>
      <div class="r"><span class="k">page win-cap</span><span class="v" id="d">0</span></div>
      <div class="row">
        <button class="arm" id="arm" data-on="false">ARM</button>
        <button id="copy">Copy JSON</button>
        <button id="reset">Reset</button>
      </div>
      <div class="note" id="note">Observing. ARM suppresses real sends (U12-a step 3).</div>
    </div>`;

  const $ = (id) => root.getElementById(id);
  $('surf').textContent = location.hostname.replace(/^www\./, '');

  const render = () => {
    const a = API.analyse();
    $('n').textContent = a.recorded;
    $('a').textContent = a.u12a.isolatedWindowCaptureFired;
    const beats = a.u12a.isolatedBeatsPageHandler;
    const bEl = $('b');
    bEl.textContent = a.u12a.reactStandinObserved === 0 ? 'not found'
                    : (beats === null ? '?' : (beats ? 'we fire first' : 'THEY FIRE FIRST'));
    bEl.className = 'v ' + (a.u12a.reactStandinObserved === 0 ? 'warn'
                          : (beats === true ? 'ok' : beats === false ? 'bad' : ''));
    const cEl = $('c');
    cEl.textContent = a.u12b.compositionCommitsObserved
      + (a.u12b.dangerousOrderings ? ` (${a.u12b.dangerousOrderings} 🔴)` : '');
    cEl.className = 'v ' + (a.u12b.dangerousOrderings ? 'bad'
                           : a.u12b.compositionCommitsObserved ? 'ok' : '');
    $('d').textContent = a.u12c.pageListenersAtWindowCapture;
    $('d').className = 'v ' + (a.u12c.pageListenersAtWindowCapture ? 'warn' : '');
  };

  $('arm').addEventListener('click', () => {
    const on = API.arm(!API.STATE.armed);
    $('arm').dataset.on = String(on);
    $('arm').textContent = on ? 'ARMED' : 'ARM';
    // Doc 05 §1.2 step 3: suppressing the send is NECESSARY, NOT SUFFICIENT. The machine cannot
    // see a stuck spinner. Say so at the moment of arming, not in a README nobody re-reads.
    $('note').innerHTML = on
      ? '<span class="bad">ARMED.</span> Enter is suppressed (compositions pass through). '
      + 'Now <b>look at the page</b>: a stuck spinner, a React error, or corrupted state means '
      + 'U12-a <b>FAILED</b> even though the send stopped. Doc 05 §1.2.'
      : 'Observing. ARM suppresses real sends (U12-a step 3).';
  });

  $('copy').addEventListener('click', async () => {
    const txt = API.dump();
    try {
      await navigator.clipboard.writeText(txt);
      $('copy').textContent = 'Copied ✓';
    } catch (_) {
      console.log(txt);                     // clipboard perms vary; console always works
      $('copy').textContent = 'See console';
    }
    setTimeout(() => { $('copy').textContent = 'Copy JSON'; }, 1600);
  });

  $('reset').addEventListener('click', () => { API.reset(); render(); });

  API.STATE.onChange = () => { if (!render.q) { render.q = requestAnimationFrame(() => { render.q = 0; render(); }); } };

  const mount = () => { (document.body || document.documentElement).appendChild(host); render(); };
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount, { once: true });
})();
