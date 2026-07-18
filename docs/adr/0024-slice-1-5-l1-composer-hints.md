# ADR 0024 — Slice 1.5: L1 advisory composer hints (Grammarly-while-typing)

**Status:** Accepted · **Date:** 2026-07-18 · **Decider:** the founder
**Related:** [ADR 0016](0016-mvp-first-sequencing.md) · [ADR 0017](0017-slice-1-technical-choices.md)

## Context

Slice 1 hard-gates on Send (L1 + L2 → modal). Live team testing showed the product needs
**earlier, lighter** feedback while typing — Grammarly-style underlines — without weakening the
Send gate or introducing PERSON/ORG noise from stock NER.

## Options

1. **L1-only underlines while typing; Send modal unchanged** (this ADR).
2. Full Grammarly UX on typing *and* Send in one change (per-span Accept / Ignore-with-reason /
   Accept all).
3. Defer all underline UX until after Slice 2.

## Decision

**Ship Slice 1.5 as L1-only advisory hints while typing.**

| Rule | Behavior |
|------|----------|
| What is underlined | L1 only (NRIC, SSM/ambiguous, TIN, EMAIL, CARD) — never PERSON/ORG |
| Blocks Send? | Never — tips are guidance only |
| Hover | Class + recommended placeholder for that span |
| Accept | Apply that one recommendation into the composer (no auto-send) |
| Dismiss | Hide tip for that span until the span text changes |
| On Enter/Send | Existing L1+L2 gate + modal (real check) |

**Send-time per-span animation + Accept all is Phase 4**, after typing UX is accepted. Shared visual
tokens from 1.5 reuse there.

## Consequences

- Typing stays fast (no L2 on the debounce hint path).
- Einstein/Apple-class L2 noise stays off the underline layer; Ignore-with-reason on Send remains the
  instrument for PERSON/ORG.
- Gate must skip when focus is inside extension UI (`data-vanguard-ui`) so modal/hint inputs are not
  treated as Send.
