// src/detection/l2/sensitivity.ts
//
// The sensitivity classifier: decides whether an NER-proposed span is actually SENSITIVE, or
// merely an entity. ADR 0017 named this gap and shipped without it — "Explain Einstein's theory"
// has a PERSON and is not a leak.
//
// 🔴 OFF by default. It needs a model URL that nobody has set, and with none set this module
// does nothing at all, so the extension behaves exactly as it did before.
//
// 🔴 SHORT PROMPTS ONLY, and the threshold is an invented number. Measured 2026-07-19 with
// onnxruntime-web single-thread WASM (what ADR 0017 ships — U22, no COOP/COEP):
//
//     21 tokens   174 ms      242 tokens  2,000 ms
//     44 tokens   342 ms      512 tokens  4,758 ms
//
// and the classifier runs ONCE PER SPAN. doc 06 §3 puts PASTE on the critical path, and a pasted
// paragraph is both longer and carries more entities — 242 tokens x 5 spans is ten seconds. So
// long inputs skip the classifier and keep today's behaviour.
//
// ⚠️ Skipping means "mask everything the NER found", which is the SAFE direction: a long paste
// stays over-masked rather than under-masked. The failure mode of this cutoff is friction, not
// leakage.
//
// ⚠️ The cutoff is `(estimate)`. It was chosen from a floor measured on a machine that is not D2
// — ASSUMPTIONS.md rates D2 Medium confidence, HIGH blast radius, and asks for a real device
// survey. Real hardware is slower. This is a knob, not a constant, and the team test is what
// replaces it.

import type { L2Entity } from './messages';

// The key changed with the hosting move (a Hugging Face repo id, not a localhost URL). Renaming
// it is deliberate: an existing `vg_sensitivity_model_url` holding `http://127.0.0.1:8765` must
// be IGNORED rather than silently reused as a repo id, which would fail in a way that looks
// exactly like everything else here has looked.
const MODEL_ID_KEY = 'vg_sensitivity_model_id';
const MAX_TOKENS_KEY = 'vg_sensitivity_max_tokens';

/** Skip the classifier above this many tokens. (estimate) — see the header. */
export const DEFAULT_MAX_TOKENS = 96;

export type SensitivityConfig = { modelId: string | null; maxTokens: number };

/**
 * 🔴 `chrome.storage` does not exist inside an offscreen document.
 *
 * Measured 2026-07-20: `await chrome.storage.local.get(...)` in `offscreen.html` throws
 * "Cannot read properties of undefined (reading 'local')". The `storage` permission is present
 * and correct in the manifest; the API is simply not exposed in that context.
 *
 * The previous version wrapped the read in a bare `try/catch` and returned
 * `{ modelUrl: null }` on failure. The caller reads that as "the user has not configured a
 * model", so the classifier was skipped — no fetch, no log, no state change — on every prompt,
 * for every user, from the day it was written until this was found. A whole session was spent
 * unable to distinguish "not connected" from "connected and disagreeing", because in that
 * design they are byte-identical.
 *
 * **A catch that returns a default converts a structural failure into a configuration state.**
 * That is CLAUDE.md §6.5's letter-vs-purpose trap: the handler's wording is "tolerate a storage
 * read failing"; its effect was to hide a permanent, total failure of the differentiating
 * feature. A missing API is never recoverable and must never be reported as "off".
 *
 * The config now comes from the service worker in the `l2-run` message (ADR 0030).
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

/**
 * Decide, without loading anything, whether this prompt is eligible.
 *
 * Uses a character proxy rather than a real token count because the decision has to be made
 * before tokenizing. 🔴 The ratio is language-dependent and measured (U21-a): English and Malay
 * run ~0.26 tokens/char, Chinese **0.72**. Using the English ratio for Chinese would let a
 * Chinese paste through at nearly three times the intended token budget — exactly the case the
 * cutoff exists to exclude — so the conservative (Chinese) ratio is applied whenever the text
 * contains CJK.
 */
export function isEligible(text: string, maxTokens: number): boolean {
  const hasCJK = /[㐀-鿿豈-﫿]/.test(text);
  const tokensPerChar = hasCJK ? 0.72 : 0.26; // U21-a, measured 2026-07-19
  return text.length * tokensPerChar <= maxTokens;
}

export type Verdict = { keep: boolean; confidence: number };

