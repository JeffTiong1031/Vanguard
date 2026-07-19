# Hand-off to the extension — sensitive-vs-not span classifier

**From:** the `ml/` parallel track · **To:** whoever integrates this · **Date:** 2026-07-19
**Do not integrate yet.** ADR 0016 and ADR 0018: Slice 1 → team test → Slice 2 (files) → *then*
sensitivity. Stock NER stays the default in Slice 1 (ADR 0017). This page is the checklist for
that later integration, not a request to start it.

---

## 1. What the artifact is

**The hand-off artifact is the HF checkpoint**, `artifacts/runs/<run_id>/`.

| | |
|---|---|
| Backbone | `microsoft/mdeberta-v3-base`, 278.1M params (embedding 192.1M = 69%) |
| Head | 2-class sequence classification over **one marked span at a time** |
| ONNX fp32 | ✅ **verified** — ORT CPU round-trip vs torch, max abs diff `9.06e-06`, argmax agrees |
| ONNX int8 | 🔴 **BLOCKED — do not ship.** See §6 |

Verify by hash before load (`SHA256SUMS` ships beside the artifact) — ADR 0017 §2, doc 05 §7
*"you control when our code changes, not us"*.

⚠️ **The weights live in `model.onnx.data`, not `model.onnx`.** `model.onnx` is ~0.1 MB of graph.
Shipping it alone gives a model that cannot load.

---

## 2. Inference protocol — reproduce exactly, or your scores will not match ours

1. **NER proposes PER/ORG spans.** This model does **not** detect entities.
   Label mapping: `PERSON → PER`, `ORG`/`ORGANIZATION → ORG`, **`LOC → dropped`** (CLAUDE.md §8.1).
2. 🔴 **Repair the spans — see §3. This is not optional.**
3. **Mark** the span inside the full prompt: `text[:start] + "[E] " + surface + " [/E]" + text[end:]`
   (`sens.marking.mark_span`).
4. **Tokenize with the shipped tokenizer.** `[E]` and `[/E]` are already in it, each a single id.
   **Windowing:** if the marked sequence exceeds 512, do **not** truncate — take a span-centered
   window keeping both markers (`sens.encoding.encode_marked` → `sens.windowing.plan_window`). If
   the marked span alone exceeds the window, **drop or fail that instance**; never clip past a
   marker.
5. **Run → 2 logits** → `labels.json` = `{"0": "KEEP", "1": "MASK"}`.
6. **Default decision is `argmax`.** The model exports **raw logits**, not a hard label. Any
   threshold is **admin/human-gated** and is deliberately not baked in — ADR 0001 puts the
   operating point with the admin.

Full detail: [`contracts/export-contract.md`](contracts/export-contract.md).

---

## 3. 🔴 Span repair is part of the model, not a nicety

Integrated MASK recall, same checkpoint, measured on the locked exam:

| pipeline | integrated MASK recall |
|---|---|
| NER → classifier | **0.650** |
| NER → **span repair** → classifier | **0.883** |
| NER → **org dictionary** → **span repair** → classifier | **0.928** |

**Ship the classifier without these and you ship a system 28 points worse**, and the difference
will look like a model problem when it is not: the classifier scores 0.996 in all three rows.

Both are deterministic, dependency-free, and specified for porting in
[`../docs/team/slice1-span-repair-handoff.md`](../docs/team/slice1-span-repair-handoff.md).
Reference implementations: [`src/sens/span_repair.py`](src/sens/span_repair.py) (29 tests),
[`src/sens/org_dictionary.py`](src/sens/org_dictionary.py) (16 tests).

⚠️ **Span repair is also a compliance fix.** Stock NER proposes `Rahman`; doc 04 §4.3 requires the
honorific **inside** the masked span, so masking the bare name leaves `Encik ____` — a
re-identification pointer that section calls a compliance failure. **Slice 1 has this defect
today, before this model is integrated at all.**

⚠️ The org dictionary is **exact match, case-sensitive, word-bounded** (ADR 0004 forbids fuzzy
matching in Phase 0). `Apple` must not fire on "an apple a day", nor `Grab` inside "grabbed".

---

## 4. What the numbers mean, and what they do not

| | |
|---|---|
| Classifier MASK precision / recall (gold spans) | **1.000 / 0.996** |
| **Integrated MASK recall** | **0.928** |
| Full span coverage | 93.2% — bm 96.7 · en 94.1 · mixed 92.8 · **zh 89.6** |
| `ship_status` | `SHIP_CANDIDATE` |

