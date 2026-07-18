// src/detection/l1/card.ts — 13-19 digit runs (optionally spaced/dashed) that pass Luhn.
import type { Finding } from './types';
const CAND_RE = /\b(?:\d[ -]?){13,19}\b/g;
function luhnOk(digits: string): boolean {
  let sum = 0, alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48;
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n; alt = !alt;
  }
  return sum % 10 === 0;
}
export function detectCard(text: string): Finding[] {
  const out: Finding[] = [];
  for (const m of text.matchAll(CAND_RE)) {
    const digits = m[0].replace(/[ -]/g, '');
    if (digits.length < 13 || digits.length > 19 || !luhnOk(digits)) continue;
    out.push({ cls: 'CARD', start: m.index!, end: m.index! + m[0].length, text: m[0] });
  }
  return out;
}
