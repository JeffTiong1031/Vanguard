# ADR 0005 — The send gate lives in the isolated world; MAIN world is observer-only

**Status:** Accepted (2026-07-16) · **Deciders:** founder + CTO · **Refines:** the founder's
capture-phase flip · **Depends on:** U12

## Context

The founder rejected fetch-layer gating in favour of DOM capture-phase interception, correctly:
aborting inside `await fetch(...)` throws into a React state machine never designed for it — error
toasts, stuck spinners, corrupted conversation state. Capture-phase means the app never enters its
send state machine at all; there is nothing to unwind.

That left an open question the original framing didn't answer: **which JS world does the gate run
in?** The instinctive answer is the MAIN world, since that's where the page's own handlers live and
"beating React" sounds like it requires being next to React.

It doesn't, and the instinct is actively harmful.

## Options

1. **MAIN world gate** — injected script, next to the page's own listeners.
2. **Isolated world gate** — content script listener on `document`, capture phase.
3. **Both** — MAIN world gate with isolated-world fallback.

## Decision

**Option 2 — isolated world.**

**Content scripts and page scripts share one DOM event dispatch.** They have separate *JS contexts*,
not separate *event systems*. A capture-phase listener registered on `document` from a content script
at `document_start` participates in the same dispatch as React's listeners, and capture-on-ancestor
precedes anything on a descendant. Registration order within the page is irrelevant because we're
higher in the tree. `stopImmediatePropagation()` from that listener prevents React's handler from
ever running. **No MAIN-world injection is needed to beat React.**

**And the isolated world is where we must be anyway**, which is the decisive argument:

> The gate must read the verdict cache **synchronously** (see doc 01 §0 — the whole design rests on
> this). The verdict cache lives in the isolated world. A MAIN-world gate would have to `postMessage`
> across the world boundary to reach it — **async** — reintroducing the exact stop-and-replay problem
> that decision #8 forbids and that the warm-cache design exists to eliminate.

Choosing the MAIN world would silently destroy the product's core mechanic in exchange for nothing.

**The MAIN world retains exactly one job:** the log-only `fetch`/WebSocket observer, which genuinely
requires patching the page's own `fetch` and therefore cannot live anywhere else.

## Consequences

**Accepted:**
- **U12 is now load-bearing and must be proven empirically, per surface, in week 1.** Specifically:
  that an isolated-world capture listener on `document` preempts React's synthetic handler *and* that
  `stopImmediatePropagation()` crosses the world boundary in the listener list. This is not something
  to reason about — it must be tested against ChatGPT and Claude directly. **If U12 fails, the gate
  mechanism fails and the architecture needs rework, not tuning.**
- The gate must cover **every** send path: Enter, Ctrl/Cmd+Enter, the Send button, paste-and-send,
  voice. A miss fails **open, silently** — the worst outcome for a compliance buyer, because the
  control still appears to work. This is what the fetch observer exists to catch.
- Shadow DOM retargets events; the gate must use `composedPath()`, not `event.target`.

**Benefits beyond the sync requirement:**
- The MAIN world is readable and writable by the page **and by the user's devtools**. A verdict cache
  there could be tampered to force "clean". In the isolated world it can't be reached by page JS.
  *(A determined user still wins — doc 00 §1.5, accepted — but we don't hand it to them.)*
- Less injected surface in a context the provider's app also occupies.

**Costs:**
- We depend on a browser behaviour (cross-world listener ordering) that is well-established but
  under-documented. Hence U12's week-1 status.

**Revisit if:** U12 fails on any target surface, or a provider moves send-triggering out of DOM events
entirely (e.g., a custom IME or canvas composer), at which point the observer becomes the only signal
and fail-open becomes structural.
