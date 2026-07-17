# Slice 1 — Chat-Text Prompt-Privacy Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The smallest extension the founder's team can clone → Load unpacked → use on ChatGPT and Claude, that detects sensitive spans as the user types or pastes (L1 deterministic + L2 on-device NER **together**), blocks the send, shows a modal with the rewrite, and lets the user press Send themselves — with no rehydration, no auto-submit, and no raw prompt leaving the device.

**Architecture:** MV3 extension built with **WXT** (committed `dist/` so the team needs no toolchain). An **ISOLATED-world content script** registered at `document_start` runs the gate (a `window` capture-phase listener, U12-proven), the site adapters (ChatGPT + Claude), and the Preact modal in a shadow root. Detection runs in two layers: **L1** deterministic detectors (pure functions, sub-ms) and **L2** a stock multilingual NER model (**transformers.js**) in an **offscreen document**. A synchronous **verdict cache** keyed on `hash(composer text)` is what the gate reads at Send time; typing debounce-scans warm it, paste preempts it. On DIRTY, the modal opens, the adapter writes the rewritten text into the composer, and a **single-use approval token** bound to `hash(rewritten)` lets the user's own Send through.

**Tech Stack:** WXT, TypeScript (strict), Preact (shadow-root modal), `@huggingface/transformers` (transformers.js v3, WASM backend), Vitest (unit), `chrome.offscreen`, `chrome.storage.local`, `crypto.subtle` (SHA-256).

## Global Constraints

Copied verbatim from ADR 0016/0017 and CLAUDE.md §8; every task's requirements implicitly include these.

