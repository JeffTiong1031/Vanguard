# Sensitive-vs-Not Parallel Track Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an isolated `ml/` tree that can generate audited training data, train a small span-level MASK model, evaluate it on a real-text substrate (ADR 0015), and export a versioned ONNX artifact — without blocking Slice 1/2 or shipping synthetic-only “green” scores.

**Architecture:** Prompt text is labeled at **character spans** with BIO tags `O` / `B-MASK` / `I-MASK` (only sensitive spans are positive). LLM output is **augmentation only**. A deterministic fixture generator powers CI. Training uses a small multilingual encoder + token-classification head. Eval refuses `SHIP`-status unless the dataset declares `substrate=real`. Extension integration is out of scope for this plan (hand-off contract only).

**Tech Stack:** Python 3.11+, pytest, pydantic v2, Hugging Face `transformers` + `datasets` + `tokenizers`, PyTorch (train), `onnx` / optimum export path, JSONL on disk.

## Global Constraints

- Does **not** amend ADR 0016: product order remains Slice 1 → team test → Slice 2 → then integrate sensitivity.
- Slice 1 L2 stays **stock NER** (ADR 0017); this track must not block it.
- Training may be synthetic-augmented; **eval text substrate must be real** (ADR 0015). Synthetic-only eval → status `NOT_SHIPPED`, never `SHIP`.
- **L1 owns** NRIC/SSM/TIN-shaped digits; the model must not be the sole ID detector. Ordinary math (`1 + 1`) is KEEP.
- Beachhead languages: EN / BM / ZH code-switching (Malaysia/SEA).
- Precision over recall for blocking UX (ADR 0001): false MASK = admin ticket.
- **No model weights in git. No raw personal eval text in git** without counsel + retention rules.
- Every number is cited, `(estimate)`, or `(unverified)` — gap over fabrication.
- Canonical rules: `docs/07-ml-training-and-data-strategy.md`, `docs/adr/0015-eval-corpus-is-real.md`, `docs/team/sensitive-vs-not-parallel-track.md`.

## File structure (locked)

```text
ml/
  README.md
  pyproject.toml
  .gitignore
  contracts/
    label-schema.md
    export-contract.md
  src/sens/
    __init__.py
    schema.py              # Pydantic records + BIO helpers
    validate_jsonl.py      # CLI + library validation
    sample_audit.py        # stratified audit sampler
    disagreement.py        # audit disagreement rate
    bio.py                 # char spans → token BIO
    metrics.py             # span P/R + 100% mention coverage
    eval_gate.py           # SHIP vs NOT_SHIPPED
  prompts/
    v1_generate_mask_spans.md
  scripts/
    generate_fixtures.py   # deterministic CI data (no LLM API)
    generate_llm_draft.py  # optional; writes candidates for audit
    merge_audit.py
    train_token_clf.py
    export_onnx.py
    run_eval.py
  tests/
    test_schema.py
    test_validate_jsonl.py
    test_sample_audit.py
    test_disagreement.py
    test_bio.py
    test_metrics.py
    test_eval_gate.py
  data/
    fixtures/              # tiny committed JSONL (synthetic, safe)
    README.md              # what may / may not be committed
  artifacts/               # gitignored: runs, onnx, reports
```

---

### Task 1: Scaffold `ml/` package and ignore rules

**Files:**
- Create: `ml/README.md`
- Create: `ml/pyproject.toml`
- Create: `ml/.gitignore`
- Create: `ml/src/sens/__init__.py`
- Create: `ml/data/README.md`
- Create: `ml/artifacts/.gitkeep` (optional; or ignore whole dir)
- Modify: `.gitignore` (repo root) — add `ml/artifacts/` and weight patterns if missing

**Interfaces:**
- Consumes: none
- Produces: installable package name `sens` via `ml/pyproject.toml`

- [ ] **Step 1: Create `ml/pyproject.toml`**

```toml
[project]
name = "sens"
version = "0.1.0"
description = "Sensitive-vs-not parallel track (training + eval tooling)"
requires-python = ">=3.11"
dependencies = [
  "pydantic>=2.6",
  "pytest>=8.0",
]

[project.optional-dependencies]
train = [
  "torch",
  "transformers>=4.40",
  "datasets>=2.18",
  "accelerate",
  "seqeval",
  "onnx",
  "onnxruntime",
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
data/llm_draft/
*.egg-info/
dist/
build/
```

- [ ] **Step 3: Create `ml/data/README.md`**

```markdown
# Data policy

- **Commit:** tiny synthetic fixtures under `fixtures/` only.
- **Do not commit:** real personal prompts, full LLM dumps, weights, ONNX.
- Real eval substrate is an ADR 0015 legal event — counsel before disk.
```

