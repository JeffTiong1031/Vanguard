### Task 13: local salted-hash audit + Ignore-rate-per-class

**Files:**
- Create: `code/extension/src/audit/audit.ts`
- Create: `code/extension/tests/audit.test.ts`

**Interfaces:**
- Consumes: `Finding`, `saltedFingerprint`, `chrome.storage.local`
- Produces:
  - `async function recordFindings(findings: Finding[]): Promise<void>`
  - `async function recordIgnore(findings: Finding[], reason: string): Promise<void>`
  - `async function ignoreRateByClass(): Promise<Record<string, { flagged: number; ignored: number }>>`

> 🔴 **I3 / U26 / decision #5, and this is the review gate: the audit stores class + count + a salted-hash fingerprint, and NEVER the raw span text.** The fingerprint lets you tell "the same value was flagged twice" without storing the value. **The Ignore-rate-per-class is the one output that feeds the ML track (ADR 0018): it ranks the stock model's false positives.** The salt is generated once per install and stored locally.

- [ ] **Step 1: Failing test — no raw text is ever persisted**

```ts
// tests/audit.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

const store: Record<string, unknown> = {};
vi.stubGlobal('chrome', {
  storage: { local: {
    get: async (k: string) => ({ [k]: store[k] }),
    set: async (o: Record<string, unknown>) => Object.assign(store, o),
  } },
});

import { recordFindings, recordIgnore, ignoreRateByClass } from '../src/audit/audit';

describe('audit', () => {
  beforeEach(() => { for (const k of Object.keys(store)) delete store[k]; });
  it('never persists the raw finding text', async () => {
    await recordFindings([{ cls: 'PERSON', start: 0, end: 5, text: 'Ahmad' }]);
    expect(JSON.stringify(store)).not.toContain('Ahmad');
  });
  it('computes ignore-rate per class', async () => {
    await recordFindings([{ cls: 'ORG', start: 0, end: 5, text: 'Apple' }]);
    await recordIgnore([{ cls: 'ORG', start: 0, end: 5, text: 'Apple' }], 'public company');
    const r = await ignoreRateByClass();
    expect(r.ORG).toEqual({ flagged: 1, ignored: 1 });
  });
});
```

- [ ] **Step 2: Implement `audit.ts`**

```ts
// src/audit/audit.ts
import type { Finding } from '../detection/l1/types';
import { saltedFingerprint } from '../detection/hash';

type Row = { cls: string; fp: string; ignored: boolean; reason?: string; t: number };
const KEY = 'vg_audit';

async function salt(): Promise<string> {
  const got = (await chrome.storage.local.get('vg_salt')).vg_salt as string | undefined;
  if (got) return got;
  const s = crypto.randomUUID();
  await chrome.storage.local.set({ vg_salt: s });
  return s;
}
async function append(rows: Row[]): Promise<void> {
  const cur = ((await chrome.storage.local.get(KEY))[KEY] as Row[] | undefined) ?? [];
  await chrome.storage.local.set({ [KEY]: [...cur, ...rows] });
}
async function toRows(findings: Finding[], ignored: boolean, reason?: string): Promise<Row[]> {
  const s = await salt();
  return Promise.all(findings.map(async (f) => ({
    cls: f.cls, fp: await saltedFingerprint(f.text, s), ignored, reason, t: Date.now(),
  })));
}
export async function recordFindings(findings: Finding[]): Promise<void> { await append(await toRows(findings, false)); }
export async function recordIgnore(findings: Finding[], reason: string): Promise<void> { await append(await toRows(findings, true, reason)); }
export async function ignoreRateByClass(): Promise<Record<string, { flagged: number; ignored: number }>> {
  const rows = ((await chrome.storage.local.get(KEY))[KEY] as Row[] | undefined) ?? [];
  const out: Record<string, { flagged: number; ignored: number }> = {};
  for (const r of rows) {
    out[r.cls] ??= { flagged: 0, ignored: 0 };
    out[r.cls]!.flagged++; if (r.ignored) out[r.cls]!.ignored++;
  }
  return out;
}
```

- [ ] **Step 3: PASS + commit**

```bash
cd code/extension && npx vitest run tests/audit.test.ts
git add code/extension/src/audit code/extension/tests/audit.test.ts
git commit -m "feat(ext): local salted-hash audit and Ignore-rate-per-class (no raw values)"
```

