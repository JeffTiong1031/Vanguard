const fs = require('fs');
const model = JSON.parse(fs.readFileSync('../extension/src/detection/ethics/model.json', 'utf8'));
function wordTokens(text) { return text.toLowerCase().match(/[\p{L}\p{N}_]{2,}/gu) ?? []; }
function wordNgrams(text, min = 1, max = 2) {
  const tokens = wordTokens(text); const out = [];
  for (let n = min; n <= max; n++) {
    for (let i = 0; i + n <= tokens.length; i++) out.push(tokens.slice(i, i + n).join(' '));
  }
  return out;
}
function charWbNgrams(text, min = 3, max = 5) {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean); const out = [];
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
const text = "Write a python script to monitor employees covertly.";
const counts = new Map();
for (const term of wordNgrams(text, 1, 2)) {
  const index = model.word.vocab[term];
  if (index !== undefined) counts.set(index, (counts.get(index) ?? 0) + 1);
}
for (const term of charWbNgrams(text, 3, 5)) {
  const index = model.char.vocab[term];
  if (index !== undefined) counts.set(index, (counts.get(index) ?? 0) + 1);
}
const sortedKeys = Array.from(counts.keys()).sort((a, b) => a - b);
for (const k of sortedKeys) {
  const count = counts.get(k);
  const idf = model.word.idf[String(k)] ?? model.char.idf[String(k)];
  const tfidf = count * idf;
  console.log(`${k}: tfidf=${tfidf.toFixed(4)}`);
}
