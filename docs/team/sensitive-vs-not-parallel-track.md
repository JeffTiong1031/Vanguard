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
> [`../superpowers/plans/2026-07-17-sensitive-vs-not-parallel-track.md`](../superpowers/plans/2026-07-17-sensitive-vs-not-parallel-track.md)  
> Execute that plan; do not freestyle a second architecture.

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
2. Documented metrics on a **held-out real-text eval** (not only LLM-made prompts).
3. An **export contract** the extension can load later (prefer ONNX int8; size budget TBD with eng — do not invent a MB number here).
4. **L1 still owns structured IDs** (NRIC/SSM/TIN shapes). The model must not be the only line for digit grammar.

**Label mechanics (locked in the plan):** only **MASK** character spans are stored. Public entities (Einstein, Apple) and ordinary math (`1 + 1`) have **zero spans** = KEEP by omission. BIO tags at train time: `O` / `B-MASK` / `I-MASK`.

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

| Phase | Plan tasks | Est. |
|---|---|---|
| **0 — Scaffold + contracts** | Tasks 1–5 | 2–3 d |
| **1 — Synthetic draft + audit tooling** | Tasks 6–7, 11 | 1–2 w |
| **2 — Human audit loop** | Task 7 + reviewers | ongoing |
| **3 — Train baseline** | Tasks 8–9, 12 | 1–3 w `(estimate)` |
| **4 — Real eval gate** | Tasks 10, 13 | non-negotiable |
| **5 — ONNX hand-off** | Tasks 14–15 | after Slice 1 works |

Estimates are **(estimate)** — no comparable internal build to cite.

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
  src/sens/                 # schema, validate, audit, bio, metrics, eval_gate
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
2. docs/superpowers/plans/2026-07-17-sensitive-vs-not-parallel-track.md
3. docs/adr/0015-eval-corpus-is-real.md
4. docs/adr/0017-slice-1-technical-choices.md
5. docs/07-ml-training-and-data-strategy.md (§1 precision, §2 C3 split, §5 eval)

HARD RULES:
- Do NOT block or modify Slice 1/2 extension work. Stay under ml/ (+ docs/team as needed).
- Follow the implementation plan task-by-task (checkboxes). TDD. Frequent commits.
- Eval text substrate must be real for SHIP_CANDIDATE (ADR 0015). Synthetic-only metrics = NOT_SHIPPED.
- L1 owns NRIC/SSM/TIN digit shapes — do not train the model as the only ID detector.
- Ordinary math like "1 + 1" and public homework entities (Einstein, Apple) = KEEP (no MASK spans).
- No model weights, ONNX, or raw personal eval text in git.
- Tag uncertain numbers (estimate) or (unverified). Prefer a gap over a fabrication.

START NOW:
- Execute Task 1 of docs/superpowers/plans/2026-07-17-sensitive-vs-not-parallel-track.md
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
- [ ] Give the team the starter prompt in §6 + link to the plan file.
