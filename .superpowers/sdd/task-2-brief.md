## Task 2: Policy storage

**Files:**
- Create: `code/extension/src/policy/store.ts`
- Test: `code/extension/tests/policy-store.test.ts`

**Interfaces:**
- Consumes: `types.Enrolment`, `types.Policy`
- Produces: `saveEnrolment(e, p)` · `getEnrolment()` · `getCachedPolicy()` · `savePolicy(p, etag)` · `getEtag()` · `clearEnrolment()`

- [ ] **Step 1: Write the failing test**

`code/extension/tests/policy-store.test.ts`:

```typescript
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  clearEnrolment, getCachedPolicy, getEnrolment, getEtag, saveEnrolment, savePolicy,
} from '../src/policy/store';
import type { Enrolment, Policy } from '../src/policy/types';

const enrolment: Enrolment = {
  org_id: 'o1', org_name: 'Acme Corp', pseudo_id: 'p1', department: 'Engineering',
};
const policy: Policy = {
  org_id: 'o1', org_name: 'Acme Corp', version: 1, tools: [], categories: [],
};

beforeEach(() => {
  const bag: Record<string, unknown> = {};
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: async (k: string | string[]) => {
          const keys = Array.isArray(k) ? k : [k];
          return Object.fromEntries(keys.filter((x) => x in bag).map((x) => [x, bag[x]]));
        },
        set: async (o: Record<string, unknown>) => { Object.assign(bag, o); },
        remove: async (k: string | string[]) => {
          for (const x of Array.isArray(k) ? k : [k]) delete bag[x];
        },
      },
    },
  });
});

describe('policy store', () => {
  it('round-trips an enrolment', async () => {
    await saveEnrolment(enrolment, policy);
    expect(await getEnrolment()).toEqual(enrolment);
  });

  it('returns null before enrolment rather than throwing', async () => {
    expect(await getEnrolment()).toBeNull();
    expect(await getCachedPolicy()).toBeNull();
  });

  it('stores the etag alongside the policy', async () => {
    await savePolicy(policy, 'W/"o1-1"');
    expect(await getEtag()).toBe('W/"o1-1"');
    expect((await getCachedPolicy())?.version).toBe(1);
  });

  it('a newer policy replaces the old one and its etag', async () => {
    await savePolicy(policy, 'W/"o1-1"');
    await savePolicy({ ...policy, version: 2 }, 'W/"o1-2"');
    expect((await getCachedPolicy())?.version).toBe(2);
    expect(await getEtag()).toBe('W/"o1-2"');
  });

  it('clearing removes the enrolment, the policy, and the etag together', async () => {
    await saveEnrolment(enrolment, policy);
    await savePolicy(policy, 'W/"o1-1"');
    await clearEnrolment();
    expect(await getEnrolment()).toBeNull();
    expect(await getCachedPolicy()).toBeNull();
    expect(await getEtag()).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run tests/policy-store.test.ts
```

Expected: `Failed to resolve import "../src/policy/store"`

- [ ] **Step 3: Write `src/policy/store.ts`**

```typescript
import type { Enrolment, Policy } from './types';

const K_ENROL = 'vg_enrolment';
const K_POLICY = 'vg_policy';
const K_ETAG = 'vg_policy_etag';

export async function saveEnrolment(enrolment: Enrolment, policy: Policy): Promise<void> {
  await chrome.storage.local.set({ [K_ENROL]: enrolment, [K_POLICY]: policy });
}

export async function getEnrolment(): Promise<Enrolment | null> {
  return ((await chrome.storage.local.get(K_ENROL))[K_ENROL] as Enrolment | undefined) ?? null;
}

export async function savePolicy(policy: Policy, etag: string | null): Promise<void> {
  await chrome.storage.local.set({ [K_POLICY]: policy, [K_ETAG]: etag });
}

export async function getCachedPolicy(): Promise<Policy | null> {
  return ((await chrome.storage.local.get(K_POLICY))[K_POLICY] as Policy | undefined) ?? null;
}

export async function getEtag(): Promise<string | null> {
  return ((await chrome.storage.local.get(K_ETAG))[K_ETAG] as string | undefined) ?? null;
}

/** Removes all three together. Leaving a stale policy behind after an
 *  unenrol would keep enforcing an org the user has left. */
export async function clearEnrolment(): Promise<void> {
  await chrome.storage.local.remove([K_ENROL, K_POLICY, K_ETAG]);
}
```

- [ ] **Step 4: Run the tests**

```bash
npx vitest run tests/policy-store.test.ts
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add code/extension/src/policy/store.ts code/extension/tests/policy-store.test.ts
git commit -m "feat(ext): policy and enrolment storage"
```

---

