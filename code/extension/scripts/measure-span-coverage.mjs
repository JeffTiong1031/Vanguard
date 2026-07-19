// scripts/measure-span-coverage.mjs
//
// Measures what fraction of gold MASK spans Slice 1's ACTUAL L2 pipeline covers in full.
//
// 🔴 Why this exists rather than reusing the ml/ number. The ml/ track measured 65.3% full
// coverage using HuggingFace `aggregation_strategy="simple"` and the library's own offset
// mapping. Slice 1 does neither: transformers.js v3's token-classification pipeline never
// populates start/end (its own source still carries `// TODO: Add support for start and end`),
// so `attachCharOffsets` reconstructs positions by walking the text and searching for each
// decoded piece. That is a different mechanism with its own failure modes, and its comments
// flag several. Quoting the ml/ figure for this pipeline would be asserting a number measured
// somewhere else.
//
// Reads the ml/ eval exam purely as gold spans. Nothing is trained or tuned here.
//
//   node scripts/measure-span-coverage.mjs [--limit N]

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { pipeline, env } from '@huggingface/transformers';
import { attachCharOffsets, mergeNerTokens } from '../src/detection/l2/messages.ts';
import { repairEntities } from '../src/detection/l2/span-repair.ts';
import { normaliseTerms, proposeOrgs } from '../src/detection/l2/org-dictionary.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const EXAM = resolve(HERE, '../../../ml/data/eval_simulated/exam.jsonl');
const MODEL_ID = 'Xenova/bert-base-multilingual-cased-ner-hrl';

env.allowLocalModels = false;

const limitArg = process.argv.indexOf('--limit');
const LIMIT = limitArg > -1 ? Number(process.argv[limitArg + 1]) : Infinity;
const REPAIR = process.argv.includes('--repair');
const USE_DICT = process.argv.includes('--dict');

// 🔴 The dictionary is derived from the ml/ TRAINING set only, never from the exam. A dictionary
// built from the exam's own organisations would recover nearly all of them and prove nothing —
// the same defect as tuning a rule against the thing that measures it. It covers roughly half
// the exam's ORGs, which is the honest estimate.
let ORG_TERMS = [];
if (USE_DICT) {
  const TRAIN = resolve(HERE, '../../../ml/data/train/merged_v3.jsonl');
  const seen = [];
  for (const line of readFileSync(TRAIN, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    for (const sp of JSON.parse(line).spans ?? []) {
      if (sp.entity_type === 'ORG') seen.push(sp.surface);
    }
  }
  ORG_TERMS = normaliseTerms(seen);
  console.log(`org dictionary: ${ORG_TERMS.length} terms (from TRAINING set, not the exam)`);
}

const rows = readFileSync(EXAM, 'utf8')
  .split('\n')
  .filter((l) => l.trim())
  .map((l) => JSON.parse(l))
  .slice(0, LIMIT);

console.log(`exam rows: ${rows.length}`);
console.log(`loading ${MODEL_ID} (first run downloads weights)...`);

// Mirror entrypoints/offscreen/main.ts exactly: same model, same dtype, same ignore_labels.
const ner = await pipeline('token-classification', MODEL_ID, { dtype: 'q8' });

/** Fraction of [goldStart, goldEnd) covered by any proposed span. Partial counts as a miss:
 *  the value is protected only if all of it is replaced. */
function coverage(goldStart, goldEnd, spans) {
  if (goldEnd <= goldStart) return 0;
  const covered = new Set();
  for (const s of spans) {
    for (let i = Math.max(s.start, goldStart); i < Math.min(s.end, goldEnd); i++) covered.add(i);
  }
  return covered.size / (goldEnd - goldStart);
}

const byLang = new Map();
let full = 0;
let fragment = 0;
let none = 0;
const examples = [];

let done = 0;
for (const ex of rows) {
  // ignore_labels: [] is what the offscreen caller passes — O tokens must advance the cursor
  // or attachCharOffsets lands on the first occurrence of a recurring word.
  const raw = await ner(ex.text, { ignore_labels: [] });
  let proposed = mergeNerTokens(attachCharOffsets(ex.text, raw));
  if (USE_DICT) proposed = proposeOrgs(ex.text, ORG_TERMS, proposed);
  if (REPAIR) proposed = repairEntities(proposed, ex.text);

  for (const sp of ex.spans) {
    if (sp.label !== 'MASK') continue;
    const frac = coverage(sp.start, sp.end, proposed);
    const bucket = byLang.get(ex.lang) ?? { full: 0, total: 0 };
    bucket.total += 1;
    if (frac >= 0.999) {
      full += 1;
      bucket.full += 1;
    } else if (frac > 0) {
      fragment += 1;
      if (examples.length < 12) {
        examples.push({
          id: ex.id,
          lang: ex.lang,
          gold: sp.surface,
          got: proposed
            .filter((p) => Math.min(p.end, sp.end) > Math.max(p.start, sp.start))
            .map((p) => ex.text.slice(p.start, p.end)),
          frac: frac.toFixed(2),
        });
      }
    } else {
      none += 1;
    }
    byLang.set(ex.lang, bucket);
  }

  if (++done % 50 === 0) console.log(`  ${done}/${rows.length}`);
}

const total = full + fragment + none;
console.log('\n=== Slice 1 pipeline, MASK span coverage ===');
console.log(`  MASK spans          ${total}`);
console.log(`  covered in full     ${full}  (${(full / total).toFixed(3)})`);
console.log(`  fragment only       ${fragment}  (${(fragment / total).toFixed(3)})`);
console.log(`  no overlap          ${none}  (${(none / total).toFixed(3)})`);
console.log('\n  by language (full-coverage rate):');
for (const [lang, b] of [...byLang].sort()) {
  console.log(`    ${lang.padEnd(6)} ${(b.full / b.total).toFixed(3)}  (${b.full}/${b.total})`);
}
console.log('\n  fragment examples (what repair would fix):');
for (const e of examples) {
  console.log(`    ${e.id} [${e.lang}] gold=${JSON.stringify(e.gold)} got=${JSON.stringify(e.got)} frac=${e.frac}`);
}
