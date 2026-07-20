# Sensitivity classifier → extension integration — design

**Date:** 2026-07-20 · **Status:** proposed, awaiting founder review
**Track:** `ml/` sensitive-vs-not ([ADR 0018](../../adr/0018-sensitive-vs-not-parallel-track.md)) → `code/extension`
**Supersedes nothing.** Extends Slice 1's L2 stage; does not touch Slice 2's file path.

---

## 1. Why this document exists

The classifier is trained, exported, verified and **already wired into the extension** — and it has
**never executed, on any prompt, once**. A full session was spent unable to tell "not connected"
from "connected and disagreeing", because in the current design those two states are
byte-identical.

**The root cause, found 2026-07-20 and confirmed by direct measurement:**

```
> await chrome.storage.local.get('vg_sensitivity_model_url')   // in offscreen.html
Uncaught TypeError: Cannot read properties of undefined (reading 'local')
```

**`chrome.storage` is undefined inside an offscreen document.** The `storage` permission is present
and correct in the manifest; the API is simply not exposed in that context. `loadConfig()` calls it
inside a `try`, its `catch` returns `{ modelUrl: null }`, the guard
`if (sens.modelUrl && …)` is false, and the whole feature is skipped in silence — no fetch, no log,
no state change. Every entity the NER proposes stays masked, which is exactly the pre-classifier
behaviour.

Evidence closing the case, all gathered 2026-07-20:

| Check | Result |
|---|---|
| `location.href` in the inspected window | `chrome-extension://…/offscreen.html` ✅ correct context |
| `chrome.storage` in that context | **undefined** 🔴 |
| Offscreen Network tab during a probe | only `ort-wasm-*` (the NER runtime). **Zero requests to `:8765`** |
| `node scripts/verify-web-bundle.mjs` | **7/7 verdicts correct**, 41–61 ms/span, loads in 2.3 s |
| `dist/` drift check | `dist/ matches a fresh build` |
| Built chunk grep | all sensitivity code present |

So: correct model, correct code, correct permissions, correct URL — and a config read that cannot
work in the process that performs it.

### 1.1 The finding that outlives the bug

🔴 **A `catch` that returns a default converts a structural failure into a configuration state.**
`loadConfig` cannot distinguish *"the admin has not configured a model"* from *"this API does not
exist in this process"*, and reports both as **off**. This is CLAUDE.md §6.5's letter-vs-purpose
trap: the handler's *wording* is "tolerate a storage read failing"; its *effect* was to hide a
permanent, total failure of the product's differentiating feature.

🔴 **And it is ledger #11 a fourth time — the code was right and the input never arrived.**
`filterBySensitivity` is correct: per-span clock, total clock, fail-safe toward MASK, 21 passing
tests. It was never called. The tests pass because they inject `classify` and `markSpan` as
callbacks — **the fixture supplies precisely the thing the runtime failed to provide.** The seam
sits inboard of the break, so no test could have caught it.

**Both facts are requirements, not commentary.** They set §3.1, §3.2 and §3.5 below.

---

## 2. Goal and non-goals

**Goal.** Anyone clones the repo → **Load unpacked** → the sensitivity classifier runs, with **no
Python server, no DevTools commands, and a visible engine state**. Inference stays entirely
on-device.

**Target audience:** (b) — the founder's whole team, on their own machines. Not a lab rig (a); not
a design-partner build (c).

### Non-goals — deliberate, each with its reason

| Excluded | Why |
|---|---|
| **Distillation / a smaller model** | 535 MB fp32 is the artifact we have. int8 is **blocked** (always-KEEP, MASK recall 0.000) and vocabulary trimming is **spent** (278M → 140M; the 86M backbone is irreducible). Weeks of ML work. **→ risk R1** |
| **Raising the 96-token cutoff** | Needs the windowing step (§3.6) and a latency budget nobody has measured on real hardware. The team test supplies that measurement. **→ risk R2** |
| **Composed eval on the shipped NER** | Mandatory before any number is quoted to a buyer, not before a team test. **→ risk R3** |
| **Chrome Web Store** | A separate step. Load-unpacked is a developer bar and cannot reach "all individuals and companies". **→ risk R4** |
| **Any API / server-side inference** | Breaks locked decision #2, invariant I1, and decision #5. Not open. |