- [ ] **Step 4: Create `ml/README.md` pointing at the operating brief + this plan**

```markdown
# ml/ — sensitive-vs-not parallel track

Operating brief: [`docs/team/sensitive-vs-not-parallel-track.md`](../docs/team/sensitive-vs-not-parallel-track.md)

Implementation plan: [`docs/superpowers/plans/2026-07-17-sensitive-vs-not-parallel-track.md`](../docs/superpowers/plans/2026-07-17-sensitive-vs-not-parallel-track.md)

```bash
cd ml
python -m venv .venv
# Windows: .venv\Scripts\activate
pip install -e ".[train]"
pytest -q
```

Does not block Slice 1/2. No weights in git.
```

- [ ] **Step 5: Create empty `ml/src/sens/__init__.py`**

```python
"""Sensitive-vs-not tooling (parallel track)."""

__version__ = "0.1.0"
```

- [ ] **Step 6: Install and sanity-check**

Run (from `ml/`):

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -e .
pytest -q
```

Expected: pytest collects 0 tests (or exits 5 “no tests”) — acceptable until Task 2. Prefer adding a trivial later.

- [ ] **Step 7: Commit**

```bash
git add ml/pyproject.toml ml/.gitignore ml/README.md ml/data/README.md ml/src/sens/__init__.py
git commit -m "chore(ml): scaffold sensitive-vs-not parallel track package"
```

---

### Task 2: JSONL record schema (Pydantic) + tests

**Files:**
- Create: `ml/src/sens/schema.py`
- Create: `ml/tests/test_schema.py`

**Interfaces:**
- Consumes: none
- Produces:
  - `class Span(BaseModel): start: int; end: int; label: Literal["MASK"]; surface: str`
  - `class Example(BaseModel): id: str; text: str; lang: Literal["en","bm","zh","mixed"]; spans: list[Span]; source: str; split: Literal["train","dev","eval_synth","eval_real"]; substrate: Literal["synthetic","real"]`
  - `def assert_spans_valid(example: Example) -> None`

Only **MASK** spans are stored. Unlisted tokens/entities are KEEP by omission (public names stay unspanned).

- [ ] **Step 1: Write the failing test**

```python
# ml/tests/test_schema.py
import pytest
from pydantic import ValidationError
from sens.schema import Example, Span, assert_spans_valid


def test_valid_mask_span():
    ex = Example(
        id="fx-1",
        text="Please email Ahmad bin Ali about the invoice.",
        lang="en",
        spans=[Span(start=13, end=26, label="MASK", surface="Ahmad bin Ali")],
        source="fixture",
        split="train",
        substrate="synthetic",
    )
    assert_spans_valid(ex)
    assert ex.text[ex.spans[0].start : ex.spans[0].end] == "Ahmad bin Ali"


def test_span_surface_mismatch_raises():
    ex = Example(
        id="fx-bad",
        text="Hello Einstein",
        lang="en",
        spans=[Span(start=6, end=14, label="MASK", surface="Wrong")],
        source="fixture",
        split="train",
        substrate="synthetic",
    )
    with pytest.raises(ValueError, match="surface"):
        assert_spans_valid(ex)


def test_public_figure_has_zero_spans():
    ex = Example(
        id="fx-keep",
        text="Explain Einstein's theory of relativity.",
        lang="en",
        spans=[],
        source="fixture",
        split="train",
        substrate="synthetic",
    )
    assert_spans_valid(ex)


def test_rejects_keep_label_in_span():
    with pytest.raises(ValidationError):
        Span(start=0, end=1, label="KEEP", surface="x")  # type: ignore[arg-type]
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd ml
pytest tests/test_schema.py -v
```

Expected: FAIL (`ModuleNotFoundError: sens.schema` or import error)

- [ ] **Step 3: Write minimal implementation**

```python
# ml/src/sens/schema.py
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator


class Span(BaseModel):
    start: int = Field(ge=0)
    end: int = Field(ge=0)
    label: Literal["MASK"]
    surface: str

    @field_validator("end")
    @classmethod
    def end_gt_start(cls, end: int, info):
        start = info.data.get("start")
        if start is not None and end <= start:
            raise ValueError("end must be > start")
        return end


class Example(BaseModel):
    id: str
    text: str
    lang: Literal["en", "bm", "zh", "mixed"]
    spans: list[Span] = Field(default_factory=list)
    source: str
    split: Literal["train", "dev", "eval_synth", "eval_real"]
    substrate: Literal["synthetic", "real"]


