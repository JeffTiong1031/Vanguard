import type { Finding, FindingClass } from '../detection/l1/types';
export { SessionNumbering } from './numbering';
import { SessionNumbering } from './numbering';

export function rewrite(text: string, findings: Finding[], numbering: SessionNumbering) {
  const sorted = [...findings].sort((a, b) => b.start - a.start); // right-to-left keeps offsets valid
  let rewritten = text;
  const map: Array<{ placeholder: string; cls: FindingClass }> = [];
  for (const f of sorted) {
    const ph = numbering.placeholderFor(f.cls, text.slice(f.start, f.end));
    rewritten = rewritten.slice(0, f.start) + ph + rewritten.slice(f.end);
    map.push({ placeholder: ph, cls: f.cls });
  }
  return { rewritten, map };
}
