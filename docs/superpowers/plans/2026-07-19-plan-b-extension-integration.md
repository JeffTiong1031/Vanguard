# Plan B — Extension Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the existing extension to the Plan A policy service — enrolment in the options page, a policy client in the background service worker, a warn banner on unapproved AI tools, one-click access requests, and governance event shipping.

**Architecture:** All policy-service traffic originates in the **background service worker**, never a content script (spec §5.4 — a content script on `https://chatgpt.com` cannot fetch `http://` on a LAN address). The content script is the *timer*: it polls the background every 5 seconds, and that message traffic also keeps the service worker alive, which `setInterval` in the worker could not do given its ~30s idle termination (U10).

**Tech Stack:** WXT, TypeScript, Preact, vitest — all already in `code/extension/`.

**Spec:** [`docs/superpowers/specs/2026-07-19-ai-governance-platform-design.md`](../specs/2026-07-19-ai-governance-platform-design.md)
**Depends on:** Plan A ([`2026-07-19-plan-a-policy-service.md`](2026-07-19-plan-a-policy-service.md)) — its API must be running.

---

## Global Constraints

- **Demo-grade build.** Every shortcut has an honest answer in spec §9.
- 🔴 **Every fetch to the policy service happens in the background service worker.** Do not reuse [`src/files/api.ts`](../../../code/extension/src/files/api.ts)'s content-script `fetch` pattern — it works today only because `http://localhost` is a mixed-content special case, and the demo runs on a LAN address that is not.
- 🔴 **I3 — events carry class, count, and salted-hash references. Never prompt text.** The server rejects extra fields with a 422, so a mistake here fails loudly rather than leaking.
- 🔴 **Which tool you use is advisory. What you ask it to do is blocking.** The unapproved-tool banner is dismissible and never blocks the page — spec §7, and consistent with [ADR 0014](../../adr/0014-degrade-to-advisory-never-closed.md).
- **Do not change the existing gate, L1, L2, vault, or file pipeline.** Plan B *adds* alongside them.
- **`dist/` is committed and drift-checked.** Run `npm run build` before committing; `npm run check:dist` must pass.
- **No `Co-Authored-By` trailer on commits** (CLAUDE.md §6.1).

### 🔴 Recorded deviation from the spec — poll interval

Spec §5.1 says the extension polls every 30 seconds. **This plan uses 5 seconds**, as a named constant tagged `(estimate)`.

**Reason:** the demo's pivotal beat is the admin clicking Approve and the employee's tab unblocking while both laptops are on screen. Thirty seconds of dead air kills it. Five seconds is under the threshold where an audience thinks nothing happened.

**Cost:** 12× the request rate per device. Irrelevant at demo scale, and every poll is a bodyless `304` thanks to Plan A's ETag. A production build would move to push and the 30-second figure would be the fallback, not the primary.

---

## File Structure

**Create:**

| Path | Responsibility |
|---|---|
| `src/policy/types.ts` | `Policy`, `Tool`, `Category`, `Enrolment` — mirrors Plan A's wire models |
| `src/policy/store.ts` | Read/write enrolment + cached policy in `chrome.storage.local` |
| `src/policy/config.ts` | Policy-service base URL and the poll interval, each tagged |
| `src/policy/messages.ts` | The content ↔ background message contract |
| `src/policy/client.ts` | `enrol()` and `fetchPolicy()` — **background only** |
| `src/policy/events.ts` | Event queue and debounced flush — **background only** |
| `src/policy/lookup.ts` | Pure: given a policy and a hostname, is this tool approved? |
| `src/ui/warn-banner.ts` | The dismissible banner plus its Request-access form |
| `entrypoints/guard.ts` | New content script on every registry host |
| `docs/adr/0031-governance-platform-sequencing-departure.md` | Records the ADR 0016 departure |

**Modify:**

| Path | Change |
|---|---|
| `entrypoints/background.ts` | Add policy + event message handlers |
| `entrypoints/options/main.tsx` | Add the enrolment section above the existing file-service field |
| `wxt.config.ts` | Registry `host_permissions` + the two policy origins |
| `entrypoints/content.ts` | Emit `ethics_block` / `pii_block` events (Task 9) |

**Tests:** `tests/policy-store.test.ts`, `tests/policy-lookup.test.ts`, `tests/policy-client.test.ts`, `tests/policy-events.test.ts`, `tests/warn-banner.test.ts`

---

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

## Task 3: The policy client — background only

**Files:**
- Create: `code/extension/src/policy/client.ts`
- Test: `code/extension/tests/policy-client.test.ts`

**Interfaces:**
- Consumes: `config.getPolicyBase`, `config.POLICY_CONFIG`, `store.*`
- Produces: `enrol(token) -> Enrolment` · `refreshPolicy() -> Policy | null` · `sendAccessRequest(llmId, reason) -> void`

🔴 **This module runs in the background service worker only.** Importing it from a content script would reintroduce the mixed-content failure spec §5.4 exists to prevent.

- [ ] **Step 1: Write the failing test**

`code/extension/tests/policy-client.test.ts`:

