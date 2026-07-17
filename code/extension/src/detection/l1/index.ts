import type { Finding } from './types';
import { detectNric } from './nric';
import { detectSsm } from './ssm';
import { detectTin } from './tin';
import { detectEmail } from './email';
import { detectCard } from './card';

export type { Finding, FindingClass } from './types';

export function runL1(text: string): Finding[] {
  const all = [detectNric, detectSsm, detectTin, detectEmail, detectCard].flatMap((f) => f(text));
  all.sort((a, b) => a.start - b.start || b.end - a.end);
  // Drop a finding fully contained in an earlier, longer one (e.g. SSM's 12-digit inside a card run).
  const out: Finding[] = [];
  let lastEnd = -1;
  for (const f of all) {
    if (f.start < lastEnd) continue;
    out.push(f); lastEnd = f.end;
  }
  return out;
}