---

## 3. Design

### 3.1 The config travels in the message — the offscreen document never reads storage

The service worker already brokers every `l2-scan`. It has full `chrome.storage`. It reads the
config and passes it down; the offscreen document consumes what it is given.

```
content script ──l2-scan──▶ background SW ──l2-scan + sensitivity config──▶ offscreen
       ◀──────────l2-result + engine status──────────────────────────────────────┘
```

`loadConfig()` moves out of the offscreen path entirely. The SW caches the config in memory and
invalidates on `chrome.storage.onChanged`, so it is not re-read per keystroke.

### 3.2 `loadConfig` fails loudly on a structural failure

`chrome?.storage?.local === undefined` is **never** a recoverable configuration state. It throws.
Only a genuine read error (quota, corruption) falls back to defaults, and it says so.

### 3.3 Engine status is a first-class value

The offscreen document reports its state on every scan, through the existing `l2-result` message:

```ts
type SensitivityStatus =
  | { state: 'disabled' }                                   // no model configured
  | { state: 'loading' }
  | { state: 'ready'; spans: number; released: number; kept: number; failed: number; ms: number }
  | { state: 'failed'; reason: string }                     // the real error, not a category
  | { state: 'skipped'; why: 'too-long' | 'no-entities' | 'file-path' };
```

🔴 **`skipped` is the entry that would have saved the session.** Today the skipped path is silent,
so absence of a log carries no information. Every branch now names itself.

Surfaced in two places: the **options page** (live, with a Test button) and a small line in the
**modal** when the state is anything but `ready`. ADR 0014 says a dead engine degrades rather than
decides — degrading requires the user to *notice*.

### 3.4 Hosting: public Hugging Face repo, hash-pinned, loaded by repo id

The localhost server, the `:8765` host permissions, and the DevTools command all disappear.
transformers.js resolves HF repo ids natively — the same mechanism the NER already uses.

**Hosting is not inference.** The weights are fetched once and cached by the browser; every
subsequent classification runs in the offscreen document on the user's CPU. No prompt text, no
entity, and no verdict ever leaves the machine. ADR 0017 already records this: *"Decision #2 is
about what we SEND, not what we download."* Invariants I1/I5 and decisions #2/#5 are untouched.

**Hash-pinning is mandatory**, extending `models.manifest.json` to the sensitivity bundle. A remote
weights fetch is a code path into the user's browser (doc 02 §6.4's un-N/A-able row). A swapped
upstream file must fail to load, not run.

⚠️ **Accepted cost, stated plainly: the trained model becomes public.** Per ADR 0003 the moat was
never the model, so this is judged to cost nothing defensible. It is reversible only in the sense
that a deleted repo does not un-download.
⚠️ **Locked-down corporate networks may block `huggingface.co`** — the fleet B3 targets. ADR 0017
already calls CDN weights *"not the shipping answer"* for enterprise. Fine for this audience.

### 3.5 An integration test at the real boundary

The existing `sensitivity.test.ts` cannot fail on this bug and never could. Two new tests:

1. **A boundary test** that drives a fake `chrome.runtime` message from SW to offscreen handler and
   asserts the config arrives and the classifier callback is invoked — with the classifier stubbed,
   but **the config path real**.
2. **A guard test** asserting the offscreen entrypoint's module graph contains no `chrome.storage`
   reference. Cheap, static, and it is the exact defect.

### 3.6 Oversize spans fail safe instead of silently truncating

