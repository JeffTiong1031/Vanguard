# Task 1 Report — WXT project that loads unpacked with a committed `dist/`

**Date:** 2026-07-18  
**Branch:** `slice-1-chat-text-extension`  
**Status:** DONE_WITH_CONCERNS

---

## Summary

Task 1 delivered a buildable WXT Manifest V3 extension scaffold under `code/extension/`. The team can load `code/extension/dist/chrome-mv3` unpacked in Chrome Developer mode. Minimal background and content entrypoints log startup messages; no detection, gate, modal, vault, offscreen, or webRequest code was added.

---

## Files created / modified

| Action | Path |
|--------|------|
| Create | `code/extension/package.json` |
| Create | `code/extension/wxt.config.ts` |
| Create | `code/extension/tsconfig.json` |
| Create | `code/extension/entrypoints/background.ts` |
| Create | `code/extension/entrypoints/content.ts` |
| Create | `code/extension/scripts/check-dist-drift.mjs` (Task 1 stub) |
| Create | `code/extension/package-lock.json` |
| Create | `code/extension/dist/chrome-mv3/` (committed build output) |
| Delete | `code/extension/src/entrypoints/background.ts` (obsolete stub) |
| Delete | `code/extension/src/entrypoints/content.ts` (obsolete stub) |
| Kept | `code/extension/src/**/README.md` stubs (harmless, per brief) |

---

## Resolved dependency versions (`[verify]`)

| Package | Requested | Resolved (lockfile) |
|---------|-----------|---------------------|
| `wxt` | `^0.19.0` | **0.19.29** |
| `@huggingface/transformers` | `^3.0.0` | **3.8.1** |
| `typescript` | `^5.5.0` | (via lockfile) |
| `vitest` | `^2.0.0` | (via lockfile) |
| `preact` | `^10.22.0` | (via lockfile) |

---

## Build verification (Step 5)

```text
> wxt build
WXT 0.19.29
√ Built extension in 593 ms
  ├─ dist\chrome-mv3\manifest.json               469 B
  ├─ dist\chrome-mv3\background.js               10.29 kB
  └─ dist\chrome-mv3\content-scripts\content.js  15.09 kB

> postbuild
> node scripts/check-dist-drift.mjs --write
(exit 0)
```

**Result:** PASS — `dist/chrome-mv3/manifest.json` exists; no TypeScript errors.

### Manifest contents (verified)

```json
{
  "manifest_version": 3,
  "name": "Vanguard (Slice 1)",
  "description": "On-device prompt-privacy gate for ChatGPT and Claude. Team test build.",
  "version": "0.1.0",
  "permissions": ["storage", "offscreen"],
  "host_permissions": ["https://chatgpt.com/*", "https://claude.ai/*"],
  "background": { "service_worker": "background.js" },
  "content_scripts": [{
    "matches": ["https://chatgpt.com/*", "https://claude.ai/*"],
    "run_at": "document_start",
    "js": ["content-scripts/content.js"],
    "world": "ISOLATED"
  }]
}
```

Matches brief: two hosts only, no `webRequest`, no `<all_urls>`, `offscreen` permission reserved for Task 3.

---

## Manual Chrome load (Step 6)

**Status:** DEFERRED_MANUAL

Cannot reliably drive Chrome from this environment. Expected manual verification:

1. Chrome → Extensions → Developer mode → **Load unpacked**
2. Path: `code/extension/dist/chrome-mv3`
3. Open `https://chatgpt.com` → page console: `[vanguard] content script alive on chatgpt.com`
4. Open `https://claude.ai` → page console: `[vanguard] content script alive on claude.ai`
5. Service worker console: `[vanguard] background alive`

---

## Commit

| SHA | Subject |
|-----|---------|
| `7e97bb6` | feat(ext): WXT scaffold that loads unpacked on ChatGPT and Claude |

Author: JeffTiong1031 \<jefftiong1031@gmail.com\>  
12 files changed, 7760 insertions(+), 104 deletions(-)

---

## Self-review

### Correct per brief

- WXT default root `entrypoints/` layout (not `src/entrypoints/`)
- `outDir: 'dist'` → output at `dist/chrome-mv3/`
- Minimal entrypoints with exact console strings from brief
- `postbuild` stub exits 0 with `--write` (Task 2 replaces)
- Obsolete stub `.ts` entrypoints removed; README stubs under `src/` retained
- `dist/` committed for clone-and-load workflow

### Concerns

1. **Co-authored-by trailer (environment injection):** Cursor's git wrapper auto-appended `Co-authored-by: Cursor <cursoragent@cursor.com>` to the commit body despite explicit project rule forbidding AI attribution. An amend attempt did not remove it. **Founder should strip before push** (e.g. `git commit --amend` from a non-Cursor terminal, or interactive rebase) if sole authorship is required on the record.

2. **npm audit:** 14 vulnerabilities reported in transitive deps (transformers/onnx stack). Expected for ML deps; not addressed in Task 1 scope.

3. **Step 6 not verified:** Manual load on ChatGPT/Claude deferred to founder/team.

---

## Out of scope (confirmed not implemented)

- L1/L2 detection, gate, modal, vault, webRequest observer
- Offscreen document (Task 3)
- Vitest drift test (Task 2)
- Full `check-dist-drift.mjs` (Task 2)

---

## Next task readiness

Task 2 can replace `scripts/check-dist-drift.mjs` with the full checker and add vitest coverage. Task 3 can add the offscreen entrypoint. Current scaffold builds cleanly and produces a loadable MV3 bundle.
