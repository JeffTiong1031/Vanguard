import model from './model.json';
import { classify } from './classify';
import type { EthicsModel } from './vectorize';

export type EthicsVerdict = { category: string; label: string; score: number };

/** Mirrors ETHICS_CATEGORIES in code/policy/app/seed.py. Change both together. */
const LABELS: Record<string, string> = {
  covert_surveillance: 'Covert monitoring of employees',
  undisclosed_profiling: 'Profiling people without their knowledge',
  discriminatory_screening: 'Screening or ranking people on protected attributes',
  security_evasion: 'Evading security controls or producing exploit code',
  harassment_content: 'Harassing, threatening, or abusive content',
  regulatory_circumvention: 'Circumventing legal or regulatory obligations',
};

const MODEL = model as unknown as EthicsModel;

/**
 * Classify a prompt. Returns null when nothing clears its threshold, which is
 * the overwhelmingly common case.
 *
 * Synchronous and sub-millisecond: it is a sparse dot product over a few
 * thousand terms, with no ML runtime involved.
 */
export function checkEthics(text: string): EthicsVerdict | null {
  if (!text.trim()) return null;
  const hit = classify(text, MODEL);
  if (!hit) return null;
  return { category: hit.category, label: LABELS[hit.category] ?? hit.category, score: hit.score };
}
