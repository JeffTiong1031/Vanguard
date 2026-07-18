### Task 7: the gate — `window` capture, `composedPath`, `isComposing`

**Files:**
- Create: `code/extension/src/gate/gate.ts`
- Create: `code/extension/tests/gate.test.ts`

**Interfaces:**
- Consumes: `VerdictCache`, `sha256Hex`, an `ApprovalStore` (Task 11), a `getComposerText(): string | null`
- Produces: `function installGate(deps: GateDeps): void` where `GateDeps = { cache, getComposerText, isSendIntent, onBlocked, approvals }`

> **Ported from the U12 spike, which proved the mechanism (U12-a/b ✅).** The gate registers a `window` capture-phase `keydown` **and** `click` listener at `document_start`. It reads the verdict **synchronously**. IME composition Enters pass through (`isComposing` — U12-b). On DIRTY with no valid approval token, it calls `stopImmediatePropagation()` + `preventDefault()` and invokes `onBlocked`.

- [ ] **Step 1: Failing test (a DIRTY verdict blocks; an approved hash passes)**

```ts
// tests/gate.test.ts
import { describe, it, expect, vi } from 'vitest';
import { decideGate } from '../src/gate/gate';
import { VerdictCache } from '../src/detection/verdict-cache';

describe('decideGate (pure core of the listener)', () => {
  it('blocks when the current text is DIRTY and unapproved', () => {
    const c = new VerdictCache(); c.setDirty('h', [{ cls: 'NRIC', start: 0, end: 1, text: 'x' }]);
    expect(decideGate({ hash: 'h', cache: c, approvedHash: null })).toBe('BLOCK');
  });
  it('passes when the DIRTY text has a matching approval', () => {
    const c = new VerdictCache(); c.setDirty('h', []);
    expect(decideGate({ hash: 'h', cache: c, approvedHash: 'h' })).toBe('PASS');
  });
  it('passes CLEAN', () => {
    const c = new VerdictCache(); c.setClean('h', []);
    expect(decideGate({ hash: 'h', cache: c, approvedHash: null })).toBe('PASS');
  });
  it('blocks UNKNOWN (cold cache) to stay fail-safe until a scan lands', () => {
    expect(decideGate({ hash: 'cold', cache: new VerdictCache(), approvedHash: null })).toBe('BLOCK');
  });
});
```

> **The cold-cache decision is a real design call:** an unknown hash BLOCKs (fail-safe) but the block is immediately resolved by the modal, which triggers a scan — so the user is never stuck, they just see the modal once while the first scan completes. This is the paste path (cache cold by construction, doc 06 §1). It is **not** fail-closed (ADR 0014): the modal always offers a path forward.

- [ ] **Step 2: Implement `decideGate` (pure) + `installGate` (listener)**

```ts
// src/gate/gate.ts
import type { VerdictCache } from '../detection/verdict-cache';

export function decideGate(a: { hash: string; cache: VerdictCache; approvedHash: string | null }): 'PASS' | 'BLOCK' {
  if (a.approvedHash === a.hash) return 'PASS';
  const v = a.cache.getSync(a.hash);
  if (!v) return 'BLOCK';               // cold cache -> modal resolves it
  return v.state === 'CLEAN' ? 'PASS' : 'BLOCK';
}

export type GateDeps = {
  cache: VerdictCache;
  getComposerText: (path: EventTarget[]) => string | null;
  isSendIntent: (e: Event, path: EventTarget[]) => boolean;
  hashOf: (text: string) => string;          // sync hash lookup memoized by the scanner
  approvedHash: () => string | null;
  onBlocked: (text: string) => void;
};

export function installGate(deps: GateDeps): void {
  const handler = (e: KeyboardEvent | MouseEvent) => {
    if (e.eventPhase !== Event.CAPTURING_PHASE) return;
    if (e instanceof KeyboardEvent && e.isComposing) return; // U12-b: IME commit, not a send
    const path = e.composedPath();
    if (!deps.isSendIntent(e, path)) return;
    const text = deps.getComposerText(path);
    if (text == null) return;
    const decision = decideGate({ hash: deps.hashOf(text), cache: deps.cache, approvedHash: deps.approvedHash() });
    if (decision === 'BLOCK') {
      e.stopImmediatePropagation();
      e.preventDefault();
      deps.onBlocked(text);
    }
  };
  window.addEventListener('keydown', handler, { capture: true });
  window.addEventListener('click', handler, { capture: true });
}
```

> **`hashOf` is synchronous:** the scanner keeps a `Map<text, hash>` warmed alongside the verdict cache, so the gate never awaits `crypto.subtle`. On a cold hash the map returns a sentinel that is not in the cache → `decideGate` BLOCKs → modal. This keeps decision #8's synchronous invariant.

- [ ] **Step 3: PASS + commit**

```bash
cd code/extension && npx vitest run tests/gate.test.ts
git add code/extension/src/gate/gate.ts code/extension/tests/gate.test.ts
git commit -m "feat(ext): window-capture gate with sync verdict read and IME pass-through"
```