/**
 * Does the MARKED string fit the model's window?
 *
 * The window is 512 tokens (`max_position_embeddings`, config.json, verified 2026-07-17). The
 * export contract forbids clipping past a marker: a truncated `[/E]` silently changes which span
 * the model is being asked about, and it answers confidently about the wrong thing. Full
 * span-centred windowing is out of scope here; the safe action for an oversize span is to keep
 * it MASKED and judge nothing.
 *
 * ⚠️ This is unreachable today, because `isEligible` caps the prompt at ~96 tokens. It is
 * unreachable *by coincidence of a number*, not by construction — and that number is explicitly
 * a knob the team test is expected to move.
 *
 * Character proxy, because the decision is made before tokenizing. Ratios measured (U21-a,
 * 2026-07-19): en/bm ~0.26 tokens/char, zh 0.72. The conservative ratio applies whenever CJK is
 * present — the English ratio on Chinese text would admit ~2.8x the intended budget.
 */
export function markedFitsWindow(marked: string): boolean {
  const hasCJK = /[㐀-鿿豈-﫿]/.test(marked);
  return marked.length * (hasCJK ? 0.72 : 0.26) <= 512;
}

/** Per-span budget. (estimate) — one forward pass measured 174 ms at 21 tokens and 342 ms at 44
 *  on this machine, and D2 is slower, so this leaves generous headroom while still failing
 *  inside the gate's own budget rather than consuming it. */
export const DEFAULT_SPAN_TIMEOUT_MS = 3_000;

/** Total budget for a whole prompt, however many spans it has. */
export const DEFAULT_TOTAL_TIMEOUT_MS = 8_000;

/**
 * 🔴 A `try/catch` does not catch "never returns".
 *
 * The first version of this module awaited the classifier with no timeout. The caller does have
 * one (`l2Scan`), but it is **120 seconds** — sized for a crashed engine, not for a new step
 * that stalls. A model load that hung therefore presented to the user as "pressing Send does
 * nothing", for two minutes, with the catch block never running. Observed 2026-07-20.
 *
 * ADR 0014 says a dead engine degrades rather than deciding. Degrading requires noticing, and
 * noticing a hang requires a clock.
 */
export function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms} ms`)), ms);
    p.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

/**
 * Drop entities the classifier says are KEEP.
 *
 * 🔴 Fail-safe is to MASK. Any error, timeout, or missing model leaves the entity list untouched,
 * so the extension over-masks rather than releasing something it did not manage to judge. This
 * matches ADR 0013's monotonic-toward-dirty rule, and it is the reason this function takes a
 * classify callback that is allowed to throw.
 */
export async function filterBySensitivity(
  text: string,
  entities: readonly L2Entity[],
  classify: (marked: string) => Promise<Verdict>,
  markSpan: (text: string, e: L2Entity) => string,
  opts: { spanTimeoutMs?: number; totalTimeoutMs?: number } = {},
): Promise<{ kept: L2Entity[]; released: L2Entity[]; failed: number; timedOut: boolean }> {
  const spanMs = opts.spanTimeoutMs ?? DEFAULT_SPAN_TIMEOUT_MS;
  const totalMs = opts.totalTimeoutMs ?? DEFAULT_TOTAL_TIMEOUT_MS;
  const deadline = Date.now() + totalMs;

  const kept: L2Entity[] = [];
  const released: L2Entity[] = [];
  let failed = 0;
  let timedOut = false;

  for (const e of entities) {
    // The per-span clock is not enough on its own: N spans each finishing just inside their
    // budget still blows the prompt's. Both are needed.
    const left = deadline - Date.now();
    if (left <= 0) {
      timedOut = true;
      failed += 1;
      kept.push(e);
      continue;
    }
    const marked = markSpan(text, e);
    if (!markedFitsWindow(marked)) {
      // Never truncate past a marker — keep masking instead of asking a corrupted question.
      failed += 1;
      kept.push(e);
      continue;
    }
    try {
      const verdict = await withTimeout(
        classify(marked), Math.min(spanMs, left), 'sensitivity',
      );
      if (verdict.keep) released.push(e);
      else kept.push(e);
    } catch {
      failed += 1;
      kept.push(e); // could not judge -> keep masking
    }
  }
  return { kept, released, failed, timedOut };
}
