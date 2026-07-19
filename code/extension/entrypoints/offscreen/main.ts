// entrypoints/offscreen/main.ts
//
// ADR 0006: ONE offscreen instance, all tabs. This is the ONLY module in the extension that
// imports `@huggingface/transformers` (resolution #7) — the background SW and content scripts
// never load the model runtime.
import { pipeline, env, type TokenClassificationPipeline } from '@huggingface/transformers';
import type { PipelineNerToken, ScanRequest, ScanResponse } from '../../src/detection/l2/messages';
import { attachCharOffsets, mergeNerTokens } from '../../src/detection/l2/messages';
import { verifyPinnedModel } from '../../src/detection/l2/pin';
import { repairEntities } from '../../src/detection/l2/span-repair';
import { loadOrgTerms, proposeOrgs } from '../../src/detection/l2/org-dictionary';
import {
  filterBySensitivity, isEligible, loadConfig, withTimeout,
} from '../../src/detection/l2/sensitivity';

const MODEL_ID = 'Xenova/bert-base-multilingual-cased-ner-hrl';

env.allowLocalModels = false;
env.useBrowserCache = true;

// [decision] Self-host the ONNX Runtime Web WASM/mjs pair from `public/ort/` instead of the
// library's default fallback (jsdelivr CDN — see node_modules/@huggingface/transformers/src/
// backends/onnx.js: `ONNX_ENV.wasm.wasmPaths = 'https://cdn.jsdelivr.net/...'` when unset and not
// in a service worker). MV3's default `extension_pages` CSP is `script-src 'self'
// 'wasm-unsafe-eval'; object-src 'self'`, which would block that CDN's `.mjs` loader module.
// Same-origin (`chrome-extension://<id>/ort/...`) avoids the question entirely. `[verify]` in a
// real browser — this is a design decision made from reading the CSP and the library's fallback
// path, not a live-tested one (Step 8 is DEFERRED_MANUAL).
// Non-null: transformers.js unconditionally populates `env.backends.onnx.wasm` when the wasm
// backend is registered (backends/onnx.js), which happens on import; the type is `Partial<...>`
// only because `env.backends.onnx` itself is generically typed to also allow other backends.
const wasmEnv = env.backends.onnx.wasm!;
wasmEnv.wasmPaths = chrome.runtime.getURL('ort/');
// U22 baseline (ADR 0017 §Consequences): single-thread WASM, no COOP/COEP, no SharedArrayBuffer.
wasmEnv.numThreads = 1;

let nerPromise: Promise<TokenClassificationPipeline> | null = null;
async function getNer(): Promise<TokenClassificationPipeline> {
  if (!nerPromise) {
    nerPromise = (async () => {
      try {
        await verifyPinnedModel(MODEL_ID); // throws on hash mismatch; seeds the browser cache
        // transformers.js v3: quantization is selected via `dtype`, not the v2 `quantized: true`
        // option. `dtype: 'q8'` on `device: 'wasm'` selects the `_quantized` file suffix, i.e.
        // `onnx/model_quantized.onnx` — verified against node_modules source (utils/dtypes.js,
        // models.js) and exactly the file models.manifest.json pins.
        const ner = await pipeline<'token-classification'>('token-classification', MODEL_ID, {
          device: 'wasm',
          dtype: 'q8',
        });
        return ner;
      } catch (e) {
        nerPromise = null; // don't cache a permanent failure; the next scan may retry
        throw e;
      }
    })();
  }
  return nerPromise;
}

// --- Sensitivity classifier (ADR 0017's missing "is it actually sensitive?" step) -----------
//
// OFF unless a model URL is configured, so the default build behaves exactly as before. Loaded
// lazily and only when a prompt is eligible, because the artifact is ~534 MB.
type SensPipe = (text: string) => Promise<Array<{ label: string; score: number }>>;
let sensPromise: Promise<SensPipe> | null = null;

// transformers.js resolves a model by CONVENTION: <localModelPath>/<id>/config.json,
// tokenizer.json, and onnx/model.onnx. It is NOT a pointer to a file, and an id of '' does not
// mean "the directory you gave me" — it produces paths that do not exist, and the load then
// stalls or rejects without anything naming the layout. Build the directory with
// `ml/scripts/build_web_bundle.py`, serve its PARENT, and leave this id matching the folder.
const SENSITIVITY_MODEL_ID = 'sens';

