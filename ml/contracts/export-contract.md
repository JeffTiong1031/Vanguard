# Export contract — sensitive-vs-not span classifier (hand-off)

Integration is OUT OF SCOPE for the ML track. This contract is what eng consumes AFTER Slice 2.

## Artifact
`sens-vMAJOR.MINOR.PATCH/` containing: `model.onnx`, tokenizer files, `labels.json`, `SHA256SUMS`.

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

## I/O
- Inputs: `input_ids`, `attention_mask` (int64, shape [batch, seq]). [names verified at Task 20]
- Output: `logits` (float, shape [batch, 2]) — raw, pre-softmax. [name verified at Task 20]

## Runtime
- Target: ONNX Runtime Web / offscreen (same class as Slice 1 L2). CPU/WASM baseline; WebGPU optional.
- Latency `[unverified]`, on-device size `[unverified]` — eng-gated, do NOT invent numbers.
- Recall of the INTEGRATED system is bounded by NER recall (this model never sees a span NER missed).
  That composed metric is measured after integration, not here.

## Integrity
- Pin by hash and verify before load (ADR 0017 §2; doc 05 §7 "you control when our code changes").
