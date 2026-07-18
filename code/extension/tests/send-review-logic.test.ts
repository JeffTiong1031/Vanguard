import { describe, it, expect } from 'vitest';
import { SessionNumbering } from '../src/mask/placeholder';
import type { Finding } from '../src/detection/l1/types';
import {
  acceptAllDecisions,
  allResolved,
  buildFinalText,
  buildPreviewSegments,
  initDecisions,
  pendingCount,
  spanKey,
} from '../src/ui/send-review-logic';

const findings: Finding[] = [
  { cls: 'NRIC', start: 3, end: 17, text: '890101-14-5555' },
  { cls: 'EMAIL', start: 20, end: 33, text: 'a@example.com' },
];
const text = 'IC 890101-14-5555 / a@example.com';

describe('send-review-logic', () => {
  it('starts with every span pending', () => {
    const d = initDecisions(findings);
    expect(pendingCount(d)).toBe(2);
    expect(allResolved(d)).toBe(false);
  });

  it('buildFinalText masks only accepted spans', () => {
    const numbering = new SessionNumbering();
    const d = initDecisions(findings);
    d.set(spanKey(findings[0]!), {
      kind: 'accepted',
      placeholder: numbering.placeholderFor('NRIC', findings[0]!.text),
    });
    d.set(spanKey(findings[1]!), { kind: 'ignored', reason: 'public' });
    expect(buildFinalText(text, findings, d, numbering)).toBe('IC NRIC_1 / a@example.com');
  });

  it('Accept all resolves everything', () => {
    const numbering = new SessionNumbering();
    const d = acceptAllDecisions(findings, numbering);
    expect(allResolved(d)).toBe(true);
    expect(buildFinalText(text, findings, d, numbering)).toBe('IC NRIC_1 / EMAIL_1');
  });

  it('preview segments mark pending vs accepted display', () => {
    const numbering = new SessionNumbering();
    const d = initDecisions(findings);
    d.set(spanKey(findings[0]!), {
      kind: 'accepted',
      placeholder: 'NRIC_1',
    });
    const segs = buildPreviewSegments(text, findings, d);
    const spans = segs.filter((s) => s.type === 'span');
    expect(spans[0]).toMatchObject({ display: 'NRIC_1', status: 'accepted' });
    expect(spans[1]).toMatchObject({ display: 'a@example.com', status: 'pending' });
    void numbering;
  });
});
