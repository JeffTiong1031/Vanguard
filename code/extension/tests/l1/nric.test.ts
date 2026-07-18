import { describe, it, expect } from 'vitest';
import { detectNric } from '../../src/detection/l1/nric';

describe('NRIC', () => {
  it('detects a valid NRIC', () => expect(detectNric('IC 890101-14-5555 ok')[0]?.cls).toBe('NRIC'));
  it('rejects an impossible month', () => expect(detectNric('991301-14-5555')).toEqual([]));
  it('rejects an unassigned PB code', () => expect(detectNric('890101-17-5555')).toEqual([]));
  it('does not fire on a bare 12-digit run without dashes', () => expect(detectNric('890101145555')).toEqual([]));
  it('rejects impossible day 00', () => expect(detectNric('890100-14-5555')).toEqual([]));
  it('rejects impossible day 32', () => expect(detectNric('890132-14-5555')).toEqual([]));
});
