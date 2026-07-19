# ADR 0029 — The sensitivity weights ship from a public, hash-pinned Hugging Face repo

**Status:** Accepted · **Date:** 2026-07-20 · **Decider:** the founder
**Context:** [ADR 0019](0019-sensitivity-span-classifier-over-ner.md) produced a trained checkpoint.
It has to reach machines that are not the founder's.

---

## 1. Context

The artifact is **535 MB fp32 ONNX**, vocabulary-trimmed to ~70K (278M → 140M params).

- **int8 is BLOCKED.** `quantize_dynamic` refuses the graph; forcing past it yields a 307 MB
  artifact that runs and is destroyed — accuracy 0.5000, **MASK recall 0.0000**, KEEP for
  everything. The trivial model [ADR 0021](0021-provenance-and-ship-gate.md) exists to reject.
- **Vocabulary trimming is spent.** It buys exactly one halving; the 86M backbone is irreducible.

Until now the extension loaded it from `python -m http.server` on `127.0.0.1:8765`, configured by
typing `chrome.storage.local.set(...)` into a DevTools console. That is a lab rig, not a build
anyone else can run.

**The founder's stated end state (2026-07-20): open to all individuals and companies.** The
immediate audience is the team: clone → Load unpacked → it works.

## 2. Options

| | Cost |
|---|---|
| **A. Public Hugging Face repo, hash-pinned** ✅ | Free, CDN-backed, browser-cached, resolved natively by transformers.js — the same mechanism the NER already uses. **The trained model becomes public.** |
| **B. GitHub Release asset** | Free, no bandwidth bill, also public, needs the `localModelPath` shim. |
| **C. Own bucket + CDN** | Retains control. You pay 535 MB × every first run, and it needs an account before anyone can test. |
| **D. Commit to git** | Rejected outright — a 535 MB blob in every clone, forever. |
| **E. An inference API** | 🔴 **Not open.** Sends raw prompt text and raw entity values to our server: breaks locked decision #2, invariant I1, and decision #5 simultaneously, and falsifies the sentence doc 02's compliance story rests on. |

## 3. Decision

**A.** Published at **`tehjiajie/vanguard-sens-v0.2.0-trim70k`**, loaded by repo id, **hash-pinned in
`models.manifest.json`** (all five files) and verified before load — doc 02 §6.4's un-N/A-able
security row, doc 05 §7's *"you control when our code changes, not us."*

Verified 2026-07-20: both LFS `sha256` values reported by the hub match `SHA256SUMS` **exactly**, so
the published weights are byte-identical to the copy that scored **7/7** on the local verifier.

### 🔴 Hosting is not inference — state it precisely, because the imprecise version invites a reversal

The weights are fetched **once** and cached by the browser. Every classification then runs in the
offscreen document, on the user's CPU. **No prompt text, no entity, and no verdict ever leaves the
machine** — there is no request to make. It works offline after the first download. Hugging Face
learns that an IP downloaded a file; not what was typed, not that anything was typed.

[ADR 0017](0017-slice-1-technical-choices.md) already settled this: **"decision #2 is about what we
SEND, not what we download — a weights fetch carries no user data and does not touch it."**
Invariants I1/I5 and decisions #2/#5 are untouched, and the claim-scoping rule holds unchanged:
*"it never reaches their servers or their training set."*

## 4. Consequences

⚠️ **The trained model is public and this cannot be undone** — a deleted repo does not un-download.
Judged acceptable because [ADR 0003](0003-wedge-vs-moat.md) already argues the moat was never the
model. **Recorded here so it is a decision, not a drift.**

⚠️ **`huggingface.co` may be blocked on locked-down corporate networks** — the fleet **B3** targets.
ADR 0017 already calls CDN weights *"not the shipping answer"* for enterprise; a self-hosted mirror
is the eventual answer. Fine for this audience.

🔴 **The end state promotes distillation from a risk to a requirement.** 535 MB is defensible for a
team test and not for *"all individuals and companies"*: ~0.8–1.1 GB resident, on a D2 budget rated
Medium confidence. int8 is dead and trimming is spent, so **the only remaining lever is
distillation** — doc 06 §6.2's trigger, which this decision fires. **→ doc 08, as a promoted risk,
not a discovered one.**

⚠️ **Version in the repo name, and never overwrite.** The extension pins hashes, so a silent
overwrite breaks every installed copy at once with no rollback. Retraining publishes a new repo.

## 5. The finding, because it would have failed in the browser the same silent way

🔴 **The weights are not in `model.onnx`.** That file is ~0.14 MB of graph; the 560 MB of tensors
lives in the sidecar `onnx/model.onnx.data`, and **transformers.js does not fetch a sidecar unless
told to.** Loading without it resolves, downloads, caches, and then fails at session init — landing
in the same `catch`, producing the same "everything stayed masked".

⚠️ **And the obvious fix is the wrong one.** `use_external_data_format: true` fetches
`model.onnx_data` — an **underscore** (`src/models.js`: `` `${baseName}_data` ``). Our sidecar is
`model.onnx.data`, a **dot**, and the ONNX graph records that dotted name in its own external-data
location field, so it is the name ORT will look up. The explicit `session_options.externalData`
form is the one where the fetched path and the recorded path agree. Verified against
`@huggingface/transformers@3.8.1` `src/models.js:265-318`.

**Caught by running the published artifact rather than assuming the upload was the whole job.**
