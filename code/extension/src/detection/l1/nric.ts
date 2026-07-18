// src/detection/l1/nric.ts — YYMMDD-PB-###G. No checksum (U1). Day/month sanity only; PB open-set.
import type { Finding } from './types';
const NRIC_RE = /\b(\d{2})(\d{2})(\d{2})-(\d{2})-(\d{4})\b/g;
const UNASSIGNED_PB = new Set(['00','17','18','19','20','69','70','73','80','81','94','95','96','97']);

export function detectNric(text: string): Finding[] {
  const out: Finding[] = [];
  for (const m of text.matchAll(NRIC_RE)) {
    const [, , mm, dd, pb] = m;
    if (+mm < 1 || +mm > 12 || +dd < 1 || +dd > 31) continue; // structural (doc 03 §2.2)
    if (UNASSIGNED_PB.has(pb!)) continue;                      // 14 unassigned PB codes (U2)
    out.push({ cls: 'NRIC', start: m.index!, end: m.index! + m[0].length, text: m[0] });
  }
  return out;
}
