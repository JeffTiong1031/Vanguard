# Slice 1 SDD Handoff — stop after Task 8

**Date:** 2026-07-18 (session paused)  
**Branch:** `slice-1-chat-text-extension` (local only — **not pushed**)  
**Plan:** `docs/superpowers/plans/2026-07-18-slice-1-chat-text-extension.md`  
**Method:** Subagent-Driven Development (fresh implementer + review per task)

---

## Resume point

**Next task: Task 9** — in-memory monotonic numbering + placeholder rewrite  
**Do not re-do Tasks 1–8.** Trust this ledger + `git log`.

BASE for Task 9 implementer: `5998b135c28ccb11533e4df625b66316972c997f`

---

## Progress (Tasks 1–8)

| Task | Status | Commits (approx) | Notes |
|------|--------|------------------|-------|
| 1 WXT scaffold + committed dist | ✅ reviewed | `0158ce4` | Step 6 Chrome load DEFERRED_MANUAL |
| 2 dist drift check | ✅ reviewed (1 fix loop) | `2b2e49e`..`6e6e0c6` | Negative drift tests; CRLF sensitivity follow-up |
| 3 hash-pinned L2 NER offscreen | ✅ reviewed (1 Critical fix) | `ab384ce`..`bbcc575` | See residual risks R1–R3 below |
| 4 L1 detectors + 1+1 guardrail | ✅ reviewed | `2788d28` | 49 L1 tests; precision gate holds |
| 5 verdict cache (monotonic dirty) | ✅ reviewed | `93c26b4` | + dist-sync `8e4a8d8` |
| 6 scan orchestration | ✅ reviewed | `b5cc31d` | ADR 0013/0014; degraded never fabricates CLEAN |
| 7 window gate | ✅ reviewed | `de092ec` | sync decideGate; isComposing; composedPath |
| 8 ChatGPT + Claude adapters | ✅ approved (lightweight) | `5998b13` | Selectors need live verify at Task 14 |

**HEAD at pause:** `5998b13`  
**Remaining:** Tasks 9 → 14, then trailer strip, then whole-branch review.

---

## Binding decisions (do not re-litigate)

- Free, public OSS models only (L2 = `Xenova/bert-base-multilingual-cased-ner-hrl`, AFL-3.0, verified downloadable).
- ChatGPT + Claude; typing + paste; Enter + mouse Send; L1 + stock L2; block/modal; Ignore-with-reason; rewrite in composer.
- User presses Send after accepting redaction — **never** silent redact, **never** auto-submit.
- **No** rehydration. **No** sensitivity-model training. **No** file/PDF work.
- **webRequest observer deferred** until after team test.
- Staged company-key / vault / audit POC **out** of this build (separate follow-on plan).
- Approval token: TTL/edit invalidation OK for team test; **consume-on-send** is an explicit follow-up.
- Git: JeffTiong1031 sole author; **never** Co-Authored-By; never modify git config.

---

## Residual risks / follow-ups (carry to Task 14 + final review)

1. **R1 (Task 3):** Self-hosted ORT is *threaded* wasm only; `numThreads=1` without COOP/COEP — **live-browser verify** L2 initializes; fails safe → advisory.
2. **R2 (Task 3):** Hash-pin + first-run weight fetch end-to-end in Chrome.
3. **R3 (Task 3):** Cosmetic comment nit on `[CLS]`/`[SEP]` in messages.ts.
4. **Dist process:** Any task that changes `entrypoints/` or code imported into the bundle must `npm run build` and commit `dist/`. Pure-source tasks (4–8 so far) don't until Task 12 wires them.
5. **Drift check CRLF:** Windows LF/CRLF can false-fail byte-hash compare — note for final review; not blocking Load-unpacked.
6. **Authorship:** Tasks 1–5 + dist-sync trailers already stripped. Tasks **6–8+** still have `Co-authored-by: Cursor` — **one filter-branch/msg-filter strip pass before whole-branch review / push**. Soft-reset + `commit-tree` pattern works; Cursor re-injects on normal `git commit`.
7. **Manual / deferred:** Task 1 Step 6 load; Task 3 `__vgScan` smoke; Task 8 live selectors; Task 14 E2E acceptance.

---

## SDD scratch (untracked)

`.superpowers/sdd/` — briefs, reports, reviews, `progress.md`, this handoff.  
Do **not** commit unless founder asks.  
`.worktrees/` may exist untracked — ignore / leave alone.

---

## Execution recipe for resume

1. Read CLAUDE.md §8 + this handoff + plan Tasks 9–14.
2. Check `.superpowers/sdd/progress.md` and `git log --oneline main..HEAD`.
3. Continue Subagent-Driven from **Task 9** (task-brief extract → implementer → review-package → reviewer → fix loop → ledger).
4. After Task 14: strip all Co-authored-by on branch range; whole-branch review; then founder decides push/PR.