async function getSensitivity(modelUrl: string): Promise<SensPipe> {
  if (!sensPromise) {
    sensPromise = (async () => {
      // Not an HF repo id: this model is unpublished, and ADR 0017's hash-pinned CDN story does
      // not cover it. allowLocalModels lets transformers.js treat localModelPath as the base.
      env.allowLocalModels = true;
      env.localModelPath = modelUrl;
      const pipe = await pipeline<'text-classification'>(
        'text-classification', SENSITIVITY_MODEL_ID, { device: 'wasm' },
      );
      return (async (text: string) => (await pipe(text)) as never) as SensPipe;
    })().catch((e) => {
      sensPromise = null; // a failed load must not become permanent
      throw e;
    });
  }
  return sensPromise;
}

chrome.runtime.onMessage.addListener((msg: ScanRequest, _sender, sendResponse) => {
  if (msg?.kind !== 'l2-scan') return;
  (async () => {
    try {
      const ner = await getNer();
      // CRITICAL: default ignore_labels:['O'] drops non-entity tokens and leaves
      // attachCharOffsets's cursor stranded on recurring substrings (wrong span). Pass
      // ignore_labels:[] so the FULL ordered stream (entity + O) advances the cursor.
      // Verified against transformers@3.8.1 src/pipelines.js (TokenClassificationPipeline._call
      // and the documented example at line ~370). mergeNerTokens drops O afterward.
      const raw = (await ner(msg.text, { ignore_labels: [] })) as unknown as PipelineNerToken[];
      const withOffsets = attachCharOffsets(msg.text, raw);
      // Repair boundaries before anything downstream masks by position. Measured on this exact
      // pipeline (scripts/measure-span-coverage.mjs, 265 gold MASK spans): the raw NER covers
      // 64.2% of them in full — it proposes `Rahman` where doc 04 §4.3 requires `Encik Rahman`,
      // and `阿里` + `巴` where the entity is `阿里巴巴`. Masking half of either leaves the rest
      // in the prompt, so this is a compliance fix as much as an accuracy one.
      // Dictionary BEFORE repair: a dictionary hit can also need a tail pulled in, and the NER
      // misses recognisable companies unpredictably — 6.4% of gold MASK spans get no overlapping
      // proposal at all, and the misses are Proton, TNB, 腾讯, 阿里巴巴, Boeing (ADR 0004).
      // Empty by default, so this is inert until a dictionary is supplied.
      const withDict = proposeOrgs(msg.text, await loadOrgTerms(), mergeNerTokens(withOffsets));
      let entities = repairEntities(withDict, msg.text);

      // Sensitivity: drop entities that are merely entities. Short prompts only — measured
      // 2026-07-19, one forward pass is 174 ms at 21 tokens and 2.0 s at 242, ONCE PER SPAN,
      // and doc 06 §3 puts paste on the critical path. A long paste therefore keeps today's
      // behaviour, which over-masks: the cutoff's failure mode is friction, not leakage.
      const sens = await loadConfig();
      if (sens.modelUrl && entities.length && isEligible(msg.text, sens.maxTokens)) {
        try {
          // 🔴 The load is the step that stalls: 534 MB over HTTP, and a wrong URL or a stopped
          // server produces a promise that never settles rather than an error. The gate's own
          // timeout is 120 s (content.ts), sized for a crashed engine — long enough that a stall
          // here reads to the user as "pressing Send does nothing". Observed 2026-07-20.
          const pipe = await withTimeout(getSensitivity(sens.modelUrl), 20_000, 'model load');
          const t0 = performance.now();
          const { kept, released, failed, timedOut } = await filterBySensitivity(
            msg.text, entities,
            async (marked) => {
              const [top] = await pipe(marked);
              return { keep: top?.label === 'KEEP', confidence: top?.score ?? 0 };
            },
            (text, e) => `${text.slice(0, e.start)}[E] ${e.text} [/E]${text.slice(e.end)}`,
          );
          console.debug(
            `[sensitivity] ${entities.length} spans in ${(performance.now() - t0).toFixed(0)} ms — `
            + `${released.length} released, ${kept.length} masked, ${failed} unjudged (kept)`
            + (timedOut ? ' — BUDGET EXHAUSTED, remaining spans kept masked' : ''));
          entities = kept;
        } catch (e) {
          // ADR 0014: a dead engine degrades, it does not decide. Masking everything the NER
          // found is the safe direction, so the original list stands.
          console.warn('[sensitivity] unavailable, keeping all NER spans masked:', e);
        }
      }

      sendResponse({ kind: 'l2-result', id: msg.id, ok: true, entities } satisfies ScanResponse);
    } catch (e) {
      sendResponse({ kind: 'l2-result', id: msg.id, ok: false, error: String(e) } satisfies ScanResponse);
    }
  })();
  return true; // async sendResponse
});
