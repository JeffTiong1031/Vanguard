### Task 4: L1 detectors — NRIC, SSM (+ambiguous), TIN, email, card-Luhn

**Files:**
- Create: `code/extension/src/detection/l1/types.ts`
- Create: `code/extension/src/detection/l1/{nric,ssm,tin,email,card}.ts`
- Create: `code/extension/src/detection/l1/index.ts`
- Create: `code/extension/tests/l1/{nric,ssm,tin,email,card,guardrail}.test.ts`

**Interfaces:**
- Consumes: none
- Produces:
  - `type FindingClass = 'NRIC' | 'SSM' | 'NRIC_OR_SSM_AMBIGUOUS' | 'TIN' | 'EMAIL' | 'CARD' | 'PERSON' | 'ORG'`
  - `type Finding = { cls: FindingClass; start: number; end: number; text: string }`
  - `function runL1(text: string): Finding[]`
  - each detector: `function detect(text: string): Finding[]`

> **The whole point of L1 is precision (quasi-contractual, ADR 0001), so the tests carry as many NEGATIVE cases as positive.** The `guardrail` test file is the ADR 0017 §5 review gate in executable form.

- [ ] **Step 1: Types + the guardrail test first (this is the one that must never regress)**

```ts
// src/detection/l1/types.ts
export type FindingClass =
  | 'NRIC' | 'SSM' | 'NRIC_OR_SSM_AMBIGUOUS' | 'TIN' | 'EMAIL' | 'CARD' | 'PERSON' | 'ORG';
export type Finding = { cls: FindingClass; start: number; end: number; text: string };
```

```ts
// tests/l1/guardrail.test.ts — ADR 0017 §5 in code. Ordinary numbers are NOT sensitive.
import { describe, it, expect } from 'vitest';
import { runL1 } from '../../src/detection/l1';

describe('L1 fires on identifier grammars, never on bare numbers', () => {
  for (const clean of ['1+1', '1 + 1 = 2', 'the year 2024', 'chapter 12', 'I need 3 apples',
                       '100%', '$4.50', 'page 42 of 100', '2024-01-01 is a date']) {
    it(`no finding: ${clean}`, () => expect(runL1(clean)).toEqual([]));
  }
});
```

- [ ] **Step 2: Run — expect FAIL** (`runL1` undefined)

- [ ] **Step 3: NRIC detector + test**

```ts
// src/detection/l1/nric.ts — YYMMDD-PB-###G. No checksum (U1). Day/month sanity only; PB open-set.
import type { Finding } from './types';
const NRIC_RE = /\b(\d{2})(\d{2})(\d{2})-(\d{2})-(\d{4})\b/g;
const UNASSIGNED_PB = new Set(['00','17','18','19','20','69','70','73','80','81','94','95','96','97']);

export function detectNric(text: string): Finding[] {
  const out: Finding[] = [];
  for (const m of text.matchAll(NRIC_RE)) {
    const [, , mm, dd, pb] = m;
    if (+mm < 1 || +mm > 12 || +dd < 1 || +dd > 31) continue; // structural (doc 03 §2.2)
    if (UNASSIGNED_PB.has(pb!)) continue;                      // 14 unassigned PB codes (U2)
    out.push({ cls: 'NRIC', start: m.index!, end: m.index! + m[0].length, text: m[0] });
  }
  return out;
}
```

```ts
// tests/l1/nric.test.ts
import { describe, it, expect } from 'vitest';
import { detectNric } from '../../src/detection/l1/nric';
describe('NRIC', () => {
  it('detects a valid NRIC', () => expect(detectNric('IC 890101-14-5555 ok')[0]?.cls).toBe('NRIC'));
  it('rejects an impossible month', () => expect(detectNric('991301-14-5555')).toEqual([]));
  it('rejects an unassigned PB code', () => expect(detectNric('890101-17-5555')).toEqual([]));
  it('does not fire on a bare 12-digit run without dashes', () => expect(detectNric('890101145555')).toEqual([]));
});
```

- [ ] **Step 4: SSM detector + the NRIC/SSM ambiguity (doc 03 §2.3)**

```ts
// src/detection/l1/ssm.ts — 12 bare digits. ~86% of 2001-2012 incorporations also parse as NRIC.
// The day filter is defeated by construction, so a 12-digit number that ALSO parses as an NRIC-shaped
// string is AMBIGUOUS, not decidable from digits alone (doc 03 §2.3).
import type { Finding } from './types';
const SSM_RE = /\b(\d{12})\b/g;

export function detectSsm(text: string): Finding[] {
  const out: Finding[] = [];
  for (const m of text.matchAll(SSM_RE)) {
    const d = m[1]!;
    const mm = +d.slice(2, 4), dd = +d.slice(4, 6);
    const looksNric = mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31;
    out.push({
      cls: looksNric ? 'NRIC_OR_SSM_AMBIGUOUS' : 'SSM',
      start: m.index!, end: m.index! + 12, text: d,
    });
  }
  return out;
}
```

