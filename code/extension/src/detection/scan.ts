import type { Finding } from './l1/types';
import { runL1 } from './l1';
import { l2Scan } from './l2/client';
import { sha256Hex } from './hash';
import { VerdictCache, type Verdict } from './verdict-cache';

export async function scanInto(cache: VerdictCache, text: string, opts: { l2TimeoutMs: number }): Promise<Verdict> {
  const hash = await sha256Hex(text);
  const l1 = runL1(text);
  if (l1.length > 0) cache.setDirty(hash, l1); // ADR 0013: gate the dangerous input now

  const l2 = await l2Scan(text, opts.l2TimeoutMs);
  if (l2 === 'degraded') {
    // ADR 0014: never fabricate CLEAN. Keep any L1 dirtiness; if L1 was empty, leave the hash unknown.
    return cache.getSync(hash) ?? { state: 'CLEAN', findings: [], complete: false };
  }
  const l2Findings: Finding[] = l2.map((e) => ({ cls: e.type, start: e.start, end: e.end, text: e.text }));
  const findings = [...l1, ...l2Findings];
  if (findings.length > 0) cache.setDirty(hash, findings);
  else cache.setClean(hash, []);
  cache.markComplete(hash);
  return cache.getSync(hash)!;
}
