# Task 1 review — WXT scaffold + committed `dist/`

**Reviewed:** 2026-07-18  
**Base:** `5dbfd8dd79718fb08497c42440fa3aa7b3129b1e`  
**Head:** `0158ce4847bd9971011042881de9d81a071e48be`  
**Brief:** `.superpowers/sdd/task-1-brief.md`  
**Artifact:** `.superpowers/sdd/task-1-review-package.diff`

---

## Verdicts

| Gate | Result |
|------|--------|
| **Spec compliance** | **✅** |
| **Task quality** | **Approved** |

---

## Spec compliance

### Required deliverables (Steps 1–7)

| Item | Status | Notes |
|------|--------|-------|
| `package.json` (name, scripts, deps) | ✅ | Matches brief; lockfile committed with resolved majors (`wxt` 0.19.29, `@huggingface/transformers` 3.8.1, `typescript` 5.9.3, `vitest` 2.1.9, `preact` 10.29.7). |
| `wxt.config.ts` | ✅ | `outDir: 'dist'`, manifest fields and permissions match brief verbatim. |
| `tsconfig.json` | ✅ | Extends `.wxt/tsconfig.json`; `strict` + `noUncheckedIndexedAccess` as specified. |
| `entrypoints/background.ts` | ✅ | Minimal `defineBackground` + exact log string. |
| `entrypoints/content.ts` | ✅ | Matches, `document_start`, `ISOLATED`, two host patterns. |
| Step 5 build | ✅ | Report evidence + committed `dist/chrome-mv3/manifest.json`, `background.js`, `content-scripts/content.js`. |
| Step 6 manual load | ⚠️ DEFERRED | Not run in implementer environment; **allowed** per task gate (`DEFERRED_MANUAL`). Residual until founder loads unpacked. |
| Step 7 commit | ✅ | Message matches brief; **no `Co-authored-by` trailer** on `0158ce4` (controller rewrite). |

### Global constraints

| Constraint | Status |
|------------|--------|
| No `webRequest` permission | ✅ Manifest has `storage` + `offscreen` only. |
| Two hosts only (`chatgpt.com`, `claude.ai`) | ✅ Config, content script, and built manifest aligned. Old stub’s `chat.openai.com` match correctly removed. |
| Free/public OSS packages | ✅ Lockfile spot-check: MIT / Apache-2.0; no proprietary license hits in diff. |
| Scaffold only (no detection/gate/modal/vault/offscreen NER) | ✅ Entrypoints are console-only; no feature code added. |
| `check-dist-drift.mjs` stub on `--write` | ✅ Allowed extra; exits 0. |
| No `Co-authored-by` | ✅ Fixed at HEAD. |

### Gaps

None blocking spec sign-off. Step 6 remains **unverified** but explicitly deferrable.

### Extras (benign / expected)

- `scripts/check-dist-drift.mjs` — controller-approved stub for Task 2.
- Deletion of obsolete `src/entrypoints/{background,content}.ts` — necessary to avoid dual entrypoint layouts; WXT root `entrypoints/` is correct.
- Replaced skeleton `compile` script with brief’s `postbuild` / `check:dist` / `test` — intended.

---

## Task quality

### Strengths

- Correct WXT layout: root `entrypoints/` instead of legacy `src/entrypoints/`.
- Committed `dist/` enables clone → Load unpacked without toolchain (ADR 0017 §3).
- Manifest in repo matches `wxt.config.ts` and brief (permissions, hosts, content-script world/timing).
- Dependency `[verify]` satisfied via committed lockfile.
- Scope discipline: no premature L1/L2/gate/modal/webRequest/offscreen implementation.

### Findings

| Severity | Finding | Action |
|----------|---------|--------|
| **Important** | **Manual load unverified (Step 6).** Build output looks correct; runtime injection on live ChatGPT/Claude not confirmed in this gate. | Founder/team: one-time Load unpacked check before treating Slice 1 scaffold as accepted. |
| **Minor** | **`tsconfig.json` dropped prior `jsx` / `jsxImportSource: preact`.** Matches brief literally; Preact modal work (later tasks) will need those options restored. | Restore when adding Preact UI — not a Task 1 blocker. |
| **Minor** | **`code/extension/README.md` still says “STUBS · Nothing here runs” and maps `src/entrypoints/`.** Out of Task 1 file list; doc drift only. | Optional follow-up doc pass (not required to pass this gate). |
| **Minor** | **Committed `manifest.json` lacks trailing newline.** Cosmetic. | Optional fix. |
| **Minor** | **WXT bundles ~10–15 KB polyfill per chunk.** Expected framework overhead; not actionable in scaffold task. | None for Task 1. |

No **Critical** issues. No code changes requested for Task 1 closure.

---

## Reviewer notes

- Implementer report references commit `7e97bb6` and a `Co-authored-by` concern; **HEAD `0158ce4` is authoritative** — trailer stripped, message clean.
- Polyfill strings inside bundled JS mention `webRequest` API metadata; that is **not** a manifest permission and does not violate ADR 0017 §6.2.
- Task 2 can replace the drift stub; Task 3 can add offscreen entrypoint on this base.

---

## Summary for controller

**Pass.** Deliverable matches the brief and global constraints. Approve Task 1; carry Step 6 manual verification as an open acceptance item for the founder, not a rework trigger for the implementer.
