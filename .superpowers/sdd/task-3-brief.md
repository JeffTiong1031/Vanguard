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
    // CORRECTED BY THE CONTROLLER (verified by execution in this repo's
    // vitest/jsdom): the plan wrote `new Response('', { status: 304 })`, which
    // THROWS "Response constructor: Invalid response status code 304" -- 304 is
    // a null-body status, so an empty-string body is still a body. `null` is
    // required. Use this line exactly as written.
    const second = new Response(null, { status: 304 });
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

