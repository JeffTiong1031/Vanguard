# ADR 0030 — The offscreen document is a pure compute context: all configuration arrives in the message

**Status:** Accepted · **Date:** 2026-07-20 · **Decider:** the founder, on evidence
**Context:** the sensitivity classifier ([ADR 0019](0019-sensitivity-span-classifier-over-ner.md))
was integrated into the extension on 2026-07-19 and **had never executed once** on any prompt.

---

## 1. Context — the measurement

`chrome.storage` **does not exist inside an offscreen document.** Measured 2026-07-20 in
`chrome-extension://<id>/offscreen.html`:

```
> await chrome.storage.local.get('vg_sensitivity_model_url')
Uncaught TypeError: Cannot read properties of undefined (reading 'local')
```

The `storage` permission is present and correct in the manifest. The API is simply not exposed in
that context.

`loadConfig()` performed that read inside a `try`. Its `catch` returned `{ modelUrl: null }`, which
the caller reads as *"the user has not configured a model"*, so the guard
`if (sens.modelUrl && …)` was false and the classifier was skipped — **no fetch, no log, no state
change** — on every prompt, for every user, from the day it was written.

**The cost was not the bug. It was the diagnosis.** Seven candidate causes — model absent, server
down, wrong `dtype`, missing host permission, load timeout, block skipped, model genuinely
disagreeing — all produce **byte-identical behaviour**: every name stays masked. Three of them were
already recorded in the source comments as previously hit. A full session was spent unable to
distinguish *"not connected"* from *"connected and disagreeing"*.

## 2. Options

| | |
|---|---|
| **A. Poll storage from the SW and mirror it into the offscreen document on a timer** | Keeps `loadConfig` where it is. Adds a second source of truth and a staleness window. |
| **B. Read config in the SW; pass it in the message** ✅ | The SW already brokers every scan. One read, one owner, no mirror. |
| **C. Give the offscreen document a `chrome.runtime` request for config** | Another round trip on the critical path, for a value that is already in the SW's hand at send time. |

## 3. Decision

**B. The service worker owns all extension state. The offscreen document reads none and writes
none.** It receives what it needs in the `l2-run` message and returns what it did in the response.

Three consequences fall out immediately:

1. **`loadConfig` throws** `SensitivityUnavailableError` when `chrome.storage.local` is absent. A
   missing API is never a recoverable configuration state and must never be reported as *"off"*.
2. **The SW→offscreen leg gets its own message kind, `l2-run`.** 🔴 `chrome.runtime.sendMessage`
   is delivered to **every** extension context, and both `background.ts` and `offscreen/main.ts`
   listened for `l2-scan` — so the offscreen document had been receiving the content script's
   message **directly**, racing the background's re-send. Harmless while both did the same thing;
   non-deterministic the moment one carries config.
3. **The engine reports a typed `SensitivityStatus` on every branch**, including the skipped ones,
   persisted by the SW and shown on the options page.

## 4. Consequences

✅ The failure that took a session is now a line of text in the options page.
✅ A latent broadcast race is closed before it could produce a real defect.
✅ [ADR 0014](0014-degrade-to-advisory-never-fail-closed.md) becomes enforceable. *"A dead engine
degrades rather than decides"* is meaningless if nobody can tell the engine is dead.

⚠️ **The generalization is the valuable part, and it is not about `storage`.** Treat the offscreen
document as a **pure compute context**: text in, findings out, no ambient state. Any future feature
that reaches for an extension API there will hit the same wall, and — because every failure path in
this pipeline degrades to *"mask everything"*, the safe direction — **it will hit it silently.**

## 5. The finding this ADR exists to record

🔴 **A `catch` that returns a default converts a structural failure into a configuration state.**

This is CLAUDE.md §6.5's letter-vs-purpose trap, **fifth instance, and the first living in an error
handler.** The handler's *wording* is "tolerate a storage read failing". Its *effect* was to hide a
permanent, total failure of the product's differentiating feature behind a state that looks
deliberate.

🔴 **And it is §2 ledger #11 again — the code was right and the input never arrived.**
`filterBySensitivity` is correct: per-span clock, total clock, fail-safe toward MASK, 21 passing
tests. **It was never called.** The tests pass because they inject `classify` and `markSpan` as
callbacks — **the fixture supplies precisely the thing the runtime failed to provide**, so the seam
sits inboard of the break and no behavioural test could have caught it. The guard that replaces
them is **static** (`tests/offscreen-no-storage.test.ts`), and it was checked by reintroducing the
defect and watching it fail.

**Transferable rule: when every failure mode of a feature is indistinguishable from the feature
being off, the observability is not a nicety — it is the feature's precondition.**