- **No auto-submit, ever (decision #8).** The user always presses Send. The extension never dispatches a submit/Enter/click programmatically.
- **No rehydration (E2).** Once a value is replaced, the extension never writes the original back into the provider's page. There is no de-pseudonymization path in Slice 1.
- **Raw prompts never reach any server (decision #2).** All scanning is on-device. Slice 1 has **no backend**. The only network call is the first-run model-weights fetch, which carries no user data.
- **Monotonic toward dirty (ADR 0013).** L1 may mark a verdict DIRTY alone; **only a completed L1+L2 scan may mark it CLEAN.** A cache entry never moves DIRTY → CLEAN except via a full scan.
- **Degrade to advisory, never fail-closed (ADR 0014).** A dead/timed-out engine surfaces "protection degraded" and lets the send through; it never blocks indefinitely.
- **I3 / decision #5:** audit records are **class + count + salted-hash fingerprint**, never the typed value. **U26 is a review gate:** no raw `key` values, no raw spans, no payloads in any persisted store or log.
- **L1 owns identifier digits (ADR 0004, doc 03 §3.2).** The `1+1` guardrail (ADR 0017 §5) is a review gate: L1 matches identifier grammars, never the presence of digits.
- **LOC is OFF; PERSON + ORG mask AND open the modal (ADR 0017 §5).** A silent mask is forbidden.
- **transformers.js, not raw ORT-web, for Slice 1 (ADR 0017 §6.1).** Raw ORT + hand-rolled tokenizer is deliberate post-team-test rework, not a Slice 1 blocker.
- **The log-only send observer is OUT of Slice 1 (ADR 0017 §6.2).**
- **Real ADR 0009 crypto is OUT; the staged POC chapters are a separate follow-on plan (ADR 0017 §6.3, §7).** This plan builds the REAL path only.
- **Every number is cited, `(estimate)`, or `(unverified)`.** Prefer a gap over a fabrication.
- **No `Co-Authored-By` trailer** on commits (CLAUDE.md §6.1).

## Decisions locked for this plan

| | Decision | Source |
|---|---|---|
| Build tool | **WXT**, `outDir: dist`, **committed `dist/` + a `dist`-matches-`src` drift check** | ADR 0017 §3 |
| L2 runtime | **transformers.js** (is ORT-web underneath) | ADR 0017 §6.1 |
| L2 model | **`Xenova/bert-base-multilingual-cased-ner-hrl`** (mBERT NER; labels PER/ORG/LOC/MISC), int8/quantized ONNX, **hash-pinned before load** | ADR 0017 §1, doc 05 §7 |
| L1 set | **NRIC · SSM (+`NRIC_OR_SSM_AMBIGUOUS`) · LHDN TIN · email · credit-card (Luhn)** | ADR 0017 §6.4 |
| Gate | **`window` capture-phase, `composedPath()`, `isComposing` pass-through** | ADR 0010, U12-a/b ✅ |
| Surfaces | **ChatGPT (`chatgpt.com`) + Claude (`claude.ai`)** | E1 |
| Storage | **in-memory session map + `chrome.storage.local` salted-hash audit**; no DEK, no vault | ADR 0017 §6.3 |

## File structure

```text
code/extension/
  package.json                      # WXT scripts + deps
  wxt.config.ts                     # manifest, permissions, outDir: dist
  tsconfig.json                     # strict
  vitest.config.ts
  dist/chrome-mv3/                  # COMMITTED build output (team loads this)
  scripts/
    check-dist-drift.mjs            # dist matches a fresh build?
    build-model-manifest.mjs        # SHA-256 of pinned model files -> models.manifest.json
  models.manifest.json              # {file: sha256} for the pinned L2 model
  entrypoints/
    background.ts                   # SW: offscreen lifecycle + message router
    content.ts                      # ISOLATED, document_start: gate + adapters + modal mount
    offscreen/
      index.html
      main.ts                       # transformers.js NER pipeline + hash-pinned load
  src/
    detection/
      l1/
        nric.ts  ssm.ts  tin.ts  email.ts  card.ts
        index.ts                    # runL1(text) -> Finding[]
        types.ts                    # Finding, FindingClass
      l2/
        client.ts                   # content-side: ask offscreen to scan -> Finding[]
        messages.ts                 # typed offscreen <-> content message contract
      scan.ts                       # orchestrate L1+L2 -> Verdict; monotonic-toward-dirty
      verdict-cache.ts              # hash(text) -> Verdict; sync read
      hash.ts                       # sha256Hex, saltedFingerprint
    mask/
      numbering.ts                  # in-memory monotonic session numbering
      placeholder.ts                # placeholder grammar (PERSON_1 ...) + rewrite
    gate/
      gate.ts                       # window capture listener; sync verdict read; approval-token match
      approval-token.ts             # single-use, hash-bound, TTL, idempotent
    adapters/
      types.ts                      # SurfaceAdapter interface
      chatgpt.ts  claude.ts
      registry.ts                   # pick adapter by hostname
    ui/
      modal.tsx                     # Preact modal in a shadow root
      mount.ts                      # shadow-root host + lifecycle
    audit/
      audit.ts                      # class+count+salted-hash -> chrome.storage.local
    util/
      debounce.ts  logger.ts
  tests/                            # Vitest mirrors src/
```

## Phase map — walking skeleton first, loadable at every phase boundary

| Phase | Delivers | Loadable? |
|---|---|---|
| **0 — Scaffold** | WXT project, committed `dist/`, drift check, offscreen bootstrap | ✅ extension loads, logs on both surfaces |
| **1 — L2 in offscreen** | hash-pinned transformers.js NER; content↔offscreen scan RPC | ✅ scan a string → PERSON/ORG spans |
| **2 — L1 detectors** | pure-function NRIC/SSM/TIN/email/card + the `1+1` guardrail | ✅ (unit only; no UI change) |
| **3 — Gate + adapters + scan** | `window` gate, verdict cache, ChatGPT+Claude adapters, typing+paste orchestration | ✅ dirty prompt is blocked at Send |
| **4 — Mask + modal + token** | numbering, rewrite, Preact modal, approval token, Ignore | ✅ **the full real flow** |
| **5 — Audit + acceptance** | salted-hash audit, Ignore-rate, end-to-end acceptance | ✅ **Slice 1 accepted** |

The two estimate-blowup risks (ADR 0017 §Consequences) are hit **early and on a thin path**: **U22** (WASM threads in the offscreen doc) in Phase 1, the **D4 adapters** in Phase 3.

---

## Phase 0 — Scaffold

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

### Task 3: hash-pinned transformers.js NER in an offscreen document

**Files:**
- Create: `code/extension/src/detection/l2/messages.ts`
- Create: `code/extension/entrypoints/offscreen/index.html`
- Create: `code/extension/entrypoints/offscreen/main.ts`
- Create: `code/extension/scripts/build-model-manifest.mjs`
- Create: `code/extension/models.manifest.json`
- Modify: `code/extension/entrypoints/background.ts`
- Create: `code/extension/src/detection/l2/client.ts`
- Create: `code/extension/tests/l2-messages.test.ts`

**Interfaces:**
- Consumes: none from earlier tasks
- Produces:
  - `type L2Entity = { type: 'PERSON' | 'ORG'; start: number; end: number; text: string }`
  - `type ScanRequest = { kind: 'l2-scan'; id: string; text: string }`
  - `type ScanResponse = { kind: 'l2-result'; id: string; ok: true; entities: L2Entity[] } | { kind: 'l2-result'; id: string; ok: false; error: string }`
  - `async function l2Scan(text: string, timeoutMs: number): Promise<L2Entity[] | 'degraded'>` (content-side, in `l2/client.ts`)

> **U22 is resolved here, on the thin path (ADR 0017 §Consequences):** the offscreen document is a **Window** context, so it can use WASM. **Baseline = single-threaded WASM** (`numThreads = 1`), which needs **no** COOP/COEP and no `SharedArrayBuffer`. Multi-threading is an opportunistic optimisation, not a Slice 1 requirement. If load or latency is unacceptable single-threaded, that is a **measured finding** for the follow-on, not a reason to block.

- [ ] **Step 1: Define the typed message contract + a failing test**

```ts
// src/detection/l2/messages.ts
export type L2Entity = { type: 'PERSON' | 'ORG'; start: number; end: number; text: string };
export type ScanRequest = { kind: 'l2-scan'; id: string; text: string };
export type ScanResponse =
  | { kind: 'l2-result'; id: string; ok: true; entities: L2Entity[] }
  | { kind: 'l2-result'; id: string; ok: false; error: string };

// mBERT-NER emits PER/ORG/LOC/MISC. Slice 1 keeps PER->PERSON and ORG only (ADR 0017 §5: LOC off).
const KEEP: Record<string, L2Entity['type'] | undefined> = { PER: 'PERSON', ORG: 'ORG' };

export type RawNerToken = { entity: string; start: number; end: number; word: string };

// Merge B-/I- token tags into whole-entity spans. transformers.js token-classification with
// `aggregation_strategy` can do this, but we merge ourselves so the contract is stable across versions.
export function mergeNerTokens(tokens: RawNerToken[]): L2Entity[] {
  const out: L2Entity[] = [];
  let cur: L2Entity | null = null;
  for (const t of tokens) {
    const [tag, rawLabel] = t.entity.split('-') as ['B' | 'I', string];
    const label = KEEP[rawLabel];
    if (!label) { cur = null; continue; }
    if (tag === 'B' || !cur || cur.type !== label) {
      cur = { type: label, start: t.start, end: t.end, text: t.word };
      out.push(cur);
    } else {
      cur.end = t.end;
      cur.text += t.word.startsWith('##') ? t.word.slice(2) : t.word;
    }
  }
  return out;
}
```

```ts
// tests/l2-messages.test.ts
import { describe, it, expect } from 'vitest';
import { mergeNerTokens } from '../src/detection/l2/messages';

describe('mergeNerTokens', () => {
  it('merges B-/I- PER tokens into one PERSON span and drops LOC', () => {
    const merged = mergeNerTokens([
      { entity: 'B-PER', start: 13, end: 18, word: 'Ahmad' },
      { entity: 'I-PER', start: 19, end: 22, word: 'Ali' },
      { entity: 'B-LOC', start: 30, end: 36, word: 'Penang' },
    ]);
    expect(merged).toEqual([{ type: 'PERSON', start: 13, end: 22, text: 'Ahmad Ali' }]);
  });

  it('keeps ORG and separates adjacent entities of different type', () => {
    const merged = mergeNerTokens([
      { entity: 'B-ORG', start: 0, end: 5, word: 'Apple' },
      { entity: 'B-PER', start: 6, end: 9, word: 'Tim' },
    ]);
    expect(merged.map((m) => m.type)).toEqual(['ORG', 'PERSON']);
  });
});
```

> The `text` reconstruction above is approximate (word-piece joining varies by tokenizer). **Downstream never trusts `text` for masking — it uses `start`/`end` against the real composer string.** `text` is for the audit fingerprint and the modal preview only.

- [ ] **Step 2: Run — expect FAIL**

```bash
cd code/extension && npx vitest run tests/l2-messages.test.ts
```

- [ ] **Step 3: Implement the offscreen HTML + pipeline**

```html
<!-- entrypoints/offscreen/index.html -->
<!doctype html>
<html><head><meta charset="utf-8" /></head>
<body><script type="module" src="./main.ts"></script></body></html>
```

```ts
// entrypoints/offscreen/main.ts
import { pipeline, env, type TokenClassificationPipeline } from '@huggingface/transformers';
import type { ScanRequest, ScanResponse, RawNerToken } from '../../src/detection/l2/messages';
import { mergeNerTokens } from '../../src/detection/l2/messages';
import { verifyPinnedModel } from '../../src/detection/l2/pin';

const MODEL_ID = 'Xenova/bert-base-multilingual-cased-ner-hrl';

env.allowLocalModels = false;
env.useBrowserCache = true;
// U22 baseline: single-thread WASM, no COOP/COEP, no SharedArrayBuffer.
env.backends.onnx.wasm.numThreads = 1;

let nerPromise: Promise<TokenClassificationPipeline> | null = null;
async function getNer(): Promise<TokenClassificationPipeline> {
  if (!nerPromise) {
    nerPromise = (async () => {
      await verifyPinnedModel(MODEL_ID); // throws on hash mismatch; seeds the browser cache
      return (await pipeline('token-classification', MODEL_ID, { quantized: true })) as TokenClassificationPipeline;
    })();
  }
  return nerPromise;
}

chrome.runtime.onMessage.addListener((msg: ScanRequest, _sender, sendResponse) => {
  if (msg?.kind !== 'l2-scan') return;
  (async () => {
    try {
      const ner = await getNer();
      const raw = (await ner(msg.text)) as unknown as RawNerToken[];
      const entities = mergeNerTokens(raw);
      sendResponse({ kind: 'l2-result', id: msg.id, ok: true, entities } satisfies ScanResponse);
    } catch (e) {
      sendResponse({ kind: 'l2-result', id: msg.id, ok: false, error: String(e) } satisfies ScanResponse);
    }
  })();
  return true; // async sendResponse
});
```

- [ ] **Step 4: Implement hash-pinned verification (`src/detection/l2/pin.ts`)**

```ts
// src/detection/l2/pin.ts
// Verify each pinned model file's SHA-256 BEFORE transformers.js loads it, then seed the browser
// Cache so transformers.js reads our verified bytes instead of re-fetching (doc 05 §7; ADR 0017 weights row).
import manifest from '../../../models.manifest.json';

// transformers.js requests files under this URL shape. [verify] the exact host/template at impl.
const HOST = 'https://huggingface.co';
const fileUrl = (modelId: string, file: string) => `${HOST}/${modelId}/resolve/main/${file}`;

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyPinnedModel(modelId: string): Promise<void> {
  const files = (manifest as Record<string, Record<string, string>>)[modelId];
  if (!files) throw new Error(`no pin manifest for ${modelId}`);
  const cache = await caches.open('transformers-cache');
  for (const [file, expected] of Object.entries(files)) {
    const url = fileUrl(modelId, file);
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`fetch ${file} failed: ${res.status}`);
    const bytes = await res.clone().arrayBuffer();
    const got = await sha256Hex(bytes);
    if (got !== expected) throw new Error(`hash mismatch for ${file}: ${got} != ${expected}`);
    await cache.put(url, new Response(bytes, { headers: res.headers }));
  }
}
```

> **`[verify]` at implementation:** the exact URL template transformers.js v3 uses and whether it reads from `caches.open('transformers-cache')`. If its cache key differs, seed under that key. The **verification logic is the invariant**; the cache-seeding is the mechanism and may need one adjustment against the live library.

- [ ] **Step 5: Implement the manifest builder + generate `models.manifest.json`**

```js
// scripts/build-model-manifest.mjs — run once to pin, re-run to re-pin on a deliberate model bump.
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const MODEL = 'Xenova/bert-base-multilingual-cased-ner-hrl';
const FILES = ['config.json', 'tokenizer.json', 'tokenizer_config.json', 'onnx/model_quantized.onnx'];
const HOST = 'https://huggingface.co';

const out = { [MODEL]: {} };
for (const f of FILES) {
  const r = await fetch(`${HOST}/${MODEL}/resolve/main/${f}`);
  if (!r.ok) throw new Error(`${f}: ${r.status}`);
  out[MODEL][f] = createHash('sha256').update(Buffer.from(await r.arrayBuffer())).digest('hex');
  console.log(f, out[MODEL][f]);
}
writeFileSync('models.manifest.json', JSON.stringify(out, null, 2) + '\n');
```

Run:
```bash
cd code/extension && node scripts/build-model-manifest.mjs
```
Expected: `models.manifest.json` written with a SHA-256 per file. **`[verify]` the exact filenames** (`model_quantized.onnx` path) against the model repo.

- [ ] **Step 6: Wire the offscreen lifecycle in `background.ts`**

```ts
// entrypoints/background.ts
import type { ScanRequest, ScanResponse } from '../src/detection/l2/messages';

const OFFSCREEN_URL = 'offscreen.html'; // [verify] WXT output path for the offscreen entrypoint

async function ensureOffscreen(): Promise<void> {
  const has = await chrome.offscreen.hasDocument?.();
  if (has) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: [chrome.offscreen.Reason.WORKERS],
    justification: 'Run on-device NER inference in a WASM worker; no data leaves the device.',
  });
}

export default defineBackground(() => {
  chrome.runtime.onMessage.addListener((msg: ScanRequest, _s, sendResponse) => {
    if (msg?.kind !== 'l2-scan') return;
    (async () => {
      await ensureOffscreen();
      const res = (await chrome.runtime.sendMessage(msg)) as ScanResponse;
      sendResponse(res);
    })();
    return true;
  });
});
```

> Offscreen documents can be reclaimed; `ensureOffscreen()` recreates on demand (ADR 0006). The SW routes content→offscreen because content scripts cannot message an offscreen document directly.

- [ ] **Step 7: Implement the content-side client with a timeout → degraded (ADR 0014)**

```ts
// src/detection/l2/client.ts
import type { L2Entity, ScanRequest, ScanResponse } from './messages';

export async function l2Scan(text: string, timeoutMs: number): Promise<L2Entity[] | 'degraded'> {
  const id = crypto.randomUUID();
  const req: ScanRequest = { kind: 'l2-scan', id, text };
  const timeout = new Promise<'degraded'>((r) => setTimeout(() => r('degraded'), timeoutMs));
  const call = chrome.runtime.sendMessage(req).then((res: ScanResponse) =>
    res.ok ? res.entities : ('degraded' as const),
  ).catch(() => 'degraded' as const);
  return Promise.race([call, timeout]);
}
```

> **`timeoutMs` is passed in, never a constant here** (doc 06: latency is a function of chunk count). Phase 3's orchestrator owns the value and derives it; Slice 1 uses a generous `(estimate)` team-test value and records the measured curve (U6-b) rather than asserting a threshold.

- [ ] **Step 8: Build, load, and smoke-test the scan end to end**

Add a temporary dev hook (removed in Phase 3): in `content.ts`, `window.__vgScan = (t) => chrome.runtime.sendMessage({ kind: 'l2-scan', id: '1', text: t })`. Reload the extension, open ChatGPT, run in the page console:
```js
await window.__vgScan('Please email Ahmad about the Apple deal')
```
Expected: `{ ok: true, entities: [ {type:'PERSON',...}, {type:'ORG',...} ] }`. First call downloads + verifies weights (slow, once); later calls are fast.

- [ ] **Step 9: Commit**

```bash
git add code/extension/entrypoints/offscreen code/extension/entrypoints/background.ts code/extension/src/detection/l2 code/extension/scripts/build-model-manifest.mjs code/extension/models.manifest.json code/extension/tests/l2-messages.test.ts code/extension/dist
git commit -m "feat(ext): hash-pinned transformers.js NER in an offscreen document"
```

---

## Phase 2 — L1 deterministic detectors (pure functions; the `1+1` guardrail lives here)

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

### Task 5: hash + verdict cache (synchronous read is the whole point)

**Files:**
- Create: `code/extension/src/detection/hash.ts`
- Create: `code/extension/src/detection/verdict-cache.ts`
- Create: `code/extension/tests/verdict-cache.test.ts`

**Interfaces:**
- Consumes: `Finding` from `l1/types`
- Produces:
  - `async function sha256Hex(s: string): Promise<string>`
  - `function saltedFingerprint(text: string, salt: string): Promise<string>`
  - `type Verdict = { state: 'CLEAN' | 'DIRTY'; findings: Finding[]; complete: boolean }`
  - `class VerdictCache { getSync(hash: string): Verdict | undefined; setDirty(hash, findings): void; setClean(hash, findings): void }`

> **The gate cannot `await` (decision #8, doc 01 §0), so the cache read is synchronous.** The hash is computed by the debounce-scanner ahead of time; at Send the gate hashes the current composer text (sync-cached hashing is fine — the string is short) and reads the verdict. **Monotonic toward dirty (ADR 0013):** `setClean` only lands if no DIRTY entry already exists for that hash.

- [ ] **Step 1: Failing test for the monotonic rule**

```ts
// tests/verdict-cache.test.ts
import { describe, it, expect } from 'vitest';
import { VerdictCache } from '../src/detection/verdict-cache';

describe('VerdictCache monotonic-toward-dirty', () => {
  it('setClean does not overwrite an existing DIRTY (ADR 0013)', () => {
    const c = new VerdictCache();
    c.setDirty('h', [{ cls: 'NRIC', start: 0, end: 1, text: 'x' }]);
    c.setClean('h', []);
    expect(c.getSync('h')!.state).toBe('DIRTY');
  });
  it('a fresh hash is undefined (cold cache -> caller must treat as unknown)', () => {
    expect(new VerdictCache().getSync('nope')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Implement `hash.ts` and `verdict-cache.ts`**

```ts
// src/detection/hash.ts
export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export async function saltedFingerprint(text: string, salt: string): Promise<string> {
  return (await sha256Hex(salt + ' ' + text)).slice(0, 16); // 64-bit prefix; never reversible to text
}
```

```ts
// src/detection/verdict-cache.ts
import type { Finding } from './l1/types';
export type Verdict = { state: 'CLEAN' | 'DIRTY'; findings: Finding[]; complete: boolean };

export class VerdictCache {
  private m = new Map<string, Verdict>();
  getSync(hash: string): Verdict | undefined { return this.m.get(hash); }
  setDirty(hash: string, findings: Finding[]): void {
    this.m.set(hash, { state: 'DIRTY', findings, complete: false });
  }
  setClean(hash: string, findings: Finding[]): void {
    if (this.m.get(hash)?.state === 'DIRTY') return; // monotonic: never DIRTY -> CLEAN except via full scan
    this.m.set(hash, { state: 'CLEAN', findings, complete: true });
  }
  markComplete(hash: string): void {
    const v = this.m.get(hash); if (v) v.complete = true;
  }
}
```

- [ ] **Step 3: Run — expect PASS**, then **Step 4: Commit**

```bash
cd code/extension && npx vitest run tests/verdict-cache.test.ts
git add code/extension/src/detection/hash.ts code/extension/src/detection/verdict-cache.ts code/extension/tests/verdict-cache.test.ts
git commit -m "feat(ext): synchronous verdict cache, monotonic toward dirty"
```

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

### Task 7: the gate — `window` capture, `composedPath`, `isComposing`

**Files:**
- Create: `code/extension/src/gate/gate.ts`
- Create: `code/extension/tests/gate.test.ts`

**Interfaces:**
- Consumes: `VerdictCache`, `sha256Hex`, an `ApprovalStore` (Task 11), a `getComposerText(): string | null`
- Produces: `function installGate(deps: GateDeps): void` where `GateDeps = { cache, getComposerText, isSendIntent, onBlocked, approvals }`

> **Ported from the U12 spike, which proved the mechanism (U12-a/b ✅).** The gate registers a `window` capture-phase `keydown` **and** `click` listener at `document_start`. It reads the verdict **synchronously**. IME composition Enters pass through (`isComposing` — U12-b). On DIRTY with no valid approval token, it calls `stopImmediatePropagation()` + `preventDefault()` and invokes `onBlocked`.

- [ ] **Step 1: Failing test (a DIRTY verdict blocks; an approved hash passes)**

```ts
// tests/gate.test.ts
import { describe, it, expect, vi } from 'vitest';
import { decideGate } from '../src/gate/gate';
import { VerdictCache } from '../src/detection/verdict-cache';

describe('decideGate (pure core of the listener)', () => {
  it('blocks when the current text is DIRTY and unapproved', () => {
    const c = new VerdictCache(); c.setDirty('h', [{ cls: 'NRIC', start: 0, end: 1, text: 'x' }]);
    expect(decideGate({ hash: 'h', cache: c, approvedHash: null })).toBe('BLOCK');
  });
  it('passes when the DIRTY text has a matching approval', () => {
    const c = new VerdictCache(); c.setDirty('h', []);
    expect(decideGate({ hash: 'h', cache: c, approvedHash: 'h' })).toBe('PASS');
  });
  it('passes CLEAN', () => {
    const c = new VerdictCache(); c.setClean('h', []);
    expect(decideGate({ hash: 'h', cache: c, approvedHash: null })).toBe('PASS');
  });
  it('blocks UNKNOWN (cold cache) to stay fail-safe until a scan lands', () => {
    expect(decideGate({ hash: 'cold', cache: new VerdictCache(), approvedHash: null })).toBe('BLOCK');
  });
});
```

> **The cold-cache decision is a real design call:** an unknown hash BLOCKs (fail-safe) but the block is immediately resolved by the modal, which triggers a scan — so the user is never stuck, they just see the modal once while the first scan completes. This is the paste path (cache cold by construction, doc 06 §1). It is **not** fail-closed (ADR 0014): the modal always offers a path forward.

- [ ] **Step 2: Implement `decideGate` (pure) + `installGate` (listener)**

```ts
// src/gate/gate.ts
import type { VerdictCache } from '../detection/verdict-cache';

export function decideGate(a: { hash: string; cache: VerdictCache; approvedHash: string | null }): 'PASS' | 'BLOCK' {
  if (a.approvedHash === a.hash) return 'PASS';
  const v = a.cache.getSync(a.hash);
  if (!v) return 'BLOCK';               // cold cache -> modal resolves it
  return v.state === 'CLEAN' ? 'PASS' : 'BLOCK';
}

export type GateDeps = {
  cache: VerdictCache;
  getComposerText: (path: EventTarget[]) => string | null;
  isSendIntent: (e: Event, path: EventTarget[]) => boolean;
  hashOf: (text: string) => string;          // sync hash lookup memoized by the scanner
  approvedHash: () => string | null;
  onBlocked: (text: string) => void;
};

export function installGate(deps: GateDeps): void {
  const handler = (e: KeyboardEvent | MouseEvent) => {
    if (e.eventPhase !== Event.CAPTURING_PHASE) return;
    if (e instanceof KeyboardEvent && e.isComposing) return; // U12-b: IME commit, not a send
    const path = e.composedPath();
    if (!deps.isSendIntent(e, path)) return;
    const text = deps.getComposerText(path);
    if (text == null) return;
    const decision = decideGate({ hash: deps.hashOf(text), cache: deps.cache, approvedHash: deps.approvedHash() });
    if (decision === 'BLOCK') {
      e.stopImmediatePropagation();
      e.preventDefault();
      deps.onBlocked(text);
    }
  };
  window.addEventListener('keydown', handler, { capture: true });
  window.addEventListener('click', handler, { capture: true });
}
```

> **`hashOf` is synchronous:** the scanner keeps a `Map<text, hash>` warmed alongside the verdict cache, so the gate never awaits `crypto.subtle`. On a cold hash the map returns a sentinel that is not in the cache → `decideGate` BLOCKs → modal. This keeps decision #8's synchronous invariant.

- [ ] **Step 3: PASS + commit**

```bash
cd code/extension && npx vitest run tests/gate.test.ts
git add code/extension/src/gate/gate.ts code/extension/tests/gate.test.ts
git commit -m "feat(ext): window-capture gate with sync verdict read and IME pass-through"
```

### Task 8: site adapters — ChatGPT and Claude

**Files:**
- Create: `code/extension/src/adapters/types.ts`
- Create: `code/extension/src/adapters/{chatgpt,claude,registry}.ts`
- Create: `code/extension/tests/adapters.test.ts`

**Interfaces:**
- Consumes: none
- Produces:
  - `type SurfaceAdapter = { host: string; getComposer(): HTMLElement | null; readText(): string | null; writeText(t: string): void; isSendControl(path: EventTarget[]): boolean; onPaste(cb: (text: string) => void): void }`
  - `function pickAdapter(hostname: string): SurfaceAdapter | null`

> 🔴 **This is the D4-volatile task (doc 05 §4.4). Selectors are `[verify against live DOM]` and are the first thing to break.** U12 proved the **gate**, not these. Each adapter has a `getComposer()` that tries an ordered list of selectors and a paste hook. The self-test in Step 4 is how a broken adapter is caught fast rather than failing open.

- [ ] **Step 1: The interface + a registry test (host routing is stable; selectors are not)**

```ts
// src/adapters/types.ts
export type SurfaceAdapter = {
  host: string;
  getComposer(): HTMLElement | null;
  readText(): string | null;
  writeText(text: string): void;
  isSendControl(path: EventTarget[]): boolean;
  onPaste(cb: (text: string) => void): void;
};
```

```ts
// tests/adapters.test.ts
import { describe, it, expect } from 'vitest';
import { pickAdapter } from '../src/adapters/registry';

describe('adapter registry', () => {
  it('routes chatgpt.com', () => expect(pickAdapter('chatgpt.com')?.host).toBe('chatgpt.com'));
  it('routes claude.ai', () => expect(pickAdapter('claude.ai')?.host).toBe('claude.ai'));
  it('returns null off-surface', () => expect(pickAdapter('example.com')).toBeNull());
});
```

- [ ] **Step 2: Implement the two adapters (selectors tagged for live verification)**

```ts
// src/adapters/chatgpt.ts   [verify all selectors against live chatgpt.com DOM]
import type { SurfaceAdapter } from './types';
const COMPOSER = ['#prompt-textarea', 'div[contenteditable="true"]'];
const SEND = ['button[data-testid="send-button"]', 'button[aria-label*="Send" i]'];

export const chatgptAdapter: SurfaceAdapter = {
  host: 'chatgpt.com',
  getComposer() { for (const s of COMPOSER) { const el = document.querySelector<HTMLElement>(s); if (el) return el; } return null; },
  readText() { return this.getComposer()?.innerText ?? null; },
  writeText(text) {
    const el = this.getComposer(); if (!el) return;
    el.focus(); el.textContent = text;
    el.dispatchEvent(new InputEvent('input', { bubbles: true })); // let the app's state sync
    const r = document.createRange(); r.selectNodeContents(el); r.collapse(false);
    const sel = getSelection(); sel?.removeAllRanges(); sel?.addRange(r); // caret to end (doc 05 §6)
  },
  isSendControl(path) {
    return path.some((n) => n instanceof Element && SEND.some((s) => n.matches?.(s) || n.closest?.(s)));
  },
  onPaste(cb) {
    document.addEventListener('paste', (e) => {
      const t = e.clipboardData?.getData('text'); if (t) cb(t);
    }, true);
  },
};
```

```ts
// src/adapters/claude.ts   [verify all selectors against live claude.ai DOM]
import type { SurfaceAdapter } from './types';
const COMPOSER = ['div[contenteditable="true"].ProseMirror', 'div[contenteditable="true"]'];
const SEND = ['button[aria-label*="Send" i]', 'button[data-testid*="send" i]'];

export const claudeAdapter: SurfaceAdapter = {
  host: 'claude.ai',
  getComposer() { for (const s of COMPOSER) { const el = document.querySelector<HTMLElement>(s); if (el) return el; } return null; },
  readText() { return this.getComposer()?.innerText ?? null; },
  writeText(text) {
    const el = this.getComposer(); if (!el) return;
    el.focus(); el.textContent = text;
    el.dispatchEvent(new InputEvent('input', { bubbles: true }));
    const r = document.createRange(); r.selectNodeContents(el); r.collapse(false);
    const sel = getSelection(); sel?.removeAllRanges(); sel?.addRange(r);
  },
  isSendControl(path) {
    return path.some((n) => n instanceof Element && SEND.some((s) => n.matches?.(s) || n.closest?.(s)));
  },
  onPaste(cb) {
    document.addEventListener('paste', (e) => { const t = e.clipboardData?.getData('text'); if (t) cb(t); }, true);
  },
};
```

```ts
// src/adapters/registry.ts
import type { SurfaceAdapter } from './types';
import { chatgptAdapter } from './chatgpt';
import { claudeAdapter } from './claude';
export function pickAdapter(hostname: string): SurfaceAdapter | null {
  if (hostname.endsWith('chatgpt.com')) return chatgptAdapter;
  if (hostname.endsWith('claude.ai')) return claudeAdapter;
  return null;
}
```

- [ ] **Step 3: PASS the registry test + commit**

```bash
cd code/extension && npx vitest run tests/adapters.test.ts
git add code/extension/src/adapters code/extension/tests/adapters.test.ts
git commit -m "feat(ext): ChatGPT and Claude adapters (selectors marked for live verification)"
```

- [ ] **Step 4: Manual adapter self-test on the live sites**

Reload the extension. On each surface, in the page console: `document.querySelector('#prompt-textarea')` (ChatGPT) / the ProseMirror composer (Claude) resolves; type text and confirm `readText()` returns it via a temporary dev hook. **If a selector is stale, fix it here — this is the D4 maintenance point, and it is expected to need a touch.**

---

## Phase 4 — Mask + numbering + modal + approval token (the real flow completes here)

### Task 9: in-memory monotonic numbering + placeholder rewrite

**Files:**
- Create: `code/extension/src/mask/numbering.ts`
- Create: `code/extension/src/mask/placeholder.ts`
- Create: `code/extension/tests/mask.test.ts`

**Interfaces:**
- Consumes: `Finding`
- Produces:
  - `class SessionNumbering { placeholderFor(cls: FindingClass, text: string): string }` (in-memory, per-session)
  - `function rewrite(text: string, findings: Finding[], numbering: SessionNumbering): { rewritten: string; map: Array<{ placeholder: string; cls: FindingClass }> }`

> **In-memory only (ADR 0017 §6.3 / E2):** the map from `PERSON_1` → the original lives in a session object and is **never persisted and never rehydrated.** Same original text within a session → same placeholder (consistent numbering, ADR 0011 monotonic). The placeholder grammar (`PERSON_1`, `ORG_1`, `NRIC_1` …) is also what stops L2 re-tagging its own output on a re-scan (doc 07 §6.2 — a detection requirement).

- [ ] **Step 1: Failing test (stable numbering + no original leaks into the map's persisted form)**

```ts
// tests/mask.test.ts
import { describe, it, expect } from 'vitest';
import { SessionNumbering, rewrite } from '../src/mask/placeholder';

describe('masking', () => {
  it('same original -> same placeholder within a session', () => {
    const n = new SessionNumbering();
    expect(n.placeholderFor('PERSON', 'Ahmad')).toBe('PERSON_1');
    expect(n.placeholderFor('PERSON', 'Ahmad')).toBe('PERSON_1');
    expect(n.placeholderFor('PERSON', 'Rachel')).toBe('PERSON_2');
  });
  it('rewrites right-to-left so offsets stay valid', () => {
    const n = new SessionNumbering();
    const { rewritten } = rewrite('call Ahmad about Apple', [
      { cls: 'PERSON', start: 5, end: 10, text: 'Ahmad' },
      { cls: 'ORG', start: 17, end: 22, text: 'Apple' },
    ], n);
    expect(rewritten).toBe('call PERSON_1 about ORG_1');
  });
});
```

- [ ] **Step 2: Implement `numbering.ts` + `placeholder.ts`**

```ts
// src/mask/numbering.ts
import type { FindingClass } from '../detection/l1/types';
export class SessionNumbering {
  private counters = new Map<FindingClass, number>();
  private assigned = new Map<string, string>(); // `${cls} ${text}` -> placeholder (IN MEMORY ONLY)
  placeholderFor(cls: FindingClass, text: string): string {
    const key = `${cls} ${text}`;
    const seen = this.assigned.get(key);
    if (seen) return seen;
    const next = (this.counters.get(cls) ?? 0) + 1;
    this.counters.set(cls, next);
    const ph = `${cls}_${next}`;
    this.assigned.set(key, ph);
    return ph;
  }
}
```

```ts
// src/mask/placeholder.ts
import type { Finding, FindingClass } from '../detection/l1/types';
export { SessionNumbering } from './numbering';
import { SessionNumbering } from './numbering';

export function rewrite(text: string, findings: Finding[], numbering: SessionNumbering) {
  const sorted = [...findings].sort((a, b) => b.start - a.start); // right-to-left keeps offsets valid
  let rewritten = text;
  const map: Array<{ placeholder: string; cls: FindingClass }> = [];
  for (const f of sorted) {
    const ph = numbering.placeholderFor(f.cls, text.slice(f.start, f.end));
    rewritten = rewritten.slice(0, f.start) + ph + rewritten.slice(f.end);
    map.push({ placeholder: ph, cls: f.cls });
  }
  return { rewritten, map };
}
```

- [ ] **Step 3: PASS + commit**

```bash
cd code/extension && npx vitest run tests/mask.test.ts
git add code/extension/src/mask code/extension/tests/mask.test.ts
git commit -m "feat(ext): in-memory monotonic numbering and placeholder rewrite (no rehydration)"
```

### Task 10: single-use, hash-bound, idempotent approval token

**Files:**
- Create: `code/extension/src/gate/approval-token.ts`
- Create: `code/extension/tests/approval-token.test.ts`

**Interfaces:**
- Consumes: `sha256Hex`
- Produces: `class ApprovalStore { approve(rewrittenHash: string, ttlMs: number): void; currentHash(): string | null; consumeIfMatch(hash: string): boolean }`

> **doc 05 §6.2:** the token binds to `hash(rewritten text)`, is single-use, has a TTL (~60s `(estimate)`), and is invalidated by any edit. The property it needs is **idempotency**, not determinism (ledger #3): approving the same rewritten text twice yields the same match. The gate reads `currentHash()` synchronously (Task 7's `approvedHash()`), and `consumeIfMatch` burns it after the send.

- [ ] **Step 1: Failing test (single-use + TTL + edit invalidation)**

```ts
// tests/approval-token.test.ts
import { describe, it, expect, vi } from 'vitest';
import { ApprovalStore } from '../src/gate/approval-token';

describe('ApprovalStore', () => {
  it('matches once then is consumed', () => {
    const s = new ApprovalStore(); s.approve('h', 60_000);
    expect(s.consumeIfMatch('h')).toBe(true);
    expect(s.consumeIfMatch('h')).toBe(false); // single-use
  });
  it('does not match a different hash (an edit changes the hash)', () => {
    const s = new ApprovalStore(); s.approve('h', 60_000);
    expect(s.consumeIfMatch('h2')).toBe(false);
    expect(s.currentHash()).toBe('h'); // unconsumed by a miss
  });
  it('expires after its TTL', () => {
    vi.useFakeTimers(); const s = new ApprovalStore(); s.approve('h', 1000);
    vi.advanceTimersByTime(1001);
    expect(s.consumeIfMatch('h')).toBe(false);
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Implement `approval-token.ts`**

```ts
// src/gate/approval-token.ts
export class ApprovalStore {
  private hash: string | null = null;
  private expiresAt = 0;
  approve(rewrittenHash: string, ttlMs: number): void {
    this.hash = rewrittenHash;
    this.expiresAt = Date.now() + ttlMs;
  }
  private live(): boolean {
    if (this.hash && Date.now() > this.expiresAt) this.hash = null;
    return this.hash != null;
  }
  currentHash(): string | null { return this.live() ? this.hash : null; }
  consumeIfMatch(hash: string): boolean {
    if (!this.live() || this.hash !== hash) return false;
    this.hash = null; // burn: single-use
    return true;
  }
  invalidate(): void { this.hash = null; } // called on any composer edit
}
```

- [ ] **Step 3: PASS + commit**

```bash
cd code/extension && npx vitest run tests/approval-token.test.ts
git add code/extension/src/gate/approval-token.ts code/extension/tests/approval-token.test.ts
git commit -m "feat(ext): single-use hash-bound approval token with TTL and edit invalidation"
```

### Task 11: the modal (Preact, shadow root) + Ignore-with-reason

**Files:**
- Create: `code/extension/src/ui/mount.ts`
- Create: `code/extension/src/ui/modal.tsx`
- Create: `code/extension/tests/modal.test.tsx`

**Interfaces:**
- Consumes: the rewrite map, an `onApprove()`, an `onIgnore(reason)`
- Produces: `function showModal(props: ModalProps): void` / `function hideModal(): void`

> **Shadow root (doc 01 §6):** the modal lives in a closed shadow root so the page's CSS cannot touch it and ours cannot leak. It shows the findings by **class + count** and the rewrite preview, offers **Approve** (writes the rewrite, mints the token, closes) and **Ignore with reason** (records the Ignore, closes without rewriting). Decision #8: the modal never sends; it hands back to the user.

- [ ] **Step 1: Failing test (Approve fires onApprove with the rewritten text; Ignore requires a reason)**

```tsx
// tests/modal.test.tsx  (jsdom environment)
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/preact';
import { Modal } from '../src/ui/modal';

describe('Modal', () => {
  it('Approve calls onApprove', () => {
    const onApprove = vi.fn();
    const { getByText } = render(
      <Modal rewritten="call PERSON_1" summary={[{ cls: 'PERSON', count: 1 }]} onApprove={onApprove} onIgnore={() => {}} />,
    );
    fireEvent.click(getByText(/approve/i));
    expect(onApprove).toHaveBeenCalledOnce();
  });
  it('Ignore is disabled until a reason is entered', () => {
    const onIgnore = vi.fn();
    const { getByText, getByPlaceholderText } = render(
      <Modal rewritten="x" summary={[]} onApprove={() => {}} onIgnore={onIgnore} />,
    );
    fireEvent.click(getByText(/ignore/i));
    expect(onIgnore).not.toHaveBeenCalled(); // no reason yet
    fireEvent.input(getByPlaceholderText(/reason/i), { target: { value: 'false positive' } });
    fireEvent.click(getByText(/ignore/i));
    expect(onIgnore).toHaveBeenCalledWith('false positive');
  });
});
```

- [ ] **Step 2: Implement `modal.tsx` (component) and `mount.ts` (shadow host)**

```tsx
// src/ui/modal.tsx
import { useState } from 'preact/hooks';
export type ModalProps = {
  rewritten: string;
  summary: Array<{ cls: string; count: number }>;
  onApprove: () => void;
  onIgnore: (reason: string) => void;
};
export function Modal({ rewritten, summary, onApprove, onIgnore }: ModalProps) {
  const [reason, setReason] = useState('');
  return (
    <div role="dialog" style="all:initial;font:14px system-ui;color:#111">
      <h2>Sensitive content detected</h2>
      <ul>{summary.map((s) => <li key={s.cls}>{s.cls}: {s.count}</li>)}</ul>
      <pre style="white-space:pre-wrap;background:#f4f4f5;padding:8px">{rewritten}</pre>
      <button onClick={onApprove}>Approve &amp; insert rewrite</button>
      <input placeholder="Reason to ignore" value={reason} onInput={(e) => setReason((e.target as HTMLInputElement).value)} />
      <button disabled={!reason} onClick={() => reason && onIgnore(reason)}>Ignore</button>
    </div>
  );
}
```

```ts
// src/ui/mount.ts
import { render } from 'preact';
import { Modal, type ModalProps } from './modal';
let host: HTMLElement | null = null;
export function showModal(props: ModalProps): void {
  if (!host) {
    host = document.createElement('div');
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;background:rgba(0,0,0,.35)';
    (document.body || document.documentElement).appendChild(host);
    host.attachShadow({ mode: 'closed' });
  }
  render(<Modal {...props} />, (host as any).shadowRoot!);
}
export function hideModal(): void { if (host) { render(null as any, (host as any).shadowRoot!); host.remove(); host = null; } }
```

> **`[verify]`** closed-shadow-root rendering with Preact's `render` target; if the closed root is awkward to reach for `render`, keep the reference from `attachShadow` in a module variable rather than reading it back off the host.

- [ ] **Step 3: PASS + commit**

```bash
cd code/extension && npx vitest run tests/modal.test.tsx
git add code/extension/src/ui code/extension/tests/modal.test.tsx
git commit -m "feat(ext): Preact modal in a shadow root with Ignore-with-reason"
```

### Task 12: wire content.ts — the full real flow end to end

**Files:**
- Modify: `code/extension/entrypoints/content.ts`
- Create: `code/extension/src/util/debounce.ts`

**Interfaces:**
- Consumes: everything above
- Produces: the running extension; no new exported types

> This task has **no unit test of its own** — it is the composition seam, verified by the Phase 5 manual acceptance run. Keep it thin: it wires modules that are each already tested.

- [ ] **Step 1: `debounce.ts`**

```ts
// src/util/debounce.ts
export function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number): (...a: A) => void {
  let t: ReturnType<typeof setTimeout> | undefined;
  return (...a: A) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
```

- [ ] **Step 2: Compose in `content.ts`**

```ts
// entrypoints/content.ts
import { pickAdapter } from '../src/adapters/registry';
import { VerdictCache } from '../src/detection/verdict-cache';
import { scanInto } from '../src/detection/scan';
import { sha256Hex } from '../src/detection/hash';
import { installGate } from '../src/gate/gate';
import { ApprovalStore } from '../src/gate/approval-token';
import { SessionNumbering, rewrite } from '../src/mask/placeholder';
import { showModal, hideModal } from '../src/ui/mount';
import { recordFindings, recordIgnore } from '../src/audit/audit';
import { debounce } from '../src/util/debounce';

export default defineContentScript({
  matches: ['https://chatgpt.com/*', 'https://claude.ai/*'],
  runAt: 'document_start',
  world: 'ISOLATED',
  main() {
    const adapter = pickAdapter(location.hostname);
    if (!adapter) return;
    const cache = new VerdictCache();
    const approvals = new ApprovalStore();
    const numbering = new SessionNumbering();
    const hashes = new Map<string, string>();       // text -> hash (sync lookup for the gate)
    const L2_TIMEOUT_MS = 4000;                       // (estimate) team-test value; U6-b curve is measured, not this

    const scan = async (text: string) => {
      const v = await scanInto(cache, text, { l2TimeoutMs: L2_TIMEOUT_MS });
      hashes.set(text, await sha256Hex(text));
      if (v.state === 'DIRTY') await recordFindings(v.findings);
    };
    const debouncedScan = debounce((t: string) => void scan(t), 250); // typing warms the cache

    installGate({
      cache,
      getComposerText: () => adapter.readText(),
      isSendIntent: (e, path) =>
        (e instanceof KeyboardEvent && e.key === 'Enter' && !e.shiftKey) || adapter.isSendControl(path),
      hashOf: (t) => hashes.get(t) ?? ' cold',
      approvedHash: () => approvals.currentHash(),
      onBlocked: async (text) => {
        // Ensure a scan exists (paste path is cold by construction, doc 06 §1), then show the modal.
        if (cache.getSync(hashes.get(text) ?? '') == null) await scan(text);
        const v = cache.getSync(hashes.get(text) ?? '');
        if (!v || v.state === 'CLEAN') return; // scan came back clean; nothing to show
        const { rewritten } = rewrite(text, v.findings, numbering);
        const summary = summarise(v.findings);
        showModal({
          rewritten, summary,
          onApprove: async () => {
            adapter.writeText(rewritten);
            approvals.approve(await sha256Hex(rewritten), 60_000);
            hashes.set(rewritten, await sha256Hex(rewritten));
            hideModal(); // user now presses Send themselves (decision #8)
          },
          onIgnore: async (reason) => { await recordIgnore(v.findings, reason); hideModal(); },
        });
      },
    });

    const el = adapter.getComposer();
    el?.addEventListener('input', () => {
      approvals.invalidate();                          // any edit kills the token
      const t = adapter.readText(); if (t) debouncedScan(t);
    });
    adapter.onPaste((text) => void scan(text));        // paste preempts: scan immediately, no debounce
  },
});

function summarise(findings: { cls: string }[]) {
  const m = new Map<string, number>();
  for (const f of findings) m.set(f.cls, (m.get(f.cls) ?? 0) + 1);
  return [...m].map(([cls, count]) => ({ cls, count }));
}
```

- [ ] **Step 3: Build + commit (manual verification is Phase 5)**

```bash
cd code/extension && npm run build
git add code/extension/entrypoints/content.ts code/extension/src/util/debounce.ts code/extension/dist
git commit -m "feat(ext): wire the full block -> modal -> rewrite -> user-sends flow"
```

---

## Phase 5 — Audit + acceptance

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

### Task 14: end-to-end acceptance on real ChatGPT and Claude

**Files:**
- Create: `code/extension/ACCEPTANCE.md`

**Interfaces:** none — this is the manual acceptance gate that defines "Slice 1 accepted."

> No log can judge the visual criterion (doc 05 §1.2). This checklist is run by a human on both live surfaces. **It is the Slice 1 acceptance definition.**

- [ ] **Step 1: Write `ACCEPTANCE.md` with this checklist and run it on BOTH surfaces**

```markdown
# Slice 1 acceptance — run on chatgpt.com AND claude.ai

## Setup
- [ ] `npm run build && npm run check:dist` — dist is in sync
- [ ] Load `dist/chrome-mv3` unpacked (Developer mode)
- [ ] First use downloads + hash-verifies weights once (watch the SW console for the verify log)

## The real flow (REAL chapters 1-4 of the chronology)
- [ ] Type `Please call Ahmad about the deal.` → the send is blocked; the modal shows PERSON: 1 and the rewrite `Please call PERSON_1 about the deal.`
- [ ] Approve → the composer now holds the rewrite, caret at end, focus in the composer
- [ ] Press Enter (or click Send) yourself → the message sends (the token matches; the gate does not stop it)
- [ ] Paste `IC 890101-14-5555 and email me at a@b.com` → blocked; modal shows NRIC: 1, EMAIL: 1
- [ ] Type `explain Einstein's theory` → blocked (stock NER PERSON); Ignore-with-reason "public figure" → sends unrewritten. **This FP is expected and is the measurement (ADR 0017 §Consequences).**
- [ ] Type `what is 1 + 1` → NOT blocked (the guardrail holds)
- [ ] Compose in Chinese via Microsoft Pinyin → Enter commits candidates normally; only a send-intent Enter is gated (U12-b)
- [ ] Kill the offscreen document (chrome://extensions → inspect → close) mid-session → next send degrades to advisory ("protection degraded"), does NOT hang (ADR 0014)

## The invariants (must all hold)
- [ ] No network request carries prompt text (DevTools → Network, filter by your typed string → zero hits except the model CDN on first run)
- [ ] `chrome.storage.local` contains NO raw names/NRICs — only classes, counts, salted fingerprints (Application tab)
- [ ] The original value is never written back into the page after a rewrite (E2)
- [ ] On a second machine, the same name gets `PERSON_1` independently — there is no shared/synced map (trivially true: no backend)
```

- [ ] **Step 2: Commit**

```bash
git add code/extension/ACCEPTANCE.md
git commit -m "docs(ext): Slice 1 end-to-end acceptance checklist"
```

---

## Deferred to a follow-on plan — the STAGED POC chronology (ADR 0017 §7)

**Not in this plan, by design.** Chapters 5–7 of the boss demo (org-dictionary panel · encrypted-vault panel · audit panel) are **theatre**, and mixing them into the real-path TDD above is exactly the "second product inside Slice 1" the founder flagged. They become a **separate, thin follow-on plan** with their own binding rules (ADR 0017 §7): every staged panel carries a visible `DEMO · NOT REAL PROTECTION` marker, never writes to the real audit store, never touches the real gate/verdict path, and uses a hardcoded `DEMO_KEY` never presented as custody. **Write that plan after Slice 1's real path is accepted** — and keep it a panel/script, not a subsystem.

---

## Self-review

**1. Spec coverage** (against ADR 0016/0017, CLAUDE.md §8, the grill answers):

| Requirement | Task |
|---|---|
| WXT + committed dist + drift check | 1, 2 |
| L2 stock NER, transformers.js, offscreen, hash-pinned CDN weights | 3 |
| U22 resolved (single-thread WASM baseline) | 3 |
| L1 = NRIC/SSM+ambiguous/TIN/email/card; `1+1` guardrail | 4 |
| Synchronous gate, `window` capture, `isComposing` pass-through | 7 |
| ChatGPT + Claude adapters; Enter + click; paste | 8, 12 |
| Verdict cache, monotonic toward dirty (ADR 0013) | 5, 6 |
| Degrade to advisory (ADR 0014) | 6, 12, 14 |
| In-memory numbering, rewrite, no rehydration (E2) | 9 |
| Single-use hash-bound approval token; user presses Send (decision #8) | 10, 12 |
| Preact modal in shadow root; Ignore-with-reason | 11 |
| Salted-hash audit, Ignore-rate-per-class (I3/U26) | 13 |
| No raw prompt to any server (decision #2); Rachel independence | 14 |
| STAGED POC chapters kept separate (ADR 0017 §7) | Deferred section |

**2. Placeholder scan:** No "TBD"/"implement later". Every code step has real code. `[verify]` tags mark **live-DOM / live-library facts that must be confirmed at implementation** (WXT output path, transformers.js cache key, site selectors) — these are the package's `[unverified]` convention, not placeholders, and each names exactly what to check.

**3. Type consistency:** `Finding`/`FindingClass` (l1/types) is the one finding shape; `L2Entity.type` is `'PERSON'|'ORG'` which is a subset of `FindingClass`, mapped in `scan.ts`. `Verdict` is defined once (verdict-cache). `VerdictCache` methods (`getSync/setDirty/setClean/markComplete`) are consistent across Tasks 5–7. `ApprovalStore` (`approve/currentHash/consumeIfMatch/invalidate`) is consistent across Tasks 10 and 12.

> 🔴 **One honest gap the implementer WILL hit, flagged not hidden:** `consumeIfMatch` is defined (Task 10) but Task 12's gate uses `approvedHash()`/`currentHash()` for the synchronous match and never calls `consumeIfMatch`. That means the token is currently consumed by TTL/edit, not by the send. **Decide at Task 12:** either burn the token in the gate's PASS branch (truest single-use) or accept TTL+edit invalidation as sufficient for the team test. It is a real design choice, not an oversight — I have left it visible rather than papering over it.

## Estimate

**~18–26 engineer-days (estimate)** — unchanged from CLAUDE.md §8. The two tasks that can move it are **Task 3** (transformers.js hash-pin + U22 in the offscreen doc — measured, not guessed) and **Task 8** (the D4 adapters — outside our control). Neither is knowable without building. **Slice 1 produces U6-b's curve for free** (doc 06 §3.3) once the team runs it on real hardware.
