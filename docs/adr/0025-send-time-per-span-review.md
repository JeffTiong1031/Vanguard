# ADR 0025 — Send-time per-span review (Grammarly-style gate modal)

**Status:** Accepted · **Date:** 2026-07-18 · **Decider:** the founder
**Related:** [ADR 0024](0024-slice-1-5-l1-composer-hints.md) · decision #8 (no auto-submit)

## Context

Slice 1.5 added L1 advisory underlines while typing. On Send, the bulk
"Approve & insert rewrite / Ignore" modal was ugly and forced an all-or-nothing
choice. The founder specified a Grammarly-like review: red underlines in a clear
popup, per-span Accept or Ignore-with-reason, Accept all, Proceed only when every
span is resolved.

## Decision

**Replace the Send modal with a per-span review surface:**

| Control | Behavior |
|---------|----------|
| Popup | Hard gate on Enter/Send when DIRTY; preview of the prompt with rose underlines |
| Hover / focus span | Why + recommendation + Accept + Ignore (reason required) |
| Accept | Animate that span to its placeholder in the preview |
| Ignore | Keep original text for that span; reason audited |
| Accept all | Accept every pending span, then Proceed |
| Proceed | Enabled only when zero pending; writes final text to composer, mints approval; **user presses Send** (no auto-submit) |
| All ignored | Final text = original; approval still minted so the next Send passes |

**Accent:** rose/red + tinted highlight (privacy risk, not Grammarly green).

**Focus:** open shadow + focus trap so Ignore keystrokes cannot land in the page composer (Claude bug).

## Consequences

- Typing hints (ADR 0024) stay L1-only and non-blocking.
- Send review shows **full L1+L2** findings (PERSON/ORG included).
- Decision #8 intact: Proceed prepares the composer; it does not submit.
