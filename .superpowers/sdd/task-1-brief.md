### Task 1: WXT project that loads unpacked with a committed `dist/`

**Files:**
- Create: `code/extension/package.json`
- Create: `code/extension/wxt.config.ts`
- Create: `code/extension/tsconfig.json`
- Create: `code/extension/entrypoints/background.ts`
- Create: `code/extension/entrypoints/content.ts`

**Interfaces:**
- Consumes: none
- Produces: a buildable WXT extension; `npm run build` writes `dist/chrome-mv3/`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "vanguard-slice1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wxt",
    "build": "wxt build",
    "postbuild": "node scripts/check-dist-drift.mjs --write",
    "check:dist": "node scripts/check-dist-drift.mjs",
    "test": "vitest run"
  },
  "devDependencies": {
    "wxt": "^0.19.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  },
  "dependencies": {
    "@huggingface/transformers": "^3.0.0",
    "preact": "^10.22.0"
  }
}
```

> **`[verify]`** the exact latest WXT (`^0.19`) and transformers.js (`^3`) majors at install time; pin the resolved versions in the lockfile and commit it.

- [ ] **Step 2: Create `wxt.config.ts`**

```ts
import { defineConfig } from 'wxt';

export default defineConfig({
  outDir: 'dist',
  manifest: {
    name: 'Vanguard (Slice 1)',
    description: 'On-device prompt-privacy gate for ChatGPT and Claude. Team test build.',
    version: '0.1.0',
    permissions: ['storage', 'offscreen'],
    host_permissions: ['https://chatgpt.com/*', 'https://claude.ai/*'],
    // No webRequest (ADR 0017 §6.2). No <all_urls>. Two hosts only.
  },
});
```

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
  "extends": "./.wxt/tsconfig.json",
  "compilerOptions": { "strict": true, "noUncheckedIndexedAccess": true }
}
```

- [ ] **Step 4: Minimal `background.ts` and `content.ts` so the build has entrypoints**

```ts
// entrypoints/background.ts
export default defineBackground(() => {
  console.info('[vanguard] background alive');
});
```

```ts
// entrypoints/content.ts
export default defineContentScript({
  matches: ['https://chatgpt.com/*', 'https://claude.ai/*'],
  runAt: 'document_start',
  world: 'ISOLATED',
  main() {
    console.info('[vanguard] content script alive on', location.hostname);
  },
});
```

- [ ] **Step 5: Install and build**

Run:
```bash
cd code/extension && npm install && npm run build
```
Expected: `dist/chrome-mv3/manifest.json` exists; no type errors.

- [ ] **Step 6: Manual load check**

Load `code/extension/dist/chrome-mv3` unpacked in Chrome (Developer mode). Open `chatgpt.com` and `claude.ai`. Expected: `[vanguard] content script alive on chatgpt.com` / `claude.ai` in the page console, and `[vanguard] background alive` in the service-worker console.

- [ ] **Step 7: Commit**

```bash
git add code/extension/package.json code/extension/wxt.config.ts code/extension/tsconfig.json code/extension/entrypoints code/extension/dist code/extension/package-lock.json
git commit -m "feat(ext): WXT scaffold that loads unpacked on ChatGPT and Claude"
```

