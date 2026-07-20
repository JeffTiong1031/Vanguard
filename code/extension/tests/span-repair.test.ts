import { describe, expect, it } from 'vitest';
import {
  LEADING_TITLES,
  TRAILING_TITLES,
  expandOrgTails,
  expandTitles,
  mergeSpans,
  repairEntities,
  repairSpans,
} from '../src/detection/l2/span-repair';

// Every fragment below is a REAL output of this extension's own L2 pipeline, captured by
// scripts/measure-span-coverage.mjs over the ml/ exam on 2026-07-19. None is invented.

const slice = (text: string, s: { start: number; end: number }) => text.slice(s.start, s.end);

describe('mergeSpans', () => {
  it('returns nothing for no spans', () => {
    expect(mergeSpans([])).toEqual([]);
  });

  it('unions overlapping spans', () => {
    expect(mergeSpans([{ start: 0, end: 1 }, { start: 0, end: 4 }])).toEqual([{ start: 0, end: 4 }]);
  });

  it('joins touching spans — 阿里巴巴 arrived as 阿里 + 巴', () => {
    expect(mergeSpans([{ start: 0, end: 2 }, { start: 2, end: 4 }])).toEqual([{ start: 0, end: 4 }]);
  });

  it('keeps disjoint spans apart', () => {
    const out = mergeSpans([{ start: 0, end: 3 }, { start: 10, end: 14 }]);
    expect(out).toHaveLength(2);
  });

  it('does not bridge a gap by default', () => {
    expect(mergeSpans([{ start: 0, end: 3 }, { start: 5, end: 8 }])).toHaveLength(2);
  });

  it('bridges when asked', () => {
    expect(mergeSpans([{ start: 0, end: 3 }, { start: 5, end: 8 }], 2)).toEqual([{ start: 0, end: 8 }]);
  });

  it('sorts unsorted input', () => {
    const out = mergeSpans([{ start: 10, end: 14 }, { start: 0, end: 4 }, { start: 2, end: 6 }]);
    expect(out).toEqual([{ start: 0, end: 6 }, { start: 10, end: 14 }]);
  });
});

describe('expandTitles — the doc 04 §4.3 compliance fix', () => {
  it('pulls in a Malay honorific (exam-037: Encik Rahman -> Rahman)', () => {
    const text = 'Tolong ingatkan Encik Rahman pasal mesyuarat.';
    const start = text.indexOf('Rahman');
    const out = expandTitles([{ start, end: start + 'Rahman'.length }], text);
    expect(slice(text, out[0]!)).toBe('Encik Rahman');
  });

  it('pulls in Puan (exam-035: Puan Zaharah -> Zaharah)', () => {
    const text = 'Sila hubungi Puan Zaharah esok.';
    const start = text.indexOf('Zaharah');
    const out = expandTitles([{ start, end: start + 'Zaharah'.length }], text);
    expect(slice(text, out[0]!)).toBe('Puan Zaharah');
  });

  it('pulls in an English title (exam-007: Mr. John Doe -> John Doe)', () => {
    const text = 'Please update Mr. John Doe with the new TIN.';
    const start = text.indexOf('John Doe');
    const out = expandTitles([{ start, end: start + 'John Doe'.length }], text);
    expect(slice(text, out[0]!)).toBe('Mr. John Doe');
  });

  it('appends a Chinese title (exam-060: 林女士 -> 林)', () => {
    const text = '请联系林女士确认订单。';
    const start = text.indexOf('林');
    const out = expandTitles([{ start, end: start + 1 }], text);
    expect(slice(text, out[0]!)).toBe('林女士');
  });

  it('appends 经理 (exam-057: 张伟经理 -> 张伟)', () => {
    const text = '请把合同发给张伟经理审核。';
    const start = text.indexOf('张伟');
    const out = expandTitles([{ start, end: start + 2 }], text);
    expect(slice(text, out[0]!)).toBe('张伟经理');
  });

  it('prefers the longest matching title', () => {
    const text = "Ucapan Dato' Seri Anwar disiarkan langsung.";
    const start = text.indexOf('Anwar');
    const out = expandTitles([{ start, end: start + 'Anwar'.length }], text);
    expect(slice(text, out[0]!)).toBe("Dato' Seri Anwar");
  });

  it('leaves a span with no title alone', () => {
    const text = 'Ask Alice about the report.';
    const start = text.indexOf('Alice');
    const out = expandTitles([{ start, end: start + 5 }], text);
    expect(slice(text, out[0]!)).toBe('Alice');
  });

  it('does not find a title inside a longer word — Sir in Kasir', () => {
    const text = 'Kasir Rahman sudah balik.';
    const start = text.indexOf('Rahman');
    const out = expandTitles([{ start, end: start + 'Rahman'.length }], text);
    expect(slice(text, out[0]!)).toBe('Rahman');
  });
});

