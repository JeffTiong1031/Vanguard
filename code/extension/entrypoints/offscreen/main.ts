// entrypoints/offscreen/main.ts
//
// ADR 0006: ONE offscreen instance, all tabs. This is the ONLY module in the extension that
// imports `@huggingface/transformers` (resolution #7) — the background SW and content scripts
// never load the model runtime.
import { pipeline, env, type TokenClassificationPipeline } from '@huggingface/transformers';
import type {
  PipelineNerToken, RunRequest, ScanResponse, SensitivityStatus,
} from '../../src/detection/l2/messages';
import { attachCharOffsets, describeStatus, mergeNerTokens } from '../../src/detection/l2/messages';
import { verifyPinnedModel } from '../../src/detection/l2/pin';
import { repairEntities } from '../../src/detection/l2/span-repair';
import { loadOrgTerms, proposeOrgs } from '../../src/detection/l2/org-dictionary';
import { filterBySensitivity, isEligible, withTimeout } from '../../src/detection/l2/sensitivity';

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

async function getSensitivity(modelId: string): Promise<SensPipe> {
  if (!sensPromise) {
    sensPromise = (async () => {
      // A Hugging Face repo id, resolved the same way the NER above already is (ADR 0029).
      //
      // 🔴 Hosting is not inference. The weights are fetched once and cached by the browser;
      // every classification then runs HERE, in this document, on this CPU. No prompt text, no
      // entity and no verdict ever leaves the machine — ADR 0017: "decision #2 is about what we
      // SEND, not what we download." Invariants I1/I5 and decisions #2/#5 are untouched.
      //
      // ⚠️ The previous version set `env.allowLocalModels = true` here to point at a localhost
      // server. That is a GLOBAL mutation of shared library state, applied lazily from inside
      // one model's loader, in a module whose top level deliberately sets it to `false` for the
      // NER. Leaving it removed rather than reinstating it.
      // 🔴 dtype MUST be explicit. transformers.js picks a file by dtype, and the default for
      // `wasm` is q8 (DEFAULT_DEVICE_DTYPE_MAPPING in utils/dtypes.js), which resolves to
      // onnx/model_quantized.onnx — a file this bundle does not contain and must not: int8
      // quantization of this model is BLOCKED, it produces a degenerate always-KEEP graph
      // (ml/contracts/export-contract.md §Quantization). Leaving it default means a 404, a
      // failed load, and every entity staying masked — the same symptom as the classifier
      // disagreeing. Observed 2026-07-20; the Node verifier missed it because `cpu` defaults
      // to fp32 and so exercised a different file.
      const pipe = await pipeline<'text-classification'>(
        'text-classification', modelId, { device: 'wasm', dtype: 'fp32' },
      );
      return (async (text: string) => (await pipe(text)) as never) as SensPipe;
    })().catch((e) => {
      sensPromise = null; // a failed load must not become permanent
      throw e;
    });
  }
  return sensPromise;
}

chrome.runtime.onMessage.addListener((msg: RunRequest, _sender, sendResponse) => {
  // 'l2-run', not 'l2-scan': sendMessage broadcasts to every extension context, so listening for
  // the content script's own kind meant handling messages that never passed through the service
  // worker and therefore carry no config. See messages.ts.
  if (msg?.kind !== 'l2-run') return;
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
      //
      // 🔴 EVERY branch below names itself, including the ones that do nothing. The previous
      // version logged only on success and on failure, so a skipped scan was silent — and the
      // absence of a log carried no information whatsoever. That is how a feature which had
      // never executed once looked identical to a feature that was working, for a full session.
      let sensitivity: SensitivityStatus;
      const cfg = msg.sensitivity;

      if (msg.purpose === 'file') {
        // ADR 0018, enforced structurally rather than by a token cutoff that happens to exclude
        // file extracts today.
        sensitivity = { state: 'skipped', why: 'file-path' };
      } else if (!cfg.modelId) {
        sensitivity = { state: 'disabled' };
      } else if (!entities.length) {
        sensitivity = { state: 'skipped', why: 'no-entities' };
      } else if (!isEligible(msg.text, cfg.maxTokens)) {
        sensitivity = { state: 'skipped', why: 'too-long' };
      } else {
        try {
          // 🔴 The load is the step that stalls: ~535 MB on first run, and a failure can present
          // as a promise that never settles rather than an error. The gate's own timeout is
          // 120 s (content.ts), sized for a crashed engine — long enough that a stall here reads
          // to the user as "pressing Send does nothing". Observed 2026-07-20.
          // 60 s (estimate): a first-run download of this size over a home connection exceeds the
          // previous 20 s. Replaced by the team test's measurement.
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
          sensitivity = timedOut
            ? { state: 'failed', reason: 'span budget exhausted — remaining spans kept masked' }
            : {
              state: 'ready',
              spans: entities.length,
              released: released.length,
              kept: kept.length,
              failed,
              ms: performance.now() - t0,
            };
          entities = kept;
        } catch (e) {
          // ADR 0014: a dead engine degrades, it does not decide. Masking everything the NER
          // found is the safe direction, so the original list stands — and now it is VISIBLE.
          sensitivity = { state: 'failed', reason: e instanceof Error ? e.message : String(e) };
        }
      }
      console.debug('[sensitivity]', describeStatus(sensitivity));

      sendResponse({
        kind: 'l2-result', id: msg.id, ok: true, entities, sensitivity,
      } satisfies ScanResponse);
    } catch (e) {
      sendResponse({ kind: 'l2-result', id: msg.id, ok: false, error: String(e) } satisfies ScanResponse);
    }
  })();
  return true; // async sendResponse
});
