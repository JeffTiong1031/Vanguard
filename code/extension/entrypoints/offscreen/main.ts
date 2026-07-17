// entrypoints/offscreen/main.ts
//
// ADR 0006: ONE offscreen instance, all tabs. This is the ONLY module in the extension that
// imports `@huggingface/transformers` (resolution #7) — the background SW and content scripts
// never load the model runtime.
import { pipeline, env, type TokenClassificationPipeline } from '@huggingface/transformers';
import type { PipelineNerToken, ScanRequest, ScanResponse } from '../../src/detection/l2/messages';
import { attachCharOffsets, mergeNerTokens } from '../../src/detection/l2/messages';
import { verifyPinnedModel } from '../../src/detection/l2/pin';

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

chrome.runtime.onMessage.addListener((msg: ScanRequest, _sender, sendResponse) => {
  if (msg?.kind !== 'l2-scan') return;
  (async () => {
    try {
      const ner = await getNer();
      const raw = (await ner(msg.text)) as unknown as PipelineNerToken[];
      // [finding] the pipeline never populates start/end (see messages.ts); reconstruct them
      // from the prompt text before merging into whole-entity spans.
      const withOffsets = attachCharOffsets(msg.text, raw);
      const entities = mergeNerTokens(withOffsets);
      sendResponse({ kind: 'l2-result', id: msg.id, ok: true, entities } satisfies ScanResponse);
    } catch (e) {
      sendResponse({ kind: 'l2-result', id: msg.id, ok: false, error: String(e) } satisfies ScanResponse);
    }
  })();
  return true; // async sendResponse
});