def assert_spans_valid(example: Example) -> None:
    n = len(example.text)
    for sp in example.spans:
        if sp.end > n:
            raise ValueError(f"span end {sp.end} exceeds text length {n}")
        sliced = example.text[sp.start : sp.end]
        if sliced != sp.surface:
            raise ValueError(
                f"surface mismatch for {example.id}: {sp.surface!r} != {sliced!r}"
            )
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pytest tests/test_schema.py -v
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ml/src/sens/schema.py ml/tests/test_schema.py
git commit -m "feat(ml): add JSONL example schema with MASK spans only"
```

---

### Task 3: Label-schema contract (human-readable)

**Files:**
- Create: `ml/contracts/label-schema.md`

**Interfaces:**
- Consumes: Task 2 span rules
- Produces: reviewer guidelines for MASK vs omission-KEEP

- [ ] **Step 1: Write `ml/contracts/label-schema.md`** with at least these rows (EN/BM/ZH):

| Text (abbrev.) | Spans | Why |
|---|---|---|
| Explain Einstein's theory | none | public figure / homework |
| Summarise Apple's earnings | none | public company / homework |
| 1 + 1 = 2 | none | not an ID; L1/out of scope |
| Please email Ahmad bin Ali… | MASK `Ahmad bin Ali` | customer/employee-like |
| Sila hubungi Encik Rahman… | MASK name | BM customer-like |
| 请把合同发给张伟 | MASK `张伟` | ZH employee-like |
| NRIC `900101-14-5678` | **none for model** | L1 owns digit grammar — may appear in text but do **not** train MASK on digits alone |

State explicitly: annotators mark **sensitive person/org mentions only**; public entities get **no span**.

- [ ] **Step 2: Commit**

```bash
git add ml/contracts/label-schema.md
git commit -m "docs(ml): add MASK vs KEEP label schema for auditors"
```

---

### Task 4: Export-contract draft (extension hand-off)

**Files:**
- Create: `ml/contracts/export-contract.md`

**Interfaces:**
- Consumes: none from code yet
- Produces: agreed artifact shape for later eng integration

- [ ] **Step 1: Write `ml/contracts/export-contract.md`**

Must include:

- Artifact: `model.onnx` + `tokenizer/` + `labels.json` + `SHA256SUMS`
- Input: token ids / attention mask (exact tensor names `[unverified]` until first export)
- Output: per-token logits or label ids for `{O, B-MASK, I-MASK}`
- Runtime target: ONNX Runtime Web / offscreen (same class as Slice 1 L2) — latency `[unverified]`, size budget `[unverified]` — **do not invent numbers**
- Versioning: `sens-vMAJOR.MINOR.PATCH`
- Pin-by-hash before load (same spirit as ADR 0017)

- [ ] **Step 2: Commit**

```bash
git add ml/contracts/export-contract.md
git commit -m "docs(ml): draft ONNX export contract for extension hand-off"
```

---

### Task 5: JSONL validation library + CLI

**Files:**
- Create: `ml/src/sens/validate_jsonl.py`
- Create: `ml/tests/test_validate_jsonl.py`
- Create: `ml/data/fixtures/tiny_train.jsonl`

**Interfaces:**
- Consumes: `Example`, `assert_spans_valid`
- Produces: `def load_jsonl(path: Path) -> list[Example]` · `def validate_path(path: Path) -> list[str]` (error messages; empty = ok)

- [ ] **Step 1: Write fixture file**

```jsonl
{"id":"fx-einstein","text":"Explain Einstein's theory of relativity.","lang":"en","spans":[],"source":"fixture","split":"train","substrate":"synthetic"}
{"id":"fx-ahmad","text":"Please email Ahmad bin Ali about the invoice.","lang":"en","spans":[{"start":13,"end":26,"label":"MASK","surface":"Ahmad bin Ali"}],"source":"fixture","split":"train","substrate":"synthetic"}
{"id":"fx-math","text":"What is 1 + 1?","lang":"en","spans":[],"source":"fixture","split":"train","substrate":"synthetic"}
```

(Verify Ahmad offsets with Python before committing.)

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


def test_validate_ok():
    assert validate_path(FIXTURES) == []
```

- [ ] **Step 3: Run — expect FAIL**

```bash
pytest tests/test_validate_jsonl.py -v
```

- [ ] **Step 4: Implement**

