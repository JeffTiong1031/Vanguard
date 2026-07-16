# ADR 0006 — One detection engine in an offscreen document, not per-tab

**Status:** Accepted (2026-07-16) · **Deciders:** founder + CTO · **Depends on:** D2, U5, U10

## Context

The detection engine loads a quantized multilingual NER model — ~135 MB after vocabulary trimming
and int8 quantization *(U5, estimate)*. It needs to be reachable from every tab where a target LLM
surface is open, with a latency budget of 30–100 ms *(U6)*.

MV3 gives three places to put code: the content script (per tab), the service worker
(extension-global, ephemeral), and an offscreen document (extension-global, persistent-ish).

## Options

1. **Content script** — engine loaded in each tab.
2. **Service worker** — engine in the SW.
3. **Offscreen document** — engine in a single hidden document.

## Decision

**Option 3.**

**Why not the content script.** Content scripts run **per tab**. A user with five ChatGPT tabs open
would hold five model instances: ~675 MB *(from U5)*. On D2 hardware — an 8 GB corporate laptop with
maybe 1–2 GB realistically addressable before the user notices — that is not a degradation, it's a
crash. Model memory is a **global** resource and must be held in a **global** context. This is
decisive on its own.

**Why not the service worker.** MV3 terminates the SW after ~30 s idle (U10). Reloading 135 MB on
every wake is absurd: it would blow the U6 budget by two orders of magnitude on the first scan after
every idle period — which, given typing is bursty, is *most* scans. The SW's lifecycle is
fundamentally incompatible with holding a large warm artifact.

**Why the offscreen document works.** Single extension-global context, one model serving every tab,
survives SW termination, and has the DOM/WASM environment ONNX Runtime Web expects.

## Consequences

**Accepted:**
- **The architecture has a component most extensions don't need**, and reviewers will ask why. The
  answer is one line: *the model is 135 MB and content scripts are per-tab.*
- **Every scan crosses a context boundary.** Content script → offscreen is `chrome.runtime`
  messaging with structured cloning. Hop cost must be counted in doc 06's latency budget, not waved
  at — it eats into U6's 30–100 ms.
- **Offscreen lifecycle is ours to manage.** Chrome may reclaim it; the SW must be able to recreate
  it, and the first scan after recreation pays the model-load cost. Doc 05 owns the state machine.
  A cold offscreen document during a send-gate cache miss is the worst-case latency path in the
  product.
- Only one offscreen document is permitted per extension, so this component is a **contended
  resource**: any future need for one (audio, clipboard, DOM parsing for Phase 1 files) must share
  it. Doc 05 should treat it as a multiplexed host from the start rather than retrofit later.

**Costs:**
- Debugging across content script → SW → offscreen is genuinely unpleasant. Budget for it.
- Concurrency: one engine, many tabs. Needs a queue and a backpressure story (doc 06).

**Revisit if:** U5 lands dramatically lower (a <20 MB model would make per-tab viable and delete a
whole component and its message-passing tax), or if offscreen reclamation proves aggressive enough
that cold-start dominates.
