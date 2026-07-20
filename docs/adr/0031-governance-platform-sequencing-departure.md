# ADR 0031 — The governance platform departs from ADR 0016's sequencing

> **Renumbered 0029 → 0031 on 2026-07-21** when this branch merged `main`, which already
> carried an ADR 0029 (sensitivity weights) and 0030 (offscreen config). Standard etiquette:
> the shared trunk keeps its numbers; the branch merging in renumbers its own ADR.

**Date:** 2026-07-19
**Status:** Accepted

## Context

[ADR 0016](0016-mvp-first-sequencing.md) locks the sequence **Slice 1 → team test →
Slice 2 → doc 08**, with B3 parked until both slices land.

The AI governance platform — admin dashboard, LLM approval workflow, ethics
classifier — is neither slice. Worse, an admin dashboard is substantially **the
B3 feature**: it is the compliance officer's console, and B3 was the research
that would have told us whether that officer wants one.

Building it now means building the feature whose demand is unmeasured, using the
argument that it is needed for a case-study pitch.

## Decision

**Proceed, scoped to the pitch deliverable.** ADR 0016's product sequencing is
**not** reversed:

- Slice 2 (file content) is **not cancelled** and not deprioritised.
- B3 remains parked. This work does **not** substitute for it — a dashboard we
  designed is not evidence that a buyer wants that dashboard.
- Doc 08 is still written after both slices, and still ranks B3 first among what
  remains unasked.

## Consequences

- The case study is answerable end to end, on two laptops, with a real approval
  round-trip.
- 🔴 **The B3 gap widens rather than closes.** We now have a console built on our
  own guess about what a compliance officer wants. That is a *stronger* reason to
  run B3, not a weaker one, and doc 08 must say so.
- A future session reading `code/policy/` may conclude the roadmap changed. It
  did not. This ADR is the record.

## Alternatives rejected

**Wait for Slice 2, then build this.** Correct on the roadmap and wrong on the
calendar — the case study has a date and Slice 2 does not.

**Answer the case study with documents alone.** The package already has eight
documents. It has no working approval workflow, and the case study asks for a
system.
