import { describe, it, expect } from 'vitest';
import { detectTin } from '../../src/detection/l1/tin';

describe('TIN', () => {
  it('detects a valid IG TIN', () => expect(detectTin('TIN IG123456789 here')[0]?.cls).toBe('TIN'));
  it('does not fire on a lone SG prefix without digits', () => expect(detectTin('country SG only')).toEqual([]));
  it('does not fire on OG inside a word without 9-11 trailing digits', () =>
    expect(detectTin('cognitive reasoning')).toEqual([]));
});