```python
# ml/src/sens/validate_jsonl.py
from __future__ import annotations

import json
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
            except Exception as e:  # noqa: BLE001 — collect later in validate_path
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

- [ ] **Step 5: Fix fixture offsets if needed, then PASS**

```bash
python -c "t='Please email Ahmad bin Ali about the invoice.'; s='Ahmad bin Ali'; print(t.index(s), t.index(s)+len(s))"
pytest tests/test_validate_jsonl.py -v
python -m sens.validate_jsonl data/fixtures/tiny_train.jsonl
```

Expected: PASS / `OK ...`

- [ ] **Step 6: Commit**

```bash
git add ml/src/sens/validate_jsonl.py ml/tests/test_validate_jsonl.py ml/data/fixtures/tiny_train.jsonl
git commit -m "feat(ml): validate MASK-span JSONL fixtures"
```

---

### Task 6: Stratified audit sampler

**Files:**
- Create: `ml/src/sens/sample_audit.py`
- Create: `ml/tests/test_sample_audit.py`

**Interfaces:**
- Consumes: `list[Example]`
- Produces: `def stratified_sample(examples: list[Example], n: int, seed: int = 0) -> list[Example]`  
  Strata keys: `(lang, has_mask: bool)` — sample across EN/BM/ZH and MASK vs empty.

- [ ] **Step 1: Failing test**

```python
# ml/tests/test_sample_audit.py
from sens.schema import Example
from sens.sample_audit import stratified_sample


def _ex(i, lang, masked):
    spans = []
    text = f"hello {lang} {i}"
    if masked:
        # span whole token "hello" for simplicity
        spans = [{"start": 0, "end": 5, "label": "MASK", "surface": "hello"}]
    return Example(
        id=f"{lang}-{i}",
        text=text,
        lang=lang,
        spans=spans,
        source="t",
        split="train",
        substrate="synthetic",
    )


def test_sample_covers_langs_and_mask_buckets():
    pool = (
        [_ex(i, "en", False) for i in range(10)]
        + [_ex(i, "en", True) for i in range(10)]
        + [_ex(i, "bm", False) for i in range(10)]
        + [_ex(i, "bm", True) for i in range(10)]
        + [_ex(i, "zh", False) for i in range(10)]
        + [_ex(i, "zh", True) for i in range(10)]
    )
    sample = stratified_sample(pool, n=12, seed=1)
    assert len(sample) == 12
    langs = {e.lang for e in sample}
    assert langs == {"en", "bm", "zh"}
    assert any(e.spans for e in sample)
    assert any(not e.spans for e in sample)
```

Fix Span construction to use `Span(...)` not dict if needed.

- [ ] **Step 2: Run — FAIL**

```bash
pytest tests/test_sample_audit.py -v
```

- [ ] **Step 3: Implement**

```python
# ml/src/sens/sample_audit.py
from __future__ import annotations

import random
from collections import defaultdict

from sens.schema import Example


def stratified_sample(examples: list[Example], n: int, seed: int = 0) -> list[Example]:
    if n <= 0:
        raise ValueError("n must be positive")
    if n > len(examples):
        raise ValueError("n exceeds pool size")

    buckets: dict[tuple[str, bool], list[Example]] = defaultdict(list)
    for ex in examples:
        buckets[(ex.lang, bool(ex.spans))].append(ex)

    rng = random.Random(seed)
    for b in buckets.values():
        rng.shuffle(b)

    # round-robin across non-empty buckets
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
git commit -m "feat(ml): stratified sampler for human audit (not 100% of rows)"
```

---

### Task 7: Audit disagreement rate

**Files:**
- Create: `ml/src/sens/disagreement.py`
- Create: `ml/tests/test_disagreement.py`
- Create: `ml/scripts/merge_audit.py`

**Interfaces:**
- Consumes: two `list[Example]` aligned by `id`
- Produces: `def span_set(ex: Example) -> set[tuple[int,int,str]]` · `def disagreement_rate(a: list[Example], b: list[Example]) -> float`  
  Rate = fraction of ids where span sets differ. If BM/ZH disagreement high, **stop scaling synthetic** (operating brief).

- [ ] **Step 1: Failing test**

```python
from sens.schema import Example, Span
from sens.disagreement import disagreement_rate


def test_disagreement_rate():
    a = [
        Example(id="1", text="ab", lang="en", spans=[Span(start=0, end=1, label="MASK", surface="a")], source="x", split="train", substrate="synthetic"),
        Example(id="2", text="cd", lang="bm", spans=[], source="x", split="train", substrate="synthetic"),
    ]
    b = [
        Example(id="1", text="ab", lang="en", spans=[], source="x", split="train", substrate="synthetic"),
        Example(id="2", text="cd", lang="bm", spans=[], source="x", split="train", substrate="synthetic"),
    ]
    assert disagreement_rate(a, b) == 0.5
```

- [ ] **Step 2: Implement + PASS**

```python
# ml/src/sens/disagreement.py
from __future__ import annotations

from sens.schema import Example


def span_set(ex: Example) -> set[tuple[int, int, str]]:
    return {(s.start, s.end, s.label) for s in ex.spans}


