# Task 14 handoff — audit the synthetic draft (team)

**Branch:** `ml-sensitive-vs-not`  
**Worktree / clone path:** use this branch only (not Slice 1).  
**Status:** ML scaffolding Tasks 1–14 (code) are done. **Stopped at HUMAN GATE Task 14** — audit → merge → founder clear → then Task 15 (eval exam) → Task 16 (train).

**Canonical plan:** [`../superpowers/plans/2026-07-18-sensitive-vs-not-ml.md`](../superpowers/plans/2026-07-18-sensitive-vs-not-ml.md)  
**Label rubric:** [`../../ml/contracts/label-schema.md`](../../ml/contracts/label-schema.md)  
**Draft to audit:** [`../../ml/data/handoff/draft_for_audit.jsonl`](../../ml/data/handoff/draft_for_audit.jsonl) (540 rows)

---

## What you are doing

1. Human-check MASK/KEEP labels on the 540-row draft (you are bilingual MY reviewers — EN/BM/ZH all fair game).
2. Merge audited labels into `ml/data/train/merged.jsonl`.
3. Tell the founder Task 14 is cleared (do **not** start Task 16 training yourselves unless the founder says so).

---

## Setup

```powershell
git fetch origin
git checkout ml-sensitive-vs-not
cd ml
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e ".[dev]"
```

---

## Audit steps

```powershell
cd ml
New-Item -ItemType Directory -Force -Path data\audit | Out-Null
Copy-Item data\handoff\draft_for_audit.jsonl data\audit\sample_audited.jsonl
```

Edit **`data/audit/sample_audited.jsonl`** only. Keep `data/handoff/draft_for_audit.jsonl` unchanged.

Open **`ml/contracts/label-schema.md`** while editing.

For each row:

- Context decides MASK vs KEEP (not fame).
- Ambiguous → KEEP; tag `ambiguous_keep` if bare name with no context.
- MASK person → include title in the span (`Encik Rahman`, not just `Rahman`).
- `text[start:end]` must equal `surface`.
- Never span NRIC/SSM/TIN digits (L1 owns them).
- **Keep the same `id`** (`draft-001` … `draft-540`).

Optional split: 001–180 / 181–360 / 361–540.

---

## Merge (after audit)

```powershell
cd ml
New-Item -ItemType Directory -Force -Path data\train | Out-Null
.\.venv\Scripts\python.exe scripts\merge_audit.py `
  --draft data\handoff\draft_for_audit.jsonl `
  --audit data\audit\sample_audited.jsonl `
  --out data\train\merged.jsonl
```

Read disagreement rates (overall + per lang). Do **not** pass `--allow-unaudited` unless the founder explicitly accepts raw LLM labels.

`data/train/` and `data/audit/` are gitignored — share `merged.jsonl` / audited file via the team’s normal channel, or ask the founder how to land them.

---

## Done criteria for Task 14

- [ ] All 540 rows audited (or founder accepts a documented subset)
- [ ] `merge_audit.py` succeeds
- [ ] Disagreement reviewed; BM/ZH not obviously broken
- [ ] Founder told: path to merged file + disagreement summary

**Next after founder clear:** Task 15 — author held-out `human_simulated` eval exam (another human gate). Training is Task 16.

---

## Cursor prompt (paste to continue)

```text
You are continuing the sensitive-vs-not ML parallel track on branch ml-sensitive-vs-not.

READ FIRST:
1. Worktree/branch: ml-sensitive-vs-not (NOT Slice 1)
2. Plan: docs/superpowers/plans/2026-07-18-sensitive-vs-not-ml.md (Global Constraints + Human gate index)
3. Handoff: docs/team/task-14-audit-handoff.md
4. Rubric: ml/contracts/label-schema.md
5. Draft: ml/data/handoff/draft_for_audit.jsonl (540 rows, already ID-fixed)

WHERE WE ARE:
- Tasks 1–14 CODE are done and on this branch.
- HARD STOP at Task 14 HUMAN GATE: human audit of the draft, then merge_audit.py → data/train/merged.jsonl.
- Do NOT start Task 15 or Task 16 until the founder clears Task 14.
- Scope: ml/ only (+ docs/team). Never touch code/extension/, Slice 1/2.
- No Co-Authored-By on commits. No weights/ONNX/real personal text in git.

YOUR JOB NOW:
Help the team finish Task 14 — audit workflow, validate audited JSONL, run merge_audit.py, interpret disagreement, and prepare a short clearance message for the founder.
If they ask to train: refuse until Task 14 is cleared and Task 15 (eval exam) is done.
```
