import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAX_TOKENS,
  filterBySensitivity,
  isEligible,
  type Verdict,
} from '../src/detection/l2/sensitivity';
import type { L2Entity } from '../src/detection/l2/messages';

const ent = (start: number, end: number, text: string): L2Entity =>
  ({ type: 'PERSON', start, end, text });

const markSpan = (text: string, e: L2Entity) =>
  `${text.slice(0, e.start)}[E] ${e.text} [/E]${text.slice(e.end)}`;

describe('isEligible — the paste cutoff', () => {
  it('lets a short English prompt through', () => {
    expect(isEligible('Explain Einstein’s theory', DEFAULT_MAX_TOKENS)).toBe(true);
  });

  it('excludes a long paste', () => {
    expect(isEligible('word '.repeat(200), DEFAULT_MAX_TOKENS)).toBe(false);
  });

  it('uses the Chinese ratio for CJK, not the English one', () => {
    // 200 CJK chars: 0.72 tok/char = 144 tokens (excluded), but 0.26 would say 52 (included).
    // U21-a measured Chinese at 2.78x English, and getting this wrong lets a Chinese paste in
    // at nearly three times the intended budget.
    const zh = '你'.repeat(200);
    expect(isEligible(zh, DEFAULT_MAX_TOKENS)).toBe(false);
    expect(zh.length * 0.26).toBeLessThan(DEFAULT_MAX_TOKENS); // the English ratio would allow it
  });

  it('still allows a short Chinese prompt', () => {
    expect(isEligible('请联系林女士确认订单。', DEFAULT_MAX_TOKENS)).toBe(true);
  });

  it('respects a custom budget', () => {
    expect(isEligible('a'.repeat(100), 10)).toBe(false);
    expect(isEligible('a'.repeat(100), 1000)).toBe(true);
  });
});

describe('filterBySensitivity', () => {
  const text = 'Explain Einstein theory and call Ahmad about the invoice.';
  const einstein = ent(8, 16, 'Einstein');
  const ahmad = ent(33, 38, 'Ahmad');

  it('releases what the classifier calls KEEP and masks the rest', async () => {
    // Match the MARKED span, not the bare word: every instance carries the whole sentence, so
    // Ahmad's input contains "Einstein" too. That is the point of the markers, and writing this
    // test the obvious way gets it wrong.
    const classify = async (marked: string): Promise<Verdict> =>
      marked.includes('[E] Einstein [/E]')
        ? { keep: true, confidence: 1 }
        : { keep: false, confidence: 1 };

    const { kept, released, failed } = await filterBySensitivity(
      text, [einstein, ahmad], classify, markSpan,
    );
    expect(released.map((e) => e.text)).toEqual(['Einstein']);
    expect(kept.map((e) => e.text)).toEqual(['Ahmad']);
    expect(failed).toBe(0);
  });

  it('KEEPS MASKING when the classifier throws — fail-safe is to mask', async () => {
    const classify = async (): Promise<Verdict> => {
      throw new Error('model unreachable');
    };
    const { kept, released, failed } = await filterBySensitivity(
      text, [einstein, ahmad], classify, markSpan,
    );
    expect(released).toEqual([]);
    expect(kept).toHaveLength(2);
    expect(failed).toBe(2);
  });

  it('masks the entities it could not judge and releases the ones it could', async () => {
    let n = 0;
    const classify = async (): Promise<Verdict> => {
      if (n++ === 0) throw new Error('timeout');
      return { keep: true, confidence: 1 };
    };
    const { kept, released, failed } = await filterBySensitivity(
      text, [einstein, ahmad], classify, markSpan,
    );
    expect(failed).toBe(1);
    expect(kept.map((e) => e.text)).toEqual(['Einstein']);
    expect(released.map((e) => e.text)).toEqual(['Ahmad']);
  });

  it('handles no entities', async () => {
    const out = await filterBySensitivity(text, [], async () => ({ keep: true, confidence: 1 }), markSpan);
    expect(out.kept).toEqual([]);
    expect(out.released).toEqual([]);
  });

  it('passes the MARKED text to the classifier, not the bare span', async () => {
    const seen: string[] = [];
    await filterBySensitivity(text, [einstein], async (m) => {
      seen.push(m);
      return { keep: false, confidence: 1 };
    }, markSpan);
    expect(seen[0]).toContain('[E] Einstein [/E]');
    expect(seen[0]).toContain('call Ahmad'); // context on both sides is preserved
  });
});
