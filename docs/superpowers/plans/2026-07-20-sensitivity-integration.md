# Sensitivity Classifier Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the trained sensitivity classifier actually run in the extension, on-device, for any teammate who clones the repo and loads it unpacked — with a visible engine state.

**Architecture:** The offscreen document has no `chrome.storage`, so its config now arrives **in the message** from the service worker, which owns storage. The offscreen document reports a typed **engine status** on every branch, including the skipped ones. Weights move from a hand-run localhost server to a **public, hash-pinned Hugging Face repo**; inference stays entirely on-device.

**Tech Stack:** WXT · TypeScript · Preact (options/modal) · `@huggingface/transformers` 3.8.1 · ONNX Runtime Web (WASM, single-thread) · Vitest

**Spec:** [`docs/superpowers/specs/2026-07-20-sensitivity-integration-design.md`](../specs/2026-07-20-sensitivity-integration-design.md)

## Global Constraints

- **No auto-submit, ever** (locked decision #8). The user presses Send.
- **On-device inference only** (locked decision #2, I1, I5). Prompt text, entities and verdicts never leave the machine. Downloading weights is not sending data (ADR 0017).
- **No rehydration** (E2). Never write an original value back into the provider's page.
- **ADR 0013 monotonic rule:** L1 may write DIRTY; only a completed L1+L2 scan may write CLEAN.
- **ADR 0014:** a dead engine degrades to advisory, never fail-closed. Failures must be *visible*.
- **ADR 0018:** sensitivity never gates files; L1 keeps sole ownership of NRIC/SSM/TIN digits.
- **Fail-safe direction is MASK.** Any error, timeout, or missing model leaves entities masked.
- **Commit messages: no `Co-Authored-By` trailer** (CLAUDE.md §6.1).
- Run from `code/extension/`. Tests: `npx vitest run <path>`.
- **Every number in a comment is cited, `(estimate)`, or `(unverified)`.**

---

## Task 1: `loadConfig` fails loudly on a missing API

The bug's root. `chrome.storage` undefined is a structural failure, not "the user hasn't configured a model".

**Files:**
- Modify: `src/detection/l2/sensitivity.ts:39-51`
- Test: `tests/sensitivity.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `loadConfig(): Promise<SensitivityConfig>` — **throws** `SensitivityUnavailableError` when `chrome.storage.local` is absent. `SensitivityConfig = { modelId: string | null; maxTokens: number }` (note: `modelUrl` → `modelId`, used from Task 8 onward).

- [ ] **Step 1: Write the failing test**

Add to `tests/sensitivity.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { loadConfig, SensitivityUnavailableError } from '../src/detection/l2/sensitivity';

describe('loadConfig', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('throws when chrome.storage is undefined (offscreen documents have no storage API)', async () => {
    vi.stubGlobal('chrome', {}); // exactly what an offscreen document sees
    await expect(loadConfig()).rejects.toBeInstanceOf(SensitivityUnavailableError);
  });

  it('returns disabled config when storage works but no model is set', async () => {
    vi.stubGlobal('chrome', { storage: { local: { get: async () => ({}) } } });
    await expect(loadConfig()).resolves.toEqual({ modelId: null, maxTokens: 96 });
  });

  it('reads a configured model id', async () => {
    vi.stubGlobal('chrome', {
      storage: { local: { get: async () => ({ vg_sensitivity_model_id: 'org/sens ' }) } },
    });
    await expect(loadConfig()).resolves.toEqual({ modelId: 'org/sens', maxTokens: 96 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sensitivity.test.ts`
Expected: FAIL — `SensitivityUnavailableError` is not exported.

- [ ] **Step 3: Implement**

Replace `sensitivity.ts:31-55` with:

```ts
const MODEL_ID_KEY = 'vg_sensitivity_model_id';
const MAX_TOKENS_KEY = 'vg_sensitivity_max_tokens';

/** Skip the classifier above this many tokens. (estimate) — see the header. */
export const DEFAULT_MAX_TOKENS = 96;

export type SensitivityConfig = { modelId: string | null; maxTokens: number };

/**
 * 🔴 `chrome.storage` does not exist in an offscreen document. Measured 2026-07-20:
 * `chrome.storage.local` → "Cannot read properties of undefined". The `storage` permission is
 * present and correct; the API is simply not exposed in that context.
 *
 * The previous version swallowed this in a bare `catch` and returned `{ modelUrl: null }`, which
 * the caller reads as "no model configured". The feature was therefore skipped in total silence
 * on every prompt, for every user, since it was written. A catch that returns a default converts
 * a structural failure into a configuration state — CLAUDE.md §6.5's letter-vs-purpose trap.
 *
 * This is never recoverable and must never be reported as "off".
 */
export class SensitivityUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SensitivityUnavailableError';
  }
}

export async function loadConfig(): Promise<SensitivityConfig> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    throw new SensitivityUnavailableError(
      'chrome.storage.local is unavailable in this context — call loadConfig from the service '
      + 'worker and pass the result in the l2-run message (ADR 0030).',
    );
  }
  const got = await chrome.storage.local.get([MODEL_ID_KEY, MAX_TOKENS_KEY]);
  const id = got[MODEL_ID_KEY];
  const max = got[MAX_TOKENS_KEY];
  return {
    modelId: typeof id === 'string' && id.trim() ? id.trim() : null,
    maxTokens: typeof max === 'number' && max > 0 ? max : DEFAULT_MAX_TOKENS,
  };
}

export async function setModelId(id: string | null): Promise<void> {
  await chrome.storage.local.set({ [MODEL_ID_KEY]: id ?? '' });
}
```

Delete the old `setModelUrl`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/sensitivity.test.ts`
Expected: PASS, all cases.

- [ ] **Step 5: Commit**

```bash
git add src/detection/l2/sensitivity.ts tests/sensitivity.test.ts
git commit -m "fix(ext): loadConfig reported a missing API as 'feature off' — the classifier never once ran"
```

---

## Task 2: The message contract — a separate kind for the enriched leg

🔴 **There is a second live defect here.** `chrome.runtime.sendMessage` from a content script is delivered to **every** extension context. Both `background.ts` and `offscreen/main.ts` listen for `kind: 'l2-scan'`, so the offscreen document **already receives the raw message directly**, races the background's re-send, and whichever responds first wins. Injecting config into a message the offscreen may also receive un-enriched would be non-deterministic. The SW→offscreen leg gets its own kind.

**Files:**
- Modify: `src/detection/l2/messages.ts:8-11`
- Test: `tests/l2-messages.test.ts`

**Interfaces:**
- Consumes: `L2Entity` from Task 0 (existing).
- Produces:
  - `ScanRequest = { kind: 'l2-scan'; id: string; text: string; purpose: 'chat' | 'file' }`
  - `RunRequest = { kind: 'l2-run'; id: string; text: string; purpose: 'chat' | 'file'; sensitivity: SensitivityConfig }`
  - `SensitivityStatus` (union, see below)
  - `ScanResponse` ok-variant gains `sensitivity: SensitivityStatus`

- [ ] **Step 1: Write the failing test**

Add to `tests/l2-messages.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { describeStatus } from '../src/detection/l2/messages';

describe('describeStatus', () => {
  it('renders every branch as human text', () => {
    expect(describeStatus({ state: 'disabled' })).toBe('Off — no model configured');
    expect(describeStatus({ state: 'loading' })).toBe('Loading model…');
    expect(describeStatus({ state: 'ready', spans: 3, released: 2, kept: 1, failed: 0, ms: 210 }))
      .toBe('Ready — 3 spans in 210 ms, 2 released, 1 masked');
    expect(describeStatus({ state: 'failed', reason: 'HTTP 404' })).toBe('Failed — HTTP 404');
    expect(describeStatus({ state: 'skipped', why: 'too-long' }))
      .toBe('Skipped — prompt too long for the classifier');
    expect(describeStatus({ state: 'skipped', why: 'file-path' }))
      .toBe('Skipped — files are not sensitivity-filtered (ADR 0018)');
    expect(describeStatus({ state: 'skipped', why: 'no-entities' }))
      .toBe('Skipped — nothing to judge');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/l2-messages.test.ts`
Expected: FAIL — `describeStatus` is not exported.

- [ ] **Step 3: Implement**

Replace `messages.ts:8-11` and append `describeStatus`:

```ts
import type { SensitivityConfig } from './sensitivity';

export type ScanPurpose = 'chat' | 'file';

/**
 * 🔴 ADR 0018: sensitivity never gates files. Today that holds only because file extracts are
 * long and fall past the token cutoff — i.e. by coincidence of a number, not by construction.
 * The chat path and the file path share `scanInto`. This flag makes the ADR structural, so
 * raising the cutoff cannot silently violate it.
 */
export type ScanRequest = { kind: 'l2-scan'; id: string; text: string; purpose: ScanPurpose };

/**
 * The SW→offscreen leg. A DIFFERENT kind on purpose: `chrome.runtime.sendMessage` broadcasts to
 * every extension context, so an `l2-scan` sent by a content script reaches the offscreen
 * document directly as well as via the background. Sharing one kind would mean the offscreen
 * sometimes handles a message that never passed through the SW and therefore carries no config.
 */
export type RunRequest = {
  kind: 'l2-run'; id: string; text: string; purpose: ScanPurpose; sensitivity: SensitivityConfig;
};

export type SensitivityStatus =
  | { state: 'disabled' }
  | { state: 'loading' }
  | { state: 'ready'; spans: number; released: number; kept: number; failed: number; ms: number }
  | { state: 'failed'; reason: string }
  | { state: 'skipped'; why: 'too-long' | 'no-entities' | 'file-path' };

export type ScanResponse =
  | { kind: 'l2-result'; id: string; ok: true; entities: L2Entity[]; sensitivity: SensitivityStatus }
  | { kind: 'l2-result'; id: string; ok: false; error: string };

export function describeStatus(s: SensitivityStatus): string {
  switch (s.state) {
    case 'disabled': return 'Off — no model configured';
    case 'loading': return 'Loading model…';
    case 'ready':
      return `Ready — ${s.spans} spans in ${s.ms.toFixed(0)} ms, ${s.released} released, ${s.kept} masked`;
    case 'failed': return `Failed — ${s.reason}`;
    case 'skipped':
      return s.why === 'too-long' ? 'Skipped — prompt too long for the classifier'
        : s.why === 'file-path' ? 'Skipped — files are not sensitivity-filtered (ADR 0018)'
        : 'Skipped — nothing to judge';
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/l2-messages.test.ts`
Expected: PASS. TypeScript errors in `background.ts`/`offscreen/main.ts`/`client.ts` are expected and fixed in Tasks 3–4 and 7.

- [ ] **Step 5: Commit**

```bash
git add src/detection/l2/messages.ts tests/l2-messages.test.ts
git commit -m "feat(ext): typed engine status, and a separate message kind for the SW->offscreen leg"
```

---

## Task 3: The service worker owns the config and injects it

**Files:**
- Modify: `entrypoints/background.ts`
- Test: `tests/sensitivity-boundary.test.ts` (create)

**Interfaces:**
- Consumes: `loadConfig` (Task 1), `ScanRequest`/`RunRequest` (Task 2).
- Produces: `buildRunRequest(msg: ScanRequest, cfg: SensitivityConfig): RunRequest` — exported from `src/detection/l2/messages.ts` so it is testable without a service worker.

- [ ] **Step 1: Write the failing test**

Create `tests/sensitivity-boundary.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildRunRequest } from '../src/detection/l2/messages';

describe('buildRunRequest', () => {
  const cfg = { modelId: 'vanguard/sens-v0.2.0', maxTokens: 96 };

  it('carries the config the offscreen document cannot read for itself', () => {
    const run = buildRunRequest(
      { kind: 'l2-scan', id: 'a', text: 'hello', purpose: 'chat' }, cfg,
    );
    expect(run).toEqual({
      kind: 'l2-run', id: 'a', text: 'hello', purpose: 'chat', sensitivity: cfg,
    });
  });

  it('preserves the file purpose so ADR 0018 survives the hop', () => {
    const run = buildRunRequest(
      { kind: 'l2-scan', id: 'b', text: 'x', purpose: 'file' }, cfg,
    );
    expect(run.purpose).toBe('file');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sensitivity-boundary.test.ts`
Expected: FAIL — `buildRunRequest` is not exported.

- [ ] **Step 3: Implement**

Append to `src/detection/l2/messages.ts`:

```ts
export function buildRunRequest(msg: ScanRequest, sensitivity: SensitivityConfig): RunRequest {
  return {
    kind: 'l2-run', id: msg.id, text: msg.text, purpose: msg.purpose, sensitivity,
  };
}
```

Replace the body of `entrypoints/background.ts`'s `defineBackground`:

```ts
import { buildRunRequest, type ScanRequest, type ScanResponse } from '../src/detection/l2/messages';
import { loadConfig, type SensitivityConfig } from '../src/detection/l2/sensitivity';

// Cached so a keystroke-rate scan does not hit storage every time. Invalidated on change.
let cfgCache: SensitivityConfig | null = null;
async function config(): Promise<SensitivityConfig> {
  if (!cfgCache) cfgCache = await loadConfig();
  return cfgCache;
}

export default defineBackground(() => {
  console.info('[vanguard] background alive');
  chrome.storage.onChanged.addListener(() => { cfgCache = null; });

  chrome.runtime.onMessage.addListener((msg: ScanRequest, _s, sendResponse) => {
    if (msg?.kind !== 'l2-scan') return;
    (async () => {
      try {
        await ensureOffscreen();
        const res = (await chrome.runtime.sendMessage(
          buildRunRequest(msg, await config()),
        )) as ScanResponse;
        sendResponse(res);
      } catch (e) {
        sendResponse({ kind: 'l2-result', id: msg.id, ok: false, error: String(e) } satisfies ScanResponse);
      }
    })();
    return true;
  });
});
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/sensitivity-boundary.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/detection/l2/messages.ts entrypoints/background.ts tests/sensitivity-boundary.test.ts
git commit -m "fix(ext): the SW reads the sensitivity config — the offscreen document has no chrome.storage"
```

---

## Task 4: The offscreen document consumes the config and reports status on every branch

**Files:**
- Modify: `entrypoints/offscreen/main.ts:99-175`
- Test: covered by Task 5's guard test plus manual acceptance (Task 10).

**Interfaces:**
- Consumes: `RunRequest`, `SensitivityStatus`, `buildRunRequest` (Tasks 2–3); `isEligible`, `filterBySensitivity`, `withTimeout` (existing).
- Produces: an offscreen listener on `kind: 'l2-run'` that always sets `sensitivity` on an ok response.

- [ ] **Step 1: Rewrite the listener**

Replace the `chrome.runtime.onMessage.addListener` block in `entrypoints/offscreen/main.ts`:

```ts
chrome.runtime.onMessage.addListener((msg: RunRequest, _sender, sendResponse) => {
  if (msg?.kind !== 'l2-run') return;
  (async () => {
    try {
      const ner = await getNer();
      const raw = (await ner(msg.text, { ignore_labels: [] })) as unknown as PipelineNerToken[];
      const withOffsets = attachCharOffsets(msg.text, raw);
      const withDict = proposeOrgs(msg.text, await loadOrgTerms(), mergeNerTokens(withOffsets));
      let entities = repairEntities(withDict, msg.text);

      // 🔴 Every branch names itself. The previous version was silent when it skipped, so the
      // absence of a log carried no information — which is how a feature that had never once
      // executed looked identical to a feature that was working. Observed 2026-07-20.
      let sensitivity: SensitivityStatus;
      const cfg = msg.sensitivity;

      if (msg.purpose === 'file') {
        sensitivity = { state: 'skipped', why: 'file-path' };   // ADR 0018, enforced structurally
      } else if (!cfg.modelId) {
        sensitivity = { state: 'disabled' };
      } else if (!entities.length) {
        sensitivity = { state: 'skipped', why: 'no-entities' };
      } else if (!isEligible(msg.text, cfg.maxTokens)) {
        sensitivity = { state: 'skipped', why: 'too-long' };
      } else {
        try {
          const pipe = await withTimeout(getSensitivity(cfg.modelId), 60_000, 'model load');
          const t0 = performance.now();
          const { kept, released, failed, timedOut } = await filterBySensitivity(
            msg.text, entities,
            async (marked) => {
              const [top] = await pipe(marked);
              return { keep: top?.label === 'KEEP', confidence: top?.score ?? 0 };
            },
            (text, e) => `${text.slice(0, e.start)}[E] ${e.text} [/E]${text.slice(e.end)}`,
          );
          sensitivity = {
            state: 'ready', spans: entities.length, released: released.length,
            kept: kept.length, failed, ms: performance.now() - t0,
          };
          if (timedOut) sensitivity = { state: 'failed', reason: 'span budget exhausted' };
          entities = kept;
        } catch (e) {
          // ADR 0014: degrade, do not decide. Entities stay masked — and now it is VISIBLE.
          sensitivity = { state: 'failed', reason: e instanceof Error ? e.message : String(e) };
        }
      }
      console.debug('[sensitivity]', describeStatus(sensitivity));
      sendResponse({ kind: 'l2-result', id: msg.id, ok: true, entities, sensitivity } satisfies ScanResponse);
    } catch (e) {
      sendResponse({ kind: 'l2-result', id: msg.id, ok: false, error: String(e) } satisfies ScanResponse);
    }
  })();
  return true;
});
```

Update `getSensitivity(modelId: string)` to take a repo id (Task 8 changes its body; the signature changes here). Add the imports: `RunRequest`, `SensitivityStatus`, `describeStatus`.

🔴 The load timeout moves **20 s → 60 s**: a 535 MB first-run download over a home connection exceeds 20 s. `(estimate)` — replaced by the team test's measurement.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors in `offscreen/main.ts`. Errors in `client.ts`/`scan.ts` are expected until Task 7.

- [ ] **Step 3: Commit**

```bash
git add entrypoints/offscreen/main.ts
git commit -m "feat(ext): the offscreen document reports engine state on every branch, including skipped"
```

---

## Task 5: A guard test for the defect itself

The existing `sensitivity.test.ts` injects `classify` and `markSpan` as callbacks, so the fixture supplies exactly what the runtime failed to provide. No behavioural test could have caught this. A static one can.

**Files:**
- Test: `tests/offscreen-no-storage.test.ts` (create)

**Interfaces:**
- Consumes: nothing. Reads source files from disk.
- Produces: nothing.

- [ ] **Step 1: Write the failing test**

Create `tests/offscreen-no-storage.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// 🔴 `chrome.storage` is UNDEFINED inside an offscreen document. Measured 2026-07-20:
// `await chrome.storage.local.get(...)` → "Cannot read properties of undefined (reading 'local')".
// The sensitivity classifier read its config there, the read threw, a bare catch reported it as
// "no model configured", and the feature never executed once. The config now arrives in the
// l2-run message (ADR 0030). This test exists so it cannot come back.
describe('offscreen entrypoint', () => {
  it('never references chrome.storage', () => {
    const src = readFileSync(
      resolve(__dirname, '../entrypoints/offscreen/main.ts'), 'utf8',
    );
    const code = src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''); // strip comments
    expect(code).not.toMatch(/chrome\s*\.\s*storage/);
  });

  it('never calls loadConfig — that is the service worker\'s job', () => {
    const src = readFileSync(
      resolve(__dirname, '../entrypoints/offscreen/main.ts'), 'utf8',
    );
    const code = src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    expect(code).not.toMatch(/\bloadConfig\s*\(/);
  });
});
```

- [ ] **Step 2: Run test**

Run: `npx vitest run tests/offscreen-no-storage.test.ts`
Expected: PASS (Task 4 already removed both). If it FAILS, Task 4 is incomplete — fix `main.ts`, do not weaken the test.

- [ ] **Step 3: Verify the test can actually fail**

Temporarily add `chrome.storage.local.get('x');` to `offscreen/main.ts`, re-run, confirm FAIL, then revert.
Expected: FAIL, then PASS after revert. **A guard test that cannot fail is not a guard.**

- [ ] **Step 4: Commit**

```bash
git add tests/offscreen-no-storage.test.ts
git commit -m "test(ext): guard the offscreen document against reading an API it does not have"
```

---

## Task 6: Oversize spans fail safe instead of truncating

The contract forbids clipping past a marker. Eligibility makes this unreachable today — by coincidence of a number, not by construction.

**Files:**
- Modify: `src/detection/l2/sensitivity.ts`
- Test: `tests/sensitivity.test.ts`

**Interfaces:**
- Consumes: `L2Entity`.
- Produces: `markedFitsWindow(marked: string, maxChars = 1200): boolean` — a conservative character proxy for the 512-token window, using the measured Chinese ratio (0.72 tokens/char, U21-a) when CJK is present.

- [ ] **Step 1: Write the failing test**

Add to `tests/sensitivity.test.ts`:

```ts
import { markedFitsWindow, filterBySensitivity } from '../src/detection/l2/sensitivity';

describe('markedFitsWindow', () => {
  it('accepts a short marked string', () => {
    expect(markedFitsWindow('Explain [E] Einstein [/E] theory')).toBe(true);
  });

  it('rejects a marked string that would exceed the 512-token window', () => {
    expect(markedFitsWindow('a'.repeat(5000))).toBe(false);
  });

  it('uses the Chinese ratio when CJK is present (0.72 tok/char, U21-a)', () => {
    expect(markedFitsWindow('中'.repeat(600))).toBe(false);  // 600 * 0.72 = 432 -- but 600 > 512/0.72
    expect(markedFitsWindow('中'.repeat(100))).toBe(true);
  });
});

describe('filterBySensitivity oversize guard', () => {
  it('keeps an oversize span masked without calling the model', async () => {
    const classify = vi.fn();
    const long = 'x'.repeat(5000);
    const res = await filterBySensitivity(
      long, [{ type: 'PERSON', start: 0, end: 1, text: 'x' }],
      classify as never, (t) => t,
    );
    expect(classify).not.toHaveBeenCalled();
    expect(res.kept).toHaveLength(1);
    expect(res.failed).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sensitivity.test.ts`
Expected: FAIL — `markedFitsWindow` is not exported.

- [ ] **Step 3: Implement**

Add to `sensitivity.ts`:

```ts
/**
 * The model's window is 512 tokens (`max_position_embeddings`, config.json, verified 2026-07-17).
 * The export contract forbids clipping past a marker: a truncated `[/E]` changes what the model
 * is being asked about, silently. Full span-centred windowing is out of scope; the safe action
 * for an oversize span is to keep it MASKED and judge nothing.
 *
 * Character proxy, because this is decided before tokenizing. Ratios measured (U21-a,
 * 2026-07-19): en/bm ~0.26 tokens/char, zh 0.72. The conservative ratio applies whenever CJK is
 * present -- the English ratio on Chinese text would admit ~3x the intended budget.
 */
export function markedFitsWindow(marked: string): boolean {
  const hasCJK = /[㐀-鿿豈-﫿]/.test(marked);
  return marked.length * (hasCJK ? 0.72 : 0.26) <= 512;
}
```

In `filterBySensitivity`'s loop, immediately after the deadline check:

```ts
    const marked = markSpan(text, e);
    if (!markedFitsWindow(marked)) {
      failed += 1;
      kept.push(e); // never truncate past a marker -- keep masking
      continue;
    }
```

and change the `classify(...)` call to `classify(marked)`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/sensitivity.test.ts`
Expected: PASS, all cases.

- [ ] **Step 5: Commit**

```bash
git add src/detection/l2/sensitivity.ts tests/sensitivity.test.ts
git commit -m "fix(ext): an oversize span keeps its mask rather than being clipped past its marker"
```

---

## Task 7: Thread `purpose` from the call sites

**Files:**
- Modify: `src/detection/l2/client.ts`, `src/detection/scan.ts`, `src/files/pipeline.ts` (call site), `entrypoints/content.ts` (call site)
- Test: `tests/scan.test.ts`

**Interfaces:**
- Consumes: `ScanPurpose`, `SensitivityStatus` (Task 2).
- Produces:
  - `l2Scan(text, timeoutMs, purpose): Promise<{ entities: L2Entity[]; sensitivity: SensitivityStatus } | 'degraded'>`
  - `scanInto(cache, text, opts: { l2TimeoutMs: number; purpose: ScanPurpose })`

- [ ] **Step 1: Write the failing test**

Add to `tests/scan.test.ts`:

```ts
it('passes purpose:file through so sensitivity is skipped (ADR 0018)', async () => {
  const sent: unknown[] = [];
  vi.stubGlobal('chrome', {
    runtime: {
      sendMessage: async (m: unknown) => { sent.push(m); return { kind: 'l2-result', id: 'x', ok: true, entities: [], sensitivity: { state: 'skipped', why: 'file-path' } }; },
    },
  });
  await scanInto(new VerdictCache(), 'some extracted text', { l2TimeoutMs: 1000, purpose: 'file' });
  expect((sent[0] as { purpose: string }).purpose).toBe('file');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/scan.test.ts`
Expected: FAIL — `scanInto` does not accept `purpose`.

- [ ] **Step 3: Implement**

`client.ts`:

```ts
export async function l2Scan(
  text: string, timeoutMs: number, purpose: ScanPurpose,
): Promise<{ entities: L2Entity[]; sensitivity: SensitivityStatus } | 'degraded'> {
  const id = crypto.randomUUID();
  const req: ScanRequest = { kind: 'l2-scan', id, text, purpose };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<'degraded'>((r) => { timer = setTimeout(() => r('degraded'), timeoutMs); });
  const call = chrome.runtime
    .sendMessage(req)
    .then((res: ScanResponse) =>
      res.ok ? { entities: res.entities, sensitivity: res.sensitivity } : ('degraded' as const))
    .catch(() => 'degraded' as const);
  try {
    return await Promise.race([call, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
```

`scan.ts` — change the signature to `opts: { l2TimeoutMs: number; purpose: ScanPurpose }`, call
`l2Scan(text, opts.l2TimeoutMs, opts.purpose)`, and read `l2.entities` where it previously read `l2`.
Return the status alongside the verdict so the modal can show it:

```ts
  const l2Findings: Finding[] = l2.entities.map((e) => ({ cls: e.type, start: e.start, end: e.end, text: e.text }));
```

Update the two call sites: `entrypoints/content.ts` passes `purpose: 'chat'`; `src/files/pipeline.ts`'s `scan` dep passes `purpose: 'file'`.

- [ ] **Step 4: Run the full suite**

Run: `npx vitest run`
Expected: PASS. Fix any call sites the compiler flags.

- [ ] **Step 5: Commit**

```bash
git add src/detection src/files/pipeline.ts entrypoints/content.ts tests/scan.test.ts
git commit -m "feat(ext): ADR 0018 is enforced by the code, not by a token cutoff"
```

---

## Task 8: Publish the model and load it by repo id

Deletes the Python server, the DevTools command, and the `:8765` host permissions.

**Files:**
- Modify: `entrypoints/offscreen/main.ts` (`getSensitivity`), `wxt.config.ts`, `models.manifest.json`, `scripts/build-model-manifest.mjs`
- Create: `ml/scripts/publish_to_hub.py`
- Test: `tests/manifest-permissions.test.ts`

**Interfaces:**
- Consumes: `SensitivityConfig.modelId` (Task 1).
- Produces: `getSensitivity(modelId: string): Promise<SensPipe>` resolving an HF repo id.

- [ ] **Step 1: Publish the bundle**

```bash
cd ml
.\.venv\Scripts\python.exe -m pip install huggingface_hub
.\.venv\Scripts\huggingface-cli.exe login
.\.venv\Scripts\huggingface-cli.exe upload <org>/sens-v0.2.0-trim70k artifacts/web/sens . --repo-type model
```

Verify in a browser: `https://huggingface.co/<org>/sens-v0.2.0-trim70k/resolve/main/config.json` returns JSON with `"id2label":{"0":"KEEP","1":"MASK"}`.

⚠️ **This publishes the trained model publicly and cannot be fully undone.** Spec §3.4, risk R5. Confirm with the founder before running.

- [ ] **Step 2: Verify the published bundle loads and agrees with Python**

```bash
cd code/extension
node scripts/verify-web-bundle.mjs "https://huggingface.co/<org>/sens-v0.2.0-trim70k/resolve/main" ""
```

Expected: `All verdicts match the Python model.` (7/7). If the empty model id fails path resolution, keep `env.localModelPath` unset and pass the repo id as the model id instead — that is the production path and is what Step 3 uses.

- [ ] **Step 3: Point the extension at the hub**

Replace `getSensitivity` in `entrypoints/offscreen/main.ts`:

```ts
async function getSensitivity(modelId: string): Promise<SensPipe> {
  if (!sensPromise) {
    sensPromise = (async () => {
      // A Hugging Face repo id, resolved by transformers.js the same way the NER already is.
      // Hosting is not inference: the weights are fetched once and cached, and every
      // classification runs here, on this CPU. No prompt text, entity or verdict leaves the
      // device -- ADR 0017, "decision #2 is about what we SEND, not what we download".
      env.allowLocalModels = false;
      // 🔴 dtype MUST be explicit. The wasm default is q8 -> onnx/model_quantized.onnx, a file
      // this bundle does not contain and must not: int8 quantization of this model is BLOCKED
      // and produces a degenerate always-KEEP graph (MASK recall 0.000,
      // ml/contracts/export-contract.md). A 404 here presents as "still blocked", which is
      // indistinguishable from the classifier disagreeing.
      const pipe = await pipeline<'text-classification'>(
        'text-classification', modelId, { device: 'wasm', dtype: 'fp32' },
      );
      return (async (text: string) => (await pipe(text)) as never) as SensPipe;
    })().catch((e) => { sensPromise = null; throw e; });
  }
  return sensPromise;
}
```

- [ ] **Step 4: Pin the hashes and drop the localhost hosts**

Run `node scripts/build-model-manifest.mjs` (extend it to accept the sensitivity repo id) so `models.manifest.json` gains an entry for `<org>/sens-v0.2.0-trim70k` covering `config.json`, `tokenizer.json`, `tokenizer_config.json`, `onnx/model.onnx`, `onnx/model.onnx.data`. Copy the values from `ml/artifacts/web/sens/SHA256SUMS` and confirm they match.

In `wxt.config.ts`, delete `'http://localhost:8765/*'` and `'http://127.0.0.1:8765/*'` and the comment block naming the local model server.

- [ ] **Step 5: Run the permissions test**

Run: `npx vitest run tests/manifest-permissions.test.ts`
Expected: PASS. Add an assertion that no `:8765` host remains:

```ts
it('no longer requests the local model server', () => {
  expect(JSON.stringify(manifest.host_permissions)).not.toContain('8765');
});
```

- [ ] **Step 6: Commit**

```bash
git add entrypoints/offscreen/main.ts wxt.config.ts models.manifest.json scripts/build-model-manifest.mjs tests/manifest-permissions.test.ts ../../ml/scripts/publish_to_hub.py
git commit -m "feat(ext): the classifier loads from a hash-pinned public repo -- no local server, inference still on-device"
```

---

## Task 9: The options page turns it on and shows what it is doing

Replaces `chrome.storage.local.set(...)` in a DevTools console.

**Files:**
- Modify: `entrypoints/options/main.tsx`
- Create: `src/detection/l2/status-store.ts`
- Test: `tests/ui/options-sensitivity.test.tsx` (create)

**Interfaces:**
- Consumes: `loadConfig`, `setModelId` (Task 1); `describeStatus`, `SensitivityStatus` (Task 2).
- Produces: `recordStatus(s: SensitivityStatus): Promise<void>` and `readStatus(): Promise<SensitivityStatus | null>`, backed by `chrome.storage.local` under `vg_sensitivity_last_status`. The **service worker** calls `recordStatus` when it receives an `l2-result` — the offscreen document still cannot write storage.

- [ ] **Step 1: Write the failing test**

Create `tests/ui/options-sensitivity.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/preact';
import { SensitivityPanel } from '../../entrypoints/options/main';

describe('SensitivityPanel', () => {
  it('shows the last engine status in plain words', async () => {
    vi.stubGlobal('chrome', {
      storage: { local: {
        get: async () => ({
          vg_sensitivity_model_id: 'vanguard/sens-v0.2.0-trim70k',
          vg_sensitivity_last_status: { state: 'ready', spans: 2, released: 1, kept: 1, failed: 0, ms: 190 },
        }),
        set: async () => {},
      } },
    });
    render(<SensitivityPanel />);
    expect(await screen.findByText(/Ready — 2 spans in 190 ms, 1 released, 1 masked/)).toBeTruthy();
  });

  it('says so when no model is configured', async () => {
    vi.stubGlobal('chrome', {
      storage: { local: { get: async () => ({}), set: async () => {} } },
    });
    render(<SensitivityPanel />);
    expect(await screen.findByText(/Off — no model configured/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ui/options-sensitivity.test.tsx`
Expected: FAIL — `SensitivityPanel` is not exported.

- [ ] **Step 3: Implement**

Create `src/detection/l2/status-store.ts`:

```ts
import type { SensitivityStatus } from './messages';

const KEY = 'vg_sensitivity_last_status';

/** Called from the SERVICE WORKER only -- the offscreen document has no chrome.storage. */
export async function recordStatus(s: SensitivityStatus): Promise<void> {
  await chrome.storage.local.set({ [KEY]: s });
}

export async function readStatus(): Promise<SensitivityStatus | null> {
  const got = await chrome.storage.local.get(KEY);
  return (got[KEY] as SensitivityStatus | undefined) ?? null;
}
```

In `entrypoints/background.ts`, after `sendResponse(res)`, add:
`if (res.ok) void recordStatus(res.sensitivity);`

Add to `entrypoints/options/main.tsx` and render it below the existing file-checking panel:

```tsx
const DEFAULT_MODEL = 'vanguard/sens-v0.2.0-trim70k';

export function SensitivityPanel() {
  const [modelId, setModel] = useState('');
  const [status, setStatus] = useState<SensitivityStatus>({ state: 'disabled' });
  useEffect(() => {
    void loadConfig().then((c) => setModel(c.modelId ?? ''));
    void readStatus().then((s) => { if (s) setStatus(s); });
    const t = setInterval(() => { void readStatus().then((s) => { if (s) setStatus(s); }); }, 2000);
    return () => clearInterval(t);
  }, []);
  return (
    <div style="margin-top:28px;border-top:1px solid #e2e8f0;padding-top:20px">
      <h1 style="font-size:18px">Sensitivity classifier</h1>
      <p style="color:#475569">
        Decides whether a name or company we found is actually sensitive, so
        "Explain Einstein's theory" is not blocked. Runs entirely on your machine. The model is
        downloaded once (~535 MB) and cached.
      </p>
      <label style="display:block;margin-bottom:6px">Model</label>
      <input
        value={modelId}
        placeholder={DEFAULT_MODEL}
        onInput={(e) => setModel((e.target as HTMLInputElement).value)}
        style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:6px"
      />
      <div style="margin-top:12px;display:flex;gap:10px;align-items:center">
        <button
          onClick={() => { void setModelId(modelId.trim() || null); }}
          style="padding:8px 14px;border:none;border-radius:6px;background:#e11d48;color:#fff;cursor:pointer"
        >Save</button>
        <button
          onClick={() => { void setModelId(null).then(() => setModel('')); }}
          style="padding:8px 14px;border:1px solid #cbd5e1;border-radius:6px;background:#fff;cursor:pointer"
        >Turn off</button>
      </div>
      <p style="margin-top:14px">
        <strong>Status:</strong>{' '}
        <span style={status.state === 'failed' ? 'color:#b91c1c' : 'color:#334155'}>
          {describeStatus(status)}
        </span>
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/ui/options-sensitivity.test.tsx`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add entrypoints/options/main.tsx entrypoints/background.ts src/detection/l2/status-store.ts tests/ui/options-sensitivity.test.tsx
git commit -m "feat(ext): options page turns the classifier on and shows what it is doing"
```

---

## Task 10: ADRs, rebuild, drift check, acceptance

**Files:**
- Create: `docs/adr/0029-sensitivity-weights-public-hub-hash-pinned.md`, `docs/adr/0030-offscreen-config-through-messages.md`
- Modify: `code/extension/ACCEPTANCE.md`, `docs/team/try-the-sensitivity-classifier.md`, `CLAUDE.md` (deliverable row 13), `ASSUMPTIONS.md` (§5 correction log)
- Modify: `dist/`

- [ ] **Step 1: Write ADR 0029**

Context: 535 MB fp32, int8 blocked, trimming spent, localhost server unshippable. Options: public HF repo / GitHub Release / own bucket+CDN. Decision: **public HF repo, hash-pinned, loaded by repo id**. Consequences: the trained model is public (accepted per ADR 0003 — the moat was never the model); `huggingface.co` may be blocked on the enterprise fleet B3 targets (ADR 0017 already calls CDN weights "not the shipping answer"); **decision #2 is untouched — downloading is not sending**; and the stated end state ("all individuals and companies") **promotes distillation from a risk to a requirement** (doc 06 §6.2's trigger has fired) → doc 08.

- [ ] **Step 2: Write ADR 0030**

Context: `chrome.storage` is undefined in an offscreen document; a bare `catch` reported that as "feature off" and the classifier never executed. Decision: **the service worker owns all configuration and passes it in the `l2-run` message; the offscreen document reads no extension state.** Consequences: one broadcast-collision defect fixed as a side effect (both contexts listened for `l2-scan`); a static guard test replaces a behavioural one that could not fail; **generalizes — the offscreen document must be treated as a pure compute context.**

- [ ] **Step 3: Record the correction in `ASSUMPTIONS.md` §5**

The entry to write: *a catch that returns a default converted a structural failure into a configuration state, and the feature was 100% inert from the day it was written until 2026-07-20.* Note it was found only by reading a raw console in the right context — the fifth instance of the letter-vs-purpose trap, and the first living in an **error handler**.

- [ ] **Step 4: Rebuild and check drift**

```bash
cd code/extension
npm run build
node scripts/check-dist-drift.mjs
```

Expected: `dist/ matches a fresh build.`

- [ ] **Step 5: Run the full suite**

Run: `npx vitest run`
Expected: all PASS. Report the count.

- [ ] **Step 6: Manual acceptance — all seven, on both surfaces**

Work through spec §6 (1–7) on **ChatGPT and Claude**. Record actual results in `ACCEPTANCE.md`, including the observed first-run download time and the observed per-span latency from the status line.

🔴 **Do not report a pass from the analyser's own verdict.** Read the status line and confirm it matches what the UI did — CLAUDE.md §2 ledger #11: a verdict is a claim about its input.

- [ ] **Step 7: Rewrite `docs/team/try-the-sensitivity-classifier.md`**

Delete the Python server, the `build_web_bundle.py` step, and the `chrome.storage.local.set` command. Replace with: load unpacked → options page → Save → done. **State R2 explicitly**: the classifier is skipped on prompts over ~96 tokens, so a long paste is still fully masked — otherwise the team will report "it doesn't work on long prompts" as a bug and be right for the wrong reason.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "docs(ext): ADRs 0029/0030, acceptance results, and a team guide with no server in it"
```

---

## Self-review notes

- **Spec coverage:** §3.1→T3/T4 · §3.2→T1 · §3.3→T2/T4/T9 · §3.4→T8 · §3.5→T3/T5 · §3.6→T6 · §3.7→T2/T7 · §5 risks→T10 ADRs · §6 acceptance→T10.
- **Type consistency:** `modelUrl` → `modelId` **everywhere** from Task 1 (storage key changes too: `vg_sensitivity_model_url` → `vg_sensitivity_model_id`, so an existing localhost value is ignored rather than silently used). `SensitivityStatus` is defined once in `messages.ts` and imported by `status-store.ts`, `offscreen/main.ts`, `options/main.tsx`. `l2Scan` returns an object from Task 7 onward, not a bare array — `scan.ts` is the only consumer.
- **Known gap, deliberate:** Task 8 Step 2 may need the fallback noted inline; the repo-id path is the production one and is what Step 3 ships.