def disagreement_rate(a: list[Example], b: list[Example]) -> float:
    by_a = {e.id: e for e in a}
    by_b = {e.id: e for e in b}
    ids = sorted(set(by_a) & set(by_b))
    if not ids:
        raise ValueError("no overlapping ids")
    disagree = sum(1 for i in ids if span_set(by_a[i]) != span_set(by_b[i]))
    return disagree / len(ids)
```

- [ ] **Step 3: Minimal `merge_audit.py`** that reads `llm.jsonl` + `audit.jsonl`, writes `train_audited.jsonl`, prints disagreement rate — keep under ~40 lines; validate with `validate_path`.

- [ ] **Step 4: Commit**

```bash
git add ml/src/sens/disagreement.py ml/tests/test_disagreement.py ml/scripts/merge_audit.py
git commit -m "feat(ml): audit disagreement rate and merge script"
```

---

### Task 8: Char spans → token BIO alignment

**Files:**
- Create: `ml/src/sens/bio.py`
- Create: `ml/tests/test_bio.py`

**Interfaces:**
- Consumes: `Example`, Hugging Face tokenizer (passed in)
- Produces: `LABEL2ID = {"O": 0, "B-MASK": 1, "I-MASK": 2}` · `def example_to_bio(example: Example, tokenizer) -> dict` with keys `input_ids`, `labels` (list[int], `-100` on specials)

Use `tokenizer(text, return_offsets_mapping=True)` and map any token overlapping a MASK span: first overlapping token `B-MASK`, rest `I-MASK`.

- [ ] **Step 1: Failing test with a tiny mock tokenizer OR real `BertTokenizerFast` if `train` extras installed**

Prefer a **pure mock** so base `pip install -e .` tests pass without torch:

```python
# ml/tests/test_bio.py
from sens.bio import LABEL2ID, align_bio_from_offsets
from sens.schema import Example, Span


def test_align_bio_simple():
    # tokens: [CLS]= (0,0), "Please"(0,6), "Ahmad"(7,12), "Ali"(13,16), [SEP]=(0,0)
    offsets = [(0, 0), (0, 6), (7, 12), (13, 16), (0, 0)]
    ex = Example(
        id="t",
        text="Please Ahmad Ali",
        lang="en",
        spans=[Span(start=7, end=16, label="MASK", surface="Ahmad Ali")],
        source="t",
        split="train",
        substrate="synthetic",
    )
    labels = align_bio_from_offsets(ex, offsets)
    assert labels[0] == -100
    assert labels[1] == LABEL2ID["O"]
    assert labels[2] == LABEL2ID["B-MASK"]
    assert labels[3] == LABEL2ID["I-MASK"]
    assert labels[4] == -100
```

- [ ] **Step 2: Implement `align_bio_from_offsets` + thin `example_to_bio` wrapper**

```python
# ml/src/sens/bio.py
from __future__ import annotations

from sens.schema import Example

LABEL2ID = {"O": 0, "B-MASK": 1, "I-MASK": 2}
ID2LABEL = {v: k for k, v in LABEL2ID.items()}


def align_bio_from_offsets(example: Example, offsets: list[tuple[int, int]]) -> list[int]:
    labels: list[int] = []
    for start, end in offsets:
        if end <= start:
            labels.append(-100)
            continue
        # find overlapping MASK spans
        hits = [sp for sp in example.spans if not (end <= sp.start or start >= sp.end)]
        if not hits:
            labels.append(LABEL2ID["O"])
            continue
        sp = hits[0]
        # B if token starts at or before span start and covers start; else I if continuation
        if start <= sp.start < end:
            labels.append(LABEL2ID["B-MASK"])
        else:
            labels.append(LABEL2ID["I-MASK"])
    return labels
