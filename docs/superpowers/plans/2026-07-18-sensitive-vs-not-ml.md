# Sensitive-vs-Not Parallel ML Track — Implementation Plan (Span Classifier)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Supersedes** `docs/superpowers/plans/2026-07-17-sensitive-vs-not-parallel-track.md`. That plan built a
> **standalone MASK token-tagger** (architecture A). The founder chose **architecture B** on 2026-07-18: a
> **span classifier** — stock NER (Slice 1's L2) proposes PERSON/ORG spans; this model only decides
> **sensitive (MASK) vs keep (KEEP)** per span. The bones (TDD scaffold, schema→validate→metrics→gate→train→export)
> are kept; the data shape, model, metrics, and export contract are rebuilt for a classifier. **Do not execute the
> 2026-07-17 plan.**

**Goal:** Build an isolated `ml/` tree that generates audited training data, trains a small multilingual **span
classifier** on `mdeberta-v3-base`, evaluates it on a **human-authored realistic (`human_simulated`) eval substrate**,
and exports a hash-pinned ONNX artifact with a written extension hand-off contract — without ever blocking Slice 1/2,
touching `code/extension/`, or shipping on synthetic-only scores.

**Architecture:** Each training/eval record is a prompt plus a list of **candidate PER/ORG spans**, each carrying a
gold label `MASK` or `KEEP`. Slice 1's stock NER supplies these spans *at inference* (out of scope here); in this track
the spans are authored/injected so the model sees the **isolated sensitivity decision**. A span is presented to the
model by wrapping it in special marker tokens `[E] … [/E]` inside the full prompt (so surrounding context is visible —
the discriminator is relational context, not fame), and the model does a **binary sequence classification** from the
pooled `[CLS]` representation. LLM output is **augmentation only**. The eval refuses `SHIP_CANDIDATE` unless the eval
substrate is `human_simulated`/`real`-dominant, MASK recall is non-zero, and required strata are present.

**Tech Stack:** Python 3.11+, pytest, pydantic v2 (unit tests import **no torch**), Hugging Face `transformers` +
`datasets` + `tokenizers`, PyTorch (train only), ONNX export via `torch.onnx`. JSONL on disk.

## Global Constraints

Every task's requirements implicitly include this section. Values are copied verbatim from the founder's locked decisions.

- **Does NOT amend ADR 0016.** Product order stays Slice 1 → team test → Slice 2 (files) → *then* integrate sensitivity. This track runs in parallel and **must never block Slice 1/2.**
- **Executor scope is `ml/` (+ `docs/team/` sync in the final task) only.** **Never** touch `code/extension/`, `code/backend/`, Slice 1, Slice 2, offscreen wiring, or adapters. Integration is out of scope.
- **Architecture B — span classifier.** The model classifies a *given* PER/ORG span as `MASK`/`KEEP`. It is **not** an entity detector and **not** a MASK token-tagger.
- **Backbone = `microsoft/mdeberta-v3-base`** (family-aligned with Slice 1 L2 and docs 03–06). Tokenizer/family aligned with L2 — **no independent family.** **`xlm-roberta-base` is forbidden as the baseline.** On-device size is `[unverified]` and **eng-gated — do not invent an MB target.** Distillation-to-fit rides doc 06 §6.2's existing trigger; do not re-litigate it here.
- **L1 owns NRIC/SSM/TIN-shaped digits.** The model is only ever given PER/ORG spans; identifier digits are **never** spans it classifies. `entity_type ∈ {PER, ORG}` — there is no ID type.
- **Label policy (founder, 2026-07-18):** relational-context discriminator. General-knowledge / public discussion / historical/fictional / entity-as-topic → **KEEP**; private working / customer / employee / contractual / financial / transactional context → **MASK**. The **same surface** may flip by context. **Genuinely ambiguous → KEEP** (precision-first tie-break only — *not* licence to predict KEEP broadly).
- **Anti-trivial ship rules:** report **MASK precision and MASK recall separately**; report proportion of true MASK detected; retain doc 07 §1.4's 100%-mention-coverage where applicable; require strata coverage across EN/BM/ZH × PER/ORG × MASK/KEEP. An always-KEEP or unacceptable-MASK-recall model is **NOT_SHIPPED even at zero false alarms.** **Do not invent a numeric recall/precision threshold** — the operating point is human/admin-gated.
- **Provenance three-way:** `provenance ∈ {llm_synthetic, human_simulated, real}`. `SHIP_CANDIDATE` only when the eval split is `human_simulated`- or `real`-dominant (**never** `llm_synthetic`-dominant). `llm_synthetic` is training-draft only.
- **Eval text substrate this phase = `human_simulated`** — human-authored/curated realistic EN/BM/ZH office prompts with **synthetic/replaced person names and C3-a-style invented ID digits** (privacy-clean). LLM-only synthetic is never the sole ship signal (ADR 0015, doc 07 §5).
- **Counsel STOP is WAIVED this phase** (data is `human_simulated`, privacy-clean) and **conditionally re-armed** the moment any `real` unmodified personal prompt enters scope (ADR 0015 / U25). Do not scrape or store third-party personal data without founder approval.
- 🔴 **The `human_simulated` waiver does NOT discharge ADR 0015's real-substrate requirement for a PRODUCTION ship.** It is a founder waiver for this **parallel-track phase** only. `SHIP_CANDIDATE` here means "worth integrating and testing," **not** "cleared for production." ADR 0015's Option 2 (real substrate) remains owed before any production ship, and a **small author pool carries its own register bias** — the eval report's `authorship_note` must state who authored the exam and in what register, and this residual risk is a named line in the gate index, not buried prose.
- 🔴 **v1 metrics are GOLD-SPAN-only, and that is a known upper bound.** The classifier is trained/evaluated on author-perfect PER/ORG spans; production uses Slice 1 stock NER, whose boundaries are noisy and whose misses the classifier can never recover. **Integrated recall is upper-bounded by NER recall.** The plan measures a **composed NER→classifier metric** on the exam (Task 18) as the honest integration number, and a full composed eval on the *live* NER is a **mandatory integration gate after Slice 1** — not optional HANDOFF prose.
- **Compute / residency:** CI + unit + tiny-fixture smoke = **CPU-only, no torch import required to pass tests.** `llm_synthetic` training may use Google Colab. **`real`-provenance data stays on the local MY machine (RTX 5070) / MY-region infra — never Colab or non-MY cloud.** Eval runs on CPU or the local RTX 5070; it needs no cloud. Retraining on real-eval failures happens locally, not on Colab. A **held-out `eval` split is never used for training** ("don't train on the exam") — code-guarded.
- **End-user inference target = CPU/WASM baseline, WebGPU optional** — stated in the export contract; do not train a model that requires a discrete GPU to run.
- **Every number is cited, `(estimate)`, or `[unverified]` — gap over fabrication.**
- **Commits carry no `Co-Authored-By` trailer** (CLAUDE.md §6.1); `git config` authorship is already correct.
- Canonical rules: `docs/07-ml-training-and-data-strategy.md`, `docs/adr/0015-eval-corpus-is-real.md`, `docs/adr/0016-mvp-first-sequencing.md`, `docs/adr/0017-slice-1-technical-choices.md`, `docs/team/sensitive-vs-not-parallel-track.md`.

---

## File structure (locked)

```text
ml/
  README.md
  pyproject.toml
  .gitignore
  contracts/
    label-schema.md            # Q4 rubric + examples + strata (Task 3)
    export-contract.md         # span-classifier ONNX hand-off (Task 4, finalized Task 20)
    eval-authoring-template.md  # exam authoring template + coverage checklist (Task 13)
  src/sens/
    __init__.py
    schema.py                  # Example, Span(entity_type, label), provenance, tags (Task 2)
    validate_jsonl.py          # load + validate (Task 5)
    residency.py               # split-guard + real-data location guard (Task 6)
    marking.py                 # [E]/[/E] span markers; span → model-input text (Task 7)
    windowing.py               # span-centered token window when markers exceed max_len (Task 7)
    align.py                   # align NER-proposed spans to gold for composed eval (Task 8b)
    sample_audit.py            # stratified audit sampler over (lang, label) (Task 8)
    disagreement.py            # label disagreement per lang (Task 9)
    metrics.py                 # MASK P/R separate + 100% mention coverage (Task 10)
    coverage.py                # required-strata checklist + stratum counts (Task 11)
    eval_gate.py               # ship_status: provenance + anti-trivial + coverage (Task 12)
  prompts/
    v1_generate_span_labels.md  # LLM draft-generation prompt (Task 14)
  scripts/
    generate_fixtures.py       # deterministic CI data, no LLM API (Task 14)
    generate_llm_draft.py      # optional; Colab; llm_synthetic only (Task 14)
    merge_audit.py             # merge audited labels + print disagreement (Task 9)
    train_span_clf.py          # mdeberta-v3-base seq-classifier (Task 16)
    run_eval.py                # gold-span metrics + gate report (Task 17)
    run_composed_eval.py       # stock NER → align → classifier; NER miss rate (Task 18)
    export_onnx.py             # ONNX + ORT round-trip verify + SHA256 pin (Task 20)
  tests/
    test_schema.py  test_validate_jsonl.py  test_residency.py  test_marking.py
    test_windowing.py  test_align.py  test_tokenizer_markers.py  # (last is train-gated)
    test_sample_audit.py  test_disagreement.py  test_metrics.py
    test_coverage.py  test_eval_gate.py
  data/
    fixtures/                  # tiny committed llm_synthetic JSONL (safe)
    README.md
  artifacts/                   # gitignored: runs, onnx, reports
```

**A safety property to preserve deliberately:** every committed fixture is `provenance=llm_synthetic`, so `eval_gate.ship_status` **structurally returns `NOT_SHIPPED` on fixtures** — CI can never emit `SHIP_CANDIDATE` off synthetic data. The SHIP path is exercised **only** by the human-authored exam at Task 15. (This is the antidote to CLAUDE.md ledger #11: the gate's SHIP branch is never fed by a fixture that supplies the field under test.)

---

### Task 1: Scaffold `ml/` package and ignore rules

**Files:**
- Create: `ml/pyproject.toml`, `ml/.gitignore`, `ml/README.md`, `ml/data/README.md`, `ml/src/sens/__init__.py`
- Modify: `.gitignore` (repo root) — append `ml/artifacts/` and weight patterns if absent

**Interfaces:**
- Consumes: none
- Produces: installable package `sens` (base install has **no torch**; `train` extra adds it)

- [ ] **Step 1: Create `ml/pyproject.toml`**

```toml
[project]
name = "sens"
version = "0.1.0"
description = "Sensitive-vs-not parallel track — span classifier (training + eval tooling)"
requires-python = ">=3.11"
dependencies = [
  "pydantic>=2.6",
]

[project.optional-dependencies]
dev = ["pytest>=8.0"]
train = [
  "torch",
  "transformers>=4.44",
  "datasets>=2.18",
  "accelerate",
  "sentencepiece",
  "onnx",
  "onnxruntime",
  "numpy",
]

[build-system]
requires = ["setuptools>=68"]
build-backend = "setuptools.build_meta"

[tool.setuptools.packages.find]
where = ["src"]

[tool.pytest.ini_options]
testpaths = ["tests"]
pythonpath = ["src"]
```

> `transformers>=4.44` because `TrainingArguments` uses `eval_strategy` (the post-4.41 name) in Task 16. `sentencepiece` is required — `mdeberta-v3-base` uses a SentencePiece tokenizer.

- [ ] **Step 2: Create `ml/.gitignore`**

```gitignore
artifacts/
**/__pycache__/
.pytest_cache/
.venv/
*.onnx
*.pt
*.bin
*.safetensors
data/train/
data/dev/
data/eval_real/
data/eval_simulated/
data/llm_draft/
*.egg-info/
dist/
build/
```

- [ ] **Step 3: Create `ml/data/README.md`**

```markdown
# Data policy

- **Commit:** tiny `llm_synthetic` fixtures under `fixtures/` only (safe, for CI).
- **Do NOT commit:** the human-authored eval exam, full LLM dumps, weights, ONNX, or any `real` prompt.
- `human_simulated` = human-written realistic office prompts with SYNTHETIC/replaced names and INVENTED
  ID digits (privacy-clean). Kept off git (large + is the exam), but not a counsel event.
- `real` = real unmodified personal prompts. NOT in scope this phase. If ever introduced: ADR 0015 /
  U25 counsel + retention STOP, and it stays on the local MY machine / MY-region infra — never Colab.
- The `eval` split is the exam: never merged into a training split (see `sens.residency`).
```

- [ ] **Step 4: Create `ml/README.md`**

```markdown
# ml/ — sensitive-vs-not parallel track (span classifier)

Operating brief: [`docs/team/sensitive-vs-not-parallel-track.md`](../docs/team/sensitive-vs-not-parallel-track.md)
Plan: [`docs/superpowers/plans/2026-07-18-sensitive-vs-not-ml.md`](../docs/superpowers/plans/2026-07-18-sensitive-vs-not-ml.md)

This model classifies a NER-proposed PERSON/ORG span as MASK (sensitive) or KEEP. It does NOT detect
entities and does NOT own ID digits (L1 does). It does not block Slice 1/2 and no weights live in git.

```bash
cd ml
python -m venv .venv
# Windows: .venv\Scripts\activate
pip install -e ".[dev]"     # unit tests, CPU-only, no torch
pytest -q
pip install -e ".[dev,train]"  # only when you reach training (Task 16)
```
```

- [ ] **Step 5: Create `ml/src/sens/__init__.py`**

```python
"""Sensitive-vs-not span classifier (parallel track)."""

__version__ = "0.1.0"
```

- [ ] **Step 6: Install (base, CPU) and sanity-check**

Run from `ml/`:

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -e ".[dev]"
pytest -q
```

Expected: pytest exits 5 ("no tests ran") until Task 2 — acceptable. **`torch` must NOT be installed by this step.**

- [ ] **Step 7: Commit**

```bash
git add ml/pyproject.toml ml/.gitignore ml/README.md ml/data/README.md ml/src/sens/__init__.py .gitignore
git commit -m "chore(ml): scaffold sensitive-vs-not span-classifier package (CPU-only base)"
```

---

### Task 2: Record schema (Pydantic) — spans carry a KEEP/MASK label

**Files:**
- Create: `ml/src/sens/schema.py`, `ml/tests/test_schema.py`

**Interfaces:**
- Consumes: none
- Produces:
  - `class Span(BaseModel): start:int; end:int; surface:str; entity_type:Literal["PER","ORG"]; label:Literal["MASK","KEEP"]`
  - `class Example(BaseModel): id:str; text:str; lang:Literal["en","bm","zh","mixed"]; spans:list[Span]; provenance:Literal["llm_synthetic","human_simulated","real"]; split:Literal["train","dev","eval"]; source:str="unknown"; tags:list[str]=[]`
  - `def assert_spans_valid(example: Example) -> None`

Unlike architecture A, **both** MASK and KEEP spans are stored — the classifier needs positive and negative instances. A public entity used as a topic (`Einstein`) is a **KEEP span**, not an absent one. `tags` marks checklist cases (`ambiguous_keep`, `math_no_mask`, `id_digit_line`) for Task 11.

- [ ] **Step 1: Write the failing test**

```python
# ml/tests/test_schema.py
import pytest
from pydantic import ValidationError
from sens.schema import Example, Span, assert_spans_valid


def _ex(**kw):
    base = dict(id="x", text="t", lang="en", spans=[], provenance="llm_synthetic", split="train")
    base.update(kw)
    return Example(**base)


def test_keep_and_mask_spans_both_valid():
    ex = _ex(
        text="Explain Einstein's theory to Ahmad bin Ali.",
        spans=[
            Span(start=8, end=16, surface="Einstein", entity_type="PER", label="KEEP"),
            Span(start=29, end=42, surface="Ahmad bin Ali", entity_type="PER", label="MASK"),
        ],
    )
    assert_spans_valid(ex)
    assert ex.spans[0].label == "KEEP"
    assert ex.spans[1].label == "MASK"


def test_surface_mismatch_raises():
    ex = _ex(text="Hello Einstein", spans=[Span(start=6, end=14, surface="Wrong", entity_type="PER", label="KEEP")])
    with pytest.raises(ValueError, match="surface"):
        assert_spans_valid(ex)


def test_end_not_after_start_raises():
    with pytest.raises(ValidationError):
        Span(start=5, end=5, surface="", entity_type="PER", label="KEEP")


def test_rejects_id_entity_type():
    with pytest.raises(ValidationError):
        Span(start=0, end=1, surface="x", entity_type="ID", label="MASK")  # type: ignore[arg-type]


def test_rejects_unknown_provenance():
    with pytest.raises(ValidationError):
        _ex(provenance="mystery")  # type: ignore[arg-type]


def test_rejects_overlapping_spans():
    # nested/overlapping marker regions would corrupt single-span marking (Task 7) — reject at validate
    ex = _ex(
        text="Ahmad bin Ali called.",
        spans=[
            Span(start=0, end=13, surface="Ahmad bin Ali", entity_type="PER", label="MASK"),
            Span(start=6, end=13, surface="bin Ali", entity_type="PER", label="MASK"),
        ],
    )
    with pytest.raises(ValueError, match="overlap"):
        assert_spans_valid(ex)
```

- [ ] **Step 2: Run — expect FAIL** — `pytest tests/test_schema.py -v` → `ModuleNotFoundError: sens.schema`

- [ ] **Step 3: Implement**

```python
# ml/src/sens/schema.py
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator

EntityType = Literal["PER", "ORG"]
Label = Literal["MASK", "KEEP"]
Provenance = Literal["llm_synthetic", "human_simulated", "real"]
Split = Literal["train", "dev", "eval"]
Lang = Literal["en", "bm", "zh", "mixed"]


class Span(BaseModel):
    start: int = Field(ge=0)
    end: int = Field(ge=0)
    surface: str
    entity_type: EntityType
    label: Label

    @field_validator("end")
    @classmethod
    def _end_gt_start(cls, end: int, info):
        start = info.data.get("start")
        if start is not None and end <= start:
            raise ValueError("end must be > start")
        return end


class Example(BaseModel):
    id: str
    text: str
    lang: Lang
    spans: list[Span] = Field(default_factory=list)
    provenance: Provenance
    split: Split
    source: str = "unknown"
    tags: list[str] = Field(default_factory=list)


def assert_spans_valid(example: Example) -> None:
    n = len(example.text)
    for sp in example.spans:
        if sp.end > n:
            raise ValueError(f"{example.id}: span end {sp.end} exceeds text length {n}")
        sliced = example.text[sp.start : sp.end]
        if sliced != sp.surface:
            raise ValueError(f"{example.id}: surface mismatch {sp.surface!r} != {sliced!r}")
    # Reject overlapping/nested spans: each span is marked independently (Task 7), and two markers
    # inside one another produce a corrupt input. NER emits disjoint PER/ORG spans in practice.
    ordered = sorted(example.spans, key=lambda s: (s.start, s.end))
    for a, b in zip(ordered, ordered[1:]):
        if b.start < a.end:
            raise ValueError(
                f"{example.id}: overlapping spans ({a.start},{a.end}) and ({b.start},{b.end})"
            )
```

Update the **Produces** note for `assert_spans_valid` in this task's Interfaces to add: *"raises on overlapping/nested spans."*

- [ ] **Step 4: Run — expect PASS** — `pytest tests/test_schema.py -v`

- [ ] **Step 5: Commit**

```bash
git add ml/src/sens/schema.py ml/tests/test_schema.py
git commit -m "feat(ml): span-classifier record schema (PER/ORG spans with KEEP/MASK labels)"
```

---

### Task 3: Label-schema contract (Q4 rubric, human-readable)

**Files:**
- Create: `ml/contracts/label-schema.md`

**Interfaces:**
- Consumes: Task 2 record shape
- Produces: the adjudication rule auditors + the LLM prompt + eval authors all apply

- [ ] **Step 1: Write `ml/contracts/label-schema.md`** containing, verbatim, the discriminator and these ratified examples:

```markdown
# Label schema — sensitive (MASK) vs keep (KEEP)

The model classifies each NER-proposed PERSON/ORG span using the SURROUNDING PROMPT CONTEXT, not the
entity's fame or surface text alone. The SAME name can be labelled differently in different contexts.

## Rule
- KEEP — general knowledge, public discussion, historical/fictional discussion, or the entity used
  merely as a TOPIC.
- MASK — a private working, customer, employee, contractual, financial, or transactional relationship
  revealed by context.
- Genuinely ambiguous (no disambiguating context) → KEEP. This is a precision-first tie-break ONLY.
  It is NOT permission to predict KEEP broadly.

## PERSON
| Prompt | Span | Label |
|---|---|---|
| Explain Einstein's theory | Einstein | KEEP |
| Einstein from accounting has not sent the invoice | Einstein | MASK |
| What is Anwar's position on X? | Anwar | KEEP |
| Ask Anwar from accounts to send the customer file | Anwar | MASK |

## ORG
| Prompt | Span | Label |
|---|---|---|
| Summarise Apple's earnings | Apple | KEEP |
| What does Sdn Bhd mean? | Sdn Bhd | KEEP |
| Chase payment from X Sdn Bhd; they owe us RM50,000 | X Sdn Bhd | MASK |
| A public employer name in clearly private/internal/transactional context | (that org) | MASK |

Public status ALONE does not decide it. A public employer named in an internal/transactional context
may be MASK.

## Honorifics / titles (doc 04 §4.3)
When a PERSON is MASK, the **title is INSIDE the MASK span** — `Encik Rahman`, `Dato' Seri Ali`,
`张先生` mask as one span, not just the bare name. Leaving `Dato' Seri ____` is a re-identification
pointer, which is a compliance failure, not a cosmetic one. When a PERSON is KEEP, the title is KEEP too.
(Author the span offsets to include the title.)

## Out of scope for this model
- NRIC / SSM / TIN and other ID-shaped digits are owned by L1 (written, not trained). They may appear
  in a prompt, but they are NEVER spans this model classifies. `entity_type` is only PER or ORG.
- Ordinary math / non-PII numbers ("1 + 1", a year, a quantity) must not force MASK.
- LOC is out of scope (CLAUDE.md §8.1): stock NER's LOC conflates public geography with addresses;
  Slice 1 does not mask it and this model does not classify it. NER label mapping at integration:
  `PERSON→PER`, `ORG/ORGANIZATION→ORG`, `LOC→dropped` (also stated in `export-contract.md`).
```

- [ ] **Step 2: Commit**

```bash
git add ml/contracts/label-schema.md
git commit -m "docs(ml): label schema — relational-context MASK/KEEP rubric for auditors"
```

---

### Task 4: Export-contract draft (extension hand-off skeleton)

**Files:**
- Create: `ml/contracts/export-contract.md`

**Interfaces:**
- Consumes: none from code yet (I/O names filled in from the real export at Task 20)
- Produces: the agreed artifact shape for later eng integration

- [ ] **Step 1: Write `ml/contracts/export-contract.md`**

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add ml/contracts/export-contract.md
git commit -m "docs(ml): draft ONNX export/hand-off contract for span classifier"
```

---

### Task 5: JSONL validation library + CLI + tiny fixture

**Files:**
- Create: `ml/src/sens/validate_jsonl.py`, `ml/tests/test_validate_jsonl.py`, `ml/data/fixtures/tiny_train.jsonl`

**Interfaces:**
- Consumes: `Example`, `assert_spans_valid`
- Produces: `def load_jsonl(path: Path) -> list[Example]` · `def validate_path(path: Path) -> list[str]` (error strings; empty = ok)

- [ ] **Step 1: Write the fixture (offsets verified in Step 5)**

```jsonl
{"id":"fx-einstein","text":"Explain Einstein's theory of relativity.","lang":"en","spans":[{"start":8,"end":16,"surface":"Einstein","entity_type":"PER","label":"KEEP"}],"provenance":"llm_synthetic","split":"train","source":"fixture"}
{"id":"fx-ahmad","text":"Email Ahmad bin Ali about the overdue invoice.","lang":"en","spans":[{"start":6,"end":19,"surface":"Ahmad bin Ali","entity_type":"PER","label":"MASK"}],"provenance":"llm_synthetic","split":"train","source":"fixture"}
{"id":"fx-math","text":"What is 1 + 1?","lang":"en","spans":[],"provenance":"llm_synthetic","split":"train","source":"fixture","tags":["math_no_mask"]}
```

- [ ] **Step 2: Write failing tests**

```python
# ml/tests/test_validate_jsonl.py
from pathlib import Path
from sens.validate_jsonl import load_jsonl, validate_path

FIXTURES = Path(__file__).resolve().parents[1] / "data" / "fixtures" / "tiny_train.jsonl"


def test_load_fixture():
    rows = load_jsonl(FIXTURES)
    assert len(rows) == 3
    assert rows[1].spans[0].surface == "Ahmad bin Ali"
    assert rows[1].spans[0].label == "MASK"


def test_validate_ok():
    assert validate_path(FIXTURES) == []
```

- [ ] **Step 3: Run — expect FAIL** — `pytest tests/test_validate_jsonl.py -v`

- [ ] **Step 4: Implement**

```python
# ml/src/sens/validate_jsonl.py
from __future__ import annotations

from pathlib import Path

from sens.schema import Example, assert_spans_valid


def load_jsonl(path: Path) -> list[Example]:
    rows: list[Example] = []
    with path.open(encoding="utf-8") as f:
        for line_no, line in enumerate(f, start=1):
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(Example.model_validate_json(line))
            except Exception as e:  # noqa: BLE001
                raise ValueError(f"{path}:{line_no}: {e}") from e
    return rows


def validate_path(path: Path) -> list[str]:
    errors: list[str] = []
    with path.open(encoding="utf-8") as f:
        for line_no, line in enumerate(f, start=1):
            line = line.strip()
            if not line:
                continue
            try:
                ex = Example.model_validate_json(line)
                assert_spans_valid(ex)
            except Exception as e:  # noqa: BLE001
                errors.append(f"{path.name}:{line_no}: {e}")
    return errors


def main() -> None:
    import argparse
    import sys

    p = argparse.ArgumentParser(description="Validate sens JSONL")
    p.add_argument("path", type=Path)
    args = p.parse_args()
    errs = validate_path(args.path)
    if errs:
        print("\n".join(errs))
        sys.exit(1)
    print(f"OK {args.path}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 5: Verify offsets, then PASS**

```bash
python -c "t=\"Email Ahmad bin Ali about the overdue invoice.\"; s='Ahmad bin Ali'; print(t.index(s), t.index(s)+len(s))"
python -c "t=\"Explain Einstein's theory of relativity.\"; s='Einstein'; print(t.index(s), t.index(s)+len(s))"
pytest tests/test_validate_jsonl.py -v
python -m sens.validate_jsonl data/fixtures/tiny_train.jsonl
```

Expected: offsets print `(6, 19)` and `(8, 16)`; tests PASS; CLI prints `OK ...`. If an offset differs, fix the fixture.

- [ ] **Step 6: Commit**

```bash
git add ml/src/sens/validate_jsonl.py ml/tests/test_validate_jsonl.py ml/data/fixtures/tiny_train.jsonl
git commit -m "feat(ml): JSONL load/validate + tiny synthetic fixture"
```

---

### Task 6: Residency + split guards ("don't train on the exam"; keep real data local)

**Files:**
- Create: `ml/src/sens/residency.py`, `ml/tests/test_residency.py`

**Interfaces:**
- Consumes: `list[Example]`
- Produces:
  - `def assert_no_eval_in_train(rows: list[Example]) -> None` — raises if any `split=="eval"` row appears in a training/dev load
  - `def assert_upload_allowed(rows: list[Example], target: str) -> None` — `target ∈ {"colab","local_my","my_region"}`; raises if any `real` row is bound for `colab`
  - `def counsel_gate_required(rows: list[Example]) -> bool` — True iff any `real` row present (the conditional ADR 0015 STOP)

- [ ] **Step 1: Failing tests**

```python
# ml/tests/test_residency.py
import pytest
from sens.schema import Example
from sens.residency import assert_no_eval_in_train, assert_upload_allowed, counsel_gate_required


def _ex(split, provenance="llm_synthetic", id="x"):
    return Example(id=id, text="t", lang="en", spans=[], provenance=provenance, split=split)


def test_eval_row_in_training_raises():
    with pytest.raises(ValueError, match="eval"):
        assert_no_eval_in_train([_ex("train"), _ex("eval", id="leak")])


def test_train_only_ok():
    assert_no_eval_in_train([_ex("train"), _ex("dev")]) is None


def test_real_to_colab_refused():
    with pytest.raises(ValueError, match="local MY|MY-region"):
        assert_upload_allowed([_ex("train", provenance="real")], target="colab")


def test_synthetic_to_colab_ok():
    assert_upload_allowed([_ex("train", provenance="llm_synthetic")], target="colab") is None


def test_real_to_local_ok():
    assert_upload_allowed([_ex("eval", provenance="real")], target="local_my") is None


def test_counsel_gate_triggers_on_real():
    assert counsel_gate_required([_ex("eval", provenance="real")]) is True
    assert counsel_gate_required([_ex("eval", provenance="human_simulated")]) is False
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

```python
# ml/src/sens/residency.py
from __future__ import annotations

from sens.schema import Example

_LOCAL_TARGETS = {"local_my", "my_region"}


def assert_no_eval_in_train(rows: list[Example]) -> None:
    """The held-out exam must never enter a training/dev load."""
    leaked = [e.id for e in rows if e.split == "eval"]
    if leaked:
        raise ValueError(
            f"eval-split rows leaked into a training/dev set: {leaked[:5]} "
            f"(+{max(0, len(leaked) - 5)} more). Never train on the exam."
        )


def assert_upload_allowed(rows: list[Example], target: str) -> None:
    """real-provenance data must stay on local MY / MY-region infra (ADR 0015)."""
    if target not in _LOCAL_TARGETS | {"colab"}:
        raise ValueError(f"unknown upload target {target!r}")
    if target in _LOCAL_TARGETS:
        return
    real = [e.id for e in rows if e.provenance == "real"]
    if real:
        raise ValueError(
            f"real-provenance rows {real[:5]} must stay on local MY / MY-region infra; "
            f"refusing upload to {target!r} (ADR 0015 / U25)."
        )


def counsel_gate_required(rows: list[Example]) -> bool:
    """The conditional ADR 0015 counsel STOP: any real personal prompt re-arms it."""
    return any(e.provenance == "real" for e in rows)
```

- [ ] **Step 4: PASS + commit**

```bash
pytest tests/test_residency.py -v
git add ml/src/sens/residency.py ml/tests/test_residency.py
git commit -m "feat(ml): residency + split guards (no eval-in-train; real stays local MY)"
```

---

### Task 7: Span marking — build the model input from a span

**Files:**
- Create: `ml/src/sens/marking.py`, `ml/tests/test_marking.py`

**Interfaces:**
- Consumes: `Example`, `Span`
- Produces:
  - `E_OPEN = "[E]"`, `E_CLOSE = "[/E]"`
  - `def mark_span(text: str, span: Span) -> str` — wraps the span in markers within the full prompt
  - `def iter_span_instances(example: Example) -> Iterator[tuple[str, str, str]]` — yields `(marked_text, label, entity_type)` per span

Pure Python; **no torch.** This is the exact input recipe the export contract (Task 4) tells eng to reproduce.

- [ ] **Step 1: Failing tests**

```python
# ml/tests/test_marking.py
from sens.schema import Example, Span
from sens.marking import mark_span, iter_span_instances, E_OPEN, E_CLOSE


def test_mark_span_wraps_context_preserved():
    text = "Email Ahmad bin Ali today."
    sp = Span(start=6, end=19, surface="Ahmad bin Ali", entity_type="PER", label="MASK")
    marked = mark_span(text, sp)
    assert marked == f"Email {E_OPEN} Ahmad bin Ali {E_CLOSE} today."
    # context on both sides survives (the discriminator needs it)
    assert marked.startswith("Email ")
    assert marked.endswith(" today.")


def test_iter_instances_one_per_span():
    ex = Example(
        id="x",
        text="Explain Einstein to Ali.",
        lang="en",
        spans=[
            Span(start=8, end=16, surface="Einstein", entity_type="PER", label="KEEP"),
            Span(start=20, end=23, surface="Ali", entity_type="PER", label="MASK"),
        ],
        provenance="llm_synthetic",
        split="train",
    )
    out = list(iter_span_instances(ex))
    assert len(out) == 2
    assert out[0][1] == "KEEP" and out[1][1] == "MASK"
    assert E_OPEN in out[0][0] and E_OPEN in out[1][0]
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

```python
# ml/src/sens/marking.py
from __future__ import annotations

from collections.abc import Iterator

from sens.schema import Example, Span

E_OPEN = "[E]"
E_CLOSE = "[/E]"


def mark_span(text: str, span: Span) -> str:
    """Wrap the target span in marker tokens, preserving both-sided context."""
    return f"{text[: span.start]}{E_OPEN} {span.surface} {E_CLOSE}{text[span.end :]}"


def iter_span_instances(example: Example) -> Iterator[tuple[str, str, str]]:
    """One classification instance per span: (marked_text, label, entity_type)."""
    for sp in example.spans:
        yield mark_span(example.text, sp), sp.label, sp.entity_type
```

- [ ] **Step 4: PASS + commit**

```bash
pytest tests/test_marking.py -v
git add ml/src/sens/marking.py ml/tests/test_marking.py
git commit -m "feat(ml): span marking — [E]...[/E] model-input builder (context preserved)"
```

- [ ] **Step 5: Span-centered windowing — failing tests** (`ml/tests/test_windowing.py`, pure Python, no torch)

```python
# ml/tests/test_windowing.py
import pytest
from sens.windowing import plan_window, SpanTooLongError


def test_no_window_when_it_fits():
    # both markers within max_len -> full [0, seq_len)
    assert plan_window(open_idx=3, close_idx=7, seq_len=20, max_len=32) == (0, 20)


def test_centers_on_span_when_too_long():
    # markers at 100..104, seq_len 300, max_len 32 -> window includes both, centered
    start, end = plan_window(open_idx=100, close_idx=104, seq_len=300, max_len=32)
    assert end - start == 32
    assert start <= 100 and 104 < end          # both markers inside
    assert start >= 0 and end <= 300


def test_clamps_at_right_edge():
    start, end = plan_window(open_idx=295, close_idx=299, seq_len=300, max_len=32)
    assert end == 300 and end - start == 32
    assert start <= 295 and 299 < end


def test_span_longer_than_window_raises():
    with pytest.raises(SpanTooLongError):
        plan_window(open_idx=0, close_idx=40, seq_len=300, max_len=32)
```

- [ ] **Step 6: Implement `ml/src/sens/windowing.py`**

```python
# ml/src/sens/windowing.py
from __future__ import annotations


class SpanTooLongError(ValueError):
    """The marked span itself does not fit in max_len — drop/fail this instance, never clip a marker."""


def plan_window(open_idx: int, close_idx: int, seq_len: int, max_len: int) -> tuple[int, int]:
    """Token index window [start, end) of size <= max_len that KEEPS both marker tokens.

    open_idx / close_idx are the token positions of [E] and [/E]. If the whole sequence already
    fits, returns (0, seq_len). Otherwise centers a max_len window on the span midpoint and clamps
    to [0, seq_len). Raises SpanTooLongError if the marked span cannot fit.
    """
    if seq_len <= max_len:
        return 0, seq_len
    if close_idx - open_idx + 1 > max_len:
        raise SpanTooLongError(f"span spans {close_idx - open_idx + 1} tokens > max_len {max_len}")
    mid = (open_idx + close_idx) // 2
    start = mid - max_len // 2
    start = max(0, min(start, seq_len - max_len))
    end = start + max_len
    # guarantee both markers are inside after clamping
    if open_idx < start:
        start = open_idx
        end = start + max_len
    if close_idx >= end:
        end = close_idx + 1
        start = end - max_len
    return start, end
```

- [ ] **Step 7: Marker-single-id check (train-gated so the base CPU suite stays torch-free)** — `ml/tests/test_tokenizer_markers.py`

```python
# ml/tests/test_tokenizer_markers.py
import pytest

transformers = pytest.importorskip("transformers")  # skipped unless [train] extras installed
from sens.marking import E_OPEN, E_CLOSE  # noqa: E402


def test_markers_are_single_special_ids():
    tok = transformers.AutoTokenizer.from_pretrained("microsoft/mdeberta-v3-base")
    tok.add_special_tokens({"additional_special_tokens": [E_OPEN, E_CLOSE]})
    for marker in (E_OPEN, E_CLOSE):
        ids = tok.encode(marker, add_special_tokens=False)
        assert len(ids) == 1, f"{marker} fragmented into {ids} — SentencePiece did not treat it as special"
        assert ids[0] >= tok.vocab_size - 2 or ids[0] in tok.all_special_ids
```

> This proves the training/serving assumption that `[E]`/`[/E]` are atomic; if a future tokenizer swap fragments them, `plan_window`'s marker-index logic silently breaks. Run it whenever `[train]` extras are installed.

- [ ] **Step 8: Run + commit** — base suite (`pytest tests/test_windowing.py -v`) passes on CPU; the marker test is collected-and-skipped without `[train]`.

```bash
pytest tests/test_windowing.py -v
git add ml/src/sens/windowing.py ml/tests/test_windowing.py ml/tests/test_tokenizer_markers.py
git commit -m "feat(ml): span-centered windowing + marker single-id guard (train-gated)"
```

---

### Task 8: Stratified audit sampler

**Files:**
- Create: `ml/src/sens/sample_audit.py`, `ml/tests/test_sample_audit.py`

**Interfaces:**
- Consumes: `list[Example]`
- Produces: `def stratified_sample(examples: list[Example], n: int, seed: int = 0) -> list[Example]` — strata key `(lang, has_mask)` where `has_mask = any(sp.label=="MASK")`

- [ ] **Step 1: Failing test**

```python
# ml/tests/test_sample_audit.py
from sens.schema import Example, Span
from sens.sample_audit import stratified_sample


def _ex(i, lang, masked):
    spans = []
    text = f"hello {lang} {i}"
    if masked:
        spans = [Span(start=0, end=5, surface="hello", entity_type="PER", label="MASK")]
    else:
        spans = [Span(start=0, end=5, surface="hello", entity_type="PER", label="KEEP")]
    return Example(id=f"{lang}-{i}-{masked}", text=text, lang=lang, spans=spans,
                   provenance="llm_synthetic", split="train")


def test_sample_covers_langs_and_mask_buckets():
    pool = []
    for lang in ("en", "bm", "zh"):
        pool += [_ex(i, lang, False) for i in range(10)]
        pool += [_ex(i, lang, True) for i in range(10)]
    sample = stratified_sample(pool, n=12, seed=1)
    assert len(sample) == 12
    assert {e.lang for e in sample} == {"en", "bm", "zh"}
    assert any(any(s.label == "MASK" for s in e.spans) for e in sample)
    assert any(all(s.label == "KEEP" for s in e.spans) for e in sample)


def test_deterministic_by_seed():
    pool = [_ex(i, "en", i % 2 == 0) for i in range(20)]
    assert [e.id for e in stratified_sample(pool, 6, seed=3)] == [
        e.id for e in stratified_sample(pool, 6, seed=3)
    ]
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

```python
# ml/src/sens/sample_audit.py
from __future__ import annotations

import random
from collections import defaultdict

from sens.schema import Example


def _has_mask(ex: Example) -> bool:
    return any(sp.label == "MASK" for sp in ex.spans)


def stratified_sample(examples: list[Example], n: int, seed: int = 0) -> list[Example]:
    if n <= 0:
        raise ValueError("n must be positive")
    if n > len(examples):
        raise ValueError("n exceeds pool size")

    buckets: dict[tuple[str, bool], list[Example]] = defaultdict(list)
    for ex in examples:
        buckets[(ex.lang, _has_mask(ex))].append(ex)

    rng = random.Random(seed)
    for b in buckets.values():
        rng.shuffle(b)

    keys = sorted(buckets.keys())
    out: list[Example] = []
    idx = {k: 0 for k in keys}
    while len(out) < n:
        progressed = False
        for k in keys:
            i = idx[k]
            bucket = buckets[k]
            if i < len(bucket):
                out.append(bucket[i])
                idx[k] = i + 1
                progressed = True
                if len(out) >= n:
                    break
        if not progressed:
            break
    if len(out) < n:
        raise ValueError("could not fill sample; pool too skewed")
    return out
```

- [ ] **Step 4: PASS + commit**

```bash
pytest tests/test_sample_audit.py -v
git add ml/src/sens/sample_audit.py ml/tests/test_sample_audit.py
git commit -m "feat(ml): stratified audit sampler over (lang, has_mask)"
```

---

### Task 8b: NER-proposal → gold span alignment (for the composed eval)

**Files:**
- Create: `ml/src/sens/align.py`, `ml/tests/test_align.py`

**Interfaces:**
- Consumes: gold `list[Span]`, proposed `list[tuple[int,int]]` (char offsets from a stock NER pass)
- Produces:
  - `def align_spans(gold, proposed) -> AlignResult` where `AlignResult` has `.matched: list[tuple[tuple[int,int], str]]` (proposed span → gold label), `.ner_misses: list[Span]` (gold with no overlapping proposal), `.ner_extras: list[tuple[int,int]]` (proposals overlapping no gold)
  - `def ner_miss_rate(result, gold) -> float`

This is pure Python and CPU-testable; the NER model itself runs only in Task 18's script. Matching is by **maximum char overlap** (a proposed span is matched to the gold span it overlaps most; zero overlap = extra).

- [ ] **Step 1: Failing tests**

```python
# ml/tests/test_align.py
from sens.schema import Span
from sens.align import align_spans, ner_miss_rate


def _g(s, e, label):
    return Span(start=s, end=e, surface="x" * (e - s), entity_type="PER", label=label)


def test_exact_match():
    gold = [_g(0, 5, "MASK")]
    res = align_spans(gold, [(0, 5)])
    assert res.matched == [((0, 5), "MASK")]
    assert res.ner_misses == [] and res.ner_extras == []


def test_partial_overlap_matches_best():
    gold = [_g(0, 10, "MASK")]
    res = align_spans(gold, [(2, 8)])   # noisy boundary, still overlaps
    assert res.matched == [((2, 8), "MASK")]


def test_miss_and_extra():
    gold = [_g(0, 5, "MASK"), _g(20, 25, "KEEP")]
    res = align_spans(gold, [(0, 5), (40, 45)])  # (20,25) missed; (40,45) is an extra
    assert res.matched == [((0, 5), "MASK")]
    assert [ (s.start, s.end) for s in res.ner_misses ] == [(20, 25)]
    assert res.ner_extras == [(40, 45)]
    assert ner_miss_rate(res, gold) == 0.5
```

- [ ] **Step 2: Implement**

```python
# ml/src/sens/align.py
from __future__ import annotations

from dataclasses import dataclass, field

from sens.schema import Span


@dataclass
class AlignResult:
    matched: list[tuple[tuple[int, int], str]] = field(default_factory=list)
    ner_misses: list[Span] = field(default_factory=list)
    ner_extras: list[tuple[int, int]] = field(default_factory=list)


def _overlap(a: tuple[int, int], b: tuple[int, int]) -> int:
    return max(0, min(a[1], b[1]) - max(a[0], b[0]))


def align_spans(gold: list[Span], proposed: list[tuple[int, int]]) -> AlignResult:
    res = AlignResult()
    matched_gold: set[int] = set()
    for p in proposed:
        best_i, best_ov = -1, 0
        for i, g in enumerate(gold):
            ov = _overlap(p, (g.start, g.end))
            if ov > best_ov:
                best_i, best_ov = i, ov
        if best_i == -1:
            res.ner_extras.append(p)
        else:
            res.matched.append((p, gold[best_i].label))
            matched_gold.add(best_i)
    res.ner_misses = [g for i, g in enumerate(gold) if i not in matched_gold]
    return res


def ner_miss_rate(result: AlignResult, gold: list[Span]) -> float:
    if not gold:
        return 0.0
    return len(result.ner_misses) / len(gold)
```

- [ ] **Step 3: PASS + commit**

```bash
pytest tests/test_align.py -v
git add ml/src/sens/align.py ml/tests/test_align.py
git commit -m "feat(ml): NER-proposal to gold span alignment (matched / misses / extras)"
```

---

### Task 9: Audit disagreement rate + merge script

**Files:**
- Create: `ml/src/sens/disagreement.py`, `ml/tests/test_disagreement.py`, `ml/scripts/merge_audit.py`

**Interfaces:**
- Consumes: two `list[Example]` aligned by `id`
- Produces:
  - `def span_label_set(ex: Example) -> set[tuple[int,int,str]]` — `(start, end, label)` per span
  - `def disagreement_rate(a: list[Example], b: list[Example]) -> float` — over all overlapping ids
  - `def disagreement_by_lang(a: list[Example], b: list[Example]) -> dict[str, float]`

- [ ] **Step 1: Failing test**

```python
# ml/tests/test_disagreement.py
from sens.schema import Example, Span
from sens.disagreement import disagreement_rate, disagreement_by_lang


def _ex(id, lang, label):
    return Example(id=id, text="ab", lang=lang, provenance="llm_synthetic", split="train",
                   spans=[Span(start=0, end=1, surface="a", entity_type="PER", label=label)])


def test_overall_rate():
    a = [_ex("1", "en", "MASK"), _ex("2", "bm", "KEEP")]
    b = [_ex("1", "en", "KEEP"), _ex("2", "bm", "KEEP")]  # differ on id 1
    assert disagreement_rate(a, b) == 0.5


def test_by_lang():
    a = [_ex("1", "en", "MASK"), _ex("2", "bm", "MASK")]
    b = [_ex("1", "en", "MASK"), _ex("2", "bm", "KEEP")]
    d = disagreement_by_lang(a, b)
    assert d["en"] == 0.0
    assert d["bm"] == 1.0
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement `disagreement.py`**

```python
# ml/src/sens/disagreement.py
from __future__ import annotations

from collections import defaultdict

from sens.schema import Example


def span_label_set(ex: Example) -> set[tuple[int, int, str]]:
    return {(s.start, s.end, s.label) for s in ex.spans}


def _overlap_ids(a: list[Example], b: list[Example]) -> tuple[dict, dict, list[str]]:
    by_a = {e.id: e for e in a}
    by_b = {e.id: e for e in b}
    ids = sorted(set(by_a) & set(by_b))
    if not ids:
        raise ValueError("no overlapping ids")
    return by_a, by_b, ids


def disagreement_rate(a: list[Example], b: list[Example]) -> float:
    by_a, by_b, ids = _overlap_ids(a, b)
    disagree = sum(1 for i in ids if span_label_set(by_a[i]) != span_label_set(by_b[i]))
    return disagree / len(ids)


def disagreement_by_lang(a: list[Example], b: list[Example]) -> dict[str, float]:
    by_a, by_b, ids = _overlap_ids(a, b)
    total: dict[str, int] = defaultdict(int)
    disagree: dict[str, int] = defaultdict(int)
    for i in ids:
        lang = by_a[i].lang
        total[lang] += 1
        if span_label_set(by_a[i]) != span_label_set(by_b[i]):
            disagree[lang] += 1
    return {lang: disagree[lang] / total[lang] for lang in total}
```

- [ ] **Step 4: PASS**, then write `ml/scripts/merge_audit.py`

```python
# ml/scripts/merge_audit.py
from __future__ import annotations

import argparse
from pathlib import Path

from sens.disagreement import disagreement_by_lang, disagreement_rate
from sens.validate_jsonl import load_jsonl, validate_path


def main() -> None:
    ap = argparse.ArgumentParser(description="Merge audited labels over an LLM draft; report disagreement")
    ap.add_argument("--draft", type=Path, required=True, help="LLM-drafted JSONL")
    ap.add_argument("--audit", type=Path, required=True, help="human-audited JSONL (same ids)")
    ap.add_argument("--out", type=Path, required=True, help="merged training JSONL (AUDITED rows only)")
    ap.add_argument("--allow-unaudited", action="store_true",
                    help="also emit draft rows with NO human audit (DANGEROUS — trains on raw LLM labels)")
    args = ap.parse_args()

    for p in (args.draft, args.audit):
        errs = validate_path(p)
        if errs:
            raise SystemExit("validation failed:\n" + "\n".join(errs))

    draft = load_jsonl(args.draft)
    audit = load_jsonl(args.audit)
    print(f"overall disagreement: {disagreement_rate(draft, audit):.3f}")
    for lang, rate in sorted(disagreement_by_lang(draft, audit).items()):
        print(f"  {lang}: {rate:.3f}")
    print("REVIEW: if BM/ZH disagreement looks material, STOP and ask the founder (no hardcoded cutoff).")

    audited_ids = {e.id for e in audit}
    unaudited = [e for e in draft if e.id not in audited_ids]
    if unaudited and not args.allow_unaudited:
        raise SystemExit(
            f"{len(unaudited)} draft rows were NOT audited (e.g. {[e.id for e in unaudited][:5]}). "
            f"Default merge emits AUDITED rows only — training on un-audited LLM labels is forbidden. "
            f"Re-run with --allow-unaudited only if the founder accepts raw LLM labels for those rows."
        )

    merged = list(audit)
    if args.allow_unaudited and unaudited:
        print(f"WARNING: including {len(unaudited)} UN-AUDITED raw-LLM rows (--allow-unaudited). "
              f"These carry no human label — this weakens BM/ZH quality (doc 07 §4.3).")
        merged += unaudited

    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("w", encoding="utf-8") as f:
        for e in merged:
            f.write(e.model_dump_json() + "\n")
    print(f"wrote {len(merged)} rows -> {args.out} (audited={len(audit)}, unaudited_included={len(merged) - len(audit)})")


if __name__ == "__main__":
    main()
```

- [ ] **Step 5: Commit**

```bash
git add ml/src/sens/disagreement.py ml/tests/test_disagreement.py ml/scripts/merge_audit.py
git commit -m "feat(ml): audit disagreement rate (overall + per-lang) and merge script"
```

---

### Task 10: MASK precision/recall (separate) + 100% mention coverage

**Files:**
- Create: `ml/src/sens/metrics.py`, `ml/tests/test_metrics.py`

**Interfaces:**
- Consumes: aligned gold/pred label lists (`"MASK"`/`"KEEP"`) and a per-entity mention-hit map
- Produces:
  - `def mask_precision_recall(gold: list[str], pred: list[str]) -> tuple[float,float]` — MASK is the positive class; **reported separately** per Global Constraints
  - `def mask_recall(gold: list[str], pred: list[str]) -> float` — the "proportion of true MASK detected"
  - `def full_mention_coverage(entities: dict[str, list[bool]]) -> float` — fraction of entities whose **every** MASK mention was predicted MASK (doc 07 §1.4 / §5.5)

Convention: with no predicted MASK, precision is vacuously `1.0` (no false alarms) — so **always-KEEP is caught by recall, not precision**, which is exactly why they are reported separately.

- [ ] **Step 1: Tests**

```python
# ml/tests/test_metrics.py
from sens.metrics import mask_precision_recall, mask_recall, full_mention_coverage


def test_precision_recall_basic():
    gold = ["MASK", "MASK", "KEEP", "KEEP"]
    pred = ["MASK", "KEEP", "MASK", "KEEP"]  # tp=1, fp=1, fn=1
    p, r = mask_precision_recall(gold, pred)
    assert p == 0.5
    assert r == 0.5


def test_always_keep_recall_zero_precision_vacuous_one():
    gold = ["MASK", "KEEP", "MASK"]
    pred = ["KEEP", "KEEP", "KEEP"]
    p, r = mask_precision_recall(gold, pred)
    assert p == 1.0     # no false alarms...
    assert r == 0.0     # ...but recall exposes the trivial model
    assert mask_recall(gold, pred) == 0.0


def test_full_mention_coverage():
    # entity "a" has two MASK mentions, one missed -> not fully covered; "b" fully covered
    entities = {"a": [True, False], "b": [True]}
    assert full_mention_coverage(entities) == 0.5


def test_full_mention_coverage_empty_is_one():
    assert full_mention_coverage({}) == 1.0
```

- [ ] **Step 2: Implement + PASS**

```python
# ml/src/sens/metrics.py
from __future__ import annotations


def mask_precision_recall(gold: list[str], pred: list[str]) -> tuple[float, float]:
    if len(gold) != len(pred):
        raise ValueError("gold and pred must be the same length")
    tp = sum(1 for g, p in zip(gold, pred) if g == "MASK" and p == "MASK")
    fp = sum(1 for g, p in zip(gold, pred) if g == "KEEP" and p == "MASK")
    fn = sum(1 for g, p in zip(gold, pred) if g == "MASK" and p == "KEEP")
    precision = tp / (tp + fp) if (tp + fp) else 1.0
    recall = tp / (tp + fn) if (tp + fn) else 1.0
    return precision, recall


def mask_recall(gold: list[str], pred: list[str]) -> float:
    return mask_precision_recall(gold, pred)[1]


def full_mention_coverage(entities: dict[str, list[bool]]) -> float:
    if not entities:
        return 1.0
    covered = sum(1 for hits in entities.values() if all(hits))
    return covered / len(entities)
```

- [ ] **Step 3: Commit**

```bash
pytest tests/test_metrics.py -v
git add ml/src/sens/metrics.py ml/tests/test_metrics.py
git commit -m "feat(ml): MASK precision/recall (separate) + 100% mention coverage"
```

---

### Task 11: Required-strata coverage checklist

**Files:**
- Create: `ml/src/sens/coverage.py`, `ml/tests/test_coverage.py`

**Interfaces:**
- Consumes: `list[Example]`
- Produces:
  - `def coverage_report(rows: list[Example]) -> dict[str, bool]` — one bool per required stratum
  - `def missing_strata(rows: list[Example]) -> list[str]` — keys that are False
  - `def stratum_counts(rows: list[Example]) -> dict[tuple[str,str,str], int]` — `(lang, entity_type, label) -> count` for the eval report

Required strata (Q6.2 checklist). `tags` cases (`ambiguous_keep`, `math_no_mask`, `id_digit_line`) are author-declared because they cannot be detected structurally.

- [ ] **Step 1: Tests**

```python
# ml/tests/test_coverage.py
from sens.schema import Example, Span
from sens.coverage import coverage_report, missing_strata, stratum_counts


def _ex(id, lang, spans, tags=None):
    return Example(id=id, text="t" * 50, lang=lang, spans=spans, provenance="human_simulated",
                   split="eval", tags=tags or [])


def _sp(s, e, etype, label, surface="x"):
    return Span(start=s, end=e, surface=surface, entity_type=etype, label=label)


def _full_exam():
    return [
        _ex("1", "en", [_sp(0, 8, "PER", "KEEP", "Einstein")]),
        _ex("2", "en", [_sp(0, 8, "PER", "MASK", "Einstein")]),   # same surface, opposite label
        _ex("3", "en", [_sp(0, 5, "ORG", "KEEP", "Apple")]),
        _ex("4", "bm", [_sp(0, 5, "ORG", "MASK", "AcmeX")]),
        _ex("5", "zh", [_sp(0, 2, "PER", "KEEP", "小明")], tags=["ambiguous_keep"]),
        _ex("6", "mixed", [], tags=["math_no_mask"]),
        _ex("7", "en", [_sp(0, 8, "PER", "KEEP", "Einstein")], tags=["id_digit_line"]),
    ]


def test_full_exam_covers_everything():
    assert missing_strata(_full_exam()) == []


def test_missing_reports_gaps():
    rows = [_ex("1", "en", [_sp(0, 8, "PER", "KEEP", "Einstein")])]
    miss = missing_strata(rows)
    assert "per_mask" in miss
    assert "lang_bm" in miss
    assert "math_no_mask" in miss


def test_stratum_counts():
    rows = [_ex("1", "en", [_sp(0, 8, "PER", "KEEP", "Einstein"), _sp(10, 15, "ORG", "MASK", "AcmeX")])]
    c = stratum_counts(rows)
    assert c[("en", "PER", "KEEP")] == 1
    assert c[("en", "ORG", "MASK")] == 1
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

```python
# ml/src/sens/coverage.py
from __future__ import annotations

from collections import defaultdict

from sens.schema import Example

# Required strata for a shippable exam (Q6.2). tag-based cases are author-declared.
REQUIRED_TAGS = ("ambiguous_keep", "math_no_mask", "id_digit_line")


def coverage_report(rows: list[Example]) -> dict[str, bool]:
    def any_span(pred) -> bool:
        return any(pred(sp) for ex in rows for sp in ex.spans)

    langs = {ex.lang for ex in rows}
    surfaces: dict[str, set[str]] = defaultdict(set)
    for ex in rows:
        for sp in ex.spans:
            surfaces[sp.surface.lower()].add(sp.label)
    all_tags = {t for ex in rows for t in ex.tags}

    report = {
        "per_keep": any_span(lambda s: s.entity_type == "PER" and s.label == "KEEP"),
        "per_mask": any_span(lambda s: s.entity_type == "PER" and s.label == "MASK"),
        "org_keep": any_span(lambda s: s.entity_type == "ORG" and s.label == "KEEP"),
        "org_mask": any_span(lambda s: s.entity_type == "ORG" and s.label == "MASK"),
        "same_surface_opposite": any(len(v) > 1 for v in surfaces.values()),
        "lang_en": "en" in langs,
        "lang_bm": "bm" in langs,
        "lang_zh": "zh" in langs,
        "code_switch": "mixed" in langs,
    }
    for tag in REQUIRED_TAGS:
        report[tag] = tag in all_tags
    return report


def missing_strata(rows: list[Example]) -> list[str]:
    return [k for k, ok in coverage_report(rows).items() if not ok]


def stratum_counts(rows: list[Example]) -> dict[tuple[str, str, str], int]:
    counts: dict[tuple[str, str, str], int] = defaultdict(int)
    for ex in rows:
        for sp in ex.spans:
            counts[(ex.lang, sp.entity_type, sp.label)] += 1
    return dict(counts)
```

- [ ] **Step 4: PASS + commit**

```bash
pytest tests/test_coverage.py -v
git add ml/src/sens/coverage.py ml/tests/test_coverage.py
git commit -m "feat(ml): required-strata coverage checklist + stratum counts"
```

---

### Task 12: Eval ship gate (provenance + anti-trivial + coverage)

**Files:**
- Create: `ml/src/sens/eval_gate.py`, `ml/tests/test_eval_gate.py`

**Interfaces:**
- Consumes: `list[Example]` (the eval rows), measured `mask_recall: float`, `missing_strata: list[str]`
- Produces: `def ship_status(examples, mask_recall, missing_strata) -> tuple[Literal["SHIP_CANDIDATE","NOT_SHIPPED"], list[str]]`

Gate logic (structural only — **no numeric recall/precision threshold**, that is human/admin-gated):
`SHIP_CANDIDATE` iff there is an `eval` split, it is **not** `llm_synthetic`-dominant, `mask_recall > 0`, and `missing_strata` is empty. Otherwise `NOT_SHIPPED` with reasons.

- [ ] **Step 1: Tests (all branches)**

```python
# ml/tests/test_eval_gate.py
from sens.schema import Example, Span
from sens.eval_gate import ship_status


def _row(provenance, split="eval"):
    return Example(id="1", text="t", lang="en", provenance=provenance, split=split,
                   spans=[Span(start=0, end=1, surface="t", entity_type="PER", label="MASK")])


def test_no_eval_split_not_shipped():
    status, reasons = ship_status([_row("human_simulated", split="train")], mask_recall=0.9, missing_strata=[])
    assert status == "NOT_SHIPPED"
    assert any("no eval" in r for r in reasons)


def test_synthetic_eval_not_shipped():
    status, reasons = ship_status([_row("llm_synthetic")], mask_recall=0.9, missing_strata=[])
    assert status == "NOT_SHIPPED"
    assert any("llm_synthetic" in r for r in reasons)


def test_always_keep_not_shipped():
    status, reasons = ship_status([_row("human_simulated")], mask_recall=0.0, missing_strata=[])
    assert status == "NOT_SHIPPED"
    assert any("recall" in r for r in reasons)


def test_missing_strata_not_shipped():
    status, reasons = ship_status([_row("human_simulated")], mask_recall=0.9, missing_strata=["per_mask"])
    assert status == "NOT_SHIPPED"
    assert any("strata" in r for r in reasons)


def test_human_simulated_clean_is_candidate():
    status, reasons = ship_status([_row("human_simulated")], mask_recall=0.6, missing_strata=[])
    assert status == "SHIP_CANDIDATE"
    assert reasons == []


def test_real_dominant_is_candidate():
    status, reasons = ship_status([_row("real")], mask_recall=0.6, missing_strata=[])
    assert status == "SHIP_CANDIDATE"


def test_provenance_tie_fails_safe():
    # equal human_simulated vs llm_synthetic -> clean (1) <= synth (1) -> NOT_SHIPPED
    rows = [_row("human_simulated"), _row("llm_synthetic")]
    status, reasons = ship_status(rows, mask_recall=0.9, missing_strata=[])
    assert status == "NOT_SHIPPED"
    assert any("clean<=synthetic" in r for r in reasons)
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

```python
# ml/src/sens/eval_gate.py
from __future__ import annotations

from typing import Literal

from sens.schema import Example

Status = Literal["SHIP_CANDIDATE", "NOT_SHIPPED"]


def ship_status(
    examples: list[Example],
    mask_recall: float,
    missing_strata: list[str],
) -> tuple[Status, list[str]]:
    reasons: list[str] = []
    eval_rows = [e for e in examples if e.split == "eval"]
    if not eval_rows:
        return "NOT_SHIPPED", ["no eval split present"]

    synth = sum(1 for e in eval_rows if e.provenance == "llm_synthetic")
    clean = len(eval_rows) - synth  # human_simulated + real
    if clean <= synth:  # tie or synthetic-majority -> fail-safe: NOT a ship signal
        reasons.append(
            "eval is not human_simulated/real-dominant (clean<=synthetic) — not a ship signal "
            "(ADR 0015 / doc 07 §5)"
        )
    if mask_recall <= 0.0:
        reasons.append("MASK recall is 0 — always-KEEP / trivial model (NOT_SHIPPED even at zero false alarms)")
    if missing_strata:
        reasons.append(f"eval missing required strata: {missing_strata}")

    if reasons:
        return "NOT_SHIPPED", reasons
    return "SHIP_CANDIDATE", []
```

- [ ] **Step 4: PASS + commit**

```bash
pytest tests/test_eval_gate.py -v
git add ml/src/sens/eval_gate.py ml/tests/test_eval_gate.py
git commit -m "feat(ml): ship gate — provenance + non-zero MASK recall + strata coverage (no invented threshold)"
```

---

### Task 13: LLM generation prompt + deterministic fixture generator

**Files:**
- Create: `ml/prompts/v1_generate_span_labels.md`, `ml/scripts/generate_fixtures.py`
- Modify: `ml/data/fixtures/tiny_train.jsonl` (regenerated)

**Interfaces:**
- Consumes: the Task 3 label schema
- Produces: `data/fixtures/tiny_train.jsonl` (committed, `llm_synthetic`, ≥12 rows covering EN/BM/ZH × PER/ORG × MASK/KEEP + tag cases) and an LLM prompt humans/agents use to write `data/llm_draft/` (gitignored)

- [ ] **Step 1: Write `ml/prompts/v1_generate_span_labels.md`** instructing the LLM to:
  - Output JSONL matching the `Example` schema (Task 2), one prompt per line
  - For each PERSON/ORG mention, emit a span with `entity_type` and a `label` per the Task 3 rubric
  - Emit **both** KEEP and MASK spans (public-topic vs private-transactional), including the **same surface with opposite labels** across two lines
  - Cover EN, BM, ZH, and at least some code-switched (`lang:"mixed"`) lines
  - **Never** label NRIC/SSM/TIN digit strings as spans (L1 owns them); an `id_digit_line` may contain such digits but only PER/ORG spans are labelled — tag it `id_digit_line`
  - Include a `math_no_mask` line (`1 + 1`, a year) with **no** spans
  - Include an `ambiguous_keep` line — a bare short name with no disambiguating context → KEEP
  - Set `provenance:"llm_synthetic"`, `source:"llm_v1"`, `split:"train"`
  - State: augmentation only; never the eval; human audit of a stratified sample follows

- [ ] **Step 2: Write `ml/scripts/generate_fixtures.py`** (deterministic, no API) producing ≥12 valid rows and re-validating

```python
# ml/scripts/generate_fixtures.py
from __future__ import annotations

from pathlib import Path

from sens.schema import Example, Span
from sens.validate_jsonl import validate_path

OUT = Path(__file__).resolve().parents[1] / "data" / "fixtures" / "tiny_train.jsonl"


def _mk(id, text, lang, spans, tags=None):
    return Example(id=id, text=text, lang=lang, provenance="llm_synthetic", split="train",
                   source="fixture", tags=tags or [],
                   spans=[Span(start=s, end=e, surface=text[s:e], entity_type=et, label=lb)
                          for (s, e, et, lb) in spans])


def build() -> list[Example]:
    rows: list[Example] = []
    rows.append(_mk("fx-einstein-keep", "Explain Einstein's theory of relativity.", "en",
                    [(8, 16, "PER", "KEEP")]))
    rows.append(_mk("fx-einstein-mask", "Einstein from accounting has not sent the invoice.", "en",
                    [(0, 8, "PER", "MASK")]))
    rows.append(_mk("fx-apple-keep", "Summarise Apple's earnings this quarter.", "en",
                    [(10, 15, "ORG", "KEEP")]))
    rows.append(_mk("fx-org-mask", "Chase payment from Bunga Raya Trading; they owe us money.", "en",
                    [(19, 37, "ORG", "MASK")]))
    rows.append(_mk("fx-bm-mask", "Sila hubungi Encik Rahman tentang bil pelanggan itu.", "bm",
                    [(19, 25, "PER", "MASK")]))
    rows.append(_mk("fx-bm-keep", "Siapakah Tunku Abdul Rahman dalam sejarah Malaysia?", "bm",
                    [(9, 27, "PER", "KEEP")]))
    rows.append(_mk("fx-zh-mask", "请把合同发给张伟。", "zh", [(6, 8, "PER", "MASK")]))
    rows.append(_mk("fx-zh-keep", "介绍一下华为公司的历史。", "zh", [(4, 6, "ORG", "KEEP")]))
    rows.append(_mk("fx-mixed", "Boss, tolong email Mr Tan the report from Apple pasal Q3.", "mixed",
                    [(19, 25, "PER", "MASK"), (42, 47, "ORG", "KEEP")]))
    rows.append(_mk("fx-ambiguous", "Ask Ali about it.", "en", [(4, 7, "PER", "KEEP")],
                    tags=["ambiguous_keep"]))
    rows.append(_mk("fx-math", "What is 1 + 1 in 2024?", "en", [], tags=["math_no_mask"]))
    rows.append(_mk("fx-iddigit", "Register 900101-14-5678 for Siti Nurhaliza's file.", "en",
                    [(28, 42, "PER", "MASK")], tags=["id_digit_line"]))
    return rows


def main() -> None:
    rows = build()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", encoding="utf-8") as f:
        for r in rows:
            f.write(r.model_dump_json() + "\n")
    errs = validate_path(OUT)
    if errs:
        raise SystemExit("fixture validation failed:\n" + "\n".join(errs))
    print(f"wrote {len(rows)} rows -> {OUT}")


if __name__ == "__main__":
    main()
```

> **Offset caution:** the surfaces are sliced from `text` by the generator itself (`text[s:e]`), so a wrong `(s,e)` produces a *wrong surface*, not a validation error. After running, **eyeball each masked/kept surface** in the output and fix any `(s,e)` whose slice is not the intended entity. The generator prints the count; open the file and read the spans.

- [ ] **Step 3: Generate + validate + confirm the fixture still parses in existing tests**

```bash
python scripts/generate_fixtures.py
python -m sens.validate_jsonl data/fixtures/tiny_train.jsonl
pytest tests/test_validate_jsonl.py -v
```

> `test_validate_jsonl.py::test_load_fixture` asserts `len(rows) == 3` against the **old** 3-row fixture. Update that assertion to the new row count (or assert `>= 12`) in the same commit — a plan-known change, not a surprise.

- [ ] **Step 4: Commit**

```bash
git add ml/prompts/v1_generate_span_labels.md ml/scripts/generate_fixtures.py ml/data/fixtures/tiny_train.jsonl ml/tests/test_validate_jsonl.py
git commit -m "feat(ml): LLM span-label prompt v1 + deterministic multilingual fixtures"
```

---

### Task 14: STOP / HUMAN GATE — review LLM/synthetic drafts before training

No code. The executor must **not** proceed to training on any LLM-generated draft until the founder/team has reviewed a stratified sample and merged audited labels.

### HUMAN GATE: LLM/synthetic draft review

**What the founder must do:**
1. **Draft generation itself is EXTERNAL** — done in Colab or a chat LLM using `prompts/v1_generate_span_labels.md`. `generate_llm_draft.py` **does not generate anything**; it only validates the pasted LLM output and tags it `llm_synthetic` into `data/llm_draft/*.jsonl` (gitignored). If the team hand-writes drafts or uses another tool, skip the script.
2. Draw a stratified sample: `python -c "from sens.sample_audit import stratified_sample; from sens.validate_jsonl import load_jsonl; ..."` (or a small helper), export the sample for human labelling.
3. **≥1 bilingual Malaysian reviewer** audits the BM/ZH portion; the founder may self-review EN. **LLM self-audit is not final for BM/ZH.**
4. Run `python scripts/merge_audit.py --draft … --audit … --out data/train/merged.jsonl` and read the printed disagreement rates. **By default the merge emits AUDITED rows only** — if any draft rows were not audited it FAILS, and training on raw un-audited LLM labels needs an explicit `--allow-unaudited` + founder sign-off (loud warning). Do not pass that flag casually.
5. **If BM/ZH disagreement looks material → STOP and decide** (no hardcoded cutoff): fix the prompt, re-draft, or shrink synthetic reliance. Record the decision.
6. Only then unblock Task 16 (training).

- [ ] **Step 1: Write `ml/scripts/generate_llm_draft.py`** (optional wrapper; complete, minimal)

```python
# ml/scripts/generate_llm_draft.py
"""Optional: write LLM-produced JSONL to data/llm_draft/ after validating it.

This does NOT call any API — paste/redirect the LLM output (produced with prompts/v1_...md)
into a file and pass it here. It only validates + tags provenance, so drafts enter the
pipeline in schema form. Colab is fine for llm_synthetic (Global Constraints).
"""
from __future__ import annotations

import argparse
from pathlib import Path

from sens.residency import assert_upload_allowed
from sens.validate_jsonl import load_jsonl, validate_path


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", type=Path, required=True, help="raw LLM JSONL (schema-shaped)")
    ap.add_argument("--out", type=Path, required=True)
    args = ap.parse_args()

    errs = validate_path(args.inp)
    if errs:
        raise SystemExit("draft failed validation:\n" + "\n".join(errs))
    rows = load_jsonl(args.inp)
    if any(r.provenance != "llm_synthetic" for r in rows):
        raise SystemExit("draft rows must be provenance=llm_synthetic")
    assert_upload_allowed(rows, target="colab")  # sanity: synthetic is Colab-safe
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("w", encoding="utf-8") as f:
        for r in rows:
            f.write(r.model_dump_json() + "\n")
    print(f"validated {len(rows)} llm_synthetic rows -> {args.out}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Commit**

```bash
git add ml/scripts/generate_llm_draft.py
git commit -m "feat(ml): optional LLM-draft ingest (validate + tag llm_synthetic)"
```

- [ ] **Step 3: PAUSE.** Do not start Task 16 until the founder clears this gate.

---

### Task 15: STOP / HUMAN GATE — author the `human_simulated` eval exam

The exam does not appear from nowhere. The founder/team **write** it against a template + the Task 3 rubric, the tooling checks validity and coverage, and the founder locks the held-out split. **This produces the substrate that the ship gate requires (Tasks 12, 17).**

**Files:**
- Create: `ml/contracts/eval-authoring-template.md`
- Create (by the founder/team, gitignored): `data/eval_simulated/exam.jsonl`

**Interfaces:**
- Consumes: `label-schema.md`, `coverage.missing_strata`, `validate_jsonl.validate_path`, `residency.assert_no_eval_in_train`
- Produces: a validated, coverage-complete, held-out `eval`-split JSONL (`provenance:human_simulated`)

- [ ] **Step 1: Write `ml/contracts/eval-authoring-template.md`**

```markdown
# Eval exam authoring template (human_simulated)

Authors: founder + team (≥1 bilingual Malaysian for BM/ZH). Goal: realistic EN/BM/ZH office prompts
with SYNTHETIC / replaced person names and INVENTED ID digits (C3-a style). Privacy-clean — no real
client/employee data. This is the EXAM: never used for training.

## Each line (JSONL)
{"id": "...", "text": "...", "lang": "en|bm|zh|mixed", "provenance": "human_simulated",
 "split": "eval", "source": "team_author", "tags": [...],
 "spans": [{"start": N, "end": M, "surface": "...", "entity_type": "PER|ORG", "label": "MASK|KEEP"}]}

## Rubric
Apply docs/../ml/contracts/label-schema.md exactly. Same surface may flip by context.

## Required coverage (the checker enforces these; count per cell is your call — no mandatory N)
- PER KEEP (public/topic)   - PER MASK (private/transactional)
- ORG KEEP (public/topic)   - ORG MASK (private/transactional)
- same surface, opposite labels across two lines
- EN, BM, ZH present; at least some code-switch (lang:"mixed")
- one line tagged "ambiguous_keep" (bare short name, no context → KEEP)
- one line tagged "math_no_mask" (1+1 / a year → no spans)
- one line tagged "id_digit_line" (ID digits present; only PER/ORG spans labelled — L1 owns the digits)

## Honest limitation to record in the eval report
A small author pool has its own register bias; this is a curated approximation of Malaysian office
code-switching, not a sample of production traffic. A green score is not proof of field accuracy.
Record who authored it and in what register.
```

### HUMAN GATE: eval-set authoring

**What the founder must do:**
1. Team writes `data/eval_simulated/exam.jsonl` against the template + rubric.
2. Validate: `python -m sens.validate_jsonl data/eval_simulated/exam.jsonl` (must print `OK`).
3. Coverage check (Step 2 below): must print `COVERAGE COMPLETE`.
4. Confirm held-out isolation: the exam is `split:"eval"` and lives only under `data/eval_simulated/` (gitignored); the training script refuses eval rows (`assert_no_eval_in_train`, Task 16). Tasks 17/18 read the exam legitimately (they *are* the eval), never for training.
5. **Founder locks the exam** (freeze the file; do not edit it after training starts, or the "don't train on the exam" property is meaningless).

- [ ] **Step 2: Write a coverage CLI `ml/scripts/check_eval_coverage.py`**

```python
# ml/scripts/check_eval_coverage.py
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from sens.coverage import missing_strata, stratum_counts
from sens.residency import assert_no_eval_in_train
from sens.validate_jsonl import load_jsonl, validate_path


def main() -> None:
    ap = argparse.ArgumentParser(description="Validate + coverage-check an authored eval exam")
    ap.add_argument("path", type=Path)
    args = ap.parse_args()

    errs = validate_path(args.path)
    if errs:
        print("VALIDATION FAILED:\n" + "\n".join(errs))
        sys.exit(1)

    rows = load_jsonl(args.path)
    non_eval = [e.id for e in rows if e.split != "eval"]
    if non_eval:
        print(f"NOT AN EXAM: rows are not split=eval: {non_eval[:5]}")
        sys.exit(1)

    miss = missing_strata(rows)
    print("stratum counts (lang, entity_type, label):")
    for k, v in sorted(stratum_counts(rows).items()):
        print(f"  {k}: {v}")
    if miss:
        print(f"COVERAGE INCOMPLETE — missing: {miss}")
        sys.exit(1)
    print("COVERAGE COMPLETE")


if __name__ == "__main__":
    main()
```

- [ ] **Step 3: Commit the template + checker (never the exam data)**

```bash
git add ml/contracts/eval-authoring-template.md ml/scripts/check_eval_coverage.py
git commit -m "docs(ml): eval exam authoring template + coverage checker (data stays gitignored)"
```

- [ ] **Step 4: PAUSE** until the founder confirms `OK` + `COVERAGE COMPLETE` and locks the exam.

---

### Task 16: Training script — mDeBERTa-v3-base span classifier

**Files:**
- Create: `ml/scripts/train_span_clf.py`

**Interfaces:**
- Consumes: JSONL train/dev (via `load_jsonl`), `iter_span_instances`, `E_OPEN`/`E_CLOSE`, `residency.assert_no_eval_in_train`, `metrics.mask_precision_recall`
- Produces: a checkpoint under `artifacts/runs/<run_id>/` (gitignored) + `metrics.json`

**Baseline model (locked):** `microsoft/mdeberta-v3-base`. **`xlm-roberta-base` is forbidden.** `[train]` extras required; **not imported by any unit test.** Colab is fine for `llm_synthetic` training; if the training set contains `human_simulated`/`real`, keep it local (the script warns).

- [ ] **Step 1: Implement**

```python
# ml/scripts/train_span_clf.py
from __future__ import annotations

import argparse
import json
from pathlib import Path

LABEL2ID = {"KEEP": 0, "MASK": 1}
ID2LABEL = {0: "KEEP", 1: "MASK"}


def main() -> None:
    import numpy as np
    from datasets import Dataset
    from transformers import (
        AutoModelForSequenceClassification,
        AutoTokenizer,
        Trainer,
        TrainingArguments,
    )

    from sens.marking import E_CLOSE, E_OPEN, iter_span_instances
    from sens.metrics import mask_precision_recall
    from sens.residency import assert_no_eval_in_train
    from sens.validate_jsonl import load_jsonl

    ap = argparse.ArgumentParser()
    ap.add_argument("--train", type=Path, required=True)
    ap.add_argument("--dev", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--model", default="microsoft/mdeberta-v3-base")
    ap.add_argument("--epochs", type=float, default=1.0)
    ap.add_argument("--max-len", type=int, default=512)
    ap.add_argument("--batch", type=int, default=8)
    args = ap.parse_args()

    if args.model == "xlm-roberta-base":
        raise SystemExit("xlm-roberta-base is forbidden as the baseline (Global Constraints).")

    train_rows = load_jsonl(args.train)
    dev_rows = load_jsonl(args.dev)
    assert_no_eval_in_train(train_rows)
    assert_no_eval_in_train(dev_rows)
    for rows, name in ((train_rows, "train"), (dev_rows, "dev")):
        if any(r.provenance in {"human_simulated", "real"} for r in rows):
            print(f"NOTE: {name} contains non-synthetic data — keep this run on local MY infra, not Colab.")

    def to_records(rows):
        recs = []
        for ex in rows:
            for marked, label, _etype in iter_span_instances(ex):
                recs.append({"text": marked, "label": LABEL2ID[label]})
        if not recs:
            raise SystemExit("no span instances found — training data has no PER/ORG spans")
        return recs

    tok = AutoTokenizer.from_pretrained(args.model)
    tok.add_special_tokens({"additional_special_tokens": [E_OPEN, E_CLOSE]})
    model = AutoModelForSequenceClassification.from_pretrained(
        args.model, num_labels=2, id2label=ID2LABEL, label2id=LABEL2ID
    )
    model.resize_token_embeddings(len(tok))

    def tok_fn(batch):
        return tok(batch["text"], truncation=True, max_length=args.max_len)

    train_ds = Dataset.from_list(to_records(train_rows)).map(tok_fn, batched=True)
    dev_ds = Dataset.from_list(to_records(dev_rows)).map(tok_fn, batched=True)

    def compute_metrics(p):
        preds = np.argmax(p.predictions, axis=1)
        gold_l = [ID2LABEL[int(i)] for i in p.label_ids]
        pred_l = [ID2LABEL[int(i)] for i in preds]
        pr, rc = mask_precision_recall(gold_l, pred_l)
        return {"mask_precision": pr, "mask_recall": rc}

    targs = TrainingArguments(
        output_dir=str(args.out),
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch,
        per_device_eval_batch_size=args.batch,
        eval_strategy="epoch",   # transformers>=4.41 name
        save_strategy="epoch",
        logging_steps=5,
        report_to=[],
    )
    trainer = Trainer(
        model=model, args=targs, train_dataset=train_ds, eval_dataset=dev_ds,
        tokenizer=tok, compute_metrics=compute_metrics,
    )
    trainer.train()
    args.out.mkdir(parents=True, exist_ok=True)
    trainer.save_model(str(args.out))
    tok.save_pretrained(str(args.out))
    metrics = trainer.evaluate()
    (args.out / "metrics.json").write_text(json.dumps(metrics, indent=2))
    print(json.dumps(metrics, indent=2))


if __name__ == "__main__":
    main()
```

- [ ] **Step 1b (should-fix): fight always-KEEP during training, not only at the gate.** KEEP will outnumber MASK in realistic data, so add a `--mask-weight` option (default `1.0`) that weights the MASK class in the loss. Add the arg and swap `Trainer` for this subclass when `--mask-weight != 1.0`:

```python
# add to scripts/train_span_clf.py (near the top of main(), after args parsed)
    ap.add_argument("--mask-weight", type=float, default=1.0,
                    help="loss weight for the MASK class (>1 fights KEEP imbalance)")

# ...define before Trainer is constructed:
    import torch
    from transformers import Trainer as _HFTrainer

    class WeightedTrainer(_HFTrainer):
        def compute_loss(self, model, inputs, return_outputs=False, **kw):
            labels = inputs.pop("labels")
            outputs = model(**inputs)
            weight = torch.tensor([1.0, args.mask_weight], device=outputs.logits.device)
            loss = torch.nn.functional.cross_entropy(outputs.logits, labels, weight=weight)
            return (loss, outputs) if return_outputs else loss

    trainer_cls = WeightedTrainer if args.mask_weight != 1.0 else Trainer
```

Then construct `trainer = trainer_cls(...)`. Alternative if you prefer data-level balancing: oversample MASK instances in `to_records`. **Either is optional for the smoke run and expected for the real run** — record which you used in the run notes.

- [ ] **Step 2: Smoke-train on fixtures (CPU acceptable for tiny data)**

```bash
pip install -e ".[dev,train]"
python scripts/train_span_clf.py --train data/fixtures/tiny_train.jsonl --dev data/fixtures/tiny_train.jsonl --out artifacts/runs/smoke --epochs 1
```

Expected: completes; writes `artifacts/runs/smoke/` (gitignored) + `metrics.json`. **`git status` must show nothing under `artifacts/` staged.** (Real training on the merged set runs on Colab for `llm_synthetic`, or locally for anything non-synthetic.)

> 🔴 **Smoke metrics are NOT ship evidence.** This run uses `--train == --dev` on 12 fixtures to prove the pipeline executes; its numbers are meaningless for accuracy and must never appear in a ship-status decision. The only ship signal is Task 19's eval on the locked `human_simulated` exam.

- [ ] **Step 3: Commit scripts only**

```bash
git add ml/scripts/train_span_clf.py
git commit -m "feat(ml): mDeBERTa-v3-base span-classifier training (markers + CPU-safe smoke)"
```

---

### Task 17: Gold-span eval runner + report (metrics + gate + stratum table)

> 🔴 **This is the GOLD-SPAN eval — an upper bound.** It scores the classifier on author-perfect spans,
> so it isolates the sensitivity decision but assumes NER is perfect. **Integrated recall is bounded by
> NER recall**, measured for real in Task 18 (composed) and again on the live NER at integration. Read
> this report's numbers as "the classifier's ceiling," never as the integrated system's accuracy.

**Files:**
- Create: `ml/scripts/run_eval.py`, `ml/tests/test_run_eval_gate_wiring.py`

**Interfaces:**
- Consumes: a checkpoint dir, an eval JSONL; `marking`, `metrics`, `coverage`, `eval_gate`
- Produces: `artifacts/reports/<run_id>.json` with `mask_precision`, `mask_recall`, `full_mention_coverage`, `stratum_counts`, `missing_strata`, `ship_status`, `reasons`, `authorship_note`

- [ ] **Step 1: Implement `run_eval.py`** (model inference lives in a torch-only function; the gate-wiring is torch-free and unit-tested in Step 3)

```python
# ml/scripts/run_eval.py
from __future__ import annotations

import argparse
import json
from pathlib import Path

from sens.coverage import missing_strata, stratum_counts
from sens.eval_gate import ship_status
from sens.metrics import full_mention_coverage, mask_precision_recall
from sens.validate_jsonl import load_jsonl


def build_report(rows, gold, pred, entities):
    pr, rc = mask_precision_recall(gold, pred)
    miss = missing_strata(rows)
    status, reasons = ship_status(rows, mask_recall=rc, missing_strata=miss)
    return {
        "n_spans": len(gold),
        "mask_precision": pr,
        "mask_recall": rc,
        "full_mention_coverage": full_mention_coverage(entities),
        "stratum_counts": {",".join(k): v for k, v in stratum_counts(rows).items()},
        "missing_strata": miss,
        "ship_status": status,
        "reasons": reasons,
        "authorship_note": "human_simulated exam authored by founder/team; curated approximation, "
        "small author pool has register bias — a green score is not field proof.",
    }


def _predict(model_dir: str, rows, max_len: int):
    import torch
    from transformers import AutoModelForSequenceClassification, AutoTokenizer

    from sens.marking import iter_span_instances

    tok = AutoTokenizer.from_pretrained(model_dir)
    model = AutoModelForSequenceClassification.from_pretrained(model_dir).eval()
    id2label = model.config.id2label
    gold, pred = [], []
    entities: dict[str, list[bool]] = {}
    with torch.no_grad():
        for ex in rows:
            for (marked, label, _etype), sp in zip(iter_span_instances(ex), ex.spans):
                enc = tok(marked, truncation=True, max_length=max_len, return_tensors="pt")
                pi = int(model(**enc).logits.argmax(-1))
                plabel = id2label[pi]
                gold.append(label)
                pred.append(plabel)
                if label == "MASK":  # 100%-mention-coverage over true-MASK mentions
                    key = f"{ex.id}:{sp.surface.lower()}"
                    entities.setdefault(key, []).append(plabel == "MASK")
    return gold, pred, entities


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", type=Path, required=True)
    ap.add_argument("--model", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--max-len", type=int, default=512)
    args = ap.parse_args()

    rows = load_jsonl(args.data)
    gold, pred, entities = _predict(str(args.model), rows, args.max_len)
    report = build_report(rows, gold, pred, entities)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run the eval on fixtures (synthetic → must be NOT_SHIPPED)**

```bash
python scripts/run_eval.py --data data/fixtures/tiny_train.jsonl --model artifacts/runs/smoke --out artifacts/reports/smoke.json
```

> The fixtures are `split:"train"` + `llm_synthetic`, so `ship_status` reports `NOT_SHIPPED` ("no eval split present"). Confirm the report says so — this proves the gate cannot green-light synthetic data.

- [ ] **Step 3: Torch-free unit test on the gate wiring**

```python
# ml/tests/test_run_eval_gate_wiring.py
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from run_eval import build_report  # noqa: E402
from sens.schema import Example, Span  # noqa: E402


def _exam_rows():
    return [
        Example(id="1", text="Einstein from accounting owes us.", lang="en", provenance="human_simulated",
                split="eval", spans=[Span(start=0, end=8, surface="Einstein", entity_type="PER", label="MASK")],
                tags=["id_digit_line"]),
        Example(id="2", text="Explain Einstein's theory.", lang="en", provenance="human_simulated",
                split="eval", spans=[Span(start=8, end=16, surface="Einstein", entity_type="PER", label="KEEP")]),
    ]


def test_report_flags_missing_strata_even_with_good_recall():
    rows = _exam_rows()
    gold = ["MASK", "KEEP"]
    pred = ["MASK", "KEEP"]           # perfect predictions...
    report = build_report(rows, gold, pred, {"1:einstein": [True]})
    assert report["mask_recall"] == 1.0
    # ...but the exam lacks ORG/BM/ZH strata, so the gate still refuses to ship
    assert report["ship_status"] == "NOT_SHIPPED"
    assert report["full_mention_coverage"] == 1.0
```

Run: `pytest tests/test_run_eval_gate_wiring.py -v` → PASS.

- [ ] **Step 4: Commit**

```bash
git add ml/scripts/run_eval.py ml/tests/test_run_eval_gate_wiring.py
git commit -m "feat(ml): eval runner — metrics + ship gate + stratum table + authorship note"
```

---

### Task 18: Composed NER→classifier eval (the honest integration number)

> 🔴 **Why this task exists (must-fix #1).** Tasks 16–17 train and score on **author-perfect gold spans**.
> Production feeds the classifier **stock-NER-proposed spans** — noisy boundaries, misses, extras. This
> task runs a **stand-in** multilingual NER over the exam, aligns its PER/ORG proposals to gold, scores
> the classifier on the **NER-proposed** spans, and reports the **NER miss rate separately**. It is the
> honest integration number the gold-span report cannot give. **A full composed eval on the *live* Slice 1
> NER is a MANDATORY integration gate after Slice 1** — this stand-in version is the in-track approximation.

**Files:**
- Create: `ml/scripts/run_composed_eval.py`

**Interfaces:**
- Consumes: the exam JSONL, a trained checkpoint, a **free/public** multilingual NER; `align.align_spans`, `align.ner_miss_rate`, `marking.mark_span`, `metrics.mask_precision_recall`
- Produces: `artifacts/reports/<run>_composed.json` with `classifier_mask_precision_on_ner_spans`, `classifier_mask_recall_on_ner_spans`, `ner_miss_rate`, `ner_extra_count`, `ner_model`

- [ ] **Step 1: Implement**

```python
# ml/scripts/run_composed_eval.py
"""Composed eval: stand-in NER over exam texts -> align PER/ORG proposals to gold ->
score the trained classifier on the NER-PROPOSED spans; report NER miss rate separately.

The NER model MUST be free/public and commercial-use OK (verify availability + licence, the
same discipline Slice 1 follows). Ideally the same family Slice 1 ships, so the number is
meaningful. PERSON->PER, ORG/ORGANIZATION->ORG, LOC dropped. --ner-model is REQUIRED so no
licence is silently assumed here [verify].
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from sens.align import align_spans
from sens.marking import mark_span
from sens.metrics import mask_precision_recall
from sens.schema import Span
from sens.validate_jsonl import load_jsonl

_NER_MAP = {"PER": "PER", "PERSON": "PER", "ORG": "ORG", "ORGANIZATION": "ORG"}


def _proposed_spans(ner, text: str) -> list[tuple[int, int]]:
    spans = []
    for ent in ner(text):
        grp = _NER_MAP.get(str(ent.get("entity_group", "")).upper())
        if grp is None:
            continue  # LOC / MISC dropped (CLAUDE.md §8.1)
        spans.append((int(ent["start"]), int(ent["end"])))
    return spans


def main() -> None:
    import torch
    from transformers import AutoModelForSequenceClassification, AutoTokenizer, pipeline

    ap = argparse.ArgumentParser()
    ap.add_argument("--data", type=Path, required=True, help="the human_simulated exam")
    ap.add_argument("--model", type=Path, required=True, help="trained classifier checkpoint")
    ap.add_argument("--ner-model", required=True,
                    help="FREE/public/commercial-OK multilingual NER (verify + document; LOC dropped)")
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--max-len", type=int, default=512)
    args = ap.parse_args()

    rows = load_jsonl(args.data)
    ner = pipeline("token-classification", model=args.ner_model, aggregation_strategy="simple")
    tok = AutoTokenizer.from_pretrained(str(args.model))
    clf = AutoModelForSequenceClassification.from_pretrained(str(args.model)).eval()
    id2label = clf.config.id2label

    gold_labels, pred_labels = [], []
    total_gold = total_miss = total_extra = 0
    with torch.no_grad():
        for ex in rows:
            res = align_spans(ex.spans, _proposed_spans(ner, ex.text))
            total_gold += len(ex.spans)
            total_miss += len(res.ner_misses)
            total_extra += len(res.ner_extras)
            for (p_start, p_end), gold_label in res.matched:
                sp = Span(start=p_start, end=p_end, surface=ex.text[p_start:p_end],
                          entity_type="PER", label=gold_label)  # entity_type unused for marking
                enc = tok(mark_span(ex.text, sp), truncation=True, max_length=args.max_len,
                          return_tensors="pt")
                pi = int(clf(**enc).logits.argmax(-1))
                gold_labels.append(gold_label)
                pred_labels.append(id2label[pi])

    pr, rc = mask_precision_recall(gold_labels, pred_labels) if gold_labels else (0.0, 0.0)
    report = {
        "n_matched_spans": len(gold_labels),
        "classifier_mask_precision_on_ner_spans": pr,
        "classifier_mask_recall_on_ner_spans": rc,
        "ner_miss_rate": (total_miss / total_gold) if total_gold else 0.0,
        "ner_extra_count": total_extra,
        "ner_model": args.ner_model,
        "note": "STAND-IN NER, not the live Slice 1 NER. Integrated MASK recall <= (1 - ner_miss_rate). "
        "The mandatory integration gate re-runs this on the SHIPPED NER after Slice 1.",
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
```

> **Optional complementary mitigation (founder's "and/or"):** a **noisy-span training augmentation** — perturb gold span boundaries (±1–2 chars) and inject a few NER-style extras into the training instances — teaches the classifier robustness to NER noise. Left optional; if used, record it in the run notes. The composed eval above is the *measurement*; augmentation is a possible *fix* if `ner_miss_rate`/boundary noise hurts.

- [ ] **Step 2: Run against the exam (after training)**

```bash
python scripts/run_composed_eval.py --data data/eval_simulated/exam.jsonl --model artifacts/runs/<run> --ner-model <free-public-ner> --out artifacts/reports/<run>_composed.json
```

Read `ner_miss_rate` as a **first-class number** — it caps integrated recall regardless of how good the classifier is.

> **Footnote (non-normative — candidate checkpoints to VERIFY, not defaults).** Starting points for
> `--ner-model`, each **`[verify: still downloadable + commercial-use licence]`** before use:
> `Davlan/xlm-roberta-base-ner-hrl`, `Babelscape/wikineural-multilingual-ner`. ⚠️ wikineural's licence
> is **CC-BY-NC-SA (non-commercial) `[verify]`** — likely unsuitable for a shipped product and only
> arguably acceptable as an internal stand-in; do not assume it. **No default is hardcoded — the
> executor picks one, verifies its availability and licence, and documents the choice** (same discipline
> Slice 1 follows, ADR 0017 §2).

- [ ] **Step 3: Commit script only**

```bash
git add ml/scripts/run_composed_eval.py
git commit -m "feat(ml): composed NER->classifier eval + separate NER miss rate"
```

---

### Task 19: STOP / HUMAN GATE — ship-status review + team test

**No new code.** The founder reviews **both** reports (gold-span, Task 17; composed, Task 18) and the team tests behaviour. Export happens only after this clears (Task 20).

### HUMAN GATE: ship-status + team test

**What the founder must do:**
1. Run the **gold-span** eval on the **locked `human_simulated` exam** (not fixtures):
   `python scripts/run_eval.py --data data/eval_simulated/exam.jsonl --model artifacts/runs/<run> --out artifacts/reports/<run>.json`
2. Run the **composed** eval (Task 18) for the integration number + `ner_miss_rate`.
3. Read both: `ship_status`, **MASK precision and recall separately**, `full_mention_coverage`, `stratum_counts`, `missing_strata`, and the composed `ner_miss_rate`. Remember `SHIP_CANDIDATE` here means "worth integrating and testing," **not** "cleared for production" (ADR 0015 real-substrate is still owed).
4. Founder/team **test** behaviour on new simulated-realistic prompts. Feedback may drive a **local retrain on the RTX 5070** (not Colab) — appending failures to the **training** set, never the exam.
5. **The held-out exam stays frozen.** Any real/unredacted personal prompt (if ever added) stays off Colab and re-arms the ADR 0015 counsel STOP (`residency.counsel_gate_required`).
6. Proceed to Task 20 **only if** `ship_status == SHIP_CANDIDATE` **and** the founder accepts the numbers (the operating threshold is the founder's/admin's call — the plan invents none).

- [ ] **Step 1: PAUSE** until the founder clears this gate.

---

### Task 20: ONNX export — a measurement gate, not an assumed success

> 🔴 **Must-fix #4.** mDeBERTa-v3 via naive `torch.onnx.export` is historically fragile. This task
> **attempts** export, then **verifies** it with an ONNX Runtime CPU round-trip against the torch model on
> a few marked strings. **If it fails, STOP** — record ONNX as `BLOCKED/[unverified]`, and the **HF
> checkpoint remains the valid hand-off artifact.** Do not pretend export always works.

**Files:**
- Create: `ml/scripts/export_onnx.py`
- Modify: `ml/contracts/export-contract.md` (fill I/O names from the real export)

**Interfaces:**
- Consumes: a HF checkpoint (`artifacts/runs/<run_id>`)
- Produces (on success): `artifacts/export/sens-v0.1.0/` with `model.onnx` + tokenizer + `labels.json` + `SHA256SUMS`

- [ ] **Step 1: Implement `export_onnx.py` with a round-trip gate**

```python
# ml/scripts/export_onnx.py
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


def _sha256(p: Path) -> str:
    h = hashlib.sha256()
    h.update(p.read_bytes())
    return h.hexdigest()


def main() -> None:
    import numpy as np
    import onnxruntime as ort
    import torch
    from transformers import AutoModelForSequenceClassification, AutoTokenizer

    ap = argparse.ArgumentParser()
    ap.add_argument("--model", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--opset", type=int, default=17)
    ap.add_argument("--tol", type=float, default=1e-3)
    args = ap.parse_args()

    args.out.mkdir(parents=True, exist_ok=True)
    tok = AutoTokenizer.from_pretrained(str(args.model))  # already has [E]/[/E]
    model = AutoModelForSequenceClassification.from_pretrained(str(args.model)).eval()

    dummy = tok("Chase payment from [E] AcmeX [/E] today.", return_tensors="pt")
    onnx_path = args.out / "model.onnx"
    torch.onnx.export(
        model,
        (dummy["input_ids"], dummy["attention_mask"]),
        str(onnx_path),
        input_names=["input_ids", "attention_mask"],
        output_names=["logits"],
        dynamic_axes={
            "input_ids": {0: "batch", 1: "seq"},
            "attention_mask": {0: "batch", 1: "seq"},
            "logits": {0: "batch"},
        },
        opset_version=args.opset,
    )

    # MEASUREMENT GATE: ORT CPU round-trip must match torch on a few marked strings.
    sess = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    checks = [
        "Chase payment from [E] AcmeX [/E] today.",
        "Explain [E] Einstein [/E] 's theory.",
        "请把合同发给 [E] 张伟 [/E] 。",
    ]
    max_diff = 0.0
    with torch.no_grad():
        for s in checks:
            enc = tok(s, return_tensors="pt")
            torch_logits = model(**enc).logits.numpy()
            ort_logits = sess.run(
                ["logits"],
                {"input_ids": enc["input_ids"].numpy(), "attention_mask": enc["attention_mask"].numpy()},
            )[0]
            max_diff = max(max_diff, float(np.abs(torch_logits - ort_logits).max()))
    if max_diff > args.tol:
        raise SystemExit(
            f"ONNX round-trip MISMATCH: max abs diff {max_diff:.4g} > tol {args.tol:.4g}. "
            f"STOP — record ONNX as BLOCKED/[unverified]. The HF checkpoint at {args.model} remains "
            f"the valid hand-off artifact; do not ship this .onnx."
        )
    print(f"ONNX round-trip OK (max abs diff {max_diff:.2g})")

    tok.save_pretrained(str(args.out))
    (args.out / "labels.json").write_text(json.dumps(model.config.id2label))
    sums = args.out / "SHA256SUMS"
    lines = [
        f"{_sha256(p)}  {p.name}"
        for p in sorted(args.out.iterdir())
        if p.is_file() and p.name != "SHA256SUMS"
    ]
    sums.write_text("\n".join(lines) + "\n")
    print(f"wrote {onnx_path} + SHA256SUMS ({len(lines)} files)")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Export + verify + record real I/O names (or STOP)**

```bash
python scripts/export_onnx.py --model artifacts/runs/<run> --out artifacts/export/sens-v0.1.0
python -c "import onnx; m=onnx.load('artifacts/export/sens-v0.1.0/model.onnx'); print('inputs',[i.name for i in m.graph.input]); print('outputs',[o.name for o in m.graph.output])"
```

If it prints `ONNX round-trip OK`, replace the `[names verified at Task 20]` / `[name verified at Task 20]` markers in `export-contract.md` with the printed names. **If it STOPs**, record ONNX as `BLOCKED/[unverified]` in `export-contract.md`, hand off the **HF checkpoint** instead, and surface it to the founder. **Do not commit anything under `artifacts/`.**

- [ ] **Step 3: Commit scripts + contract update only**

```bash
git add ml/scripts/export_onnx.py ml/contracts/export-contract.md
git commit -m "feat(ml): ONNX export with ORT round-trip gate + SHA256 pin"
```

- [ ] **Step 4: PAUSE** — do not proceed to hand-off until export is verified or explicitly recorded as blocked.

---

### Task 21: Hand-off note + operating-brief sync (END OF PLAN)

**Files:**
- Create: `ml/HANDOFF_TO_EXTENSION.md`
- Modify: `docs/team/sensitive-vs-not-parallel-track.md` (point §6 starter prompt + plan link at **this** plan)

**Interfaces:**
- Consumes: `export-contract.md`
- Produces: the eng checklist for *later* integration (after Slice 2) — the executor does not integrate

- [ ] **Step 1: Write `ml/HANDOFF_TO_EXTENSION.md`** (1 page):
  - Artifact path pattern `sens-vX.Y.Z/`, hash-verify before load. **If Task 20 recorded ONNX as `BLOCKED`, the hand-off artifact is the HF checkpoint** and ONNX is an open item, not a shipped file.
  - NER→model label mapping: `PERSON→PER`, `ORG/ORGANIZATION→ORG`, `LOC→dropped`
  - Inference protocol = NER proposes PER/ORG spans → `mark_span` → **span-centered windowing** (`sens.windowing.plan_window`) → tokenize → 2 logits → **default `argmax`, admin/human-gated threshold**
  - `labels.json` = `{"0":"KEEP","1":"MASK"}`; model exports **raw logits**, not a hard label
  - **Do NOT integrate before Slice 1 works and Slice 2 ships** (ADR 0016); stock NER stays default (ADR 0017)
  - **Integrated recall is bounded by NER recall** — v1 metrics are gold-span; the stand-in composed number is Task 18; **a composed eval on the SHIPPED NER is a mandatory integration gate** (not optional)
  - **`SHIP_CANDIDATE` ≠ production-cleared** — ADR 0015 real-substrate is still owed before production
  - Ignore-rate-per-class is a prioritization signal, **not a label** (doc 07 §7)

- [ ] **Step 2: Update `docs/team/sensitive-vs-not-parallel-track.md`** — replace the plan link + §6 starter prompt's plan path with `docs/superpowers/plans/2026-07-18-sensitive-vs-not-ml.md`, and note architecture is (B) span classifier.

- [ ] **Step 3: Full CPU unit suite green without train extras**

```bash
cd ml
pip install -e ".[dev]"
pytest -q
```

Expected: all unit tests PASS with **no torch installed**.

- [ ] **Step 4: Commit**

```bash
git add ml/HANDOFF_TO_EXTENSION.md docs/team/sensitive-vs-not-parallel-track.md
git commit -m "docs(ml): extension hand-off note + track brief synced to span-classifier plan"
```

- [ ] **Step 5: STOP. End of plan.** The executor does not touch `code/extension/`. Integration is out of scope.

---

## Human gate index

| Gate | Task | Clears when |
|---|---|---|
| **LLM/synthetic draft review** | 14 | Founder + ≥1 bilingual Malaysian reviewer audit a stratified sample; disagreement reviewed; merged (audited-only) |
| **Eval-set authoring** | 15 | Team authors exam; `validate` = OK; `check_eval_coverage` = COVERAGE COMPLETE; founder locks it |
| **Ship-status + team test** | 19 | `ship_status == SHIP_CANDIDATE` on the real exam (gold-span **and** composed), `ner_miss_rate` read, **and** founder accepts the numbers |
| **ONNX export gate** | 20 | ORT round-trip matches torch — else ONNX recorded `BLOCKED/[unverified]`, HF checkpoint handed off |
| **Eng hand-off** | 21 | Hand-off note written; brief synced; CPU suite green — then STOP |
| **Counsel STOP (conditional)** | 6 / 15 | **Waived this phase** (`human_simulated`). **Re-armed** if any `real` prompt enters scope — then ADR 0015 / U25 counsel + retention before disk |
| **ADR 0015 production residual (not a pause — a standing caveat)** | Global / gate index | `human_simulated` waiver does **not** discharge real-substrate for production ship; register-bias residual stays in `authorship_note` |

---

## Self-review

### Spec coverage

| Spec item (brief / ADRs / doc 07 / Q&A) | Task(s) |
|---|---|
| Architecture (B) — span classifier, not MASK tagger | Global + 2, 7, 16 |
| Backbone mdeberta-v3-base; xlm-roberta-base forbidden; size eng-gated | Global + 16 |
| L1 owns ID digits; model only classifies PER/ORG | 2 (schema), 3, 13 |
| Label policy — relational context; ambiguous→KEEP | 3, 13, 15 |
| Honorific/title inside MASK span (doc 04 §4.3) | 3 (should-fix #8) |
| Overlapping/nested spans rejected at validate | 2 (must-fix #10) |
| Anti-trivial: separate MASK P/R; always-KEEP = NOT_SHIPPED; no invented threshold | 10, 12 |
| Train imbalance fought during training (class weight / oversample) | 16 (should-fix #6) |
| 100% mention coverage (doc 07 §1.4) | 10, 17 |
| Strata coverage EN/BM/ZH × PER/ORG × MASK/KEEP | 11, 15, 17 |
| Provenance three-way + ship gate (human_simulated/real only; tie fails safe) | 2, 12 |
| Eval substrate = human_simulated (privacy-clean); LLM never sole ship signal | 12, 15, Global |
| **Train/serve span mismatch — gold-span caveat + composed NER→classifier eval + NER miss rate** | Global, 8b, 17, 18 (must-fix #1) |
| **NER label mapping PERSON→PER, ORG→ORG, LOC dropped** | 3, 4, 18, 21 (should-fix #7) |
| **Marker single-id + span-centered windowing (no blind truncation)** | 7 (must-fix #3), 4, 21 |
| **Export logits/scores; default argmax until admin threshold** | 4, 20 (should-fix #9) |
| **ONNX export is a measurement gate (ORT round-trip; STOP on fail)** | 20 (must-fix #4) |
| **merge emits AUDITED rows only (--allow-unaudited + warning)** | 9, 14 (must-fix #2) |
| **ADR 0015 residual: waiver ≠ production discharge; register-bias in report** | Global, 17, gate index (must-fix #5) |
| Human audit = stratified sample, not 100%; ≥1 bilingual MY reviewer; no LLM self-audit | 8, 9, 14 |
| Disagreement report + STOP on material BM/ZH; no hardcoded cutoff | 9, 14 |
| Counsel STOP waived now / conditionally re-armed | 6, 15, gate index |
| Compute: CPU-only CI; Colab for synthetic; real stays local MY | 1, 6, 16 |
| Don't train on the exam (held-out guard) | 6, 15, 16 |
| Retrain-on-failures local, not Colab | 19 (gate) |
| End-user inference CPU/WASM baseline, WebGPU optional | 4 (export contract) |
| No weights/ONNX/real text in git | 1 (.gitignore), 3 (data policy), throughout |
| Eval-set authoring is a gated task (template + checklist + validator + split-guard) | 15 |
| Smoke metrics ≠ ship evidence; draft-gen is external | 16, 14 (nits) |
| Terminal scope: report + hash-pinned ONNX (or blocked→HF) + hand-off; STOP; no code/extension | 20, 21 |
| Every number cited / (estimate) / [unverified] | Global + 4, 16, 18 |
| No Co-Authored-By trailer | Global |

### Placeholder scan

- No "TBD", "implement later", "add validation later", or "similar to Task N" — every code step carries complete code.
- Deliberate `[unverified]`/`[verify]` markers: on-device **size** and **latency** (eng-gated), the export **I/O names** until measured at Task 20, and the **composed-eval NER checkpoint's availability + licence** (must be free/public/commercial-OK, `--ner-model` required so nothing is silently assumed). These are measurement/verification gates, not unfinished work.
- Deliberately **not** specified: the numeric MASK-recall/precision **ship threshold** (human/admin-gated) and the **per-cell exam counts** (human-gated). Both are absences the founder required, not gaps.
- Type consistency: `Span(start,end,surface,entity_type,label)` and `Example(id,text,lang,spans,provenance,split,source,tags)` are used identically across Tasks 2–18; `LABEL2ID={"KEEP":0,"MASK":1}`/`ID2LABEL` match between Task 16 (train) and Tasks 17–18 (eval/composed); `mark_span`/`iter_span_instances`/`E_OPEN`/`E_CLOSE` (Task 7) and `plan_window` (Task 7) are consumed unchanged by Tasks 16–20; `align_spans`/`ner_miss_rate` (Task 8b) are consumed by Task 18; `ship_status(examples, mask_recall, missing_strata)` signature is identical in Tasks 12 and 17.
