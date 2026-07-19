import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  withTimeout,
  DEFAULT_MAX_TOKENS,
  filterBySensitivity,
  isEligible,
  loadConfig,
  markedFitsWindow,
  SensitivityUnavailableError,
  type Verdict,
} from '../src/detection/l2/sensitivity';
import type { L2Entity } from '../src/detection/l2/messages';

// 🔴 The bug this file could not catch, and now must.
//
// `chrome.storage` is UNDEFINED inside an offscreen document — measured 2026-07-20:
// `await chrome.storage.local.get(...)` throws "Cannot read properties of undefined (reading
// 'local')". The `storage` permission is present and correct; the API is simply not exposed in
// that context. loadConfig read it inside a try, its catch returned `{ modelUrl: null }`, the
// caller read that as "no model configured", and the classifier was skipped in total silence on
// every prompt since the day it was written.
//
// The rest of this file passes `classify` and `markSpan` in as callbacks — the fixture supplies
// exactly what the runtime failed to provide, so no test here could ever have failed. These
// three sit on the real seam.
describe('loadConfig', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('throws when chrome.storage is absent — a structural failure is never "feature off"', async () => {
    vi.stubGlobal('chrome', {}); // exactly what an offscreen document sees
    await expect(loadConfig()).rejects.toBeInstanceOf(SensitivityUnavailableError);
  });

  it('reports disabled when storage works and no model is configured', async () => {
    vi.stubGlobal('chrome', { storage: { local: { get: async () => ({}) } } });
    await expect(loadConfig()).resolves.toEqual({ modelId: null, maxTokens: DEFAULT_MAX_TOKENS });
  });

  it('reads and trims a configured model id', async () => {
    vi.stubGlobal('chrome', {
      storage: { local: { get: async () => ({ vg_sensitivity_model_id: ' vanguard/sens ' }) } },
    });
    await expect(loadConfig()).resolves.toEqual({
      modelId: 'vanguard/sens', maxTokens: DEFAULT_MAX_TOKENS,
    });
  });
});

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

describe('timeouts — a try/catch does not catch "never returns"', () => {
  // The first version of this module had no clock. The caller's timeout is 120 s, sized for a
  // crashed engine, so a stalled model load presented as "pressing Send does nothing" for two
  // minutes while the catch block never ran. Observed 2026-07-20.

  it('withTimeout rejects a promise that never settles', async () => {
    const never = new Promise<never>(() => {});
    await expect(withTimeout(never, 20, 'thing')).rejects.toThrow(/timed out after 20 ms/);
  });

  it('withTimeout passes a value straight through', async () => {
    await expect(withTimeout(Promise.resolve(7), 1000, 'thing')).resolves.toBe(7);
  });

  it('a hanging classifier does NOT hang the scan — the span stays masked', async () => {
    const text = 'Explain Einstein theory';
    const hangs = () => new Promise<Verdict>(() => {});
    const out = await filterBySensitivity(
      text, [ent(8, 16, 'Einstein')], hangs, markSpan, { spanTimeoutMs: 20, totalTimeoutMs: 100 },
    );
    expect(out.kept).toHaveLength(1);       // fail-safe is to mask
    expect(out.released).toEqual([]);
    expect(out.failed).toBe(1);
  });

  it('stops spending once the whole-prompt budget is gone', async () => {
    // Each span finishing just inside its own budget still blows the prompt's, which is why the
    // per-span clock is not sufficient on its own.
    const slow = () => new Promise<Verdict>((r) => setTimeout(() => r({ keep: true, confidence: 1 }), 30));
    const many = Array.from({ length: 10 }, (_, i) => ent(i, i + 1, 'x'));
    const t0 = Date.now();
    const out = await filterBySensitivity(
      'x'.repeat(20), many, slow, markSpan, { spanTimeoutMs: 100, totalTimeoutMs: 90 },
    );
    expect(Date.now() - t0).toBeLessThan(400);
    expect(out.timedOut).toBe(true);
    expect(out.kept.length + out.released.length).toBe(10); // nothing is silently dropped
    expect(out.kept.length).toBeGreaterThan(0);             // the unjudged remainder stays masked
  });

  it('never releases a span it could not judge, however the failure arrives', async () => {
    for (const classify of [
      () => new Promise<Verdict>(() => {}),                       // hangs
      async () => { throw new Error('boom'); },                   // throws
    ]) {
      const out = await filterBySensitivity(
        'Explain Einstein theory', [ent(8, 16, 'Einstein')], classify, markSpan,
        { spanTimeoutMs: 20, totalTimeoutMs: 60 },
      );
      expect(out.released).toEqual([]);
    }
  });
});

describe('markedFitsWindow — never clip past a marker', () => {
  it('accepts a short marked string', () => {
    expect(markedFitsWindow('Explain [E] Einstein [/E] theory')).toBe(true);
  });

  it('rejects a marked string that would exceed the 512-token window', () => {
    expect(markedFitsWindow('a'.repeat(5000))).toBe(false);
  });

  it('uses the Chinese ratio for CJK (0.72 tok/char, U21-a), not the English one', () => {
    // 1000 CJK chars: 0.72 => 720 tokens (rejected). The English 0.26 would say 260 (accepted),
    // i.e. it would hand the model a string ~1.4x its window with a marker clipped off the end.
    expect(markedFitsWindow('你'.repeat(1000))).toBe(false);
    expect(markedFitsWindow('你'.repeat(100))).toBe(true);
  });
});

describe('filterBySensitivity — the oversize guard', () => {
  it('keeps an oversize span masked without asking the model a corrupted question', async () => {
    let called = 0;
    const classify = async (): Promise<Verdict> => { called += 1; return { keep: true, confidence: 1 }; };
    const long = 'x'.repeat(5000);
    const res = await filterBySensitivity(long, [ent(0, 1, 'x')], classify, markSpan);
    expect(called).toBe(0);
    expect(res.kept).toHaveLength(1);
    expect(res.released).toHaveLength(0);
    expect(res.failed).toBe(1);
  });
});
