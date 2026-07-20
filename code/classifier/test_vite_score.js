const fs = require('fs');
const model = JSON.parse(fs.readFileSync('../extension/src/detection/ethics/model.json', 'utf8'));

function wordTokens(text) { return text.toLowerCase().match(/[\p{L}\p{N}_]{2,}/gu) ?? []; }
function wordNgrams(text, min = 1, max = 2) {
  const tokens = wordTokens(text);
  const out = [];
  for (let n = min; n <= max; n++) {
    for (let i = 0; i + n <= tokens.length; i++) out.push(tokens.slice(i, i + n).join(' '));
  }
  return out;
}
function charWbNgrams(text, min = 3, max = 5) {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  const out = [];
  for (const word of words) {
    const padded = ` ${word} `;
    if (padded.length < min) {
      out.push(padded);
      continue;
    }
    const maxN = Math.min(max, padded.length);
    for (let n = min; n <= maxN; n++) {
      for (let i = 0; i + n <= padded.length; i++) {
        out.push(padded.slice(i, i + n));
      }
    }
  }
  return out;
}
function accumulate(terms, branch, counts) {
  for (const term of terms) {
    const index = branch.vocab[term];
    if (index === undefined) continue;
    counts.set(index, (counts.get(index) ?? 0) + 1);
  }
}
function vectorize(text, model) {
  const counts = new Map();
  accumulate(wordNgrams(text, 1, 2), model.word, counts);
  accumulate(charWbNgrams(text, 3, 5), model.char, counts);
  const weighted = new Map();
  for (const [index, count] of counts) {
    const idf = model.word.idf[String(index)] ?? model.char.idf[String(index)];
    if (idf === undefined) continue;
    weighted.set(index, count * idf);
  }
  let sumSquares = 0;
  for (const value of weighted.values()) sumSquares += value * value;
  const norm = Math.sqrt(sumSquares);
  if (norm === 0) return weighted;
  for (const [index, value] of weighted) weighted.set(index, value / norm);
  return {weighted, norm, sumSquares};
}

const v = vectorize("Write a python script to monitor employees covertly.", model);
console.log("JS Norm:", v.norm);
let score = model.categories.find(c => c.key === "covert_surveillance").intercept;
const coef = model.categories.find(c => c.key === "covert_surveillance").coef;
for (const [index, weight] of coef) {
  const value = v.weighted.get(index);
  if (value !== undefined) score += weight * value;
}
console.log("JS Score:", score);
