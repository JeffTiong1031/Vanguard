## Task 1: Policy types, config, and the pure lookup

**Files:**
- Create: `code/extension/src/policy/types.ts`
- Create: `code/extension/src/policy/config.ts`
- Create: `code/extension/src/policy/lookup.ts`
- Test: `code/extension/tests/policy-lookup.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: types `Tool`, `Category`, `Policy`, `Enrolment` · `POLICY_CONFIG` · `toolForHost(policy, hostname) -> Tool | null` · `isApproved(policy, hostname) -> boolean`

Start with the pure function: it has every interesting edge case and needs no browser.

- [ ] **Step 1: Write the types**

`code/extension/src/policy/types.ts`:

```typescript
/** Wire types, mirroring code/policy/app/models.py. If you change one, change both. */
export type Tool = {
  llm_id: string;
  host: string;
  display_name: string;
  status: 'approved' | 'blocked';
};

export type Category = { key: string; label: string; enabled: boolean };

export type Policy = {
  org_id: string;
  org_name: string;
  version: number;
  tools: Tool[];
  categories: Category[];
};

/** What enrolment returns and what we persist. No name, no email — the server
 *  never issues one, so there is nothing here to leak. */
export type Enrolment = {
  org_id: string;
  org_name: string;
  pseudo_id: string;
  department: string;
};

export type GovernanceEventType =
  | 'visit_unapproved' | 'warn_shown' | 'request_sent' | 'ethics_block' | 'pii_block';

export type GovernanceEvent = {
  host: string;
  type: GovernanceEventType;
  category?: string;
  finding_hash?: string;
  ts: string;
};
```

- [ ] **Step 2: Write the config**

`code/extension/src/policy/config.ts`:

```typescript
/**
 * Policy-service settings. Every value that is a guess is tagged, matching
 * src/files/config.ts: "the scaffold does not launder an estimate into a
 * constant by writing it in code."
 */
export const POLICY_CONFIG = {
  /** Content script asks the background this often. NOT a background timer --
   *  the service worker is terminated after ~30s idle (U10), so it cannot hold
   *  one. This message traffic is also what keeps the worker alive.
   *
   *  5s rather than the spec's 30s (estimate): the demo's pivotal beat is an
   *  admin approving while the employee's tab is on screen, and 30s of dead air
   *  kills it. Recorded as a deliberate deviation in the plan header. */
  pollMs: 5_000,
  /** Coalesce event bursts before shipping. Immediate-ish, because the usage
   *  dashboard must reflect a block within a second or two on stage. (estimate) */
  eventDebounceMs: 500,
  /** A poll that hangs must not wedge the banner. (estimate) */
  requestTimeoutMs: 8_000,
} as const;

const KEY = 'vg_policy_base';
/** Overridden in the options page. Default matches Plan A's uvicorn port. */
const DEFAULT_BASE = 'http://localhost:8001';

export async function getPolicyBase(): Promise<string> {
  const stored = (await chrome.storage.local.get(KEY))[KEY] as string | undefined;
  return (stored || DEFAULT_BASE).replace(/\/+$/, '');
}

export async function setPolicyBase(base: string): Promise<void> {
  await chrome.storage.local.set({ [KEY]: base.replace(/\/+$/, '') });
}
```

- [ ] **Step 3: Write the failing test**

`code/extension/tests/policy-lookup.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { isApproved, toolForHost } from '../src/policy/lookup';
import type { Policy } from '../src/policy/types';

const policy: Policy = {
  org_id: 'o1', org_name: 'Acme Corp', version: 3,
  tools: [
    { llm_id: 'openai', host: 'chatgpt.com', display_name: 'ChatGPT', status: 'approved' },
    { llm_id: 'google', host: 'gemini.google.com', display_name: 'Google Gemini', status: 'blocked' },
  ],
  categories: [],
};

describe('toolForHost', () => {
  it('matches an exact host', () => {
    expect(toolForHost(policy, 'chatgpt.com')?.llm_id).toBe('openai');
  });
  it('matches a subdomain of a registry host', () => {
    expect(toolForHost(policy, 'www.chatgpt.com')?.llm_id).toBe('openai');
  });
  it('does NOT match a lookalike domain', () => {
    // "notchatgpt.com".endsWith("chatgpt.com") is true — a naive endsWith is a
    // real bug here, so the boundary must be a dot.
    expect(toolForHost(policy, 'notchatgpt.com')).toBeNull();
  });
  it('returns null for a host that is not in the registry at all', () => {
    expect(toolForHost(policy, 'example.com')).toBeNull();
  });
});

describe('isApproved', () => {
  it('is true for an approved tool', () => {
    expect(isApproved(policy, 'chatgpt.com')).toBe(true);
  });
  it('is false for a blocked tool', () => {
    expect(isApproved(policy, 'gemini.google.com')).toBe(false);
  });
  it('is true for a host we do not govern — we warn about known tools, not the whole web', () => {
    expect(isApproved(policy, 'example.com')).toBe(true);
  });
  it('is true when there is no policy at all, so an unenrolled user is never blocked', () => {
    expect(isApproved(null, 'gemini.google.com')).toBe(true);
  });
});
```

- [ ] **Step 4: Run it and watch it fail**

```bash
cd code/extension && npx vitest run tests/policy-lookup.test.ts
```

Expected: `Failed to resolve import "../src/policy/lookup"`

- [ ] **Step 5: Write `src/policy/lookup.ts`**

```typescript
import type { Policy, Tool } from './types';

/**
 * Find the registry entry governing a hostname.
 *
 * The dot boundary matters: a bare `endsWith('chatgpt.com')` also matches
 * `notchatgpt.com`, which would hand an attacker-controlled domain the policy
 * of a tool we approved.
 */
export function toolForHost(policy: Policy | null, hostname: string): Tool | null {
  if (!policy) return null;
  const host = hostname.toLowerCase();
  return policy.tools.find(
    (t) => host === t.host || host.endsWith(`.${t.host}`),
  ) ?? null;
}

/**
 * Governed and blocked → false. Everything else → true.
 *
 * An unknown host is approved by design: we warn about a curated set of known
 * AI tools, not about the whole web. An unenrolled user is never warned at all.
 */
export function isApproved(policy: Policy | null, hostname: string): boolean {
  const tool = toolForHost(policy, hostname);
  return tool === null || tool.status === 'approved';
}
```

- [ ] **Step 6: Run the tests**

```bash
npx vitest run tests/policy-lookup.test.ts
```

Expected: 8 passed.

- [ ] **Step 7: Commit**

```bash
git add code/extension/src/policy/ code/extension/tests/policy-lookup.test.ts
git commit -m "feat(ext): policy types, config, and host lookup"
```

---

