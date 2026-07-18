# Task 8 Report — ChatGPT and Claude Site Adapters

**Status:** ✅ Complete  
**Base:** `de092ecf7a480249f8d28c0cb6c908cbf750134f`  
**Commit:** `5998b13` — `feat(ext): ChatGPT and Claude adapters (selectors marked for live verification)`

## TDD

| Phase | Result |
|---|---|
| **RED** | `tests/adapters.test.ts` failed — `../src/adapters/registry` module not found |
| **GREEN** | 5/5 adapter tests pass after implementation |

## Test Summary

- Adapter suite: **5 passed** (3 registry routing + 2 shape)
- Full suite: **70 passed** (13 files), dist drift unchanged

## Files Created/Modified

| File | Action |
|---|---|
| `code/extension/src/adapters/types.ts` | Replaced doc-05 contract stub with `SurfaceAdapter` type |
| `code/extension/src/adapters/chatgpt.ts` | Created |
| `code/extension/src/adapters/claude.ts` | Created |
| `code/extension/src/adapters/registry.ts` | Created |
| `code/extension/tests/adapters.test.ts` | Created |

`git status` post-commit: only adapter source + test files; **dist/ unchanged**.

---

## Selectors for Task 14 Manual Verification

### ChatGPT (`chatgpt.com`)

**Composer** (tried in order):
1. `#prompt-textarea`
2. `div[contenteditable="true"]`

**Send control** (checked via `composedPath` + `matches`/`closest`):
1. `button[data-testid="send-button"]`
2. `button[aria-label*="Send" i]`

**Paste hook:** capture-phase `document` `paste` listener.

### Claude (`claude.ai`)

**Composer** (tried in order):
1. `div[contenteditable="true"].ProseMirror`
2. `div[contenteditable="true"]`

**Send control** (checked via `composedPath` + `matches`/`closest`):
1. `button[aria-label*="Send" i]`
2. `button[data-testid*="send" i]`

**Paste hook:** capture-phase `document` `paste` listener.

---

## Self-Review

### `writeText` — no auto-submit (decision #8) ✅

Both adapters:
- `el.focus()`
- `el.textContent = text`
- `el.dispatchEvent(new InputEvent('input', { bubbles: true }))`
- Caret to end via `Range` + `Selection`

**No** `keydown`/`keyup` Enter, **no** button `.click()`, **no** form `.submit()`.

### `readText` uses `innerText` ✅

```ts
return this.getComposer()?.innerText ?? null;
```

### `isSendControl` walks composed path ✅

```ts
return path.some((n) => n instanceof Element && SEND.some((s) => n.matches?.(s) || n.closest?.(s)));
```

---

## Concerns / Task 14 Checklist

1. **All selectors are best-effort** — tagged `[verify against live DOM]`; D4 churn is expected.
2. **`writeText` uses `textContent`** — may strip rich-text formatting; acceptable for Slice 1 rewrite flow but verify React/Lexical state syncs on both surfaces.
3. **`InputEvent` dispatch** — some SPAs listen for `beforeinput` or synthetic React events; if rewrite doesn't stick, Task 14 should note which surface and event type is needed.
4. **Subdomain routing** — `pickAdapter` uses `hostname.endsWith('chatgpt.com')` / `endsWith('claude.ai')`; covers `www` and subdomains.
5. **Paste listener is global capture** — not scoped to composer; fine for Slice 1 but may fire on non-composer pastes.
6. **Prior `SiteAdapter` / `RequestSchemaAdapter` interface removed** from `types.ts` — replaced by brief's `SurfaceAdapter`; request-schema adapter remains a future task.

---

## Task 14 Smoke Commands

On each live surface, in DevTools console:

```js
// ChatGPT
document.querySelector('#prompt-textarea') ?? document.querySelector('div[contenteditable="true"]')

// Claude
document.querySelector('div[contenteditable="true"].ProseMirror') ?? document.querySelector('div[contenteditable="true"]')
```

Confirm: composer resolves · type text · adapter `readText()` returns it (via temporary dev hook) · send button matches one SEND selector.
