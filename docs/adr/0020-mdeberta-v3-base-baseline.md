# ADR 0020 — Sensitivity-model baseline is mDeBERTa-v3-base; xlm-roberta-base forbidden; on-device size eng-gated

**Status:** Accepted · **Date:** 2026-07-18 · **Decider:** the founder
**Refines:** [ADR 0019](0019-sensitivity-span-classifier-over-ner.md) · **Related:** doc 03 §4, doc 06 §6.2

## Context

The span classifier (ADR 0019) runs **on-device** (decision #2), landing in the *same* offscreen
document as Slice 1's stock NER — so it adds to doc 06's memory/latency budget, which was already
fighting to stay near ~140 MB. The first plan draft pinned **`xlm-roberta-base`** (~278M params,
~1.1 GB fp32) as the training baseline "to swap later" — a checkpoint nobody would ship and one that
bakes a tokenizer/size story into every downstream task.

## Options

| | Baseline | Why not / why |
|---|---|---|
| **A** | `xlm-roberta-base` | 🔴 Throwaway; not the shipping family; no plausible on-device budget |
| **B** | **`microsoft/mdeberta-v3-base`** | ✅ The package's chosen backbone family (doc 03/06), proven on BM/ZH (doc 03 §3.3), one tokenizer story across L2 and this model |
| **C** | Deliberately tiny from day one | Weaker baseline; premature optimisation before any accuracy signal |

## Decision

**Option B.** Baseline on **`microsoft/mdeberta-v3-base`**, tokenizer/family aligned with Slice 1's L2
(no independent family). **`xlm-roberta-base` is forbidden as the baseline.** On-device size is
**`[unverified]` and eng-gated — no MB target is invented in the plan.** Distillation-to-fit, if
needed, rides doc 06 §6.2's existing trigger rather than being re-litigated here.

## Consequences

- A span classifier over a *marked* span needs far less capacity than full NER, so family alignment is
  affordable; the real size number is a measurement, taken with eng, not a guess.
- **End-user inference target stays CPU/WASM baseline, WebGPU optional** — stated in the export contract
  so nobody trains a model that needs a discrete GPU to run.
- If the eng-gated size lands too high, the answer is doc 06 §6.2 (quantise/distil), and the eval
  (ADR 0015) is the detector that catches the BM/ZH cost of doing so — not a new decision here.
