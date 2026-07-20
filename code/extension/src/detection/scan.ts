import type { Finding } from './l1/types';
import { runL1 } from './l1';
import { l2Scan } from './l2/client';
import type { ScanPurpose } from './l2/messages';
import { sha256Hex } from './hash';
import { VerdictCache, type Verdict } from './verdict-cache';

export async function scanInto(
  cache: VerdictCache,
  text: string,
  opts: { l2TimeoutMs: number; purpose: ScanPurpose },
): Promise<Verdict> {
  const hash = await sha256Hex(text);
  const l1 = runL1(text);
  if (l1.length > 0) cache.setDirty(hash, l1); // ADR 0013: gate the dangerous input now

  // `purpose` carries to the offscreen document so ADR 0018 ("sensitivity never gates files") is
  // enforced by the code. The chat path and the file path share this function; until now files
  // escaped the classifier only because their extracts are long enough to fall past the token
  // cutoff — a coincidence of a number, not a guarantee.
  const l2 = await l2Scan(text, opts.l2TimeoutMs, opts.purpose);
  if (l2 === 'degraded') {
    // ADR 0014: preserve L1 dirtiness; otherwise pass explicitly as surfaced advisory, never as CLEAN.
    if (l1.length === 0) cache.setAdvisory(hash);
    return cache.getSync(hash)!;
  }
  const l2Findings: Finding[] = l2.entities.map((e) => ({ cls: e.type, start: e.start, end: e.end, text: e.text }));
  const findings = [...l1, ...l2Findings];
  if (findings.length > 0) cache.setDirty(hash, findings);
  else cache.setClean(hash, []);
  cache.markComplete(hash);
  return cache.getSync(hash)!;
}
