# Parallel track — sensitive-vs-not model (team)

> **Status:** founder direction 2026-07-17 · **Does not replace Slice 1/2** · **Does not amend
> [ADR 0016](../adr/0016-mvp-first-sequencing.md)** — product order stays **Slice 1 → team test →
> Slice 2 (files) → then integrate sensitivity**. This track runs *alongside* so the model is ready
> when Slices 1–2 work, not so PDF waits on ML.
>
> **Canonical ML/data rules live in** [`../07-ml-training-and-data-strategy.md`](../07-ml-training-and-data-strategy.md)
> **and** [`../adr/0015-eval-corpus-is-real.md`](../adr/0015-eval-corpus-is-real.md). This file is the
> **team operating brief**, not a second source of truth. If this conflicts with doc 07 / ADR 0015,
> those win.
>
> 🔴 **Implementation plan (task-by-task):**  
> [`../superpowers/plans/2026-07-18-sensitive-vs-not-ml.md`](../superpowers/plans/2026-07-18-sensitive-vs-not-ml.md)  
> Execute that plan; do not freestyle a second architecture.
>
> ⚠️ **Architecture is (B): a span classifier over stock-NER-proposed PER/ORG spans**
> ([ADR 0019](../adr/0019-sensitivity-span-classifier-over-ner.md)). The 2026-07-17 plan this
> document originally linked described architecture (A), a standalone MASK tagger, and is
> **superseded**. Sections below that still describe (A) are flagged inline.

---

## 1. Is parallel workable?

**Yes — with three hard seams.**

| Seam | Rule |
|---|---|
| **Schedule** | Founder/eng owns **Slice 1 + Slice 2**. ML owns **data + train + eval**. Neither waits on the other for day-to-day work. |
| **Product plug-in** | Slice 1 ships **stock multilingual NER** ([ADR 0017](../adr/0017-slice-1-technical-choices.md)). Sensitivity is a **later swap/add-on**, not a Slice 1 blocker. |
| **Truth** | Training may use LLM-augmented data. **Eval text substrate must be real** (ADR 0015). A green score on synthetic-only eval is **not a ship signal**. |

**What “done” means for this track (before wiring into the extension):**

1. A small on-device-capable classifier (or NER head) that outputs **mask / don’t mask** (or equivalent span labels) for EN/BM/ZH prompts.
2. Documented metrics on a held-out eval that is not only LLM-made prompts. ⚠️ **This phase's
   substrate is `human_simulated`, not `real`** — a founder waiver under
   [ADR 0022](../adr/0022-human-simulated-substrate-and-counsel-stop.md). **It does not discharge
   [ADR 0015](../adr/0015-eval-corpus-is-real.md)'s real-substrate requirement for a production
   ship**, which remains owed.
3. An **export contract** the extension can load later (prefer ONNX int8; size budget TBD with eng — do not invent a MB number here).
4. **L1 still owns structured IDs** (NRIC/SSM/TIN shapes). The model must not be the only line for digit grammar.

> 🔴 **SUPERSEDED by [ADR 0019](../adr/0019-sensitivity-span-classifier-over-ner.md).** The paragraph
> below describes architecture **(A)**, a standalone BIO MASK tagger. That is **not** what is built.

~~**Label mechanics (locked in the plan):** only **MASK** character spans are stored. Public entities (Einstein, Apple) and ordinary math (`1 + 1`) have **zero spans** = KEEP by omission. BIO tags at train time: `O` / `B-MASK` / `I-MASK`.~~

**Label mechanics, as actually built (architecture B):** stock NER proposes PER/ORG spans; **every
proposed span carries an explicit `MASK` or `KEEP` label** and the model is a **binary classifier over
one marked span at a time**, not a sequence tagger. There are no BIO tags. Public entities
(Einstein, Apple) are labelled `KEEP` **explicitly**, not by omission — the distinction matters,
because "KEEP by omission" cannot express *the same surface, opposite labels in two contexts*, which
is the property the whole model exists to learn. Ordinary math (`1 + 1`) yields **zero spans**,
since NER proposes no entity there.

---

## 2. Same repo or another repo?

**Recommendation: same monorepo, isolated tree — `ml/` at repo root.**

| Option | When |
|---|---|
| ✅ **`ml/` in this repo** (recommended for A1) | Shared docs/ADRs, one clone for the founder, clear boundary from `code/extension/`. |
| Separate repo | Different GitHub permissions, separate GPU CI, or external contractors who must not see extension source. |

**Hard rules if `ml/` lives here:**

- **No model weights in git** (same as `code/README.md`: weights are not a repo artifact).
- **No raw personal eval text in git** without counsel + retention rules (ADR 0015 is a legal event).
- Training deps stay under `ml/`; they must not pollute the WXT extension install path.
- Integration happens later via a **versioned artifact** (CDN / release asset + hash pin), same spirit as ADR 0017’s weights story — not by committing `.onnx` blobs into `dist/`.

---

## 3. Roadmap (ML team) — summary

