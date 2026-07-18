# Task 14 Report — end-to-end acceptance checklist

**Date:** 2026-07-18  
**Branch:** `slice-1-chat-text-extension`  
**Base:** `de790dc556e49a9863127f7fadaea4b6b1424a77`  
**Status:** CHECKLIST WRITTEN — LIVE RUN DEFERRED TO TEAM TEST

---

## Summary

Created `code/extension/ACCEPTANCE.md` as the Slice 1 manual acceptance gate. Brief checklist preserved verbatim; augmented with residual risks R1–R3, Task 8 live-selector checks, Task 12 UX minors, and Task 13 cross-tab audit note. All live checkboxes left unchecked per binding resolution #4.

---

## Deliverable

| Action | Path |
|--------|------|
| Create | `code/extension/ACCEPTANCE.md` |

---

## Automated verification (run 2026-07-18)

### `npm run build && npm run check:dist`

**Exit code:** 0

```text
> wxt build
√ Built extension in ~4.9 s
Σ Total size: 22.57 MB

> postbuild — check-dist-drift.mjs --write

> check:dist
dist/ matches a fresh build.
```

### `npm run test`

**Exit code:** 0

```text
Test Files  17 passed (17)
     Tests  89 passed (89)
  Duration  ~16 s
```

Includes `dist-drift.test.ts` (3 tests, ~15 s) confirming committed `dist/` matches a fresh production build.

---

## Live acceptance (DEFERRED_MANUAL)

Cannot drive Chrome against chatgpt.com / claude.ai from this environment. Team must:

1. Load `code/extension/dist/chrome-mv3` unpacked.
2. Run every section in `ACCEPTANCE.md` on **both** surfaces.
3. Complete sign-off table at document bottom.

---

## Commit

| Hash | Message |
|------|---------|
| `8ff8e38` | `docs(ext): Slice 1 end-to-end acceptance checklist` |

Files committed: `code/extension/ACCEPTANCE.md` only.

---

## Concerns / carry-forward

1. **R1:** Threaded ORT WASM + `numThreads=1` without COOP/COEP — L2 init must be verified live; fail-safe → advisory.
2. **R2:** Hash-pin + first-run CDN weight fetch end-to-end in browser.
3. **Task 8:** Adapter selectors are `[verify]` on live DOM — composer bind + Send-button path on both surfaces.
4. **Task 12 minors:** Cold CLEAN paste may swallow first Send; Approve→Send may need second keypress if `innerText` round-trip mismatches rewrite hash.
5. **Task 13:** Cross-tab audit storage races — note only, not blocking team test.
6. **R3:** Cosmetic `messages.ts` comment — non-blocking, skip or note.

None block checklist publication; all are explicit live-verification items in `ACCEPTANCE.md`.
