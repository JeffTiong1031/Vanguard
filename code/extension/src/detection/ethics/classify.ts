import { vectorize, type EthicsModel } from './vectorize';

/** decision_function: w·x + b, per category. */
export function scoreAll(text: string, model: EthicsModel): Record<string, number> {
  const x = vectorize(text, model);
  const out: Record<string, number> = {};
  for (const category of model.categories) {
    let score = category.intercept;
    for (const [index, weight] of category.coef) {
      const value = x.get(index);
      if (value !== undefined) score += weight * value;
    }
    out[category.key] = score;
  }
  return out;
}

/**
 * The highest-scoring category that clears its own threshold, or null.
 *
 * Thresholds are PER CATEGORY because each was chosen to keep every hard
 * negative silent for that category specifically -- a single global threshold
 * would be set by whichever category happens to be noisiest.
 */
export function classify(
  text: string, model: EthicsModel,
): { category: string; score: number } | null {
  const scores = scoreAll(text, model);
  let best: { category: string; score: number } | null = null;
  for (const category of model.categories) {
    const score = scores[category.key]!;
    if (score < category.threshold) continue;
    if (!best || score > best.score) best = { category: category.key, score };
  }
  return best;
}
