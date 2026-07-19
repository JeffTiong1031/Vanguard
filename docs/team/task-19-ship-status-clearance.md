# Task 19 — ship-status review: CLEARED

**Date:** 2026-07-19 · **Decision:** founder · **Model:** `colab_v7`
**Exam:** `human_simulated`, 562 questions, SHA256 `22708BCDFBAB4B0F1D33CCD424884AFFF320747A9781BCB0CD3087197C285A8F`

The numbers the decision was taken on, so a later reader can check what was accepted rather
than infer it.

---

## Reports read

| | value |
|---|---|
| `ship_status` (composed pipeline) | **`SHIP_CANDIDATE`**, no blocking reasons |
| Classifier MASK **precision** | **1.0000** |
| Classifier MASK **recall** | **0.9961** (gold spans) · **0.9960** (NER-proposed spans) |
| `full_mention_coverage` | **1.0000** |
| **Integrated MASK recall** | **0.928** |
| MASK spans covered in full by NER | **93.2%** — bm 96.7 · en 94.1 · mixed 92.8 · **zh 89.6** |
| Complete NER blind spots | **2.3%** |
| `missing_strata` | none — 16/16 |
| Substitution-probe flips | **2 / 500** (0.4%), balanced 1 MASK / 1 KEEP |
| Exam counterexample questions | **30 / 30** correct |

Pipeline: stock NER → org dictionary → span repair → classifier.

---

## What `SHIP_CANDIDATE` means here, and what it does not

Per the plan, it means **"worth integrating and testing"**. It does **not** mean cleared for
production. The gate is **structural**: it verifies that no trivial-model rule, no substrate rule
and no coverage rule was violated, and that an integrated measurement exists and is non-trivial.

**No numeric threshold was set, deliberately.** ADR 0001 puts the operating point with the admin,
and the number that would fix it — how many false flags a team absorbs per week before loosening or
disabling a control — is a **B3 question that has not been asked**. Inventing a floor here would
have produced a figure with nothing behind it.

---

## Accepted with these open items, none of which the numbers above discharge

1. 🔴 **ADR 0015 real-substrate is still owed.** The exam is `human_simulated` under
   [ADR 0022](../adr/0022-human-simulated-substrate-and-counsel-stop.md)'s waiver. Every figure here
   is "on a corpus we constructed", not "on production traffic".
2. 🔴 **Stand-in NER, not the shipped one.** A composed eval on the NER Slice 1 actually ships is a
   **mandatory integration gate** and is not discharged by this.
3. 🔴 **Neither candidate NER was trained on Malay.** BM figures rest on cross-lingual transfer, so
   they are the least stable numbers in the table.
4. ⚠️ **Exam confound is reduced, not neutral** — generic-ORG `P(MASK)` 0.800, titled-PER 0.765,
   from 1.000 / 0.988 before counterexamples. The substitution probe is still doing part of the
   discriminating work, and a probe is generated, so it is a diagnostic and never ship evidence.
5. ⚠️ **~2.3% of sensitive entities remain invisible** to both the NER and the dictionary.
6. ⚠️ **Task 20 ran before this gate cleared.** The plan orders Task 19 → Task 20; in practice the
   export measurement was taken first. Nothing in the export changed the numbers above, but the
   order was not as written and is recorded rather than tidied away.

---

## Consequences of clearing

- **Task 20 export** is authorised. Outcome: **fp32 ONNX verified** (ORT round-trip max abs diff
  `9.06e-06`, argmax agrees); **int8 `BLOCKED`** — forcing past the blocker yields a degenerate model
  (accuracy 0.50, MASK recall 0.000). The **HF checkpoint is the hand-off artifact**; ONNX fp32 is
  verified but int8 is an open item, not a shipped file.
- **Size:** untrimmed fp32 is 1061 MB; trimmed to 70K vocabulary it is ~533 MB, i.e. ~0.8–1.1 GB
  resident, inside D2's stated ~1–2 GB. **Distillation is not currently required** — but **D2 is a
  Medium-confidence assumption with HIGH blast radius** and is owed a real device survey, and doc 06
  §6.1's runtime multiple is still inherited rather than measured.
- **No integration.** ADR 0016 and ADR 0018 stand: Slice 1 → team test → Slice 2 → then sensitivity.
