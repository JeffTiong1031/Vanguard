# Eval exam authoring template (`human_simulated`)

Authors: founder + team (**≥1 bilingual Malaysian for BM/ZH**). Goal: realistic EN/BM/ZH office
prompts with **synthetic / replaced person names** and **invented ID digits** (C3-a style).
Privacy-clean — no real client or employee data.

> 🔴 **This is the EXAM. It is never used for training, and never used to choose a model.**
> Tuning against it — hyperparameters, checkpoint selection, "let's try again" — is training on the
> exam by another route, and it silently destroys the only instrument that can tell you the model
> works. Tune on a **dev** split carved out of `data/train/merged.jsonl`. Read the exam once, at the end.

---

## Each line (JSONL)

```json
{"id": "exam-001", "text": "...", "lang": "en|bm|zh|mixed", "provenance": "human_simulated",
 "split": "eval", "source": "team_author", "tags": [],
 "spans": [{"start": 0, "end": 5, "surface": "...", "entity_type": "PER|ORG", "label": "MASK|KEEP"}]}
```

`provenance` **must** be `human_simulated` and `split` **must** be `eval`. The checker hard-fails
otherwise: per ADR 0021 an `llm_synthetic` exam can never produce `SHIP_CANDIDATE`, so authoring one
by mistake wastes the entire effort.

## Rubric

Apply [`label-schema.md`](label-schema.md) exactly. **The same surface may flip label by context** —
that is the property under test, not an inconsistency.

---

## Required coverage

The checker enforces these. **Count per cell is your call — there is no mandatory N** (deliberate:
the number is the founder's, not the tool's).

- PER KEEP (public / topic) · PER MASK (private / transactional)
- ORG KEEP (public / topic) · ORG MASK (private / transactional)
- same surface, opposite labels across two lines
- EN, BM, ZH present; some code-switch (`lang:"mixed"`)
- one line tagged `ambiguous_keep` (bare short name, no context → KEEP)
- one line tagged `math_no_mask` (`1+1` / a year → **no spans**)
- one line tagged `id_digit_line` (ID digits present; only PER/ORG spans labelled — **L1 owns the digits**)

---

## Sizing — two kinds of question, two different logics

### Measurement questions — the count sets your error bar

`n` = **number of MASK spans**, not rows. A no-span row contributes 0; a two-span row contributes 2.

| MASK spans | 95% CI half-width at true recall 90% |
|---|---|
| 30 | ±11.1pp |
| 50 | ±8.5pp |
| 100 | ±6.0pp |
| **200** | **±4.2pp** |
| 400 | ±3.0pp |

**±10pp is not a decision** — it cannot separate a shippable model from an unshippable one.
**±5pp** distinguishes 85% from 95% and is usually enough for a first gate.

⚠️ **Per-language costs 4×.** 200 MASK spans total ≈ 50 per language ≈ **±8.5pp per language**. If
you report a BM or ZH number off an exam this size, **label it directional and underpowered** rather
than printing a precise-looking figure.

You also need **KEEP** spans for precision — ADR 0021 makes always-KEEP `NOT_SHIPPED`, and precision
is quasi-contractual under ADR 0001. Budget them roughly 1:1 with MASK.

### Probe questions — count is irrelevant, design is everything

These are diagnostic, not statistical. A model that fails 5 of 5 titled-KEEP probes has already told
you it learned the shortcut; 95 more probes add nothing.

| Probe | Suggested | Catches |
|---|---|---|
| 🔴 **titled person, KEEP** | 10–15 | **the honorific shortcut — see below** |
| same surface, both labels | 8–10 pairs | whether context is actually being read |
| `math_no_mask` | ~5 | firing on digits |
| `id_digit_line` | ~5 | spanning identifier digits (L1's territory) |
| `ambiguous_keep` | ~5 | over-MASKing under ambiguity |

---

## 🔴 The titled-KEEP requirement — measured, not hypothetical

In the Task 14 training set (`merged.jsonl`, 540 rows / 304 PER spans), honorifics predict MASK
strongly:

- `P(MASK | span contains a title) = 0.939` (92 MASK vs 6 KEEP, of 98 titled PER spans)
- **only 6 spans in 304** are a titled person labelled KEEP

> ⚠️ **These figures were first published here as `≈0.98` and "2 rows in 540". Both were wrong** —
> the title list used to compute them omitted `Datuk`, `Tun` and `Sir`. Corrected 2026-07-18 against
> the full list now in `scripts/check_eval_coverage.py`. The finding survives the correction (0.939
> is still a strong shortcut); the magnitudes did not. **A detector list is a measurement instrument,
> and an incomplete one produces an honest verdict on the wrong input.**

A model can score well on that distribution by learning **"has `Encik`/`Mr.`/`先生` → MASK"** without
learning the relational concept at all. Real Malaysian office text contains plenty of titled-KEEP
(*"Dato' Seri Anwar's policy on subsidies"* — public figure as topic, KEEP under the rubric).

**If the exam inherits the same gap, the exam scores the shortcut as success and cannot detect it.**
Author titled-KEEP lines deliberately. The checker reports this count as an advisory warning; it is
not a hard fail, because the right number is a judgement call.

---

## Honest limitation to record in the eval report

A small author pool carries its own register bias. This is a **curated approximation** of Malaysian
office code-switching, not a sample of production traffic. **A green score is not proof of field
accuracy.** Record who authored it and in what register.

Per **ADR 0015**, the `human_simulated` substrate is this phase's founder waiver. It does **not**
discharge the real-substrate requirement for a production ship — that residual stays in the report's
`authorship_note`.

---

## Workflow

```powershell
cd ml
# 1. author data/eval_simulated/exam.jsonl (gitignored — never committed)
# 2. validate + coverage
.\.venv\Scripts\python.exe scripts\check_eval_coverage.py data\eval_simulated\exam.jsonl
# must print: OK ... and COVERAGE COMPLETE
```

Then **the founder locks the exam.** Do not edit it after training starts — if the exam can move,
"we did not train on the exam" means nothing.
