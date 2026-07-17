import { describe, it, expect, vi, beforeEach } from 'vitest';
import { scanInto } from '../src/detection/scan';
import { VerdictCache } from '../src/detection/verdict-cache';
import { sha256Hex } from '../src/detection/hash';
import { l2Scan } from '../src/detection/l2/client';

vi.mock('../src/detection/l2/client', () => ({
  l2Scan: vi.fn(async () => [{ type: 'PERSON', start: 0, end: 5, text: 'Ahmad' }]),
}));

describe('scanInto', () => {
  it('an L1 hit makes it DIRTY even before L2', async () => {
    const c = new VerdictCache();
    const v = await scanInto(c, 'IC 890101-14-5555', { l2TimeoutMs: 1000 });
    expect(v.state).toBe('DIRTY');
    expect(v.findings.some((f) => f.cls === 'NRIC')).toBe(true);
  });
  it('L1-clean + L2 PERSON is DIRTY', async () => {
    const c = new VerdictCache();
    const v = await scanInto(c, 'call Ahmad', { l2TimeoutMs: 1000 });
    expect(v.state).toBe('DIRTY');
    expect(v.findings.some((f) => f.cls === 'PERSON')).toBe(true);
  });
});

describe('scanInto degraded path (ADR 0014)', () => {
  beforeEach(() => {
    vi.mocked(l2Scan).mockReset();
  });

  it('L1 hit + L2 degraded: verdict stays DIRTY and cache is DIRTY', async () => {
    vi.mocked(l2Scan).mockResolvedValueOnce('degraded');
    const c = new VerdictCache();
    const text = 'IC 890101-14-5555';
    const hash = await sha256Hex(text);
    const v = await scanInto(c, text, { l2TimeoutMs: 1000 });
    expect(v.state).toBe('DIRTY');
    expect(c.getSync(hash)!.state).toBe('DIRTY');
  });

  it('L1 clean + L2 degraded: CLEAN incomplete, cache has no entry', async () => {
    vi.mocked(l2Scan).mockResolvedValueOnce('degraded');
    const c = new VerdictCache();
    const text = 'hello world';
    const hash = await sha256Hex(text);
    const v = await scanInto(c, text, { l2TimeoutMs: 1000 });
    expect(v.state).toBe('CLEAN');
    expect(v.complete).toBe(false);
    expect(c.getSync(hash)).toBeUndefined();
  });
});

describe('scanInto L1-clean + L2 empty', () => {
  beforeEach(() => {
    vi.mocked(l2Scan).mockReset();
  });

  it('state CLEAN, complete:true, cache cached CLEAN', async () => {
    vi.mocked(l2Scan).mockResolvedValueOnce([]);
    const c = new VerdictCache();
    const text = 'hello world';
    const hash = await sha256Hex(text);
    const v = await scanInto(c, text, { l2TimeoutMs: 1000 });
    expect(v.state).toBe('CLEAN');
    expect(v.complete).toBe(true);
    expect(c.getSync(hash)!.state).toBe('CLEAN');
  });
});
