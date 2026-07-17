# ADR 0018 — sensitive-vs-not is a parallel track, integrated after Slice 2, and does not gate files

**Status:** Accepted · **Date:** 2026-07-17 · **Decider:** the founder
**Builds on:** [ADR 0016](0016-mvp-first-sequencing.md) (MVP-first), [ADR 0017](0017-slice-1-technical-choices.md)
(Slice 1's stock L2), [ADR 0015](0015-eval-corpus-is-real.md) (the eval substrate is real)

---

## Context

Slice 1 and Slice 2 ship a **pipeline** with a **stock NER stand-in** for L2 (ADR 0017): it tags
PERSON / ORG / LOC, which is *"is an entity"*, not *"is sensitive."* The **sensitive-vs-not** model —
the thing that makes *"Apple's earnings"* clean and *"my colleague Ahmad's salary"* dirty — is the
actual wedge, and it needs a trained model, a corpus, and a lawful basis (**C3-b**, **U14-a**,
**U25**). None of those is on the Slice 1/Slice 2 critical path, and the founder does not want the
extension build waiting on them.

## Decision

**Four coupled rulings:**

1. **Sensitive-vs-not is a PARALLEL track.** While the extension team builds Slice 1 → team test →
   Slice 2, **a separate team may start sensitive-vs-not**, briefed in
   [`docs/team/sensitive-vs-not-parallel-track.md`](../team/sensitive-vs-not-parallel-track.md), with a
   task-by-task implementation plan at
   [`docs/superpowers/plans/2026-07-17-sensitive-vs-not-parallel-track.md`](../superpowers/plans/2026-07-17-sensitive-vs-not-parallel-track.md).
   **Both are the founder's, written 2026-07-17.**
2. **It lives in `ml/` in this monorepo** — a sibling of `code/`, **not inside the extension**, so it
   cannot block the extension build and the extension cannot accidentally depend on unfinished model
   code.
3. **It integrates into the extension AFTER Slice 2**, replacing the stock L2 stand-in. **Not before.**
   The order stays **Slice 1 → team test → Slice 2 (file content) → integrate sensitive-vs-not.**
4. 🔴 **Sensitivity does NOT gate files.** Slice 2's file-content checking runs against the same
   detector stack Slice 1 uses (L1 + stock NER). **A file is scanned for the same entities a prompt
   is** — sensitivity classification is a later *quality* upgrade to both paths, **not a precondition
   for either.** Waiting for sensitive-vs-not before shipping file scanning would re-couple the two
   tracks the whole point of this ADR is to separate.

**The training recipe (canonical detail is doc 07; this is the shape the parallel team is held to):**
LLM-generated candidates → **stratified human audit — NOT 100% of rows** → train a **small,
on-device-capable** model → **eval on the REAL text substrate (ADR 0015).** 🔴 **A synthetic-only eval
is NOT a ship signal** — it tests the claim against itself (doc 07 §8.5; ADR 0015's letter-vs-purpose
finding).

🔴 **L1 remains the SOLE owner of NRIC / SSM / TIN-shaped digits.** The sensitive-vs-not model **never
adjudicates a structured identifier.** This is unchanged from ADR 0004 and doc 03 §3.2, and it is
restated here because a *"sensitivity"* model is exactly what someone would wrongly reach for to
resolve doc 03 §2.3's NRIC/SSM collision. **The collision is L1's ambiguity to carry
(`NRIC_OR_SSM_AMBIGUOUS`), not the ML model's to guess.**

## Options considered

| | Option | Why not |
|---|---|---|
| **A** | **Serialise: finish the extension, THEN start the ML** | Wastes the parallelism. The ML track's long pole is the corpus + lawful basis (U25, with counsel), which is **calendar time the extension build could run alongside.** |
| **B** | **Parallel track, `ml/` sibling, integrate after Slice 2** | ✅ **Chosen.** |
| **C** | Build sensitive-vs-not INTO the extension now | Cancels ADR 0016 — it puts the extension back behind C3-b/U14-a/U25, the exact block MVP-first exists to avoid. |
| **D** | Gate Slice 2's files on sensitivity | Re-couples the tracks and delays file scanning behind the ML long pole. Explicitly rejected. |

## Consequences

- **Two teams, two review surfaces, one monorepo.** `code/` (extension) and `ml/` (model) evolve
  independently. The **integration seam is a single interface**: the extension calls a detector that
  returns spans + labels; today it is stock NER, later it is the trained model. **Keeping that seam
  narrow in Slice 1 is now a design requirement** (ADR 0017 §1 already makes the pipeline real around
  it).
- 🔴 **U25 is still the gate on the ML track, and it is still counsel's call, not the CTO's.** The
  parallel team can do LLM-generated candidates and synthetic work immediately, but **the real-text
  eval (ADR 0015) cannot start until lawful basis clears.** The parallel track does **not** dissolve
  this dependency — it just stops it blocking the *extension.* **The founder owns U25** (his stated
  action item).
- **DP-SGD is NOT reopened** (doc 02 §4.5) — the eval substrate is real but never enters a gradient;
  training may stay synthetic. ADR 0015's boundary holds.
- **The stock model's false-positive rate is the parallel track's first target metric**, handed to it
  by the Slice 1 team test as **Ignore-rate-per-class** (ADR 0017 §4). The two tracks have one
  designed handoff and it runs the right direction: **the extension measures the problem, the ML track
  fixes it.**
- ⚠️ **The risk this creates, named so doc 08 inherits it:** a parallel team building against doc 07's
  design with **no running extension to test in** can drift from what the pipeline actually needs
  (chunk sizes, latency budget, the L1 placeholder-grammar mask). **doc 07's inherited-requirements
  list (§6) is the contract**; the parallel brief points at it rather than restating it.
