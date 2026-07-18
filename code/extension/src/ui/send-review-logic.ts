import type { Finding, FindingClass } from '../detection/l1/types';
import { SessionNumbering } from '../mask/placeholder';

export type SpanStatus =
  | { kind: 'pending' }
  | { kind: 'accepted'; placeholder: string }
  | { kind: 'ignored'; reason: string };

export type SpanDecisionMap = Map<string, SpanStatus>;

export function spanKey(f: Finding): string {
  return `${f.cls}:${f.start}:${f.end}:${f.text}`;
}

const WHY: Record<string, string> = {
  NRIC: 'Looks like a Malaysian identity card number.',
  SSM: 'Looks like a company registration (SSM) number.',
  NRIC_OR_SSM_AMBIGUOUS: 'Could be an IC or an SSM number — structure alone cannot tell.',
  TIN: 'Looks like a tax identification number (TIN).',
  EMAIL: 'Looks like an email address.',
  CARD: 'Looks like a payment card number.',
  PERSON: 'Looks like a person name. Mask if this is someone from your org or a private individual.',
  ORG: 'Looks like an organisation name. Mask if this is sensitive to your company.',
};

export function whyForClass(cls: FindingClass | string): string {
  return WHY[cls] ?? `Detected as ${cls}.`;
}

export function initDecisions(findings: Finding[]): SpanDecisionMap {
  const map: SpanDecisionMap = new Map();
  for (const f of findings) map.set(spanKey(f), { kind: 'pending' });
  return map;
}

export function allResolved(decisions: SpanDecisionMap): boolean {
  if (decisions.size === 0) return true;
  for (const d of decisions.values()) {
    if (d.kind === 'pending') return false;
  }
  return true;
}

export function pendingCount(decisions: SpanDecisionMap): number {
  let n = 0;
  for (const d of decisions.values()) if (d.kind === 'pending') n += 1;
  return n;
}

/** Build final outbound text: accepted → placeholder, ignored/pending → original. */
export function buildFinalText(
  text: string,
  findings: Finding[],
  decisions: SpanDecisionMap,
  numbering: SessionNumbering,
): string {
  const sorted = [...findings].sort((a, b) => b.start - a.start);
  let out = text;
  for (const f of sorted) {
    const d = decisions.get(spanKey(f));
    if (!d || d.kind !== 'accepted') continue;
    const ph = d.placeholder || numbering.placeholderFor(f.cls, f.text);
    out = out.slice(0, f.start) + ph + out.slice(f.end);
  }
  return out;
}

export type PreviewSeg =
  | { type: 'text'; value: string }
  | {
      type: 'span';
      finding: Finding;
      display: string;
      status: SpanStatus['kind'];
      animating?: boolean;
    };

/** Left-to-right segments for the review preview (original offsets). */
export function buildPreviewSegments(
  text: string,
  findings: Finding[],
  decisions: SpanDecisionMap,
): PreviewSeg[] {
  const sorted = [...findings].sort((a, b) => a.start - b.start);
  const segs: PreviewSeg[] = [];
  let cursor = 0;
  for (const f of sorted) {
    if (f.start < cursor) continue; // overlap skip
    if (f.start > cursor) segs.push({ type: 'text', value: text.slice(cursor, f.start) });
    const d = decisions.get(spanKey(f)) ?? { kind: 'pending' as const };
    const display =
      d.kind === 'accepted' ? d.placeholder : text.slice(f.start, f.end);
    segs.push({ type: 'span', finding: f, display, status: d.kind });
    cursor = f.end;
  }
  if (cursor < text.length) segs.push({ type: 'text', value: text.slice(cursor) });
  return segs;
}

export function acceptAllDecisions(
  findings: Finding[],
  numbering: SessionNumbering,
): SpanDecisionMap {
  const map: SpanDecisionMap = new Map();
  for (const f of findings) {
    map.set(spanKey(f), {
      kind: 'accepted',
      placeholder: numbering.placeholderFor(f.cls, f.text),
    });
  }
  return map;
}