```ts
// tests/l1/ssm.test.ts
import { describe, it, expect } from 'vitest';
import { detectSsm } from '../../src/detection/l1/ssm';
describe('SSM', () => {
  it('flags a 12-digit that cannot be an NRIC as SSM', () =>
    expect(detectSsm('201501234567')[0]?.cls).toBe('SSM')); // month=15 -> not NRIC-shaped
  it('flags an NRIC-shaped 12-digit as AMBIGUOUS', () =>
    expect(detectSsm('890101145555')[0]?.cls).toBe('NRIC_OR_SSM_AMBIGUOUS'));
});
```

- [ ] **Step 5: TIN, email, card (Luhn) detectors + tests**

```ts
// src/detection/l1/tin.ts — LHDN TIN: IG (current) + legacy SG/OG (pre-2023 docs get pasted; doc 03 §U3).
import type { Finding } from './types';
const TIN_RE = /\b(IG|SG|OG)\d{9,11}\b/gi;
export function detectTin(text: string): Finding[] {
  return [...text.matchAll(TIN_RE)].map((m) => ({ cls: 'TIN', start: m.index!, end: m.index! + m[0].length, text: m[0] }));
}
```

```ts
// src/detection/l1/email.ts
import type { Finding } from './types';
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
export function detectEmail(text: string): Finding[] {
  return [...text.matchAll(EMAIL_RE)].map((m) => ({ cls: 'EMAIL', start: m.index!, end: m.index! + m[0].length, text: m[0] }));
}
```

```ts
// src/detection/l1/card.ts — 13-19 digit runs (optionally spaced/dashed) that pass Luhn.
import type { Finding } from './types';
const CAND_RE = /\b(?:\d[ -]?){13,19}\b/g;
function luhnOk(digits: string): boolean {
  let sum = 0, alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48;
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n; alt = !alt;
  }
  return sum % 10 === 0;
}
export function detectCard(text: string): Finding[] {
  const out: Finding[] = [];
  for (const m of text.matchAll(CAND_RE)) {
    const digits = m[0].replace(/[ -]/g, '');
    if (digits.length < 13 || digits.length > 19 || !luhnOk(digits)) continue;
    out.push({ cls: 'CARD', start: m.index!, end: m.index! + m[0].length, text: m[0] });
  }
  return out;
}
```

```ts
// tests/l1/card.test.ts
import { describe, it, expect } from 'vitest';
import { detectCard } from '../../src/detection/l1/card';
describe('card', () => {
  it('detects a Luhn-valid test PAN', () => expect(detectCard('4111 1111 1111 1111')[0]?.cls).toBe('CARD'));
  it('ignores a Luhn-invalid 16-digit run', () => expect(detectCard('4111 1111 1111 1112')).toEqual([]));
  it('ignores a 12-digit run (too short for a card)', () => expect(detectCard('4111 1111 1111')).toEqual([]));
});
```

- [ ] **Step 6: `runL1` orchestrator — union, then resolve overlaps**

```ts
// src/detection/l1/index.ts
import type { Finding } from './types';
import { detectNric } from './nric';
import { detectSsm } from './ssm';
import { detectTin } from './tin';
import { detectEmail } from './email';
import { detectCard } from './card';

export function runL1(text: string): Finding[] {
  const all = [detectNric, detectSsm, detectTin, detectEmail, detectCard].flatMap((f) => f(text));
  all.sort((a, b) => a.start - b.start || b.end - a.end);
  // Drop a finding fully contained in an earlier, longer one (e.g. SSM's 12-digit inside a card run).
  const out: Finding[] = [];
  let lastEnd = -1;
  for (const f of all) {
    if (f.start < lastEnd) continue;
    out.push(f); lastEnd = f.end;
  }
  return out;
}
```

- [ ] **Step 7: Run all L1 tests — expect PASS (including the guardrail)**

```bash
cd code/extension && npx vitest run tests/l1
```
Expected: PASS. The guardrail file proves `1+1`, years, and bare numbers produce zero findings.

- [ ] **Step 8: Commit**

```bash
git add code/extension/src/detection/l1 code/extension/tests/l1
git commit -m "feat(ext): L1 detectors (NRIC/SSM+ambiguous/TIN/email/card) with the 1+1 guardrail"
```

> **`export type { Finding, FindingClass }`** from `l1/types.ts` is the shared finding shape used by L2 (map `L2Entity` → `Finding` with `cls: 'PERSON'|'ORG'`) and by mask/audit downstream. Later tasks import from here.

---

## Phase 3 — Gate + verdict cache + adapters + scan orchestration

