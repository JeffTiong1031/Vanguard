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

const MODEL_URL_KEY = 'vg_sensitivity_model_url';
const MAX_TOKENS_KEY = 'vg_sensitivity_max_tokens';

/** Skip the classifier above this many tokens. (estimate) — see the header. */
export const DEFAULT_MAX_TOKENS = 96;

export type SensitivityConfig = { modelUrl: string | null; maxTokens: number };

export async function loadConfig(): Promise<SensitivityConfig> {
  try {
    const got = await chrome.storage.local.get([MODEL_URL_KEY, MAX_TOKENS_KEY]);
    const url = got[MODEL_URL_KEY];
    const max = got[MAX_TOKENS_KEY];
    return {
      modelUrl: typeof url === 'string' && url.trim() ? url.trim().replace(/\/+$/, '') : null,
      maxTokens: typeof max === 'number' && max > 0 ? max : DEFAULT_MAX_TOKENS,
    };
  } catch {
    return { modelUrl: null, maxTokens: DEFAULT_MAX_TOKENS };
  }
}

export async function setModelUrl(url: string | null): Promise<void> {
  await chrome.storage.local.set({ [MODEL_URL_KEY]: url ?? '' });
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
): Promise<{ kept: L2Entity[]; released: L2Entity[]; failed: number }> {
  const kept: L2Entity[] = [];
  const released: L2Entity[] = [];
  let failed = 0;

  for (const e of entities) {
    try {
      const verdict = await classify(markSpan(text, e));
      if (verdict.keep) released.push(e);
      else kept.push(e);
    } catch {
      failed += 1;
      kept.push(e); // could not judge -> keep masking
    }
  }
  return { kept, released, failed };
}
