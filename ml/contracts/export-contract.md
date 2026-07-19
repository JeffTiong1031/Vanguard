# Export contract — sensitive-vs-not span classifier (hand-off)

Integration is OUT OF SCOPE for the ML track. This contract is what eng consumes AFTER Slice 2.

## Artifact
`sens-vMAJOR.MINOR.PATCH/` containing: `model.onnx`, **`model.onnx.data`**, tokenizer files,
`labels.json`, `SHA256SUMS`.

⚠️ **The weights live in `model.onnx.data`, not in `model.onnx`.** The model exceeds the 2 GB
protobuf limit, so ONNX writes external data: `model.onnx` is ~0.1 MB of graph and the tensors sit
beside it. **Shipping `model.onnx` alone yields a model that cannot load**, and any size figure that
counts only `model.onnx` is off by four orders of magnitude.

## NER → this model — label mapping (locked)
Slice 1's stock NER labels map as: `PERSON → PER`, `ORG`/`ORGANIZATION → ORG`, `LOC → dropped`
(LOC is out of scope, CLAUDE.md §8.1). Only PER/ORG proposals are sent to this classifier. IDs are L1's.

## Inference protocol (what eng must reproduce)
1. Slice 1's stock NER proposes PERSON/ORG spans. (This model does NOT detect entities.)
2. For each span, build the model input by wrapping the span in markers inside the full prompt:
   `text[:start] + "[E] " + surface + " [/E]" + text[end:]`  (see `sens.marking.mark_span`).
3. Tokenize with the shipped tokenizer (the `[E]`/`[/E]` special tokens are already in it, each a
   single id). **Windowing:** if the marked sequence exceeds `max_len` (512), do NOT blindly truncate —
   take a **span-centered window** that keeps both markers (see `sens.windowing.plan_window`); if the
   marked span alone exceeds the window, that instance is dropped/failed, never silently clipped past a
   marker. Eng must reproduce this exact windowing or scores diverge from the reported eval.
4. Run the model → 2 logits → `labels.json` (`{"0":"KEEP","1":"MASK"}`).
5. **Default decision = `argmax`** until an admin sets a threshold. The model exports **raw logits/scores**,
   not a hard label; THRESHOLD IS HUMAN/ADMIN-GATED — not baked into the model.

## I/O — ✅ verified at Task 20 (2026-07-19)
- Inputs: `input_ids`, `attention_mask` (int64, shape `[batch, seq]`) — both dynamic.
- Output: `logits` (float, shape `[batch, 2]`) — raw, pre-softmax.
- opset **17**, 885 nodes.
- **ORT CPU round-trip vs torch: max abs diff `9.06e-06`** over EN/BM/ZH marked strings, argmax
  agrees on all. Export is verified, not assumed.

## Quantization — 🔴 `BLOCKED`. int8 is NOT available for this model as it stands.

Two independent refusals, and the second is the serious one.

**1. The quantizer refuses the graph.**
```
InferenceError: [ShapeInferenceError] Inferred shape and existing shape
differ in dimension 0: (768) vs (2)
```
Three option sets fail identically, so the fault is in the exported graph — the classifier head —
not in the quantizer's configuration.

**2. Forcing past it produces a model that runs and is destroyed.** Dropping the exporter's stale
`value_info` lets shape inference recompute and quantization then completes, yielding a **307 MB**
artifact. Scored against the exam, that artifact is degenerate:

| | accuracy | MASK recall |
|---|---|---|
| fp32 (torch) | **0.9981** | **0.9962** |
| int8 (ONNX) | **0.5000** | **0.0000** |

It predicts **KEEP for everything** — the trivial model ADR 0021 exists to reject — and the loss is
**uniform across en/bm/zh/mixed** (−0.49 to −0.52 each), not the BM/ZH-first degradation doc 06
§6.3 anticipated. fp32/int8 prediction agreement is **50.2%**, i.e. chance.

