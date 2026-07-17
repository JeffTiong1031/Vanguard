# ADR 0022 — Phase substrate is human-authored "simulated realistic"; the ADR 0015 counsel STOP is waived and conditionally re-armed

**Status:** Accepted · **Date:** 2026-07-18 · **Decider:** the founder
**Amends (for this phase):** [ADR 0015](0015-eval-corpus-is-real.md) · **Related:** doc 02 §6.1 (PDPA), U18, U25

## Context

ADR 0015 chose a **real** text substrate for the eval and named it a **legal event** — real Malaysian
personal data on disk, pre-product, with a counsel/lawful-basis STOP (U25) before it lands. That STOP
would block the parallel ML track behind a legal item. But ADR 0015's *purpose* is to catch the three
taxes (trim/quant/distil degrade BM/ZH first) by using text that reaches for real, low-frequency
register — which **LLM-stereotypical** synthetic text cannot.

## Options

| | Substrate | Sees the taxes? | Legal surface |
|---|---|---|---|
| 1 | LLM-only synthetic | ❌ Blind by construction | None |
| 2 | Real unmodified personal prompts | ✅ Yes | 🔴 Counsel STOP (ADR 0015) |
| 3 | **Human-authored realistic prompts, synthetic entities** | 🟠 Better than LLM; carries author-pool bias | 🟢 Privacy-clean |

## Decision

**Option 3 for this parallel-track phase.** The eval substrate is **`human_simulated`** — human-written/
curated realistic EN/BM/ZH office prompts with **synthetic/replaced person names and invented C3-a-style
ID digits** (privacy-clean). Because no real personal data lands on disk, the **ADR 0015 counsel STOP is
waived for this phase**, and **conditionally re-armed** the moment any `real` unmodified personal prompt
enters scope (a code guard, `residency.counsel_gate_required`, plus the re-arm note). Third-party
personal data is not scraped/stored without founder approval. Reviewers are the founder + team, with
**≥1 bilingual Malaysian reviewer for BM/ZH** and no LLM self-audit as final.

## Consequences

- 🔴 **The waiver does NOT discharge ADR 0015's real-substrate requirement for a PRODUCTION ship.**
  `SHIP_CANDIDATE` on `human_simulated` means "worth integrating and testing," not "production-cleared."
  ADR 0015 Option 2 remains owed before production.
- **A small author pool carries its own register bias** — a curated approximation of Malaysian office
  code-switching, not production traffic. The eval report's `authorship_note` must record who authored
  the exam and in what register, so a green score is not over-read.
- If a design partner later shares real prompts, Option 2 becomes the eval's upgrade and the counsel
  STOP re-arms per ADR 0015.