```

Refine B/I rule in implementation until test passes (token that first overlaps span start → B).

> 🔴 **CORRECTNESS FIX — founder-directed 2026-07-17. Do this before training; it must NOT block
> Slice 1.** The naive rule *"B iff `start <= sp.start < end`, else I"* is **wrong when a MASK span
> begins mid-token or in a gap the tokenizer skipped** — the case that actually shows up in BM's
> agglutinative morphology and ZH without whitespace, i.e. **the wedge's own languages.** When the
> first token that overlaps a span *starts after* `sp.start` (leading space, or a sub-word split
> inside the name), `start <= sp.start` is **false**, so that token gets **I-MASK with no preceding
> B-MASK** — a broken BIO sequence `seqeval` will reject, and the word-aligned fixtures above never
> exercise it. **Requirement: the FIRST overlapping token of each span gets `B-MASK`, every subsequent
> overlapping token gets `I-MASK` — decided by overlap order, not by an offset comparison.**

- [ ] **Step 2b (founder addendum): add the mid-token failing test**

```python
# ml/tests/test_bio.py  — add this case
def test_span_starting_mid_token_still_gets_B_first():
    # Span (5,20). No token covers offset 5 (a gap); the first OVERLAPPING token
    # starts at 6. The naive `start <= sp.start` rule makes it I-MASK with no B.
    # text: "abcde-FGHIJKLMNO-xyz" (len 20); surface = text[5:20]
    text = "abcde-FGHIJKLMNO-xyz"
    offsets = [(0, 0), (0, 4), (6, 10), (11, 20), (0, 0)]
    ex = Example(
        id="mid",
        text=text,
        lang="bm",
        spans=[Span(start=5, end=20, label="MASK", surface=text[5:20])],
        source="t",
        split="train",
        substrate="synthetic",
    )
    labels = align_bio_from_offsets(ex, offsets)
    assert labels[0] == -100                 # [CLS]
    assert labels[1] == LABEL2ID["O"]        # (0,4) does not overlap (5,20)
    assert labels[2] == LABEL2ID["B-MASK"]   # (6,10) FIRST overlap -> B, not I
    assert labels[3] == LABEL2ID["I-MASK"]   # (11,20) continuation -> I
    assert labels[4] == -100                 # [SEP]
```

- [ ] **Step 2c (founder addendum): correct `align_bio_from_offsets` to be first-overlap stateful**

```python
# ml/src/sens/bio.py  — replace align_bio_from_offsets with this
def align_bio_from_offsets(example: Example, offsets: list[tuple[int, int]]) -> list[int]:
    labels: list[int] = []
    started: set[int] = set()  # span index -> B-MASK already emitted
    for start, end in offsets:
        if end <= start:                       # specials / empty tokens
            labels.append(-100)
            continue
        hit = None
        for idx, sp in enumerate(example.spans):
            if not (end <= sp.start or start >= sp.end):  # overlaps this span
                hit = idx
                break
        if hit is None:
            labels.append(LABEL2ID["O"])
        elif hit not in started:               # FIRST overlapping token of the span
            started.add(hit)
            labels.append(LABEL2ID["B-MASK"])
        else:                                  # subsequent overlapping tokens
            labels.append(LABEL2ID["I-MASK"])
    return labels
```

This keeps every case in Step 1's test green (first overlap still → B there) **and** fixes the
mid-token case. The `test_align_bio_simple` assertions are unchanged.

- [ ] **Step 3: PASS + commit**

```bash
pytest tests/test_bio.py -v
git add ml/src/sens/bio.py ml/tests/test_bio.py
git commit -m "feat(ml): align character MASK spans to token BIO labels (first-overlap B/I)"
```

---

### Task 9: Span metrics + 100% mention coverage

**Files:**
- Create: `ml/src/sens/metrics.py`
- Create: `ml/tests/test_metrics.py`

**Interfaces:**
- Consumes: gold/pred as `set[tuple[int,int]]` per example (char spans) or list of spans
- Produces:
  - `def span_precision_recall(gold: set[tuple[int,int]], pred: set[tuple[int,int]]) -> tuple[float,float]`
  - `def full_mention_coverage(gold_by_entity: dict[str, list[tuple[int,int]]], pred: set[tuple[int,int]]) -> float`  
    Fraction of entities whose **every** gold mention span is in `pred` (doc 07 §1.4 / §5.5).

For v1 entity keying: use gold surface string lowercased as entity id within one example (document limitation in README — good enough for fixtures).

- [ ] **Step 1: Tests**

```python
from sens.metrics import full_mention_coverage, span_precision_recall


def test_precision_recall():
    gold = {(0, 5), (10, 15)}
    pred = {(0, 5)}
    p, r = span_precision_recall(gold, pred)
    assert p == 1.0
    assert r == 0.5


def test_full_mention_coverage():
    # entity A mentioned twice; missing one mention => not fully covered
    gold_by_entity = {"a": [(0, 1), (5, 6)], "b": [(10, 11)]}
    pred = {(0, 1), (10, 11)}  # missing (5,6)
    assert full_mention_coverage(gold_by_entity, pred) == 0.5
```

- [ ] **Step 2: Implement + PASS + commit**

```python
# ml/src/sens/metrics.py
from __future__ import annotations


def span_precision_recall(
    gold: set[tuple[int, int]], pred: set[tuple[int, int]]
) -> tuple[float, float]:
    if not pred:
        p = 1.0 if not gold else 0.0
    else:
        p = len(gold & pred) / len(pred)
    if not gold:
        r = 1.0
    else:
        r = len(gold & pred) / len(gold)
    return p, r


