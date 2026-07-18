import { describe, it, expect } from 'vitest';
import { detectCard } from '../../src/detection/l1/card';

describe('card', () => {
  it('detects a Luhn-valid test PAN', () => expect(detectCard('4111 1111 1111 1111')[0]?.cls).toBe('CARD'));
  it('ignores a Luhn-invalid 16-digit run', () => expect(detectCard('4111 1111 1111 1112')).toEqual([]));
  it('ignores a 12-digit run (too short for a card)', () => expect(detectCard('4111 1111 1111')).toEqual([]));
  it('detects a Luhn-valid 19-digit PAN', () =>
    expect(detectCard('4111 1111 1111 1111 110')[0]?.cls).toBe('CARD'));
  it('does not fire on a 20-digit run whose 19-digit prefix fails Luhn', () =>
    expect(detectCard('12345678901234567890')).toEqual([]));
});
