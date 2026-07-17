# ADR 0021 — Three-way data provenance and a structural ship gate

**Status:** Accepted · **Date:** 2026-07-18 · **Decider:** the founder
**Implements:** [ADR 0015](0015-eval-corpus-is-real.md)'s "synthetic-only eval is not a ship signal" ·
**Related:** doc 07 §1 (precision), §5 (eval)

## Context

ADR 0015 requires that a green score on a synthetic eval is **not** a ship signal, and doc 07 §1
requires the model be judged on **MASK precision and recall separately** so an always-KEEP model
cannot pass on "zero false alarms." The plan needs a machine-checkable gate that encodes both without
inventing a numeric accuracy threshold (which is the founder's/admin's call).

## Options

| | Approach | Problem |
|---|---|---|
| **A** | Binary `substrate ∈ {synthetic, real}` | Cannot express the phase's actual substrate (human-authored realistic), and conflates "LLM synthetic" with "human curated" |
| **B** | **Three-way provenance + structural gate** | Slightly more schema; requires a dominance rule |

## Decision

**Option B.** Records carry **`provenance ∈ {llm_synthetic, human_simulated, real}`**. `ship_status`
returns `SHIP_CANDIDATE` **only** when the `eval` split is **`human_simulated`- or `real`-dominant**
(clean count strictly greater than `llm_synthetic`; a **tie fails safe** to `NOT_SHIPPED`), **and**
MASK recall is non-zero (anti-trivial), **and** required strata coverage is complete. `llm_synthetic`
is training-draft only. **No numeric recall/precision threshold is hardcoded** — that operating point
is human/admin-gated (doc 07 §1.5).

## Consequences

- **Committed CI fixtures are all `llm_synthetic`, so CI can never emit `SHIP_CANDIDATE`** — the SHIP
  path is only ever exercised by the human-authored exam (a deliberate antidote to the "fixture
  supplies the field under test" failure mode).
- **MASK precision and recall are reported separately**, plus doc 07 §1.4's 100%-mention-coverage and
  strata coverage across EN/BM/ZH × PER/ORG × MASK/KEEP. An always-KEEP model is `NOT_SHIPPED` even at
  zero false alarms.
- `SHIP_CANDIDATE` means "worth integrating and testing," **not** "production-cleared" — ADR 0015's
  real-substrate requirement still stands ([ADR 0022](0022-human-simulated-substrate-and-counsel-waiver.md)).