def full_mention_coverage(
    gold_by_entity: dict[str, list[tuple[int, int]]],
    pred: set[tuple[int, int]],
) -> float:
    if not gold_by_entity:
        return 1.0
    ok = 0
    for mentions in gold_by_entity.values():
        if all(m in pred for m in mentions):
            ok += 1
    return ok / len(gold_by_entity)
```

```bash
pytest tests/test_metrics.py -v
git add ml/src/sens/metrics.py ml/tests/test_metrics.py
git commit -m "feat(ml): span P/R and 100% mention-coverage metrics"
```

---

### Task 10: Eval ship gate (ADR 0015)

**Files:**
- Create: `ml/src/sens/eval_gate.py`
- Create: `ml/tests/test_eval_gate.py`

**Interfaces:**
- Consumes: `list[Example]`, metrics dict
- Produces: `def ship_status(examples: list[Example]) -> Literal["SHIP_CANDIDATE","NOT_SHIPPED"]`  
  Rule: if **any** example has `split=="eval_real"` and `substrate=="real"` and metrics were computed on that set → `SHIP_CANDIDATE`; if eval set is missing or all `substrate=="synthetic"` → `NOT_SHIPPED`.  
  **Never** return SHIP on synthetic-only eval.

- [ ] **Step 1: Tests covering both branches**

```python
from sens.eval_gate import ship_status
from sens.schema import Example


def test_synthetic_eval_not_shipped():
    rows = [
        Example(id="1", text="x", lang="en", spans=[], source="s", split="eval_synth", substrate="synthetic")
    ]
    assert ship_status(rows) == "NOT_SHIPPED"


def test_real_eval_is_candidate():
    rows = [
        Example(id="1", text="x", lang="bm", spans=[], source="s", split="eval_real", substrate="real")
    ]
    assert ship_status(rows) == "SHIP_CANDIDATE"
```

- [ ] **Step 2: Implement + PASS + commit**

```python
# ml/src/sens/eval_gate.py
from __future__ import annotations

from typing import Literal

from sens.schema import Example


def ship_status(examples: list[Example]) -> Literal["SHIP_CANDIDATE", "NOT_SHIPPED"]:
    real = [
        e
        for e in examples
        if e.split == "eval_real" and e.substrate == "real"
    ]
    if not real:
        return "NOT_SHIPPED"
    return "SHIP_CANDIDATE"
