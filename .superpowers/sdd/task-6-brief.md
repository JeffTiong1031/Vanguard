### Task 6: scan orchestration — L1 short-circuit + L2 completion

**Files:**
- Create: `code/extension/src/detection/scan.ts`
- Create: `code/extension/tests/scan.test.ts`

**Interfaces:**
- Consumes: `runL1`, `l2Scan`, `VerdictCache`, `sha256Hex`
- Produces: `async function scanInto(cache: VerdictCache, text: string, opts: { l2TimeoutMs: number }): Promise<Verdict>`

> **ADR 0013 short-circuit:** L1 runs first (sub-ms). If L1 finds anything, write DIRTY **immediately** — the dangerous paste is gated without waiting for L2. Then L2 completes the picture: a fully clean scan (L1 empty **and** L2 returns no PERSON/ORG) is the only path to CLEAN. L2 `'degraded'` → advisory (ADR 0014): do not upgrade to CLEAN, surface degraded.

- [ ] **Step 1: Failing tests (short-circuit + degrade)**

```ts
// tests/scan.test.ts
import { describe, it, expect, vi } from 'vitest';
import { scanInto } from '../src/detection/scan';
import { VerdictCache } from '../src/detection/verdict-cache';

vi.mock('../src/detection/l2/client', () => ({
  l2Scan: vi.fn(async () => [{ type: 'PERSON', start: 0, end: 5, text: 'Ahmad' }]),
}));

describe('scanInto', () => {
  it('an L1 hit makes it DIRTY even before L2', async () => {
    const c = new VerdictCache();
    const v = await scanInto(c, 'IC 890101-14-5555', { l2TimeoutMs: 1000 });
    expect(v.state).toBe('DIRTY');
    expect(v.findings.some((f) => f.cls === 'NRIC')).toBe(true);
  });
  it('L1-clean + L2 PERSON is DIRTY', async () => {
    const c = new VerdictCache();
    const v = await scanInto(c, 'call Ahmad', { l2TimeoutMs: 1000 });
    expect(v.state).toBe('DIRTY');
    expect(v.findings.some((f) => f.cls === 'PERSON')).toBe(true);
  });
});
```

- [ ] **Step 2: Implement `scan.ts`**

```ts
// src/detection/scan.ts
import type { Finding } from './l1/types';
import { runL1 } from './l1';
import { l2Scan } from './l2/client';
import { sha256Hex } from './hash';
import { VerdictCache, type Verdict } from './verdict-cache';

export async function scanInto(cache: VerdictCache, text: string, opts: { l2TimeoutMs: number }): Promise<Verdict> {
  const hash = await sha256Hex(text);
  const l1 = runL1(text);
  if (l1.length > 0) cache.setDirty(hash, l1); // ADR 0013: gate the dangerous input now

  const l2 = await l2Scan(text, opts.l2TimeoutMs);
  if (l2 === 'degraded') {
    // ADR 0014: never fabricate CLEAN. Keep any L1 dirtiness; if L1 was empty, leave the hash unknown.
    return cache.getSync(hash) ?? { state: 'CLEAN', findings: [], complete: false };
  }
  const l2Findings: Finding[] = l2.map((e) => ({ cls: e.type, start: e.start, end: e.end, text: e.text }));
  const findings = [...l1, ...l2Findings];
  if (findings.length > 0) cache.setDirty(hash, findings);
  else cache.setClean(hash, []);
  cache.markComplete(hash);
  return cache.getSync(hash)!;
}
```

- [ ] **Step 3: PASS + commit**

```bash
cd code/extension && npx vitest run tests/scan.test.ts
git add code/extension/src/detection/scan.ts code/extension/tests/scan.test.ts
git commit -m "feat(ext): L1+L2 scan orchestration with ADR 0013/0014 rules"
```

