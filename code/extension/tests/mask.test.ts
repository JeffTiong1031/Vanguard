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
  it('distinct classes with colliding concatenation get distinct placeholders', () => {
    const n = new SessionNumbering();
    expect(n.placeholderFor('NRIC', '_OR_SSM_AMBIGUOUSfoo')).toBe('NRIC_1');
    expect(n.placeholderFor('NRIC_OR_SSM_AMBIGUOUS', 'foo')).toBe('NRIC_OR_SSM_AMBIGUOUS_1');
  });
  it('rewrite map has privacy-safe shape with no original text', () => {
    const n = new SessionNumbering();
    const { map } = rewrite('call Ahmad about Apple', [
      { cls: 'PERSON', start: 5, end: 10, text: 'Ahmad' },
      { cls: 'ORG', start: 17, end: 22, text: 'Apple' },
    ], n);
    for (const entry of map) {
      expect(Object.keys(entry).sort()).toEqual(['cls', 'placeholder']);
      expect(entry).toEqual({ placeholder: entry.placeholder, cls: entry.cls });
    }
    const serialized = JSON.stringify(map);
    expect(serialized).not.toContain('Ahmad');
    expect(serialized).not.toContain('Apple');
  });
});
