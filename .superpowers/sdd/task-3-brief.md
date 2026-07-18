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

