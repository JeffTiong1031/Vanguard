# Prompt for Claude — Write Slice 2 Implementation Plan

> **How to use:** Paste everything below the line into Claude (Opus/Sonnet with the
> `writing-plans` skill available). Do **not** ask it to implement yet — plan only.
> Expected output path: `docs/superpowers/plans/2026-07-18-slice-2-file-content.md`

---

You are acting as founding CTO / staff engineer for **Vanguard** (this repo:
HackAttack / prompt-privacy browser extension).

**Use the `writing-plans` skill** to write a detailed, task-by-task **Slice 2 —
file content checking** implementation plan. Announce that you are using that
skill. Save the plan to:

`docs/superpowers/plans/2026-07-18-slice-2-file-content.md`

**Do not write production code in this session.** Plan only. Push back where
scope is dishonest or too wide. Prefer a thin MVP that the founder’s team can
load and test, then a clear “later” backlog.

---

## Required reading before planning (actually read these)

1. `CLAUDE.md` §8 (Slice 2 row), §5 engagement rules  
2. `ASSUMPTIONS.md` — decisions #2, #5, #7, #8; E3 (amended); F3/F4  
3. `docs/adr/0008-hybrid-split-by-workload.md` — files = cloud, in-region, zero-retention  
4. `docs/adr/0007-python-backend-with-codegen.md` — Python/FastAPI backend  
5. `docs/adr/0016-mvp-first-sequencing.md` — Slice 2 after team accepts Slice 1; B3 not between slices  
6. `docs/adr/0017-slice-1-technical-choices.md` + `docs/adr/0018-sensitive-vs-not-parallel-track.md` — same L1+stock L2; sensitivity does **not** gate files  
7. `docs/adr/0025-send-time-per-span-review.md` — Send review UX for prompts  
8. `docs/adr/0026-report-false-detection-after-slice-2.md` — **Report is AFTER Slice 2; out of MVP**  
9. `docs/02-privacy-architecture.md` §4.3 (zero-retention traps), §6.2 (residency)  
10. `code/extension/` — current Send modal, gate, adapters (extend; don’t rewrite Slice 1)  
11. `code/README.md` — order of operations  

Also re-read any cross-reference you cite. Internal references drift.

---

## Founder-locked product decisions (2026-07-18) — do not re-litigate

### Privacy / posture

- **Prompt text:** on-device always (unchanged).  
- **Files:** upload to **our** backend → parse → L1 + stock L2 → return extract + findings → **delete file bytes** (zero retention, F4).  
- **Not** a frontier LLM as the file scanner for MVP — same detector stack as chat.  
- Audit: class + count + salted hash; raw values never in long-term logs.  
- **Report** button / training upload: **out of Slice 2 MVP** (ADR 0026).

### UX workflow (layman → plan must implement this)

1. User attaches file + types prompt → presses Send.  
2. If file exceeds limits / unsupported / unreadable → **tell the user clearly** (no silent skip).  
3. Review window opens with two parts: **Prompt | File**.  
4. **Progressive UI:** Prompt review appears **first** (on-device). File tab shows “Checking…” until the API returns.  
5. File review shows **our extracted readable copy** (not native Word/Excel) with **red underlines** + hover (why + recommendation).  
6. **Accept / Ignore** (Ignore requires reason) on file spans — same spirit as prompt (ADR 0025).  
7. Accept/Ignore edits **our copy**. On Proceed, **what goes to ChatGPT/Claude is the cleaned copy** — the **original dirty file must not** upload unchanged.  
8. Practical MVP: cleaned output may be a **redacted `.txt` (or similar simple file)** that replaces the attachment; preserving full DOCX/XLSX formatting after Accept is **out of MVP** (backlog).  
9. Proceed only when **all** pending items on prompt **and** file are resolved (or file = all good / no file).  
10. **User presses Send** — no auto-submit (decision #8).  

### Architecture (MVP)

```
Extension (WXT) → POST /scan (file) → Python FastAPI
  → size/type checks → parse → L1 + stock NER
  → JSON { extract, findings } → delete bytes
Extension → review UI → cleaned attach + cleaned prompt → user Send
```

- Backend lives under `code/backend/` (scaffold exists as stub — make it real for scan).  
- Team-test hosting: plan must say how the team runs the API locally (Docker or `uvicorn`) and how the extension points at it (config). CDN/production hardening can be Phase-1 backlog; **local API is enough for Slice 2 team test** if stated clearly.  
- Residency (`ap-southeast-5`) is the commercial target — note it; don’t block MVP on multi-region.

### Formats

Founder wants eventually: DOCX, PDF, TXT, XLSX, CSV, PPTX, JPG/PNG.

**Plan must argue a thin v1 set** and put the rest in ordered backlog. Recommended v1 (you may adjust with reasoning):

| v1 (MVP) | Later |
|---|---|
| TXT, CSV, DOCX, PDF (**text** layer) | XLSX, PPTX, OCR (scanned PDF / JPG / PNG) |

XLSX extract will look messy — say so in acceptance notes; optional simple table preview is nice-to-have, not required.

### Limits (plan must pick concrete numbers, tagged estimate if unverified)

- Max upload size  
- Max extracted characters / pages / rows  
- Scan timeout  
- Clear user-facing errors for: too large, timeout, unsupported type, password-protected, parse failure  

### Security (non-negotiable in plan)

Hostile files: zip bombs, malformed PDF/Office, oversized, timeouts, **no retention** of content in retry queues / APM body capture. Specify how MVP avoids each trap.

### Explicitly out of Slice 2 MVP

- Report → cloud feedback (ADR 0026)  
- sensitive-vs-not model integration (ADR 0018 — after Slice 2)  
- In-Office redlining / rewrite preserving DOCX formatting  
- Suppress-on-reupload fingerprints (discuss only as backlog; do not conflate with Report)  
- B3 / force-install  
- Doc 08  
- Auto-submit  

---

## Plan requirements (writing-plans format)

- Header with Goal / Architecture / Tech Stack / Global Constraints  
- File map (create vs modify) before tasks  
- Bite-sized tasks with checkboxes, TDD where sensible  
- Separate **extension** tasks from **backend** tasks; define the API contract in an early task  
- Extend existing Send review UI — do not invent a second unrelated modal system  
- Acceptance checklist the team can run (ChatGPT + Claude, with and without file, over-limit, progressive loading)  
- Timeline estimate in engineer-days (tag **estimate**)  
- One short ADR draft task if a new decision must be recorded (e.g. “cleaned extract replaces attachment”) — propose `docs/adr/0027-…`  
- Risk section: adapters break on D4, parse failures, UX confusion on XLSX, local API friction for team test  

### Push back hard if needed

If full format list in v1 is incompatible with a team-testable MVP in reasonable time, **cut formats** and say why. Do not hide the swamp (doc 00 §1.7).

### Engagement style

- Numbers cited or tagged `(estimate)` / `(unverified)`  
- Every fork → a decision, not “it depends” without a rule  
- Critique before agreement; no soft fabrications  

---

## Deliverable

Write only:

`docs/superpowers/plans/2026-07-18-slice-2-file-content.md`

Then give the founder a **3-line summary** in chat and wait — do not start implementation.
