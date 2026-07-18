import { describe, it, expect } from 'vitest';
import { detectSsm } from '../../src/detection/l1/ssm';

describe('SSM', () => {
  it('flags a 12-digit that cannot be an NRIC as SSM', () =>
    expect(detectSsm('201501234567')[0]?.cls).toBe('SSM')); // month=15 -> not NRIC-shaped
  it('flags an NRIC-shaped 12-digit as AMBIGUOUS', () =>
    expect(detectSsm('890101145555')[0]?.cls).toBe('NRIC_OR_SSM_AMBIGUOUS'));
  it('does not fire on an 11-digit run', () => expect(detectSsm('20150123456')).toEqual([]));
  it('does not fire on a 13-digit run', () => expect(detectSsm('2015012345678')).toEqual([]));
});
