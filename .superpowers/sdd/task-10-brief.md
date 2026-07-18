### Task 10: single-use, hash-bound, idempotent approval token

**Files:**
- Create: `code/extension/src/gate/approval-token.ts`
- Create: `code/extension/tests/approval-token.test.ts`

**Interfaces:**
- Consumes: `sha256Hex`
- Produces: `class ApprovalStore { approve(rewrittenHash: string, ttlMs: number): void; currentHash(): string | null; consumeIfMatch(hash: string): boolean }`

> **doc 05 §6.2:** the token binds to `hash(rewritten text)`, is single-use, has a TTL (~60s `(estimate)`), and is invalidated by any edit. The property it needs is **idempotency**, not determinism (ledger #3): approving the same rewritten text twice yields the same match. The gate reads `currentHash()` synchronously (Task 7's `approvedHash()`), and `consumeIfMatch` burns it after the send.

- [ ] **Step 1: Failing test (single-use + TTL + edit invalidation)**

```ts
// tests/approval-token.test.ts
import { describe, it, expect, vi } from 'vitest';
import { ApprovalStore } from '../src/gate/approval-token';

describe('ApprovalStore', () => {
  it('matches once then is consumed', () => {
    const s = new ApprovalStore(); s.approve('h', 60_000);
    expect(s.consumeIfMatch('h')).toBe(true);
    expect(s.consumeIfMatch('h')).toBe(false); // single-use
  });
  it('does not match a different hash (an edit changes the hash)', () => {
    const s = new ApprovalStore(); s.approve('h', 60_000);
    expect(s.consumeIfMatch('h2')).toBe(false);
    expect(s.currentHash()).toBe('h'); // unconsumed by a miss
  });
  it('expires after its TTL', () => {
    vi.useFakeTimers(); const s = new ApprovalStore(); s.approve('h', 1000);
    vi.advanceTimersByTime(1001);
    expect(s.consumeIfMatch('h')).toBe(false);
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Implement `approval-token.ts`**

```ts
// src/gate/approval-token.ts
export class ApprovalStore {
  private hash: string | null = null;
  private expiresAt = 0;
  approve(rewrittenHash: string, ttlMs: number): void {
    this.hash = rewrittenHash;
    this.expiresAt = Date.now() + ttlMs;
  }
  private live(): boolean {
    if (this.hash && Date.now() > this.expiresAt) this.hash = null;
    return this.hash != null;
  }
  currentHash(): string | null { return this.live() ? this.hash : null; }
  consumeIfMatch(hash: string): boolean {
    if (!this.live() || this.hash !== hash) return false;
    this.hash = null; // burn: single-use
    return true;
  }
  invalidate(): void { this.hash = null; } // called on any composer edit
}
```

- [ ] **Step 3: PASS + commit**

```bash
cd code/extension && npx vitest run tests/approval-token.test.ts
git add code/extension/src/gate/approval-token.ts code/extension/tests/approval-token.test.ts
git commit -m "feat(ext): single-use hash-bound approval token with TTL and edit invalidation"
```

