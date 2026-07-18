### Task 2: `dist/`-matches-`src/` drift check

**Files:**
- Create: `code/extension/scripts/check-dist-drift.mjs`
- Create: `code/extension/tests/dist-drift.test.ts`

**Interfaces:**
- Consumes: the committed `dist/` and a fresh build
- Produces: `check:dist` exits non-zero when the committed build is stale

> **Why:** a committed build artifact is a second source of truth and drifts silently (ADR 0017 §3). The check is the guard: it rebuilds to a temp dir and compares a manifest of content hashes.

- [ ] **Step 1: Write the failing test**

```ts
// tests/dist-drift.test.ts
import { execFileSync } from 'node:child_process';
import { describe, it, expect } from 'vitest';

describe('dist drift', () => {
  it('committed dist matches a fresh build', () => {
    // check:dist exits 0 when in sync, 1 when stale. A non-zero exit throws.
    expect(() =>
      execFileSync('node', ['scripts/check-dist-drift.mjs'], { cwd: process.cwd() }),
    ).not.toThrow();
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`check-dist-drift.mjs` does not exist yet)

```bash
cd code/extension && npx vitest run tests/dist-drift.test.ts
```

- [ ] **Step 3: Implement `scripts/check-dist-drift.mjs`**

```js
// scripts/check-dist-drift.mjs
// Build to a temp dir, hash every output file, compare to committed dist/chrome-mv3.
// --write mode (postbuild) just refreshes committed dist. Default mode verifies + exits 1 on drift.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync } from 'node:fs';

const COMMITTED = 'dist/chrome-mv3';

function hashTree(root) {
  const out = {};
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else out[relative(root, p).replace(/\\/g, '/')] = createHash('sha256').update(readFileSync(p)).digest('hex');
    }
  };
  walk(root);
  return out;
}

if (process.argv.includes('--write')) process.exit(0); // postbuild already produced dist/

const tmp = mkdtempSync(join(tmpdir(), 'vanguard-build-'));
execFileSync('npx', ['wxt', 'build', '--outDir', tmp], { stdio: 'inherit' });
const fresh = hashTree(join(tmp, 'chrome-mv3'));
const committed = hashTree(COMMITTED);

const keys = new Set([...Object.keys(fresh), ...Object.keys(committed)]);
const drift = [...keys].filter((k) => fresh[k] !== committed[k]);
if (drift.length) {
  console.error('dist/ is stale. Run `npm run build` and commit. Drifted:\n' + drift.join('\n'));
  process.exit(1);
}
console.log('dist/ matches a fresh build.');
```

> **`[verify]`** WXT's `--outDir` flag name at implementation; if absent, set `outDir` via env or a second config. The hashing logic is stable regardless.

- [ ] **Step 4: Run — expect PASS**

```bash
cd code/extension && npm run build && npx vitest run tests/dist-drift.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add code/extension/scripts/check-dist-drift.mjs code/extension/tests/dist-drift.test.ts code/extension/vitest.config.ts
git commit -m "feat(ext): fail CI when committed dist drifts from src"
```

---

## Phase 1 — L2 in the offscreen document (the U22 risk, hit early)