The contract forbids clipping past a marker. Eligibility (~96 tokens) makes this unreachable today,
but it is unreachable *by coincidence*. If a marked string exceeds 512 tokens, **skip that span and
keep it masked**; never truncate. Full span-centred windowing is out of scope (R2).

### 3.7 ADR 0018 enforced by code, not by a number

`ScanRequest` gains `purpose: 'chat' | 'file'`. Sensitivity runs only for `'chat'`.

🔴 **Today files escape sensitivity only because extracts are long and fall past the cutoff.** The
chat path and the file path share `scanInto`. Raise the cutoff — a config change nobody thinks of
as architectural — and ADR 0018 is silently violated. The flag makes the ADR structural.

---

## 4. Files

| File | Change |
|---|---|
| `src/detection/l2/messages.ts` | `purpose`, `sensitivity` config on request; `SensitivityStatus` on response |
| `src/detection/l2/sensitivity.ts` | `loadConfig` throws on missing API; `resolveStatus`; oversize guard |
| `src/detection/l2/client.ts` | pass `purpose`; return status alongside entities |
| `entrypoints/background.ts` | read + cache config, inject into the message, invalidate on change |
| `entrypoints/offscreen/main.ts` | consume config from message; emit status on every branch |
| `entrypoints/options/main.tsx` | enable/disable, model source, live status, Test button |
| `src/detection/scan.ts` | thread `purpose` through |
| `models.manifest.json` + `scripts/build-model-manifest.mjs` | pin the sensitivity bundle |
| `wxt.config.ts` | drop `:8765` hosts; nothing added (HF is not a `host_permission` for `fetch` from an extension page — verify at build) |
| `tests/sensitivity-boundary.test.ts`, `tests/offscreen-no-storage.test.ts` | new |
| `docs/adr/0029-*.md`, `docs/adr/0030-*.md` | hosting; config-through-messages |

---

## 5. Risks carried forward to doc 08

| # | Risk |
|---|---|
| **R1** 🔴 | **Distillation is promoted from risk to requirement by the stated end state.** 535 MB is defensible for a team test and not for "all individuals and companies". int8 dead, trimming spent. Doc 06 §6.2's trigger has fired. |
| **R2** 🟠 | The 96-token cutoff makes the feature **inert on the dominant threat** (paste, doc 00 §6). Safe direction, but it means the team test exercises the feature least where it matters most. **Say this to the team explicitly** or their feedback will be about a path that never ran. |
| **R3** 🔴 | The shipped NER is **`q8`-quantized**; ML's integrated 0.928 was measured on a **different, fp32** stand-in never trained on Malay. **The number we would quote has never been measured on the pipeline we run.** Blocks any external claim. |
| **R4** 🟠 | Load-unpacked cannot reach the stated end state. CWS is a separate, unplanned step. |
| **R5** 🟠 | Publishing to HF makes the trained model public. Judged acceptable per ADR 0003; recorded so it is a decision, not a drift. |

---

## 6. Acceptance

A teammate with no context:

1. Clones the repo, `chrome://extensions` → Developer mode → **Load unpacked** → `code/extension/dist/chrome-mv3`.
2. Opens the options page. Sees **Sensitivity: disabled**. Turns it on. Sees **loading**, then **ready**.
3. On ChatGPT **and** Claude: `Explain Einstein's theory` → **no modal, no block.**
4. `Einstein from accounting hasn't sent the invoice` → **blocked**, modal, `PERSON_1`, presses Send themselves.
5. `Tolong ingatkan Encik Rahman pasal mesyuarat esok` → blocked, and the mask covers **`Encik Rahman`**, not `Rahman`.
6. Stops their network → options page shows **failed: \<reason\>**, and the extension keeps masking (fail-safe). **The failure is visible.**
7. Attaches a file → sensitivity reports **skipped: file-path**.

**No Python server. No DevTools console. No `chrome.storage.local.set`.**
