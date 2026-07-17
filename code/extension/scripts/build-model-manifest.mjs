// scripts/build-model-manifest.mjs — run once to pin, re-run to re-pin on a deliberate model bump.
//
// Files pinned here MUST be exactly the files the running pipeline loads (verified against
// node_modules/@huggingface/transformers@3.8.1 source, see .superpowers/sdd/task-3-report.md):
//   - config.json                 (model config; PretrainedConfig.from_pretrained)
//   - tokenizer.json               (fast tokenizer; PreTrainedTokenizer.from_pretrained)
//   - tokenizer_config.json        (ditto — fetched alongside tokenizer.json, always)
//   - onnx/model_quantized.onnx    (dtype: 'q8' on device 'wasm' -> suffix '_quantized')
// `vocab.txt` is deliberately NOT pinned: transformers.js's tokenizer loader never fetches it
// (only tokenizer.json/tokenizer_config.json), so pinning it would be dead weight, not security.
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
