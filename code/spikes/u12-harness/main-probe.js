// U12 harness — MAIN world.
//
// 🔴 READ THIS BEFORE COPYING ANYTHING HERE INTO THE PRODUCT.
//
// Phase 0 injects NOTHING into the MAIN world. ADR 0012 reversed that: the observer is
// `chrome.webRequest` in the service worker, not a MAIN-world fetch patch. Two reasons, and both
// apply to this file:
//
//   (a) Enumeration. A MAIN-world patch only sees what we thought to enumerate.
//   (b) A MAIN-world patch CAN BREAK THE PROVIDER'S APP. Force-installed estate-wide it must never
//       throw — "your DLP tool broke ChatGPT for 150 people" ends the account.
//
// This file exists ONLY because U12-c's protocol (doc 05 §1.4 step 1) requires an inventory of what
// the page registers, and that inventory is only obtainable from inside the page's own context.
// It is a MEASURING INSTRUMENT FOR A SPIKE, on our own two machines, for a week. It is not a
// component. Nothing here ships.
//
// It is written defensively for exactly the reason ADR 0012 gives: even a throwaway patch on
// addEventListener sits in the path of every listener the page registers.

(() => {
  'use strict';

  const T0 = performance.now();
  const now = () => +(performance.now() - T0).toFixed(3);

  const send = (kind, payload) => {
    try {
      window.postMessage({ __vanguard: 'u12', kind, payload }, window.location.origin);
    } catch (_) { /* never throw into the page */ }
  };

  // ── U12-c step 1 — the inventory ──────────────────────────────────────────────────────────────
  // Doc 05 §1.4: "patch EventTarget.prototype.addEventListener and log every registration on
  // `window` and `document` with its capture flag." The claim under test is that a page listener at
  // `window` capture would fire BEFORE ours and could stopPropagation() us into silence — doc 00
  // §6's worst case, because it fails open and the dashboard stays green.
  const realAdd = EventTarget.prototype.addEventListener;
  let patched = 0;

  EventTarget.prototype.addEventListener = function (type, listener, options) {
    try {
      if (this === window || this === document) {
        const capture = options === true || (options && options.capture === true);
        if (['keydown', 'keypress', 'keyup', 'submit', 'click', 'compositionend'].includes(type)) {
          patched++;
          send('listener-registered', {
            node: this === window ? 'window' : 'document',
            type,
            capture: !!capture,
            passive: !!(options && options.passive),
            t: now(),
            // Where the page registered it from. Truncated — we want the frame, not a novel.
            stack: (new Error().stack || '').split('\n').slice(2, 4).join(' | ').slice(0, 300),
          });
        }
      }
    } catch (_) { /* swallow — see the header. This must never break the page. */ }
    // Always call through, always with the original args, whatever happened above.
    return realAdd.call(this, type, listener, options);
  };

  send('probe-installed', { t: now(), readyState: document.readyState });

  // ── U12-a step 2 — the React stand-in ─────────────────────────────────────────────────────────
  // Doc 05 §1.2 step 2: "Observe ordering against a MAIN-world listener registered at the root
  // container as a React stand-in." React 17+ delegates at its root container, which is a DESCENDANT
  // of document — so capture-on-an-ancestor should precede it. That is the one arrow the whole
  // architecture rests on (①  before ③).
  //
  // The root container does not exist at document_start, so we poll for it.
  //
  // ⚠️ The detection below is a HEURISTIC and is tagged as one. Doc 05 §1.2 already flags that
  // "React's root-container delegation from v17 onward is [unverified] for the specific bundles
  // ChatGPT and Claude ship — they may pin, patch, or bundle differently." If this never resolves,
  // the honest reading is "we did not find a React root", NOT "React isn't there".
  const REACT_KEYS = ['__reactContainer$', '_reactRootContainer', '__reactFiber$'];

  function findReactRoot() {
    const candidates = [document.getElementById('root'), document.getElementById('__next'),
                        ...Array.from(document.body ? document.body.children : [])];
    for (const el of candidates) {
      if (!el) continue;
      for (const k of Object.keys(el)) {
        if (REACT_KEYS.some((rk) => k.startsWith(rk))) return { el, key: k };
      }
    }
    return null;
  }

  let tries = 0;
  const poll = setInterval(() => {
    if (++tries > 100) {                       // ~10s
      clearInterval(poll);
      send('react-standin-status', {
        found: false, tries,
        note: 'No React root container found by heuristic. This is DATA, not a failure of U12-a — '
            + 'doc 05 §1.2 flags the bundles as [unverified]. Fall back to PROTOCOL.md step 4 '
            + '(observe against the real send instead of a stand-in).',
      });
      return;
    }
    const hit = findReactRoot();
    if (!hit) return;
    clearInterval(poll);

    // Register a capture listener at the root container — where React itself delegates. If our
    // isolated-world window listener does NOT log before this one, U12-a has failed and the
    // architecture needs rework, not tuning (doc 05 §1.2).
    realAdd.call(hit.el, 'keydown', (ev) => {
      send('react-standin-keydown', {
        key: ev.key,
        phase: ev.eventPhase,
        t: now(),
        // If the isolated world called stopImmediatePropagation() and this still fired, the stop did
        // NOT cross the world boundary — which is the second half of U12-a's claim.
        afterArmedStop: ev.defaultPrevented,
      });
    }, { capture: true });

    send('react-standin-status', {
      found: true, tries, key: hit.key,
      el: hit.el.tagName.toLowerCase() + (hit.el.id ? '#' + hit.el.id : ''),
      note: 'Stand-in registered at the React root container, capture phase. U12-a passes step 2 '
          + 'only if the ISOLATED window listener logs BEFORE this one.',
    });
  }, 100);

  // ── U20, the decisive half — fetch / XHR ──────────────────────────────────────────────────────
  //
  // Added 2026-07-17 after the first real run. The first version recorded WebSocket frames only, and
  // that CANNOT close U20: ChatGPT emitted 62-byte frames, which are almost certainly telemetry —
  // but "almost certainly" is not the standard here, and arguing from frame size alone is a
  // correlation argument dressed as evidence.
  //
  // 🔴 The decisive test is not "did a socket carry bytes near a send." It is:
  //
  //       WHICH TRANSPORT CARRIED THE PROMPT'S BYTES?
  //
  // A prompt is hundreds to thousands of bytes. If a POST goes out carrying ~the prompt's length at
  // the moment of send, the prompt is on HTTP, `webRequest` sees it, and ADR 0012's observer works
  // for that surface. That is a SIZE argument, and it beats a timing argument because it does not
  // depend on how tightly two clocks line up.
  //
  // ⚠️ THE IRONY, STATED RATHER THAN HIDDEN: to resolve U20 — which exists because `webRequest`
  // cannot see WebSocket frames — this patches `fetch` in the MAIN world, which is exactly what
  // ADR 0012 REJECTED for the product. That is fine and it is not a contradiction: ADR 0012's two
  // reasons are (a) enumeration blind spots and (b) it can break the provider's app across a
  // force-installed estate. Neither applies to an instrument on two machines for a week. But it is
  // precisely the kind of thing that gets copy-pasted into a component later, so: NOTHING HERE
  // SHIPS. See this file's header.
  //
  // Lengths, methods and URL paths ONLY. Never bodies. I1/I3 apply to a spike too.
  const bodyLen = (b) => {
    try {
      if (b == null) return 0;
      if (typeof b === 'string') return b.length;
      if (b.byteLength != null) return b.byteLength;
      if (b.size != null) return b.size;                 // Blob
      if (typeof b.get === 'function') return -1;         // FormData — opaque, don't enumerate
      return -1;
    } catch (_) { return -1; }
  };

  const realFetch = window.fetch;
  if (realFetch) {
    window.fetch = function (input, init) {
      try {
        const url = typeof input === 'string' ? input : (input && input.url) || '';
        const method = (init && init.method) || (input && input.method) || 'GET';
        const n = bodyLen(init && init.body);
        if (method !== 'GET' && n !== 0) {
          send('http-send', {
            transport: 'fetch', method, t: now(),
            path: String(url).split('?')[0].replace(/^https?:\/\/[^/]+/, ''),
            bodyBytes: n,
          });
        }
      } catch (_) { /* never throw into the page */ }
      return realFetch.apply(this, arguments);
    };
  }

  const realOpen = XMLHttpRequest.prototype.open;
  const realSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    try { this.__vg = { method, url: String(url) }; } catch (_) { /* ignore */ }
    return realOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function (body) {
    try {
      const n = bodyLen(body);
      if (this.__vg && this.__vg.method !== 'GET' && n !== 0) {
        send('http-send', {
          transport: 'xhr', method: this.__vg.method, t: now(),
          path: this.__vg.url.split('?')[0].replace(/^https?:\/\/[^/]+/, ''),
          bodyBytes: n,
        });
      }
    } catch (_) { /* never throw into the page */ }
    return realSend.apply(this, arguments);
  };

  // ── U20, the WebSocket half ───────────────────────────────────────────────────────────────────
  // ASSUMPTIONS U20 / ADR 0012: `webRequest` sees the WebSocket HANDSHAKE, never the FRAMES — so a
  // surface that moved prompt submission onto an open socket is INVISIBLE to the observer. Doc 05
  // §10 says this is "observable during the U12 spike at zero marginal cost". Collecting it here is
  // that zero-cost observation: we are already in the page's context.
  //
  // We only record THAT a socket was opened and whether it carried traffic while a prompt was sent.
  // We do not read frame contents — I1/I3 apply to a spike as much as to the product.
  const RealWS = window.WebSocket;
  if (RealWS) {
    const Wrapped = function (url, protocols) {
      const ws = protocols === undefined ? new RealWS(url) : new RealWS(url, protocols);
      try {
        send('websocket-open', { url: String(url).split('?')[0], t: now() });
        const realSend = ws.send.bind(ws);
        ws.send = function (data) {
          // Length and type only. NEVER the payload. Doc 05's own standard: hash only, no content.
          send('websocket-send', {
            t: now(),
            bytes: (data && data.length) || (data && data.byteLength) || 0,
            type: typeof data,
          });
          return realSend(data);
        };
      } catch (_) { /* never throw into the page */ }
      return ws;
    };
    Wrapped.prototype = RealWS.prototype;
    for (const k of ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED']) Wrapped[k] = RealWS[k];
    try { window.WebSocket = Wrapped; } catch (_) { /* leave it alone if frozen */ }
  }
})();
