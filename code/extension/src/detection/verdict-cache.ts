import type { Finding } from './l1/types';
export type Verdict = { state: 'CLEAN' | 'DIRTY'; findings: Finding[]; complete: boolean };

export class VerdictCache {
  private m = new Map<string, Verdict>();
  getSync(hash: string): Verdict | undefined { return this.m.get(hash); }
  setDirty(hash: string, findings: Finding[]): void {
    this.m.set(hash, { state: 'DIRTY', findings, complete: false });
  }
  setClean(hash: string, findings: Finding[]): void {
    if (this.m.get(hash)?.state === 'DIRTY') return; // monotonic: never DIRTY -> CLEAN except via full scan
    this.m.set(hash, { state: 'CLEAN', findings, complete: true });
  }
  markComplete(hash: string): void {
    const v = this.m.get(hash); if (v) v.complete = true;
  }
}
