import { describe, expect, it } from 'vitest';
import { findTerms, normaliseTerms, proposeOrgs } from '../src/detection/l2/org-dictionary';

// The false-positive cases matter more than the hits here: this layer's entire value is its
// precision, and precision is quasi-contractual under ADR 0001.

describe('normaliseTerms', () => {
  it('orders longest first so the full legal name wins', () => {
    const out = normaliseTerms(['Maju Trading', 'Maju Trading Sdn Bhd', 'Acme']);
    expect(out[0]).toBe('Maju Trading Sdn Bhd');
  });

  it('deduplicates case-insensitively', () => {
    expect(normaliseTerms(['Acme', 'ACME', 'acme'])).toHaveLength(1);
  });

  it('drops blanks', () => {
    expect(normaliseTerms(['', '   ', 'Acme'])).toEqual(['Acme']);
  });
});

describe('findTerms', () => {
  it('finds a term the NER misses (Boeing in an English sentence)', () => {
    const text = 'We owe Boeing RM500,000 for the parts.';
    expect(findTerms(text, ['Boeing'])).toEqual([{ start: 7, end: 13 }]);
  });

  it('finds every occurrence', () => {
    expect(findTerms('Boeing invoiced us; Boeing was not paid.', ['Boeing'])).toHaveLength(2);
  });

  it('needs no word boundary for CJK', () => {
    const text = '我们公司目前欠阿里巴巴一笔服务费。';
    const out = findTerms(text, ['阿里巴巴']);
    expect(text.slice(out[0]!.start, out[0]!.end)).toBe('阿里巴巴');
  });

  it('proposes nothing for an empty dictionary', () => {
    expect(findTerms('Anything at all', [])).toEqual([]);
  });
});

describe('precision — what ADR 0004 exact-match exists to protect', () => {
  it('does not fire inside a longer word', () => {
    expect(findTerms('She grabbedit quickly', ['Grab'])).toEqual([]);
  });

  it('respects a trailing boundary', () => {
    expect(findTerms('Acmex is not Acme', ['Acme'])).toEqual([{ start: 13, end: 17 }]);
  });

  it('respects a leading boundary', () => {
    expect(findTerms('MegaAcme is not Acme', ['Acme'])).toEqual([{ start: 16, end: 20 }]);
  });

  it('is case-sensitive — "an apple a day" must not be masked', () => {
    expect(findTerms('I ate an apple a day', ['Apple'])).toEqual([]);
    expect(findTerms('Summarise Apple earnings', ['Apple'])).toEqual([{ start: 10, end: 15 }]);
  });

  it('treats punctuation as a boundary', () => {
    expect(findTerms('Ask Acme, then leave.', ['Acme'])).toEqual([{ start: 4, end: 8 }]);
  });
});

describe('proposeOrgs', () => {
  const ent = (type: string, start: number, end: number, text: string) => ({ type, start, end, text });

  it('adds a term the NER missed', () => {
    const text = 'Tolong bayar bil tertunggak TNB sebelum minggu depan.';
    const out = proposeOrgs(text, ['TNB'], []);
    expect(out).toHaveLength(1);
    expect(out[0]!.type).toBe('ORG');
    expect(out[0]!.text).toBe('TNB');
  });

  it('does NOT re-add an entity the NER already found', () => {
    const text = 'We owe Boeing money.';
    const s = text.indexOf('Boeing');
    const out = proposeOrgs(text, ['Boeing'], [ent('ORG', s, s + 6, 'Boeing')]);
    expect(out).toHaveLength(1);
  });

  it('does not mislabel a PERSON the NER already found', () => {
    // a dictionary term overlapping a PERSON span must not be re-proposed as ORG
    const text = 'Ask Ahmad Trading about it.';
    const s = text.indexOf('Ahmad Trading');
    const out = proposeOrgs(text, ['Ahmad Trading'], [ent('PERSON', s, s + 13, 'Ahmad Trading')]);
    expect(out).toHaveLength(1);
    expect(out[0]!.type).toBe('PERSON');
  });

  it('returns entities in document order', () => {
    const text = 'Pay TNB then invoice Proton.';
    const out = proposeOrgs(text, ['TNB', 'Proton'], []);
    expect(out.map((e) => e.text)).toEqual(['TNB', 'Proton']);
  });

  it('passes NER entities through untouched when the dictionary is empty', () => {
    const text = 'Ask Ahmad about it.';
    const ner = [ent('PERSON', 4, 9, 'Ahmad')];
    expect(proposeOrgs(text, [], ner)).toEqual(ner);
  });
});
