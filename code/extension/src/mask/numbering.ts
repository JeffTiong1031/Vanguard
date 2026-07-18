import type { FindingClass } from '../detection/l1/types';

export class SessionNumbering {
  private counters = new Map<FindingClass, number>();
  private assigned = new Map<string, string>(); // `${cls}${text}` -> placeholder (IN MEMORY ONLY)

  placeholderFor(cls: FindingClass, text: string): string {
    const key = `${cls}${text}`;
    const seen = this.assigned.get(key);
    if (seen) return seen;
    const next = (this.counters.get(cls) ?? 0) + 1;
    this.counters.set(cls, next);
    const ph = `${cls}_${next}`;
    this.assigned.set(key, ph);
    return ph;
  }
}
