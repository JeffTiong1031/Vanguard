### Task 8: site adapters — ChatGPT and Claude

**Files:**
- Create: `code/extension/src/adapters/types.ts`
- Create: `code/extension/src/adapters/{chatgpt,claude,registry}.ts`
- Create: `code/extension/tests/adapters.test.ts`

**Interfaces:**
- Consumes: none
- Produces:
  - `type SurfaceAdapter = { host: string; getComposer(): HTMLElement | null; readText(): string | null; writeText(t: string): void; isSendControl(path: EventTarget[]): boolean; onPaste(cb: (text: string) => void): void }`
  - `function pickAdapter(hostname: string): SurfaceAdapter | null`

> 🔴 **This is the D4-volatile task (doc 05 §4.4). Selectors are `[verify against live DOM]` and are the first thing to break.** U12 proved the **gate**, not these. Each adapter has a `getComposer()` that tries an ordered list of selectors and a paste hook. The self-test in Step 4 is how a broken adapter is caught fast rather than failing open.

- [ ] **Step 1: The interface + a registry test (host routing is stable; selectors are not)**

```ts
// src/adapters/types.ts
export type SurfaceAdapter = {
  host: string;
  getComposer(): HTMLElement | null;
  readText(): string | null;
  writeText(text: string): void;
  isSendControl(path: EventTarget[]): boolean;
  onPaste(cb: (text: string) => void): void;
};
```

```ts
// tests/adapters.test.ts
import { describe, it, expect } from 'vitest';
import { pickAdapter } from '../src/adapters/registry';

describe('adapter registry', () => {
  it('routes chatgpt.com', () => expect(pickAdapter('chatgpt.com')?.host).toBe('chatgpt.com'));
  it('routes claude.ai', () => expect(pickAdapter('claude.ai')?.host).toBe('claude.ai'));
  it('returns null off-surface', () => expect(pickAdapter('example.com')).toBeNull());
});
```

- [ ] **Step 2: Implement the two adapters (selectors tagged for live verification)**

```ts
// src/adapters/chatgpt.ts   [verify all selectors against live chatgpt.com DOM]
import type { SurfaceAdapter } from './types';
const COMPOSER = ['#prompt-textarea', 'div[contenteditable="true"]'];
const SEND = ['button[data-testid="send-button"]', 'button[aria-label*="Send" i]'];

export const chatgptAdapter: SurfaceAdapter = {
  host: 'chatgpt.com',
  getComposer() { for (const s of COMPOSER) { const el = document.querySelector<HTMLElement>(s); if (el) return el; } return null; },
  readText() { return this.getComposer()?.innerText ?? null; },
  writeText(text) {
    const el = this.getComposer(); if (!el) return;
    el.focus(); el.textContent = text;
    el.dispatchEvent(new InputEvent('input', { bubbles: true })); // let the app's state sync
    const r = document.createRange(); r.selectNodeContents(el); r.collapse(false);
    const sel = getSelection(); sel?.removeAllRanges(); sel?.addRange(r); // caret to end (doc 05 §6)
  },
  isSendControl(path) {
    return path.some((n) => n instanceof Element && SEND.some((s) => n.matches?.(s) || n.closest?.(s)));
  },
  onPaste(cb) {
    document.addEventListener('paste', (e) => {
      const t = e.clipboardData?.getData('text'); if (t) cb(t);
    }, true);
  },
};
```

```ts
// src/adapters/claude.ts   [verify all selectors against live claude.ai DOM]
import type { SurfaceAdapter } from './types';
const COMPOSER = ['div[contenteditable="true"].ProseMirror', 'div[contenteditable="true"]'];
const SEND = ['button[aria-label*="Send" i]', 'button[data-testid*="send" i]'];

export const claudeAdapter: SurfaceAdapter = {
  host: 'claude.ai',
  getComposer() { for (const s of COMPOSER) { const el = document.querySelector<HTMLElement>(s); if (el) return el; } return null; },
  readText() { return this.getComposer()?.innerText ?? null; },
  writeText(text) {
    const el = this.getComposer(); if (!el) return;
    el.focus(); el.textContent = text;
    el.dispatchEvent(new InputEvent('input', { bubbles: true }));
    const r = document.createRange(); r.selectNodeContents(el); r.collapse(false);
    const sel = getSelection(); sel?.removeAllRanges(); sel?.addRange(r);
  },
  isSendControl(path) {
    return path.some((n) => n instanceof Element && SEND.some((s) => n.matches?.(s) || n.closest?.(s)));
  },
  onPaste(cb) {
    document.addEventListener('paste', (e) => { const t = e.clipboardData?.getData('text'); if (t) cb(t); }, true);
  },
};
```

```ts
// src/adapters/registry.ts
import type { SurfaceAdapter } from './types';
import { chatgptAdapter } from './chatgpt';
import { claudeAdapter } from './claude';
export function pickAdapter(hostname: string): SurfaceAdapter | null {
  if (hostname.endsWith('chatgpt.com')) return chatgptAdapter;
  if (hostname.endsWith('claude.ai')) return claudeAdapter;
  return null;
}
```

- [ ] **Step 3: PASS the registry test + commit**

```bash
cd code/extension && npx vitest run tests/adapters.test.ts
git add code/extension/src/adapters code/extension/tests/adapters.test.ts
git commit -m "feat(ext): ChatGPT and Claude adapters (selectors marked for live verification)"
```

- [ ] **Step 4: Manual adapter self-test on the live sites**

Reload the extension. On each surface, in the page console: `document.querySelector('#prompt-textarea')` (ChatGPT) / the ProseMirror composer (Claude) resolves; type text and confirm `readText()` returns it via a temporary dev hook. **If a selector is stale, fix it here — this is the D4 maintenance point, and it is expected to need a touch.**

---

## Phase 4 — Mask + numbering + modal + approval token (the real flow completes here)