> **The shape-inference refusal was protecting us.** The graph metadata was inconsistent for a
> reason, and the "fix" that silenced it produced a plausible-looking 307 MB artifact that
> answers everything wrong. The round-trip gate caught it on `argmax`; the size report alone
> would not have. **`export_onnx.py` now deletes a failed int8 artifact** so it cannot be shipped
> by accident.

**Consequence: quantization cannot currently be assumed as a size lever.** Any budget that reaches
a shippable number by way of int8 is resting on something that does not work yet.

## Runtime — size measured, latency still `[unverified]`

| | |
|---|---|
| Parameters | **278.1M** (embedding **192.1M = 69%**) |
| fp32 ONNX (`model.onnx` + `.data`) | **1061 MB** — measured, verified |
| int8 | **307 MB** — measured, **REJECTED** (degenerate, see above) |
| doc 06 §6.2 distillation trigger | ~140 MB |

### Does it fit? Probably — and an earlier version of this section said otherwise

🔴 **Read doc 06 §6.2's trigger carefully, because this contract first read it wrong.** It says
distillation becomes a Phase 0 requirement *"if the D2 memory budget lands below ~140 MB of
weights"*. **~140 MB is what trimming is expected to ACHIEVE, not a ceiling to fit under.** The
budget is `ASSUMPTIONS.md` **D2: ~1–2 GB addressable by the extension before the user notices**.

Measured, against that budget:

| | weights | × 1.5–2 runtime multiple | vs D2's ~1–2 GB |
|---|---|---|---|
| Untrimmed fp32 | 1061 MB | 1.6–2.1 GB | 🔴 over |
| **Trimmed to 70K vocab, fp32** | **533 MB** | **0.8–1.1 GB** | ✅ **within budget** |

**Vocabulary trimming in fp32 is very likely sufficient. int8 being broken is not fatal, because
int8 was never required to reach the budget.**

> ⚠️ **This section previously concluded "distillation is a Phase 0 requirement, not a risk".**
> That was wrong, and it came from reading ~140 MB as a ceiling rather than as trimming's target.
> The measurements were right; the proposition they were compared against was not.

**Trimming figures, measured** (not assumed): the backbone is **86.0M parameters and irreducible by
trimming**, and 70K vocabulary gives **139.8M total** — both confirming CLAUDE.md §6.2's derivation
exactly. Trimming buys one halving and is then exhausted.

⚠️ **The binding uncertainty is D2, not the model.** `ASSUMPTIONS.md` rates D2 **Medium** confidence
with **HIGH** blast radius and says it *"should be replaced with a real device survey from the first
design partner"*. An 8 GB floor makes trimming mandatory; a 16 GB floor makes the budget
comfortable. **The size question is now gated on a device survey, not on more engineering here.**

⚠️ Also unresolved: doc 06 §6.1 requires the **1.5–2× runtime multiple to be measured, not
inherited** — resident set on D2, warm, at P95 sequence length, **in Chinese** because the wedge's
languages produce the longest sequences. That measurement has not been taken. The 0.8–1.1 GB row
above inherits the rule of thumb doc 06 explicitly refuses to assert.

⚠️ Per doc 06 §6.3, trimming, quantization and distillation each degrade **BM/ZH first** — three
taxes on the one asset the wedge is built on.

⚠️ Per doc 06 §6.3, trimming, quantization and distillation each degrade **BM/ZH first** — three
taxes on the one asset the wedge is built on.

- Target: ONNX Runtime Web / offscreen (same class as Slice 1 L2). CPU/WASM baseline; WebGPU optional.
- **Latency `[unverified]`** — eng-gated, do NOT invent numbers.
- Recall of the INTEGRATED system is bounded by NER recall (this model never sees a span NER missed).
  Measured at Task 18: **integrated MASK recall 0.928** with span repair + org dictionary, against
  0.996 on gold spans. Use the integrated figure; the gold-span one is an upper bound.

## Integrity
- Pin by hash and verify before load (ADR 0017 §2; doc 05 §7 "you control when our code changes").