```typescript
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { enrol, refreshPolicy, sendAccessRequest } from '../src/policy/client';

const policy = {
  org_id: 'o1', org_name: 'Acme Corp', version: 1, tools: [], categories: [],
};

function mockStorage() {
  const bag: Record<string, unknown> = {};
  return {
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
  };
}

beforeEach(() => {
  vi.stubGlobal('chrome', { storage: mockStorage() });
});

describe('enrol', () => {
  it('posts the token and persists what comes back', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      org_id: 'o1', org_name: 'Acme Corp', pseudo_id: 'p1',
      department: 'Engineering', policy,
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await enrol('ENG-abc');
    expect(result.department).toBe('Engineering');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain('/v1/enroll');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ token: 'ENG-abc' });
  });

  it('throws a readable error on a bad token', async () => {
    vi.stubGlobal('fetch', async () => new Response('{}', { status: 401 }));
    await expect(enrol('nope')).rejects.toThrow(/not recognised/i);
  });
});

describe('refreshPolicy', () => {
  it('sends If-None-Match once an etag is known and keeps the cache on 304', async () => {
    const first = new Response(JSON.stringify(policy), {
      status: 200, headers: { etag: 'W/"o1-1"' },
    });
    const second = new Response('', { status: 304 });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second);
    vi.stubGlobal('fetch', fetchMock);

    await chrome.storage.local.set({
      vg_enrolment: { org_id: 'o1', org_name: 'A', pseudo_id: 'p1', department: 'Eng' },
    });

    const a = await refreshPolicy();
    expect(a?.version).toBe(1);

    const b = await refreshPolicy();
    expect(b?.version).toBe(1); // unchanged, served from cache
    const headers = (fetchMock.mock.calls[1]![1] as RequestInit).headers as Record<string, string>;
    expect(headers['If-None-Match']).toBe('W/"o1-1"');
  });

  it('returns null when not enrolled instead of calling the network', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await refreshPolicy()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns the cached policy when the network fails, so a dead service never blocks anyone', async () => {
    await chrome.storage.local.set({
      vg_enrolment: { org_id: 'o1', org_name: 'A', pseudo_id: 'p1', department: 'Eng' },
      vg_policy: policy,
    });
    vi.stubGlobal('fetch', async () => { throw new Error('offline'); });
    expect((await refreshPolicy())?.version).toBe(1);
  });
});

describe('sendAccessRequest', () => {
  it('includes the pseudo_id from storage, never a name', async () => {
    const fetchMock = vi.fn(async () => new Response('{"id":"r1"}', { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    await chrome.storage.local.set({
      vg_enrolment: { org_id: 'o1', org_name: 'A', pseudo_id: 'p1', department: 'Eng' },
    });

    await sendAccessRequest('google', 'Translation QA');
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body).toEqual({ pseudo_id: 'p1', llm_id: 'google', reason: 'Translation QA' });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run tests/policy-client.test.ts
```

Expected: `Failed to resolve import "../src/policy/client"`

- [ ] **Step 3: Write `src/policy/client.ts`**

```typescript
/**
 * Policy-service HTTP client.
 *
 * 🔴 BACKGROUND SERVICE WORKER ONLY. A content script on https://chatgpt.com
 * cannot fetch http:// on a LAN address -- Chrome blocks it as mixed content,
 * and http://localhost is a special case that does not generalise to the
 * two-laptop demo. The service worker runs on a chrome-extension:// origin,
 * which is a secure context, so it may fetch http:// with host permissions.
 * See spec section 5.4.
 */
import { POLICY_CONFIG, getPolicyBase } from './config';
import { getCachedPolicy, getEnrolment, getEtag, saveEnrolment, savePolicy } from './store';
import type { Enrolment, Policy } from './types';

async function timedFetch(url: string, init?: RequestInit): Promise<Response> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), POLICY_CONFIG.requestTimeoutMs);
  try {
    return await fetch(url, { ...init, signal: abort.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function enrol(token: string): Promise<Enrolment> {
  const base = await getPolicyBase();
  const response = await timedFetch(`${base}/v1/enroll`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  if (response.status === 401) {
    throw new Error('That enrolment token was not recognised. Check it with your admin.');
  }
  if (!response.ok) throw new Error(`Enrolment failed (${response.status}).`);

  const body = (await response.json()) as Enrolment & { policy: Policy };
  const enrolment: Enrolment = {
    org_id: body.org_id, org_name: body.org_name,
    pseudo_id: body.pseudo_id, department: body.department,
  };
  await saveEnrolment(enrolment, body.policy);
  return enrolment;
}

/**
 * Conditional GET. Returns the current policy, or null if not enrolled.
 *
 * A network failure returns the CACHED policy rather than throwing. ADR 0014:
 * a dead service degrades to advisory, it never blocks the user's work.
 */
export async function refreshPolicy(): Promise<Policy | null> {
  const enrolment = await getEnrolment();
  if (!enrolment) return null;

  const base = await getPolicyBase();
  const etag = await getEtag();
  try {
    const response = await timedFetch(
      `${base}/v1/policy?org_id=${encodeURIComponent(enrolment.org_id)}`,
      { headers: etag ? { 'If-None-Match': etag } : {} },
    );
    if (response.status === 304) return await getCachedPolicy();
    if (!response.ok) return await getCachedPolicy();

    const policy = (await response.json()) as Policy;
    await savePolicy(policy, response.headers.get('etag'));
    return policy;
  } catch {
    return await getCachedPolicy();
  }
}

export async function sendAccessRequest(llmId: string, reason: string): Promise<void> {
  const enrolment = await getEnrolment();
  if (!enrolment) throw new Error('Not enrolled.');
  const base = await getPolicyBase();
  const response = await timedFetch(`${base}/v1/requests`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pseudo_id: enrolment.pseudo_id, llm_id: llmId, reason }),
  });
  if (!response.ok) throw new Error(`Request failed (${response.status}).`);
}
```

- [ ] **Step 4: Run the tests**

```bash
npx vitest run tests/policy-client.test.ts
```

Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add code/extension/src/policy/client.ts code/extension/tests/policy-client.test.ts
git commit -m "feat(ext): policy client with conditional GET and offline fallback"
```

---

## Task 4: Event queue and flush

**Files:**
- Create: `code/extension/src/policy/events.ts`
- Test: `code/extension/tests/policy-events.test.ts`

**Interfaces:**
- Consumes: `store.getEnrolment`, `config`
- Produces: `queueEvent(e: GovernanceEvent) -> void` · `flushNow() -> Promise<void>`

- [ ] **Step 1: Write the failing test**

`code/extension/tests/policy-events.test.ts`:

```typescript
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { flushNow, queueEvent } from '../src/policy/events';
import type { GovernanceEvent } from '../src/policy/types';