```

```bash
pytest tests/test_eval_gate.py -v
git add ml/src/sens/eval_gate.py ml/tests/test_eval_gate.py
git commit -m "feat(ml): refuse SHIP status without real eval substrate"
```

---

### Task 11: LLM generation prompt + fixture generator script

**Files:**
- Create: `ml/prompts/v1_generate_mask_spans.md`
- Create: `ml/scripts/generate_fixtures.py`

**Interfaces:**
- Consumes: label schema
- Produces: more committed fixtures (EN/BM/ZH) via deterministic script; LLM prompt for humans/agents to produce `data/llm_draft/` (gitignored)

- [ ] **Step 1: Write `ml/prompts/v1_generate_mask_spans.md`**

Must instruct the LLM to:

- Output JSONL lines matching `Example` schema
- Include KEEP-by-omission cases: Einstein, Apple, `1 + 1`
- Include MASK cases: customer/employee names in EN, BM, ZH
- **Never** label NRIC/SSM digit strings as MASK (L1 owns them)
- Mark `substrate=synthetic`, `source=llm_v1`
- State: augmentation only; not eval

- [ ] **Step 2: Extend `generate_fixtures.py`** to write ≥9 lines covering en/bm/zh × mask/empty, then validate

```bash
python scripts/generate_fixtures.py
python -m sens.validate_jsonl data/fixtures/tiny_train.jsonl
```

- [ ] **Step 3: Commit**

```bash
git add ml/prompts/v1_generate_mask_spans.md ml/scripts/generate_fixtures.py ml/data/fixtures/
git commit -m "feat(ml): LLM prompt v1 and expanded synthetic fixtures"
```

---

### Task 12: Training script (baseline token classifier)

**Files:**
- Create: `ml/scripts/train_token_clf.py`

**Interfaces:**
- Consumes: JSONL train/dev, `align_bio_from_offsets`, `LABEL2ID`
- Produces: checkpoint under `ml/artifacts/runs/<run_id>/` (gitignored)

**Baseline model id (locked for v1):** `xlm-roberta-base` *(estimate: may be heavy for final on-device; acceptable for parallel-track baseline — swap later with eng)*. Do not pick a 7B LLM.

- [ ] **Step 1: Implement train script** that:

  1. Loads JSONL via `load_jsonl`
  2. Tokenizes with `return_offsets_mapping=True`
  3. Aligns BIO labels
  4. Fine-tunes `AutoModelForTokenClassification` for 1–3 epochs on fixtures (smoke) 
  5. Writes `metrics.json` with span P/R on **dev** (synthetic OK for smoke) and **always** prints `ship_status(eval_rows)` separately

- [ ] **Step 2: Smoke train on fixtures** (GPU optional; CPU OK for tiny data)

```bash
pip install -e ".[train]"
python scripts/train_token_clf.py --train data/fixtures/tiny_train.jsonl --dev data/fixtures/tiny_train.jsonl --out artifacts/runs/smoke --epochs 1
```

Expected: completes; writes `artifacts/runs/smoke/`; no files under `artifacts/` staged to git.

- [ ] **Step 3: Commit scripts only (not artifacts)**

```bash
git add ml/scripts/train_token_clf.py
git commit -m "feat(ml): baseline XLM-R token-classifier training script"
```

---

### Task 13: Eval runner + report

**Files:**
- Create: `ml/scripts/run_eval.py`

**Interfaces:**
- Consumes: model dir or ONNX later; eval JSONL; `metrics`, `eval_gate`
- Produces: `artifacts/reports/<run_id>.json` with `precision`, `recall`, `full_mention_coverage`, `ship_status`

- [ ] **Step 1: Implement CLI**

```bash
python scripts/run_eval.py --data data/fixtures/tiny_train.jsonl --model artifacts/runs/smoke --out artifacts/reports/smoke.json
```

Must print `ship_status=NOT_SHIPPED` for fixture/synthetic data.

- [ ] **Step 2: Add a test that `run_eval` logic sets NOT_SHIPPED on synthetic** (import the function, don’t require GPU).

- [ ] **Step 3: Commit**

```bash
git add ml/scripts/run_eval.py ml/tests/test_eval_gate.py
git commit -m "feat(ml): eval runner with ADR 0015 ship gate in report"
```

---

### Task 14: ONNX export + hash pin

**Files:**
- Create: `ml/scripts/export_onnx.py`

**Interfaces:**
- Consumes: HF checkpoint
- Produces: `artifacts/export/sens-v0.1.0/model.onnx` + `SHA256SUMS` + tokenizer files; update `export-contract.md` tensor names from **measured** export (replace `[unverified]` only with observed names)

- [ ] **Step 1: Implement export using `torch.onnx.export` or optimum; write SHA256**

```bash
python scripts/export_onnx.py --model artifacts/runs/smoke --out artifacts/export/sens-v0.1.0
```

- [ ] **Step 2: Document exact I/O names in `ml/contracts/export-contract.md` from the real file**

- [ ] **Step 3: Commit scripts + contract update only**

```bash
git add ml/scripts/export_onnx.py ml/contracts/export-contract.md
git commit -m "feat(ml): ONNX export script and pin-by-hash hand-off"
```

---

### Task 15: Operating-brief sync + founder hand-off note

**Files:**
- Modify: `docs/team/sensitive-vs-not-parallel-track.md` (link plan; replace starter prompt)
- Create: `ml/HANDOFF_TO_EXTENSION.md`

**Interfaces:**
- Consumes: export contract
- Produces: eng checklist: load ONNX in offscreen later; feature-flag vs stock NER; Ignore-rate not a label

- [ ] **Step 1: Write `ml/HANDOFF_TO_EXTENSION.md`** (1 page): artifact path pattern, hash verify, label ids, “do not integrate before Slice 1 works”, ADR 0017 stock NER remains default.

- [ ] **Step 2: Ensure track doc §6 starter prompt points at this plan file and Task 1 as entry.**

- [ ] **Step 3: Run full unit suite without train extras**

```bash
cd ml
pip install -e .
pytest -q
```

Expected: all non-train tests PASS.

- [ ] **Step 4: Commit**

```bash
git add ml/HANDOFF_TO_EXTENSION.md docs/team/sensitive-vs-not-parallel-track.md
git commit -m "docs(ml): hand-off note and track brief synced to implementation plan"
```

---

## Self-review

| Spec item (track brief) | Task |
|---|---|
| `ml/` scaffold + isolation | 1 |
| Label schema MASK vs KEEP | 3 (+ schema 2) |
| Export contract | 4, 14 |
| LLM prompts + draft generation | 11 |
| Stratified audit (not 100%) | 6–7 |
| Train small on-device-class model | 12 |
| Real eval gate ADR 0015 | 10, 13 |
| Metrics incl. 100% mention coverage | 9 |
| ONNX + hash | 14 |
| No block Slice 1/2 / no weights in git | Global + 1 + 15 |
| L1 owns digit IDs | label-schema Task 3 + prompts Task 11 |

Placeholder scan: size/latency left as `[unverified]` deliberately (not TBD work — measurement gate). No “implement later” steps without a script path.
