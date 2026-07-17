// src/detection/l1/tin.ts — LHDN TIN: IG (current) + legacy SG/OG (pre-2023 docs get pasted; doc 03 §U3).
import type { Finding } from './types';
const TIN_RE = /\b(IG|SG|OG)\d{9,11}\b/gi;
export function detectTin(text: string): Finding[] {
  return [...text.matchAll(TIN_RE)].map((m) => ({ cls: 'TIN', start: m.index!, end: m.index! + m[0].length, text: m[0] }));
}
