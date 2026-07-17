import { describe, it, expect } from 'vitest';
import { detectEmail } from '../../src/detection/l1/email';

describe('email', () => {
  it('detects a normal address', () =>
    expect(detectEmail('reach me at alice@example.com thanks')[0]?.cls).toBe('EMAIL'));
  it('does not fire on not an @ mention', () => expect(detectEmail('not an @ mention')).toEqual([]));
  it('does not fire on a@b without TLD', () => expect(detectEmail('a@b')).toEqual([]));
});
