# `classifier/` — ethics & risk classifier

Six policy-violation categories, one-vs-rest LinearSVC over TF-IDF, exported as
JSON and evaluated in the browser as a dot product. No ML runtime ships.

**Spec:** [`docs/superpowers/specs/2026-07-19-ai-governance-platform-design.md`](../../docs/superpowers/specs/2026-07-19-ai-governance-platform-design.md) §6

## Not `ml/`

`ml/` is a separate team's sensitive-vs-not span classifier ([ADR 0018](../../docs/adr/0018-sensitive-vs-not-parallel-track.md)).
This is a different model with a different job. Do not merge them.

## Retrain

```bash
python -m venv .venv && .venv/Scripts/pip install -e ".[dev]"
.venv/Scripts/python -m pytest            # corpus integrity + vectorizer contract
.venv/Scripts/python evaluate.py          # must print PASS
.venv/Scripts/python export.py            # writes model.json, prints its size
.venv/Scripts/python parity_fixtures.py   # regenerate the JS parity fixtures
cd ../extension && npx vitest run         # parity + hard-negative fence
```

🔴 **`parity_fixtures.py` must be re-run after ANY change to the corpus,
`train.py`, or `export.py`.** Stale fixtures make the parity test pass against
a model that no longer exists.

## Measured (2026-07-20)

```
category                      precision   recall  threshold
covert_surveillance               1.000    1.000    -0.3145
undisclosed_profiling             1.000    1.000    -0.0253
discriminatory_screening          1.000    1.000     0.3643
security_evasion                  1.000    1.000     0.0759
harassment_content                1.000    1.000    -0.1796
regulatory_circumvention          1.000    1.000     0.3805
```

- Exported model: **529 KB** — measured by `export.py`, not estimated.
- Coefficients kept per category: 3000 (pruned by magnitude; `evaluate.py` re-run
  against the pruned model and the hard-negative gate stayed clean).
- JS Runtime Latency: **0.591 ms** — measured by `vitest bench`, not estimated.