🔴 **`SHIP_CANDIDATE` means "worth integrating and testing". It does not mean cleared for
production.** The gate is structural — it checks that no trivial-model, substrate or coverage rule
was broken and that an integrated measurement exists. **No numeric threshold has been set**, because
the question that fixes one is a B3 question nobody has asked yet.

🔴 **Use the integrated figure, never the gold-span one.** 0.996 assumes the NER proposes every span
with correct boundaries. It does not. A gate that certifies on the gold-span number is certifying on
an upper bound — that bug existed in our own eval gate until 2026-07-19.

🔴 **A composed eval on the NER you actually ship is a MANDATORY integration gate.** Ours used a
stand-in (`Davlan/bert-base-multilingual-cased-ner-hrl`, AFL-3.0, commercial-use OK) **which was not
trained on Malay** — BM figures rest on cross-lingual transfer. Nothing here discharges that gate.

🔴 **ADR 0015's real-substrate requirement is still owed.** The exam is `human_simulated` under
ADR 0022's waiver: 562 questions from a small author pool, privacy-clean but constructed. Every
number above is "on a corpus we built", not "on production traffic".

---

## 5. On-device size

| | |
|---|---|
| fp32 ONNX | **1061 MB** — measured |
| Trimmed to ~70K vocabulary, fp32 | **~533 MB** → ~0.8–1.1 GB resident |
| D2 budget (`ASSUMPTIONS.md`) | ~1–2 GB addressable |

**Vocabulary trimming in fp32 is very likely sufficient; distillation is not currently required.**
The 86M backbone is irreducible by trimming and 70K vocabulary gives 139.8M params — both confirming
CLAUDE.md §6.2's derivation.

⚠️ **The binding uncertainty is D2, not the model.** `ASSUMPTIONS.md` rates it Medium confidence,
HIGH blast radius, and says it should be replaced by a real device survey. ⚠️ doc 06 §6.1 also
requires the 1.5–2× runtime multiple to be **measured** on D2, warm, at P95 sequence length, **in
Chinese** — the resident-set figure above inherits a rule of thumb doc 06 explicitly refuses to assert.

---

## 6. 🔴 int8 is BLOCKED — do not assume quantization works

`quantize_dynamic` refuses this graph (`ShapeInferenceError`, classifier head). Forcing past it
produces a 307 MB artifact that **runs and is destroyed**:

| | accuracy | MASK recall |
|---|---|---|
| fp32 | 0.9981 | 0.9962 |
| int8 | **0.5000** | **0.0000** |

It predicts KEEP for everything — the trivial model ADR 0021 exists to reject — uniformly across
en/bm/zh/mixed. **The refusal was protecting us.** `scripts/export_onnx.py` deletes a failed int8
artifact so it cannot ship by accident. If you revisit quantization, **the pass condition is the
argmax, not the file size**: 307 MB looks like progress.

---

## 7. Other things a first integration gets wrong

- **The Ignore-rate per class is a prioritization signal, not a label** (doc 07 §7). It ranks our
  bugs; it does not tell us the answer. Local labelling only (doc 02 §4.6).
- **L1 keeps sole ownership of NRIC/SSM/TIN digit grammar** (ADR 0018). This model never adjudicates
  an identifier, and `entity_type` is only `PER` or `ORG`.
- **The exam is frozen.** If you retrain on failures, append them to the **training** set. Any real
  or unredacted personal prompt stays off Colab and re-arms ADR 0015's counsel STOP
  (`sens.residency.counsel_gate_required`).

---

## 8. Where the detail lives

| | |
|---|---|
| I/O, protocol, size, quantization | [`contracts/export-contract.md`](contracts/export-contract.md) |
| Label rubric (MASK vs KEEP) | [`contracts/label-schema.md`](contracts/label-schema.md) |
| Span repair spec for porting | [`../docs/team/slice1-span-repair-handoff.md`](../docs/team/slice1-span-repair-handoff.md) |
| How the numbers were reached, and what went wrong | [`../docs/team/task-17-18-eval-findings.md`](../docs/team/task-17-18-eval-findings.md) |
| Ship-status clearance + open items | [`../docs/team/task-19-ship-status-clearance.md`](../docs/team/task-19-ship-status-clearance.md) |
