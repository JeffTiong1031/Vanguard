/**
 * A TypeScript reimplementation of scikit-learn's TF-IDF, exactly.
 *
 * 🔴 Every function here mirrors a documented sklearn behaviour. A subtle
 * mismatch produces a WRONG SCORE, never an error -- which is why
 * tests/ethics-parity.test.ts compares against real Python output rather than
 * trusting these units alone.
 *
 * Contract pinned by code/classifier/tests/test_vectorizer_contract.py.
 */
export type Branch = { vocab: Record<string, number>; idf: Record<string, number> };
export type EthicsModel = {
  version: number;
  settings: { lowercase: boolean; word_ngram_range: [number, number]; char_ngram_range: [number, number] };
  word: Branch;
  char: Branch;
  categories: { key: string; threshold: number; intercept: number; coef: [number, number][] }[];
};

/** sklearn's default token_pattern: (?u)\b\w\w+\b — two or more word chars. */
export function wordTokens(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}_]{2,}/gu) ?? [];
}

export function wordNgrams(text: string, min = 1, max = 2): string[] {
  const tokens = wordTokens(text);
  const out: string[] = [];
  for (let n = min; n <= max; n++) {
    for (let i = 0; i + n <= tokens.length; i++) out.push(tokens.slice(i, i + n).join(' '));
  }
  return out;
}

/**
 * sklearn analyzer="char_wb": n-grams from inside word boundaries only, with
 * each whitespace-separated word padded by one space on each side. A word
 * shorter than n yields the padded word itself, once.
 */
export function charWbNgrams(text: string, min = 3, max = 5): string[] {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (const word of words) {
    const padded = ` ${word} `;
    for (let n = min; n <= max; n++) {
      if (padded.length < n) { out.push(padded); continue; }
      for (let i = 0; i + n <= padded.length; i++) out.push(padded.slice(i, i + n));
    }
  }
  return out;
}

function accumulate(
  terms: string[], branch: Branch, counts: Map<number, number>,
): void {
  for (const term of terms) {
    const index = branch.vocab[term];
    if (index === undefined) continue;   // out-of-vocabulary, as sklearn does
    counts.set(index, (counts.get(index) ?? 0) + 1);
  }
}

/**
 * Produce the L2-normalised TF-IDF vector as a sparse index -> weight map.
 *
 * Normalisation happens ONCE over the concatenation of both branches, matching
 * train.py, which sets norm=None on each branch and normalises after.
 */
export function vectorize(text: string, model: EthicsModel): Map<number, number> {
  const counts = new Map<number, number>();
  const [wMin, wMax] = model.settings.word_ngram_range;
  const [cMin, cMax] = model.settings.char_ngram_range;
  accumulate(wordNgrams(text, wMin, wMax), model.word, counts);
  accumulate(charWbNgrams(text, cMin, cMax), model.char, counts);

  const weighted = new Map<number, number>();
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
  return weighted;
}