describe('expandOrgTails', () => {
  it('absorbs a legal suffix', () => {
    const text = 'Invois daripada Maju Trading Sdn Bhd masih tertunggak.';
    const start = text.indexOf('Maju');
    const out = expandOrgTails([{ start, end: start + 'Maju Trading'.length }], text);
    expect(slice(text, out[0]!)).toBe('Maju Trading Sdn Bhd');
  });

  it('absorbs a CJK tail', () => {
    const text = '请跟进华为供应链伙伴的月度采购付款。';
    const start = text.indexOf('华为');
    const out = expandOrgTails([{ start, end: start + 2 }], text);
    expect(slice(text, out[0]!)).toBe('华为供应链伙伴');
  });

  it('will not cross sentence punctuation into another organisation', () => {
    const text = 'Ask Acme. Then call Beta Holdings about it.';
    const out = expandOrgTails([{ start: 4, end: 8 }], text);
    expect(slice(text, out[0]!)).toBe('Acme');
  });

  it('bounds the lookahead', () => {
    const text = `Acme${' '.repeat(40)}Holdings`;
    expect(expandOrgTails([{ start: 0, end: 4 }], text)).toEqual([{ start: 0, end: 4 }]);
  });

  it('leaves a span with no tail alone', () => {
    const text = 'We owe Boeing RM500,000 for the parts.';
    const start = text.indexOf('Boeing');
    const out = expandOrgTails([{ start, end: start + 6 }], text);
    expect(slice(text, out[0]!)).toBe('Boeing');
  });
});

describe('repairSpans', () => {
  it('makes a fragmented Chinese org whole (exam-055: 阿里巴巴 -> 阿里 + 巴)', () => {
    const text = '我们公司目前欠阿里巴巴一笔服务费。';
    const s = text.indexOf('阿里巴巴');
    const out = repairSpans([{ start: s, end: s + 2 }, { start: s + 2, end: s + 4 }], text);
    expect(out).toHaveLength(1);
    expect(slice(text, out[0]!)).toBe('阿里巴巴');
  });

  it('handles a fragment and a title together', () => {
    const text = '请联系林女士确认订单。';
    const s = text.indexOf('林');
    const out = repairSpans([{ start: s, end: s + 1 }], text);
    expect(slice(text, out[0]!)).toBe('林女士');
  });

  it('is idempotent', () => {
    const text = 'Tolong hubungi Encik Rahman esok.';
    const s = text.indexOf('Rahman');
    const once = repairSpans([{ start: s, end: s + 6 }], text);
    expect(repairSpans(once, text)).toEqual(once);
  });

  it('handles empty input', () => {
    expect(repairSpans([], 'anything')).toEqual([]);
  });
});

describe('repairEntities', () => {
  it('repairs each entity and refreshes its text', () => {
    const text = 'Tolong ingatkan Encik Rahman pasal invois.';
    const start = text.indexOf('Rahman');
    const out = repairEntities(
      [{ type: 'PERSON', start, end: start + 6, text: 'Rahman' }],
      text,
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.text).toBe('Encik Rahman');
    expect(out[0]!.type).toBe('PERSON');
  });

  it('does NOT merge a PERSON into an adjacent ORG', () => {
    // masking depends on the distinction: PERSON_1 and ORG_1 are different placeholders
    const text = 'Ahmad Acme Corp';
    const out = repairEntities(
      [
        { type: 'PERSON', start: 0, end: 5, text: 'Ahmad' },
        { type: 'ORG', start: 6, end: 15, text: 'Acme Corp' },
      ],
      text,
    );
    expect(out).toHaveLength(2);
    expect(out.map((e) => e.type)).toEqual(['PERSON', 'ORG']);
  });

  it('returns entities in document order', () => {
    const text = 'Call Encik Rahman then email Puan Siti.';
    const r = text.indexOf('Rahman');
    const s = text.indexOf('Siti');
    const out = repairEntities(
      [
        { type: 'PERSON', start: s, end: s + 4, text: 'Siti' },
        { type: 'PERSON', start: r, end: r + 6, text: 'Rahman' },
      ],
      text,
    );
    expect(out.map((e) => e.text)).toEqual(['Encik Rahman', 'Puan Siti']);
  });

  it('handles no entities', () => {
    expect(repairEntities([], 'nothing here')).toEqual([]);
  });
});

describe('provenance discipline', () => {
  it('keeps exam-only titles OUT of the lists', () => {
    // Seen failing on the eval exam but absent from the ml/ training set, so there is no
    // independent evidence for them. Adding one tunes the ruler against what it measures.
    for (const t of ['Chef', 'Uncle', 'Laksamana']) expect(LEADING_TITLES).not.toContain(t);
    for (const t of ['律师', '主管']) expect(TRAILING_TITLES).not.toContain(t);
  });
});
