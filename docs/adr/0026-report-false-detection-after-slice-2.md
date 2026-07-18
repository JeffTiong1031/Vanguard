# ADR 0026 — Report false detection: opt-in feedback after Slice 2 (not Ignore)

**Status:** Accepted · **Date:** 2026-07-18 · **Decider:** the founder
**Related:** decision #5 · I1 · [ADR 0008](0008-hybrid-split-by-workload.md) · [ADR 0025](0025-send-time-per-span-review.md) · ASSUMPTIONS **E3** · doc 00 §1.6 · doc 02 §4.6 · doc 07 §7

## Context

The founder wants a path to improve the model from real mistakes without treating **Ignore** as a
training label (doc 00 §1.6: Ignore is poisoned as ML data; valuable as compliance evidence).

Proposed control: a **Report** button (composer hints, Send review modal, and later file review)
that, with explicit consent, may send the flagged sentence/span and a reason (“why this is wrong”)
to us for the improvement loop.

## Decision

1. **Build Report after Slice 2 lands** — not in Slice 1.5, not in the Slice 2 MVP critical path.
   Slice 2 already introduces cloud file transit (ADR 0008); bundling a new prompt-exfil purpose in
   the same release muddies the sales sentence.
2. **Report ≠ Ignore ≠ Accept.**
   - **Accept** — mask / rewrite that span (chat) or acknowledge remediation intent as designed.
   - **Ignore** — send/keep original; reason audited for the **admin console**; **never a train label**.
   - **Report** — opt-in donation of span (+ optional wider context) + reason for **improvement**;
     requires consent UI; **admin policy may disable** uploads (tenant owns the data — ADR 0001).
3. **Surfaces (when built):** composer hover, Send review pop-out, and file review — same control.
4. **Default payload:** flagged span(s) + short window + class + user reason. Full prompt only via
   explicit extra checkbox (off by default).
5. **Not live retrain.** Uploads enter a review/queue for the improvement loop (E3); they do not
   hot-update the on-device model from one click.
6. **Does not replace ADR 0015.** Report is sparse augmentation; the real eval substrate remains a
   deliberate corpus.

## Rejected

| Option | Why not |
|---|---|
| Auto-upload on Ignore | Poisoned labels; silent purpose change; falsifies I1/decision #5 story |
| Syntheticize-then-upload on Ignore | Same seam; scrubbing deletes the sensitive-vs-not signal; residual PII risk |
| Ship Report inside Slice 2 MVP | Couples file cloud path with a second retention/purpose story too early |

## Consequences

- Slice 2 plan and implementation **must not** depend on Report.
- Accept/Ignore behavior in ADR 0025 unchanged until Report ships.
- When Report ships: DPA must name the improvement purpose; questionnaire rows are no longer “we
  never receive prompts” for that opt-in path — say so plainly.
- ⚠️ **Report must not become a silent suppress-list** for re-uploads of the same span unless a
  separate, explicit “dismiss this finding” control is designed — see Slice 2 UX discussion with the
  founder (2026-07-18). Conflating Report with suppress fails open on true positives the user meant
  to fix later and never did.
