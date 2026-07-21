# Task 6 Report: Hosted demo backend documentation

## Summary

Successfully inserted hosted demo backend documentation into both README.md and ACCEPTANCE.md, enabling testers and the founder to understand the demo scaffolding option without requiring local Python/Docker setup.

## What was implemented

### 1. README.md insertion (lines 181–199)

Added a new subsection `#### Option: hosted demo backend (no terminal)` immediately after the Docker option in the team-test quick start.

**Location:** After line 179 (Docker compose section), before line 201 (### 3. Load the extension).

**Content:**
- Explanation that the hosted API is on Render (Path A demo host, not production)
- Instructions for testers to wake the free-tier server at `https://vanguard-extract.onrender.com/healthz`
- Warning about the 15-minute sleep window and ~50s cold-start time
- Troubleshooting note for "couldn't reach the file-checking service" errors
- Founder one-time deploy instructions referencing `render.yaml` and `VANGUARD_DEMO_TOKEN`
- Disclaimer that this is demo scaffolding only, not the production/compliance path (which uses Malaysia `ap-southeast-5` with DPA)

### 2. ACCEPTANCE.md insertion (line 139)

Added hosted option sentence to the Slice 2 Prerequisites line.

**Location:** End of the existing Prerequisites line, after the default localhost/Options URL description.

**Content:** Explains that the committed build points at the hosted backend with a baked-in demo token, no local API needed, and reminds testers to warm `https://vanguard-extract.onrender.com/healthz` before the session.

## Verification

### Grep verification
```
C:\Jeff\UM AI\Y1 Sem break\HackAttack\README.md:188:  Before a live demo, open `https://vanguard-extract.onrender.com/healthz` once to **wake
C:\Jeff\UM AI\Y1 Sem break\HackAttack\code\extension\ACCEPTANCE.md:139:**Prerequisites:** local `uvicorn` / `docker compose` in `code/backend/` · Options API URL `http://localhost:8000` (default). Alternatively, use the hosted demo backend (Path A): the committed build points at it and the demo token is baked in — no local API needed. Warm `https://vanguard-extract.onrender.com/healthz` before the session (free tier sleeps).
```

✓ Both files contain the hosted endpoint URL
✓ Exact locations match task requirements
✓ No duplication or missing content

### Self-review findings

**README.md:**
- ✓ Subsection properly nested at `#### Option:` level under `### 2. Start the file-checking API`
- ✓ Markdown formatting intact (bold, inline code, blockquote)
- ✓ Flows naturally from Docker option into section 3
- ✓ Three bullet points (Testers, Error case, Founder) are clear and well-structured
- ✓ Disclaimer blockquote is properly formatted

**ACCEPTANCE.md:**
- ✓ Sentence seamlessly appended to existing Prerequisites line
- ✓ Backlink to Path A is consistent with README.md terminology
- ✓ No markdown formatting conflicts
- ✓ Line length is long but readable (typical for requirements docs)

## Files changed

| File | Status | Change type |
|------|--------|-------------|
| README.md | Modified | Added 19-line subsection + blank line |
| code/extension/ACCEPTANCE.md | Modified | Extended Prerequisites line by ~1 sentence |

## Commit details

| SHA | Subject |
|-----|---------|
| 3c94cd0 | docs: hosted demo backend — warm-before-demo, token brief, deploy order |

- Commit authored by: JeffTiong1031 <jefftiong1031@gmail.com> (no Co-Authored-By trailer per CLAUDE.md §6.1)
- Date: 2026-07-22
- Files: 2 changed, 21 insertions(+), 1 deletion(-)

## Issues and concerns

**None.** Both insertions are exactly as specified in the brief, in the correct locations, with proper markdown formatting. The grep verification confirms presence in both files. No content duplication, no rendering issues detected.
