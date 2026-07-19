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

## Quantization — 🔴 `BLOCKED`, do not assume int8 works
`onnxruntime.quantization.quantize_dynamic` fails on this graph:

```
InferenceError: [ShapeInferenceError] Inferred shape and existing shape
differ in dimension 0: (768) vs (2)
```

Three variants were tried (`use_external_data_format`, `MatMulConstBOnly`, `MatMul`-only) and all
fail identically, so the fault is in the exported graph — the classifier head — not in the
quantizer's options. **Recorded as blocked rather than worked around**: a measurement gate that
succeeds by some other route is not a measurement.

## Runtime — size measured, latency still `[unverified]`

| | |
|---|---|
| Parameters | **278.1M** (embedding **192.1M = 69%**) |
| fp32 ONNX (`model.onnx` + `.data`) | **1061 MB** — measured |
| int8 | **~265 MB** *(estimate, 1 byte/param — quantization is blocked, so this is NOT measured)* |
| doc 06 §6.2 distillation trigger | ~140 MB |

🔴 **The trigger is effectively fired.** int8 at ~265 MB is 1.9× the budget. Vocabulary trimming
buys **one** halving and is then exhausted (CLAUDE.md §6.2) → ~133 MB, which clears ~140 MB by
7 MB with **no margin left**. Any additional pressure — the 1.5–2× runtime multiple over weights,
WASM overhead — puts distillation from a risk to a Phase 0 requirement.

⚠️ **~265 MB is an estimate and the decision leans on it.** A real int8 graph carries scale and
zero-point tensors, so the measured figure will be larger, not smaller. **Treat ~133 MB post-trim as
an optimistic bound.**

⚠️ Per doc 06 §6.3, trimming, quantization and distillation each degrade **BM/ZH first** — three
taxes on the one asset the wedge is built on.

- Target: ONNX Runtime Web / offscreen (same class as Slice 1 L2). CPU/WASM baseline; WebGPU optional.
- **Latency `[unverified]`** — eng-gated, do NOT invent numbers.
- Recall of the INTEGRATED system is bounded by NER recall (this model never sees a span NER missed).
  Measured at Task 18: **integrated MASK recall 0.928** with span repair + org dictionary, against
  0.996 on gold spans. Use the integrated figure; the gold-span one is an upper bound.

## Integrity
- Pin by hash and verify before load (ADR 0017 §2; doc 05 §7 "you control when our code changes").
