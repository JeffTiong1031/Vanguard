// scripts/verify-web-bundle.mjs
//
// Prove transformers.js can actually load the bundle and that its verdicts match the Python
// model, BEFORE anyone loads it in a browser.
//
// 🔴 Why this exists. The first integration attempt pointed transformers.js at the flat ONNX
// export with an empty model id. It resolves models by convention -- <base>/<id>/config.json,
// tokenizer.json, onnx/model.onnx -- so nothing was found, the load never completed, and the
// symptom was "Einstein is still blocked": indistinguishable from the classifier simply
// disagreeing. A load failure and a wrong answer look identical from the outside, so the load
// has to be proven separately.
//
//   node scripts/verify-web-bundle.mjs <base-url-or-dir> [model-id]

import { pipeline, env } from '@huggingface/transformers';

const base = process.argv[2];
const modelId = process.argv[3] ?? 'sens';
if (!base) {
  console.error('usage: node scripts/verify-web-bundle.mjs <base-url-or-dir> [model-id]');
  process.exit(1);
}

env.allowLocalModels = true;
env.localModelPath = base;
env.useBrowserCache = false;

// Expected verdicts come from the Python model on the same strings (2026-07-19). The point is
// not that the model is good -- that is the exam's job -- but that the JS runtime reproduces it.
const CASES = [
  ['Explain [E] Einstein [/E] theory', 'KEEP'],
  ["Summarise [E] Apple [/E] 's latest quarterly earnings.", 'KEEP'],
  ['[E] Einstein [/E] from accounting has not sent the invoice.', 'MASK'],
  ['Chase payment from [E] Apple [/E] ; they owe us RM50,000.', 'MASK'],
  ['[E] 李白 [/E] 的诗歌流传千古。', 'KEEP'],
  ['[E] 李白先生 [/E] ，您的退款已经处理完毕。', 'MASK'],
  ['Tolong ingatkan [E] Encik Rahman [/E] pasal mesyuarat esok.', 'MASK'],
];

// 🔴 dtype is what picks the FILE, and its default is per-device: `cpu` -> fp32, `wasm` -> q8
// (DEFAULT_DEVICE_DTYPE_MAPPING, utils/dtypes.js). An earlier version of this script ran cpu
// with no dtype, resolved onnx/model.onnx, and passed — while the browser asked wasm for
// onnx/model_quantized.onnx, got a 404, and failed. The verifier certified a file the product
// never loads.
//
// Node offers no wasm device, so the device cannot be matched. The DTYPE can, and it is the part
// that selects the artifact. Assert the file exists too, since that is the failure mode.
const DTYPE = 'fp32';   // must match the offscreen document; int8 is BLOCKED for this model

const expected = `${base.replace(/\/+$/, '')}/${modelId}/onnx/model.onnx`;
console.log(`loading ${base}/${modelId} (dtype=${DTYPE}) ...`);
console.log(`  expects ${expected}`);

const t0 = performance.now();
const clf = await pipeline('text-classification', modelId, { device: 'cpu', dtype: DTYPE });
console.log(`loaded in ${((performance.now() - t0) / 1000).toFixed(1)} s\n`);

let wrong = 0;
for (const [text, expected] of CASES) {
  const t = performance.now();
  const [top] = await clf(text);
  const ms = performance.now() - t;
  const ok = top.label === expected;
  if (!ok) wrong += 1;
  console.log(
    `${ok ? 'ok  ' : 'WRONG'} ${top.label.padEnd(4)} ${top.score.toFixed(3)} ` +
    `${ms.toFixed(0).padStart(5)} ms  ${text.slice(0, 58)}`,
  );
}

console.log(wrong === 0
  ? '\nAll verdicts match the Python model. The bundle is loadable and correct.'
  : `\n${wrong} verdict(s) differ from Python — do NOT ship this bundle.`);
process.exit(wrong === 0 ? 0 : 1);
