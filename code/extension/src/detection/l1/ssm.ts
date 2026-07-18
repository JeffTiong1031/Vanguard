// src/detection/l1/ssm.ts — 12 bare digits. ~86% of 2001-2012 incorporations also parse as NRIC.
// The day filter is defeated by construction, so a 12-digit number that ALSO parses as an NRIC-shaped
// string is AMBIGUOUS, not decidable from digits alone (doc 03 §2.3).
import type { Finding } from './types';
const SSM_RE = /\b(\d{12})\b/g;

export function detectSsm(text: string): Finding[] {
  const out: Finding[] = [];
  for (const m of text.matchAll(SSM_RE)) {
    const d = m[1]!;
    const mm = +d.slice(2, 4), dd = +d.slice(4, 6);
    const looksNric = mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31;
    out.push({
      cls: looksNric ? 'NRIC_OR_SSM_AMBIGUOUS' : 'SSM',
      start: m.index!, end: m.index! + 12, text: d,
    });
  }
  return out;
}
