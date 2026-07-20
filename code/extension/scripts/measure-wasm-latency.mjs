// scripts/measure-wasm-latency.mjs
//
// How long does one classifier forward pass take in the runtime the extension actually gets?
//
// 🔴 doc 06 §6.1: "measure the runtime multiple, do not inherit it." This is that rule applied
// to inference rather than memory. Native CPU numbers are not the product's numbers -- ADR 0017
// ships single-thread WASM with no COOP/COEP and no SharedArrayBuffer (U22), and measured
// 2026-07-19 that costs ~3x.
//
// Uses onnxruntime-web with the wasm backend in Node: the same execution path the offscreen
// document takes, without a 534 MB download into dist/.
//
//   node scripts/measure-wasm-latency.mjs <model.onnx> [--threads 1]
//
// ⚠️ This machine is not D2. ASSUMPTIONS.md defines D2 as a mid-range corporate laptop with
// integrated graphics and no discrete GPU, and rates it Medium confidence with HIGH blast
// radius. Every figure here is a FLOOR for the fleet the product targets.

import { readFileSync, existsSync } from 'node:fs';
import * as ort from 'onnxruntime-web';

const model = process.argv[2];
if (!model) {
  console.error('usage: node scripts/measure-wasm-latency.mjs <model.onnx> [--threads N]');
  process.exit(1);
}
const threadArg = process.argv.indexOf('--threads');
const threads = threadArg > -1 ? Number(process.argv[threadArg + 1]) : 1;

ort.env.wasm.numThreads = threads;
ort.env.wasm.simd = true;
ort.env.logLevel = 'error';

// Weights over 2 GB protobuf live beside the graph in model.onnx.data, and ort-web will not
// resolve the sidecar by convention the way the Python runtime does — it must be handed over.
const graph = new Uint8Array(readFileSync(model));
const opts = { executionProviders: ['wasm'], graphOptimizationLevel: 'all' };
const sidecar = `${model}.data`;
if (existsSync(sidecar)) {
  opts.externalData = [{ path: 'model.onnx.data', data: new Uint8Array(readFileSync(sidecar)) }];
}

const t0 = performance.now();
const session = await ort.InferenceSession.create(graph, opts);
console.log(`threads=${threads}  model load ${((performance.now() - t0) / 1000).toFixed(1)} s\n`);

// Sequence length drives cost; which tokens they are does not.
const LENGTHS = [21, 44, 128, 242, 512];

console.log(`${'tokens'.padStart(7)} ${'p50 ms'.padStart(9)} ${'p95 ms'.padStart(9)}`);
console.log('-'.repeat(28));
for (const n of LENGTHS) {
  const ids = BigInt64Array.from({ length: n }, (_, i) => BigInt(1 + (i * 977) % 70000));
  const mask = BigInt64Array.from({ length: n }, () => 1n);
  const feeds = {
    input_ids: new ort.Tensor('int64', ids, [1, n]),
    attention_mask: new ort.Tensor('int64', mask, [1, n]),
  };
  for (let i = 0; i < 3; i++) await session.run(feeds);
  const times = [];
  for (let i = 0; i < 15; i++) {
    const t = performance.now();
    await session.run(feeds);
    times.push(performance.now() - t);
  }
  times.sort((a, b) => a - b);
  const p50 = times[Math.floor(times.length / 2)];
  const p95 = times[Math.floor(times.length * 0.95)];
  console.log(`${String(n).padStart(7)} ${p50.toFixed(1).padStart(9)} ${p95.toFixed(1).padStart(9)}`);
}

console.log('\nThe classifier runs ONCE PER SPAN, so multiply by the span count. On the ml/ exam');
console.log('that is p50=1, p95=1, max=2 — but a pasted paragraph is longer AND carries more');
console.log('entities, and doc 06 §3 puts paste on the critical path, not typing.');
console.log('Chinese costs 2.78x the tokens per character (U21-a), so the same visual paste sits');
console.log('further down this table.');
