### Task 4: Extension sends the bearer token

**Files:**
- Modify: `code/extension/src/files/config.ts` (add `DEMO_TOKEN`; change `DEFAULT_BASE`)
- Modify: `code/extension/src/files/api.ts` (send `Authorization` on `/v1/extract` and `/v1/redact`)
- Test: `code/extension/tests/files/api.test.ts` (add header assertions)

**Interfaces:**
- Consumes: `getApiBase()` (unchanged).
- Produces: `DEMO_TOKEN: string` exported from `config.ts`; both file requests carry `Authorization: Bearer ${DEMO_TOKEN}`. `DEFAULT_BASE` points at the hosted HTTPS origin (placeholder until Task 7).

- [ ] **Step 1: Write the failing tests**

Append to `code/extension/tests/files/api.test.ts` (inside the file, after the existing `describe('extractFile', ...)` block — reuse the file's existing `mockFetch`, `okBody`, and imports):

```ts
describe('demo bearer token', () => {
  it('sends Authorization: Bearer on extract', async () => {
    const spy = mockFetch(200, okBody);
    vi.stubGlobal('fetch', spy);
    await extractFile(new File(['x'], 'a.txt'));
    const init = spy.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toMatch(/^Bearer .+/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd code/extension && npx vitest run tests/files/api.test.ts`
Expected: FAIL — `headers.Authorization` is `undefined` (extract currently sends only `x-vanguard-filename`).

- [ ] **Step 3: Add the token constant and hosted default in `config.ts`**

In `code/extension/src/files/config.ts`, change the `DEFAULT_BASE` line:

```ts
// Path A demo host (Render). Local dev: set `vg_api_base` in Options to http://localhost:8000.
// Replaced with the real onrender.com URL at deploy time (Task 7).
const DEFAULT_BASE = 'https://vanguard-extract.onrender.com';
```

And add, near the top of the file (after the `CLIENT_LIMITS` block):

```ts
/**
 * Shared demo bearer token, baked into the team-test build. Path A only, NOT a
 * secret (it ships in the private repo build) -- a casual-abuse deterrent for the
 * public host. Must equal VANGUARD_DEMO_TOKEN in the Render environment.
 * See docs/superpowers/specs/2026-07-21-hosted-demo-file-backend-design.md.
 * Replaced with the real value at deploy time (Task 7).
 */
export const DEMO_TOKEN = 'REPLACE_WITH_DEMO_TOKEN';
```

- [ ] **Step 4: Send the header on both requests in `api.ts`**

In `code/extension/src/files/api.ts`, change the import line:

```ts
import { CLIENT_LIMITS, DEMO_TOKEN, getApiBase } from './config';
```

In `extractFile`, change the `fetch` `headers` object:

```ts
      headers: {
        'x-vanguard-filename': encodeURIComponent(file.name),
        Authorization: `Bearer ${DEMO_TOKEN}`,
      },
```

In `redactFile`, add a `headers` field to the `/v1/redact` fetch (it currently has none):

```ts
    response = await fetch(`${base}/v1/redact`, {
      method: 'POST',
      body,
      signal: abort.signal,
      headers: { Authorization: `Bearer ${DEMO_TOKEN}` },
    });
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd code/extension && npx vitest run tests/files/api.test.ts`
Expected: PASS (existing api tests + the new bearer test).

- [ ] **Step 6: Commit**

```bash
git add code/extension/src/files/config.ts code/extension/src/files/api.ts code/extension/tests/files/api.test.ts
git commit -m "feat(ext): send shared demo bearer token on file routes; default to hosted API"
```

---

