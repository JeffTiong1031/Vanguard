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
