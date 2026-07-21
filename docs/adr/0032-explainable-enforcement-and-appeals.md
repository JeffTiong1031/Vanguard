# ADR 0032 — Enforcement decisions explain themselves and can be appealed

**Status:** Accepted · **Date:** 2026-07-21

## Context
Case-study challenge 3b (transparency & redressal for affected people) scored 2/10:
Vanguard governs inputs to AI but had no concept of the decisions it makes about a
person. The affected person, though, is the employee whose prompt Vanguard itself
blocked or redacted — already present in the extension at the moment of the decision.

## Decision
Every enforcement decision (ethics block, PII redaction, tool-access block) renders a
plain-language explanation naming the category and stating a machine decided it
on-device. Content decisions (ethics, PII) can be contested: the employee submits an
appeal (class + reason, prompt text only via an explicit opt-in), an admin resolves it
in a new console Reviews screen, and the employee sees the outcome by polling.

The transparency wording ships in the extension as a static catalog
(`src/detection/explanations.ts`); the PII send-review already carried a per-class "why"
via `whyForClass`, so that surface gained only the *report-a-wrong-flag* affordance, not
a duplicate explanation. Tool-access blocks get an explanation only — their redressal is
the pre-existing "Request access" flow.

## Consequences
- Redressal is review + record + feedback, NOT a real-time unblock; an ethics block
  holds in the moment (fail-closed). An overturned appeal is a labelled false positive.
- `disclosed_text` is the one path prompt text can reach the company server, opt-in and
  purpose-limited; a production build must add a retention limit and fold it into the DPA.
  Two executable tests guard the default: the policy service stores `disclosed_text = NULL`
  on a default appeal, and the extension client omits the key unless the employee opts in.
- The `pseudo_id` is a bearer handle for `GET /v1/appeals` (same trust model as events);
  production would bind it to the enrolment session.