const event = (over: Partial<GovernanceEvent> = {}): GovernanceEvent => ({
  host: 'gemini.google.com', type: 'visit_unapproved',
  ts: new Date().toISOString(), ...over,
});

beforeEach(() => {
  vi.useFakeTimers();
  const bag: Record<string, unknown> = {
    vg_enrolment: { org_id: 'o1', org_name: 'A', pseudo_id: 'p1', department: 'Eng' },
  };
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: async (k: string | string[]) => {
          const keys = Array.isArray(k) ? k : [k];
          return Object.fromEntries(keys.filter((x) => x in bag).map((x) => [x, bag[x]]));
        },
        set: async (o: Record<string, unknown>) => { Object.assign(bag, o); },
        remove: async () => {},
      },
    },
  });
});

afterEach(() => { vi.useRealTimers(); });

describe('event queue', () => {
  it('coalesces a burst into a single request', async () => {
    const fetchMock = vi.fn(async () => new Response('{"accepted":3}', { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);

    queueEvent(event());
    queueEvent(event({ type: 'warn_shown' }));
    queueEvent(event({ type: 'request_sent' }));
    expect(fetchMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(600);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.events).toHaveLength(3);
    expect(body.pseudo_id).toBe('p1');
  });

  it('never sends a field the server would reject', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);
    queueEvent(event({ category: 'covert_surveillance' }));
    await vi.advanceTimersByTimeAsync(600);

    const sent = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    const allowed = new Set(['host', 'type', 'category', 'finding_hash', 'ts']);
    for (const e of sent.events) {
      for (const key of Object.keys(e)) expect(allowed.has(key)).toBe(true);
    }
  });

  it('re-queues on a failed flush so events are not silently lost', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(new Response('{}', { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);

    queueEvent(event());
    await vi.advanceTimersByTimeAsync(600);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await flushNow();
    const body = JSON.parse((fetchMock.mock.calls[1]![1] as RequestInit).body as string);
    expect(body.events).toHaveLength(1);
  });

  it('drops events when not enrolled rather than queueing forever', async () => {
    await chrome.storage.local.remove('vg_enrolment');
    const bag = await chrome.storage.local.get('vg_enrolment');
    expect(bag.vg_enrolment).toBeUndefined();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    queueEvent(event());
    await vi.advanceTimersByTimeAsync(600);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run tests/policy-events.test.ts
```

Expected: `Failed to resolve import "../src/policy/events"`

- [ ] **Step 3: Write `src/policy/events.ts`**

```typescript
/**
 * Governance event shipping. BACKGROUND SERVICE WORKER ONLY (see client.ts).
 *
 * 🔴 I3. A GovernanceEvent has no field for prompt text, and Plan A's server
 * sets extra="forbid" so an event carrying one is REJECTED with a 422 rather
 * than silently accepted. If this module ever starts 422-ing, something began
 * putting user text in an event -- treat that as a leak, not a bug.
 */
import { POLICY_CONFIG, getPolicyBase } from './config';
import { getEnrolment } from './store';
import type { GovernanceEvent } from './types';

let queue: GovernanceEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

export function queueEvent(event: GovernanceEvent): void {
  queue.push(event);
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    void flushNow();
  }, POLICY_CONFIG.eventDebounceMs);
}

export async function flushNow(): Promise<void> {
  if (queue.length === 0) return;
  const enrolment = await getEnrolment();
  if (!enrolment) {
    // Not enrolled: there is no org to attribute these to. Drop rather than
    // grow an unbounded queue in a worker that may be killed anyway.
    queue = [];
    return;
  }

  const batch = queue;
  queue = [];
  try {
    const base = await getPolicyBase();
    const response = await fetch(`${base}/v1/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pseudo_id: enrolment.pseudo_id, events: batch }),
    });
    if (!response.ok) throw new Error(String(response.status));
  } catch {
    // Put them back at the front so ordering survives a transient failure.
    queue = [...batch, ...queue];
  }
}
```

- [ ] **Step 4: Run the tests**

```bash
npx vitest run tests/policy-events.test.ts
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add code/extension/src/policy/events.ts code/extension/tests/policy-events.test.ts
git commit -m "feat(ext): debounced governance event queue with re-queue on failure"
```

---

## Task 5: Message contract and background handlers

**Files:**
- Create: `code/extension/src/policy/messages.ts`
- Modify: `code/extension/entrypoints/background.ts`

**Interfaces:**
- Consumes: `client.*`, `events.*`, `store.getCachedPolicy`
- Produces: message kinds `policy-get`, `policy-enrol`, `policy-request-access`, `policy-event`

- [ ] **Step 1: Write the message contract**

`code/extension/src/policy/messages.ts`:

```typescript
import type { Enrolment, GovernanceEvent, Policy } from './types';

/** Content script -> background. Mirrors src/detection/l2/messages.ts's shape. */
export type PolicyRequest =
  | { kind: 'policy-get' }
  | { kind: 'policy-enrol'; token: string }
  | { kind: 'policy-request-access'; llmId: string; reason: string }
  | { kind: 'policy-event'; event: GovernanceEvent };

export type PolicyResponse =
  | { kind: 'policy-result'; ok: true; policy: Policy | null; enrolment: Enrolment | null }
  | { kind: 'policy-result'; ok: false; error: string };

export function isPolicyRequest(msg: unknown): msg is PolicyRequest {
  return typeof (msg as PolicyRequest)?.kind === 'string'
    && (msg as PolicyRequest).kind.startsWith('policy-');
}
```

- [ ] **Step 2: Add the handlers to `entrypoints/background.ts`**

Add these imports at the top of the existing file:

```typescript
import { enrol, refreshPolicy, sendAccessRequest } from '../src/policy/client';
import { queueEvent } from '../src/policy/events';
import { isPolicyRequest, type PolicyRequest, type PolicyResponse } from '../src/policy/messages';
import { getCachedPolicy, getEnrolment } from '../src/policy/store';
```

Add this listener **inside** `defineBackground(() => { ... })`, after the existing `l2-scan` listener:

```typescript
  // Policy traffic lives HERE, not in the content script. A content script on
  // https://chatgpt.com cannot fetch http:// on a LAN address -- see
  // src/policy/client.ts and spec section 5.4.
  chrome.runtime.onMessage.addListener((msg: PolicyRequest, _s, sendResponse) => {
    if (!isPolicyRequest(msg)) return;
    (async () => {
      try {
        switch (msg.kind) {
          case 'policy-get': {
            const policy = await refreshPolicy();
            sendResponse({
              kind: 'policy-result', ok: true,
              policy, enrolment: await getEnrolment(),
            } satisfies PolicyResponse);
            return;
          }
          case 'policy-enrol': {
            const enrolment = await enrol(msg.token);
            sendResponse({
              kind: 'policy-result', ok: true,
              policy: await getCachedPolicy(), enrolment,
            } satisfies PolicyResponse);
            return;
          }
          case 'policy-request-access': {
            await sendAccessRequest(msg.llmId, msg.reason);
            sendResponse({
              kind: 'policy-result', ok: true,
              policy: await getCachedPolicy(), enrolment: await getEnrolment(),
            } satisfies PolicyResponse);
            return;
          }
          case 'policy-event': {
            queueEvent(msg.event);
            sendResponse({
              kind: 'policy-result', ok: true,
              policy: null, enrolment: null,
            } satisfies PolicyResponse);
            return;
          }
        }
      } catch (e) {
        sendResponse({
          kind: 'policy-result', ok: false, error: String(e instanceof Error ? e.message : e),
        } satisfies PolicyResponse);
      }
    })();
    return true;   // keep the message channel open for the async reply
  });
```

- [ ] **Step 3: Verify the extension still builds**

```bash
cd code/extension && npm run build
```

Expected: build succeeds. Then confirm existing tests are unaffected:

```bash
npx vitest run
```

Expected: all previously passing tests still pass.

- [ ] **Step 4: Commit**

```bash
git add code/extension/src/policy/messages.ts code/extension/entrypoints/background.ts
git commit -m "feat(ext): policy message contract and background handlers"
```

---

## Task 6: The warn banner

**Files:**
- Create: `code/extension/src/ui/warn-banner.ts`
- Test: `code/extension/tests/warn-banner.test.ts`

**Interfaces:**
- Consumes: nothing (pure DOM)
- Produces: `showWarnBanner(opts)` · `hideWarnBanner()`

Mounted in a shadow root, matching [`src/ui/mount.ts`](../../../code/extension/src/ui/mount.ts) — the page's CSS must not be able to restyle or hide our banner.

- [ ] **Step 1: Write the failing test**

`code/extension/tests/warn-banner.test.ts`:

```typescript
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { hideWarnBanner, showWarnBanner } from '../src/ui/warn-banner';

function host(): ShadowRoot {
  return document.querySelector('[data-vanguard-ui="warn-banner"]')!.shadowRoot!;
}

beforeEach(() => { document.body.innerHTML = ''; hideWarnBanner(); });

describe('warn banner', () => {
  it('names the tool and the organisation', () => {
    showWarnBanner({
      toolName: 'Google Gemini', orgName: 'Acme Corp',
      onRequest: async () => {}, onDismiss: () => {},
    });
    expect(host().textContent).toContain('Google Gemini');
    expect(host().textContent).toContain('Acme Corp');
  });

  it('is dismissible — it warns, it does not block', () => {
    const onDismiss = vi.fn();
    showWarnBanner({
      toolName: 'Google Gemini', orgName: 'Acme Corp',
      onRequest: async () => {}, onDismiss,
    });
    host().querySelector<HTMLButtonElement>('[data-act="dismiss"]')!.click();
    expect(onDismiss).toHaveBeenCalled();
    expect(document.querySelector('[data-vanguard-ui="warn-banner"]')).toBeNull();
  });

  it('does not cover the page — no full-screen overlay', () => {
    showWarnBanner({
      toolName: 'X', orgName: 'Y', onRequest: async () => {}, onDismiss: () => {},
    });
    const style = host().querySelector('style')!.textContent!;
    // A banner that blocks the page would contradict spec section 7's
    // advisory-for-tools rule, so assert the absence of a blocking overlay.
    expect(style).not.toContain('inset: 0');
    expect(style).not.toContain('height: 100vh');
  });

  it('sends the typed reason with the access request', async () => {
    const onRequest = vi.fn(async () => {});
    showWarnBanner({
      toolName: 'Google Gemini', orgName: 'Acme Corp', onRequest, onDismiss: () => {},
    });
    host().querySelector<HTMLButtonElement>('[data-act="open-request"]')!.click();
    const input = host().querySelector<HTMLInputElement>('[data-act="reason"]')!;
    input.value = 'Translation QA';
    input.dispatchEvent(new Event('input'));
    host().querySelector<HTMLButtonElement>('[data-act="send"]')!.click();
    await Promise.resolve();
    expect(onRequest).toHaveBeenCalledWith('Translation QA');
  });

  it('confirms after a request is sent so the user does not click twice', async () => {
    showWarnBanner({
      toolName: 'G', orgName: 'A', onRequest: async () => {}, onDismiss: () => {},
    });
    host().querySelector<HTMLButtonElement>('[data-act="open-request"]')!.click();
    host().querySelector<HTMLButtonElement>('[data-act="send"]')!.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(host().textContent).toContain('Request sent');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run tests/warn-banner.test.ts
```

Expected: `Failed to resolve import "../src/ui/warn-banner"`

- [ ] **Step 3: Write `src/ui/warn-banner.ts`**

```typescript
/**
 * The unapproved-tool banner.
 *
 * 🔴 It WARNS. It does not block. Spec section 7: "which tool you use is
 * advisory, what you ask it to do is blocking." The case study's own finding is
 * that outright bans push usage out of sight, and a blocked page sends the
 * employee to their phone, where we see nothing at all.
 */
const HOST_ATTR = 'data-vanguard-ui';

export type WarnBannerOptions = {
  toolName: string;
  orgName: string;
  onRequest: (reason: string) => Promise<void>;
  onDismiss: () => void;
};

export function hideWarnBanner(): void {
  document.querySelector(`[${HOST_ATTR}="warn-banner"]`)?.remove();
}

export function showWarnBanner(options: WarnBannerOptions): void {
  hideWarnBanner();

  const host = document.createElement('div');
  host.setAttribute(HOST_ATTR, 'warn-banner');
  const root = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  // A top strip, never an overlay. Deliberately no inset/height rules that
  // would cover the page -- warn-banner.test.ts asserts their absence.
  style.textContent = `
    .bar { position: fixed; top: 0; left: 0; right: 0; z-index: 2147483646;
           display: flex; gap: 12px; align-items: center; flex-wrap: wrap;
           padding: 10px 16px; background: #fef3c7; border-bottom: 1px solid #f59e0b;
           font: 14px/1.4 system-ui, sans-serif; color: #78350f; }
    button { border: none; border-radius: 6px; padding: 6px 12px; cursor: pointer;
             background: #b45309; color: #fff; font-size: 13px; }
    button.ghost { background: transparent; color: #78350f; text-decoration: underline; }
    input { flex: 1; min-width: 200px; padding: 6px 8px; font-size: 13px;
            border: 1px solid #d97706; border-radius: 6px; }
  `;

  const bar = document.createElement('div');
  bar.className = 'bar';

  const render = (mode: 'warn' | 'form' | 'sent') => {
    bar.innerHTML = '';
    if (mode === 'sent') {
      bar.append(text(`Request sent to ${options.orgName}. You'll be notified when it's reviewed.`));
      bar.append(button('Dismiss', 'dismiss', 'ghost'));
      wire();
      return;
    }
    if (mode === 'form') {
      bar.append(text(`Why do you need ${options.toolName}?`));
      const input = document.createElement('input');
      input.setAttribute('data-act', 'reason');
      input.placeholder = 'e.g. translation QA for the SEA launch';
      bar.append(input);
      bar.append(button('Send request', 'send'));
      bar.append(button('Cancel', 'cancel', 'ghost'));
      wire();
      return;
    }
    bar.append(text(
      `${options.toolName} is not approved at ${options.orgName}. ` +
      `You can still use it — this is a notice, not a block.`,
    ));
    bar.append(button('Request access', 'open-request'));
    bar.append(button('Dismiss', 'dismiss', 'ghost'));
    wire();
  };

  function text(content: string): HTMLSpanElement {
    const span = document.createElement('span');
    span.textContent = content;
    return span;
  }

  function button(label: string, act: string, cls = ''): HTMLButtonElement {
    const el = document.createElement('button');
    el.textContent = label;
    el.setAttribute('data-act', act);
    if (cls) el.className = cls;
    return el;
  }

  let reason = '';
  function wire(): void {
    bar.querySelector('[data-act="reason"]')?.addEventListener('input', (e) => {
      reason = (e.target as HTMLInputElement).value;
    });
    bar.querySelector('[data-act="open-request"]')?.addEventListener('click', () => render('form'));
    bar.querySelector('[data-act="cancel"]')?.addEventListener('click', () => render('warn'));
    bar.querySelector('[data-act="dismiss"]')?.addEventListener('click', () => {
      hideWarnBanner();
      options.onDismiss();
    });
    bar.querySelector('[data-act="send"]')?.addEventListener('click', () => {
      void options.onRequest(reason).then(() => render('sent'));
    });
  }

  render('warn');
  root.append(style, bar);
  document.documentElement.append(host);
}
```

- [ ] **Step 4: Run the tests**

```bash
npx vitest run tests/warn-banner.test.ts
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add code/extension/src/ui/warn-banner.ts code/extension/tests/warn-banner.test.ts
git commit -m "feat(ext): dismissible warn banner with inline access request"
```

---

## Task 7: The guard content script

**Files:**
- Create: `code/extension/entrypoints/guard.ts`

**Interfaces:**
- Consumes: `messages.PolicyRequest/PolicyResponse`, `lookup.toolForHost`, `ui/warn-banner`
- Produces: the running guard

**This is the timer.** It polls the background every 5 seconds, which both refreshes policy and keeps the service worker alive — a `setInterval` inside the worker would die with it after ~30 seconds of idle (U10).

- [ ] **Step 1: Write `entrypoints/guard.ts`**

```typescript
import { POLICY_CONFIG } from '../src/policy/config';
import { toolForHost } from '../src/policy/lookup';
import type { PolicyRequest, PolicyResponse } from '../src/policy/messages';
import type { Enrolment, GovernanceEvent, Policy } from '../src/policy/types';
import { hideWarnBanner, showWarnBanner } from '../src/ui/warn-banner';

/** Every registry host. Keep in step with code/policy/app/seed.py's REGISTRY. */
const REGISTRY_MATCHES = [
  'https://chatgpt.com/*',
  'https://claude.ai/*',
  'https://gemini.google.com/*',
  'https://copilot.microsoft.com/*',
  'https://www.perplexity.ai/*',
  'https://chat.deepseek.com/*',
  'https://chat.mistral.ai/*',
  'https://grok.com/*',
];

function ask(msg: PolicyRequest): Promise<PolicyResponse> {
  return chrome.runtime.sendMessage(msg) as Promise<PolicyResponse>;
}

function emit(event: GovernanceEvent): void {
  void ask({ kind: 'policy-event', event });
}

export default defineContentScript({
  matches: REGISTRY_MATCHES,
  runAt: 'document_idle',
  world: 'ISOLATED',
  main() {
    let shownFor: string | null = null;   // llm_id the banner is currently up for
    let dismissed = false;                // per page load; a reload warns again
    let reportedVisit = false;

    async function tick(): Promise<void> {
      let response: PolicyResponse;
      try {
        response = await ask({ kind: 'policy-get' });
      } catch {
        return;   // worker restarting; the next tick picks it up
      }
      if (!response?.ok) return;

      const policy: Policy | null = response.policy;
      const enrolment: Enrolment | null = response.enrolment;
      if (!policy || !enrolment) return;   // not enrolled: never warn

      const tool = toolForHost(policy, location.hostname);

      // Approved, or not a governed tool at all -> take the banner down. This is
      // the demo's pivot: the admin approves and the banner clears itself.
      if (!tool || tool.status === 'approved') {
        if (shownFor) { hideWarnBanner(); shownFor = null; }
        return;
      }

      if (!reportedVisit) {
        reportedVisit = true;
        emit({ host: location.hostname, type: 'visit_unapproved', ts: new Date().toISOString() });
      }
      if (dismissed || shownFor === tool.llm_id) return;

      shownFor = tool.llm_id;
      emit({ host: location.hostname, type: 'warn_shown', ts: new Date().toISOString() });
      showWarnBanner({
        toolName: tool.display_name,
        orgName: enrolment.org_name,
        onDismiss: () => { dismissed = true; shownFor = null; },
        onRequest: async (reason) => {
          await ask({ kind: 'policy-request-access', llmId: tool.llm_id, reason });
          emit({ host: location.hostname, type: 'request_sent', ts: new Date().toISOString() });
        },
      });
    }

    void tick();
    setInterval(() => { void tick(); }, POLICY_CONFIG.pollMs);
    // A tab returning to the foreground should not wait out the interval.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void tick();
    });
  },
});
```

- [ ] **Step 2: Verify it builds**

```bash
cd code/extension && npm run build
```

Expected: the build succeeds and `dist/chrome-mv3/content-scripts/guard.js` exists.

```bash
ls dist/chrome-mv3/content-scripts/
```

- [ ] **Step 3: Commit**

```bash
git add code/extension/entrypoints/guard.ts
git commit -m "feat(ext): guard content script polls policy and shows the warn banner"
```

---

## Task 8: Manifest — registry hosts and the two policy origins

**Files:**
- Modify: `code/extension/wxt.config.ts`

🔴 **`host_permissions` is fixed at build time.** The venue's IP cannot be added on the day, which is why both a LAN address and a tunnel hostname go in now (spec §5.4).

- [ ] **Step 1: Replace the `host_permissions` array in `wxt.config.ts`**

```typescript
    host_permissions: [
      // --- AI tool registry. Keep in step with code/policy/app/seed.py. ---
      // A curated, finite list is the answer to "why not <all_urls>?": AI
      // surfaces are known and enumerable, and asking for the whole web would
      // fail the buyer's own security review (doc 02 section 6.4).
      'https://chatgpt.com/*',
      'https://claude.ai/*',
      'https://gemini.google.com/*',
      'https://copilot.microsoft.com/*',
      'https://www.perplexity.ai/*',
      'https://chat.deepseek.com/*',
      'https://chat.mistral.ai/*',
      'https://grok.com/*',

      // --- File-extract service (Slice 2, unchanged) ---
      'http://localhost:8000/*',
      'https://vanguard-extract.example.com/*',

      // --- Policy service (Plan A) ---
      // 🔴 THREE origins, and all three must ship. host_permissions is baked at
      // build time, so the venue's address cannot be added on the day.
      //   1. localhost      -- development
      //   2. the LAN address -- two-laptop demo over a phone hotspot with a
      //      reserved IP. EDIT THIS to the reserved address before building.
      //   3. the tunnel      -- a named cloudflared tunnel. HTTPS, so it also
      //      sidesteps mixed content entirely; prefer it as the primary path.
      'http://localhost:8001/*',
      'http://192.168.1.50:8001/*',
      'https://vanguard-policy.example.com/*',
    ],
```

- [ ] **Step 2: Build and confirm the manifest**

```bash
npm run build
python -c "import json;m=json.load(open('dist/chrome-mv3/manifest.json'));print('\n'.join(m['host_permissions']))"
```

Expected: thirteen origins, and **no `<all_urls>`**.

- [ ] **Step 3: Confirm the guard content script registered on every registry host**

```bash
python -c "import json;m=json.load(open('dist/chrome-mv3/manifest.json'));print(json.dumps(m['content_scripts'],indent=1))"
```

Expected: two content-script entries — the existing `content.js` on ChatGPT and Claude, and `guard.js` on all eight registry hosts.

- [ ] **Step 4: Commit**

```bash
git add code/extension/wxt.config.ts code/extension/dist/
git commit -m "feat(ext): registry host permissions and the three policy origins"
```

---

## Task 9: Emit governance events from the existing gate

**Files:**
- Modify: `code/extension/entrypoints/content.ts`

**Interfaces:**
- Consumes: `messages.PolicyRequest`
- Produces: `pii_block` events when the modal opens on a dirty prompt

Plan C adds `ethics_block`. This task wires the event path that already has something to report.

- [ ] **Step 1: Add the emitter near the top of `content.ts`**

After the existing imports, add:

```typescript
import type { GovernanceEvent } from '../src/policy/types';
import type { PolicyRequest } from '../src/policy/messages';

/** Fire-and-forget. A governance event must never delay the gate, and a policy
 *  service that is down must never stop someone sending a prompt (ADR 0014). */
function emitGovernance(event: GovernanceEvent): void {
  void (chrome.runtime.sendMessage({ kind: 'policy-event', event } satisfies PolicyRequest)
    .catch(() => undefined));
}
```

- [ ] **Step 2: Emit when the modal blocks a dirty prompt**

Inside `onBlocked`, immediately after `if (!promptDirty && !files.hasHeld()) return;`, add:

```typescript
        // I3: the CLASS of each finding and a count. Never the matched text.
        for (const finding of promptDirty ? verdict!.findings : []) {
          emitGovernance({
            host: location.hostname,
            type: 'pii_block',
            category: finding.cls,
            ts: new Date().toISOString(),
          });
        }
```

- [ ] **Step 3: Confirm no finding text can reach the event**

```bash
cd code/extension && grep -n "emitGovernance" entrypoints/content.ts
```

Expected: exactly two hits — the definition and the one call site. Read the call site and confirm the object literal contains `host`, `type`, `category`, `ts` and **nothing else**. `finding.text` must not appear anywhere in it.

- [ ] **Step 4: Run the full test suite**

```bash
npx vitest run && npm run build && npm run check:dist
```

Expected: all tests pass, build succeeds, no dist drift.

- [ ] **Step 5: Commit**

```bash
git add code/extension/entrypoints/content.ts code/extension/dist/
git commit -m "feat(ext): emit pii_block governance events from the send gate"
```

---

## Task 10: Enrolment in the options page

**Files:**
- Modify: `code/extension/entrypoints/options/main.tsx`

**Interfaces:**
- Consumes: `messages.*`, `config.getPolicyBase/setPolicyBase`, `store.clearEnrolment`

- [ ] **Step 1: Rewrite `entrypoints/options/main.tsx`**

```tsx
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { getApiBase, setApiBase } from '../../src/files/config';
import { getPolicyBase, setPolicyBase } from '../../src/policy/config';
import type { PolicyRequest, PolicyResponse } from '../../src/policy/messages';
import { clearEnrolment } from '../../src/policy/store';
import type { Enrolment, Policy } from '../../src/policy/types';

function ask(msg: PolicyRequest): Promise<PolicyResponse> {
  return chrome.runtime.sendMessage(msg) as Promise<PolicyResponse>;
}

function Organisation() {
  const [enrolment, setEnrolment] = useState<Enrolment | null>(null);
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [token, setToken] = useState('');
  const [base, setBase] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    void getPolicyBase().then(setBase);
    void ask({ kind: 'policy-get' }).then((r) => {
      if (r.ok) { setEnrolment(r.enrolment); setPolicy(r.policy); }
    });
  }, []);

  async function join() {
    setError('');
    await setPolicyBase(base);
    const r = await ask({ kind: 'policy-enrol', token: token.trim() });
    if (!r.ok) { setError(r.error); return; }
    setEnrolment(r.enrolment);
    setPolicy(r.policy);
    setToken('');
  }

  async function leave() {
    await clearEnrolment();
    setEnrolment(null);
    setPolicy(null);
  }

  if (enrolment) {
    const approved = policy?.tools.filter((t) => t.status === 'approved').length ?? 0;
    return (
      <section>
        <h2 style="font-size:16px">Organisation</h2>
        <p style="color:#15803d">
          Connected to <strong>{enrolment.org_name}</strong> · {enrolment.department} ·{' '}
          {approved} approved tools · policy v{policy?.version ?? '?'}
        </p>
        <button onClick={leave} style="padding:6px 12px;border:1px solid #cbd5e1;
                border-radius:6px;background:#fff;cursor:pointer">Disconnect</button>
      </section>
    );
  }

  return (
    <section>
      <h2 style="font-size:16px">Organisation</h2>
      <p style="color:#475569">
        Paste the enrolment token your admin gave you. It identifies your department,
        not you — Vanguard never stores your name or email address.
      </p>
      <input
        value={base}
        onInput={(e) => setBase((e.target as HTMLInputElement).value)}
        placeholder="Policy service address"
        style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:6px;margin-bottom:8px"
      />
      <input
        value={token}
        onInput={(e) => setToken((e.target as HTMLInputElement).value)}
        placeholder="ENG-xxxxxxxxxxxx"
        style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:6px"
      />
      <button onClick={join} style="margin-top:12px;padding:8px 14px;border:none;
              border-radius:6px;background:#e11d48;color:#fff;cursor:pointer">Connect</button>
      {error && <p style="color:#b91c1c">{error}</p>}
    </section>
  );
}

function FileService() {
  const [base, setBase] = useState('');
  const [saved, setSaved] = useState(false);
  useEffect(() => { void getApiBase().then(setBase); }, []);
  return (
    <section style="margin-top:32px">
      <h2 style="font-size:16px">File checking</h2>
      <p style="color:#475569">
        Address of the file-checking service. Use <code>http://localhost:8000</code> if you are
        running it yourself, or the shared address your team was given.
      </p>
      <input
        value={base}
        onInput={(e) => { setBase((e.target as HTMLInputElement).value); setSaved(false); }}
        style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:6px"
      />
      <button
        onClick={async () => { await setApiBase(base); setSaved(true); }}
        style="margin-top:12px;padding:8px 14px;border:none;border-radius:6px;
               background:#e11d48;color:#fff;cursor:pointer"
      >Save</button>
      {saved && <span style="margin-left:10px;color:#15803d">Saved</span>}
    </section>
  );
}

function Options() {
  return (
    <div style="font:14px/1.5 system-ui, sans-serif; max-width:560px">
      <h1 style="font-size:18px">Vanguard</h1>
      <Organisation />
      <FileService />
    </div>
  );
}

render(<Options />, document.getElementById('root')!);
```

- [ ] **Step 2: Build and check by hand**

```bash
npm run build
```

Load the extension unpacked, open its options page. Expected: an Organisation section with two fields, and the File checking section unchanged below it. Pasting a token from Plan A's `scripts/seed.py` flips it to *"Connected to Acme Corp · Engineering · 2 approved tools · policy v1"*.

- [ ] **Step 3: Commit**

```bash
git add code/extension/entrypoints/options/main.tsx code/extension/dist/
git commit -m "feat(ext): organisation enrolment in the options page"
```

---

## Task 11: ADR 0031 and the end-to-end walkthrough

**Files:**
- Create: `docs/adr/0031-governance-platform-sequencing-departure.md`
- Create: `code/extension/DEMO.md`

- [ ] **Step 1: Write the ADR**

`docs/adr/0031-governance-platform-sequencing-departure.md`:

```markdown
# ADR 0031 — The governance platform departs from ADR 0016's sequencing

**Date:** 2026-07-19
**Status:** Accepted

## Context

[ADR 0016](0016-mvp-first-sequencing.md) locks the sequence **Slice 1 → team test →
Slice 2 → doc 08**, with B3 parked until both slices land.

The AI governance platform — admin dashboard, LLM approval workflow, ethics
classifier — is neither slice. Worse, an admin dashboard is substantially **the
B3 feature**: it is the compliance officer's console, and B3 was the research
that would have told us whether that officer wants one.

Building it now means building the feature whose demand is unmeasured, using the
argument that it is needed for a case-study pitch.

## Decision

**Proceed, scoped to the pitch deliverable.** ADR 0016's product sequencing is
**not** reversed:

- Slice 2 (file content) is **not cancelled** and not deprioritised.
- B3 remains parked. This work does **not** substitute for it — a dashboard we
  designed is not evidence that a buyer wants that dashboard.
- Doc 08 is still written after both slices, and still ranks B3 first among what
  remains unasked.

## Consequences

- The case study is answerable end to end, on two laptops, with a real approval
  round-trip.
- 🔴 **The B3 gap widens rather than closes.** We now have a console built on our
  own guess about what a compliance officer wants. That is a *stronger* reason to
  run B3, not a weaker one, and doc 08 must say so.
- A future session reading `code/policy/` may conclude the roadmap changed. It
  did not. This ADR is the record.

## Alternatives rejected

**Wait for Slice 2, then build this.** Correct on the roadmap and wrong on the
calendar — the case study has a date and Slice 2 does not.

**Answer the case study with documents alone.** The package already has eight
documents. It has no working approval workflow, and the case study asks for a
system.
```

- [ ] **Step 2: Write the demo runbook**

`code/extension/DEMO.md`:

````markdown
# Two-laptop demo runbook

**Laptop A — admin.** Runs the policy service and the console.
**Laptop B — employee.** Runs Chrome with the extension loaded unpacked.

## Before the day

🔴 **`host_permissions` is baked at build time.** Decide the addresses now.

1. Reserve a LAN IP for laptop A on the hotspot you will use, or set up a named
   `cloudflared` tunnel with a fixed hostname.
2. Put both in `wxt.config.ts` (Task 8), then `npm run build`.
3. Verify from laptop B's browser that `http://<laptop-A>:8001/healthz` returns
   `{"ok": true}` **before** you need it on stage.

## Setup

Laptop A:
```bash
cd code/policy
.venv/Scripts/python scripts/seed.py            # prints the department tokens
.venv/Scripts/python -m uvicorn app.main:app --host 0.0.0.0 --port 8001
```

Laptop B: load `code/extension/dist/chrome-mv3` unpacked, open the options page,
set the policy address to laptop A, paste the **Engineering** token.
Expected: *"Connected to Acme Corp · Engineering · 2 approved tools"*.

## The run

| # | Laptop | Action | What the audience sees |
|---|---|---|---|
| 1 | A | Open the console, sign in as `Acme Corp` / `vanguard` | Eight AI tools, two approved |
| 2 | B | Open `gemini.google.com` | Amber banner: not approved at Acme Corp — **and the page still works** |
| 3 | B | Click Request access, type a reason, send | "Request sent" |
| 4 | A | Requests screen | The row appears within ~3s, with the department |
| 5 | A | Approve | — |
| 6 | B | Do nothing | **The banner disappears on its own within ~5s.** This is the beat. |
| 7 | B | Paste a prompt with an NRIC into ChatGPT | Existing Slice 1 modal blocks it |
| 8 | A | Usage screen | Events by department, tool, and category |

## If the network fails

The extension falls back to its **cached** policy (ADR 0014 — degrade to
advisory, never fail closed), so nothing blocks and nothing crashes. Say so; it
is a designed behaviour, not a save.
````

- [ ] **Step 3: Walk the runbook end to end**

Run every row of the table above against a real Plan A service. Expected: step 6 clears the banner with no reload and no click.

- [ ] **Step 4: Commit**

```bash
git add docs/adr/0031-governance-platform-sequencing-departure.md code/extension/DEMO.md
git commit -m "docs: ADR 0031 sequencing departure and the two-laptop demo runbook"
```

---

## What Plan B does not do

- **No ethics classifier.** `ethics_block` is an accepted event type and nothing produces one yet — **Plan C**.
- **No change to the existing gate, L1, L2, vault, or file pipeline.** Plan B only adds an event emitter to `content.ts`.
- **No push-based policy propagation.** Polling only; spec §9 carries the honest answer.
- **No admin UI in the extension.** Admin authority is server-side, and the console is a separate surface. A second password inside the extension was rejected in brainstorming.