Detailed steps, tests, and commits: **the implementation plan** (link above). Phase map:

⚠️ **Task numbers below are the 2026-07-18 plan's (21 tasks).** They are not the 2026-07-17 plan's.

| Phase | Plan tasks | Status (2026-07-19) |
|---|---|---|
| **0 — Scaffold + contracts** | 1–5 | ✅ done |
| **1 — Guards, marking, metrics, gate** | 6–13 | ✅ done |
| **2 — Human audit loop** | 14 (human gate) | ✅ cleared — 540 rows audited |
| **3 — Eval exam authoring** | 15 (human gate) | ✅ locked — 562 questions |
| **4 — Train baseline** | 16 | ✅ done |
| **5 — Eval: gold-span + composed** | 17–18 | ✅ done — integrated MASK recall **0.928** |
| **6 — Ship-status review** | 19 (human gate) | ✅ accepted 2026-07-19 |
| **7 — ONNX hand-off** | 20–21 | 🟡 fp32 verified, **int8 BLOCKED**; hand-off note deferred |

Estimates were **(estimate)** — no comparable internal build to cite.

### Human audit (reminder)

LLM generates candidates → you audit a **stratified sample**, not every row → merge → train → **eval on real text**. Checking 100% of synthetic rows is not the design.

---

## 4. What the ML team must *not* do

- Block Slice 1 on “waiting for our model.”
- Treat Einstein/Apple-style stock-NER FPs as “solved” by more synthetic data without real eval.
- Put raw keystrokes / raw prompt values into shared logs (Decision #5 / I3 / U26 — production posture).
- Replace L1 digit detectors with the model.
- Claim Malaysian beachhead quality from EN-heavy synthetic sets.
- Return `SHIP` / “ready for extension” on synthetic-only eval scores.

---

## 5. Folder layout (created by plan Task 1)

```text
ml/
  README.md
  pyproject.toml
  contracts/
    label-schema.md
    export-contract.md
  src/sens/                 # schema, validate, residency, marking, windowing, align,
                            # sample_audit, disagreement, metrics, coverage, eval_gate,
                            # span_repair, org_dictionary   (no `bio` — architecture B)
  prompts/                  # LLM generation prompts (versioned)
  scripts/                  # fixtures, train, eval, export
  tests/
  data/fixtures/            # tiny committed synthetic JSONL only
  artifacts/                # gitignored runs / onnx / reports
```

---

## 6. Starter prompt (paste into a fresh coding agent)

Copy the block below into a **new** agent chat with this repo as cwd. Prefer
`superpowers:subagent-driven-development` or `superpowers:executing-plans` against the plan file.

```text
You are implementing the sensitive-vs-not PARALLEL ML track for a prompt-privacy browser extension.

READ FIRST (in order):
1. docs/team/sensitive-vs-not-parallel-track.md
2. docs/superpowers/plans/2026-07-18-sensitive-vs-not-ml.md
3. docs/adr/0015-eval-corpus-is-real.md
4. docs/adr/0017-slice-1-technical-choices.md
5. docs/07-ml-training-and-data-strategy.md (§1 precision, §2 C3 split, §5 eval)

HARD RULES:
- Do NOT block or modify Slice 1/2 extension work. Stay under ml/ (+ docs/team as needed).
- Follow the implementation plan task-by-task (checkboxes). TDD. Frequent commits.
- Eval text substrate must be real for SHIP_CANDIDATE (ADR 0015). Synthetic-only metrics = NOT_SHIPPED.
- L1 owns NRIC/SSM/TIN digit shapes — do not train the model as the only ID detector.
- Ordinary math like "1 + 1" yields no spans at all. Public homework entities (Einstein, Apple)
  are labelled KEEP EXPLICITLY (architecture B, ADR 0019) - not "KEEP by omission".
- No model weights, ONNX, or raw personal eval text in git.
- Tag uncertain numbers (estimate) or (unverified). Prefer a gap over a fabrication.

START NOW:
- Execute Task 1 of docs/superpowers/plans/2026-07-18-sensitive-vs-not-ml.md
- Stop at the end of Task 1, show pytest/install evidence, and wait for review before Task 2
  UNLESS the user asked you to continue through a larger batch.

Do not claim the model is production-ready. Do not invent latency or size budgets.
```

---

## 7. Founder checklist (you)

- [ ] Keep building Slice 1 / Slice 2; do not wait on this track.
- [ ] Assign 1–2 people who can review BM/ZH labels.
- [ ] Before real eval data lands on disk: counsel / lawful basis (ADR 0015 / U25 — `[verify]`).
- [ ] When Slice 1 team test runs: keep Ignore-reason telemetry (class + count + salted hash only).
- [ ] Integration meeting only after Phase 4 has a real-eval report (`SHIP_CANDIDATE`).
- [x] Give the team the starter prompt in §6 + link to the plan file. **(2026-07-19: the link now
      points at the 2026-07-18 plan; the 2026-07-17 one described architecture A.)**
