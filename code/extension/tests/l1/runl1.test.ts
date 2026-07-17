import { describe, it, expect } from 'vitest';
import { runL1 } from '../../src/detection/l1';

describe('runL1', () => {
  it('returns only NRIC for a dashed NRIC, not SSM/AMBIGUOUS on the same string', () => {
    const findings = runL1('IC 890101-14-5555 ok');
    expect(findings).toHaveLength(1);
    expect(findings[0]?.cls).toBe('NRIC');
  });

  it('dedupes overlapping findings, keeping the longer span', () => {
    // 16-digit Luhn-valid PAN; SSM would match a 12-digit prefix if boundaries allowed overlap.
    const text = '4111111111111111';
    const findings = runL1(text);
    expect(findings.filter((f) => f.cls === 'CARD')).toHaveLength(1);
    expect(findings.filter((f) => f.cls === 'SSM' || f.cls === 'NRIC_OR_SSM_AMBIGUOUS')).toHaveLength(0);
  });

  it('merges non-overlapping findings from multiple detectors', () => {
    const findings = runL1('IC 890101-14-5555 email alice@example.com TIN IG123456789');
    const classes = findings.map((f) => f.cls).sort();
    expect(classes).toEqual(['EMAIL', 'NRIC', 'TIN']);
  });
});
