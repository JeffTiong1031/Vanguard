# ADR 0019 — The sensitivity model is a span classifier over NER proposals, not a standalone MASK tagger

**Status:** Accepted · **Date:** 2026-07-18 · **Decider:** the founder
**Context for:** the parallel ML track ([ADR 0018](0018-sensitive-vs-not-parallel-track.md)) · **Plan:**
[`docs/superpowers/plans/2026-07-18-sensitive-vs-not-ml.md`](../superpowers/plans/2026-07-18-sensitive-vs-not-ml.md)

## Context

The sensitive-vs-not model's job is the discriminator the product is actually short on: not *"find the
person"* (Slice 1's stock NER already finds Einstein and Apple — ADR 0017 §1) but *"is this mention
sensitive?"* — `Einstein`(keep) vs `Ahmad bin Ali`(mask). The first parallel-track plan built a
**standalone MASK token-tagger** that re-learns entity detection and, at integration, would *replace*
stock NER wholesale.

## Options

| | Approach | Cost |
|---|---|---|
| **A** | Standalone MASK token-tagger (detects + judges in one model) | Duplicates NER; entangled errors (a miss could be "didn't find" or "judged not-sensitive" — undecidable) |
| **B** | **Span classifier over NER-proposed PER/ORG spans** | Needs candidate spans from a NER pass; export is a span-classifier, not a tagger |

## Decision

**Option B.** Slice 1's stock NER proposes PERSON/ORG spans; this model classifies each span
**`MASK` vs `KEEP`** using the surrounding prompt context (the discriminator is relational context,
not fame). A span is presented by wrapping it in `[E] … [/E]` markers inside the full prompt and doing
binary sequence classification. Data, metrics, and the export contract are all built around a span
classifier.

## Consequences

- **Reuses the extension's existing L2 instead of competing with it**, and gives interpretable failure
  modes — precision is quasi-contractual (ADR 0001), so *"why did it mask this"* must be answerable.
- 🔴 **Train/serve span mismatch is now an explicit, managed risk.** Training/eval use author-perfect
  gold spans; production uses noisy NER spans. **Integrated recall is upper-bounded by NER recall.** The
  plan measures a composed NER→classifier metric (with a stand-in NER) and makes a **live-NER composed
  eval a mandatory integration gate after Slice 1** — not optional prose.
- **L1 still owns identifier digits.** The model is only ever given PER/ORG spans; it never adjudicates
  an NRIC/SSM/TIN (ADR 0004, ADR 0018).
- Integration remains out of scope for the ML track and happens after Slice 2 (ADR 0016/0018).
