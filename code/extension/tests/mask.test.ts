import { describe, it, expect } from 'vitest';
import { SessionNumbering, rewrite } from '../src/mask/placeholder';

describe('masking', () => {
  it('same original -> same placeholder within a session', () => {
    const n = new SessionNumbering();
    expect(n.placeholderFor('PERSON', 'Ahmad')).toBe('PERSON_1');
    expect(n.placeholderFor('PERSON', 'Ahmad')).toBe('PERSON_1');
    expect(n.placeholderFor('PERSON', 'Rachel')).toBe('PERSON_2');
  });
  it('rewrites right-to-left so offsets stay valid', () => {
    const n = new SessionNumbering();
    const { rewritten } = rewrite('call Ahmad about Apple', [
      { cls: 'PERSON', start: 5, end: 10, text: 'Ahmad' },
      { cls: 'ORG', start: 17, end: 22, text: 'Apple' },
    ], n);
    expect(rewritten).toBe('call PERSON_1 about ORG_1');
  });
});
