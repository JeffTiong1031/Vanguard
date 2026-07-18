import { describe, it, expect, beforeEach, vi } from 'vitest';

const store: Record<string, unknown> = {};
vi.stubGlobal('chrome', {
  storage: { local: {
    get: async (k: string) => ({ [k]: store[k] }),
    set: async (o: Record<string, unknown>) => Object.assign(store, o),
  } },
});

import { recordFindings, recordIgnore, ignoreRateByClass } from '../src/audit/audit';

describe('audit', () => {
  beforeEach(() => { for (const k of Object.keys(store)) delete store[k]; });
  it('never persists the raw finding text', async () => {
    await recordFindings([{ cls: 'PERSON', start: 0, end: 5, text: 'Ahmad' }]);
    expect(JSON.stringify(store)).not.toContain('Ahmad');
  });
  it('computes ignore-rate per class', async () => {
    await recordFindings([{ cls: 'ORG', start: 0, end: 5, text: 'Apple' }]);
    await recordIgnore([{ cls: 'ORG', start: 0, end: 5, text: 'Apple' }], 'public company');
    const r = await ignoreRateByClass();
    expect(r.ORG).toEqual({ flagged: 1, ignored: 1 });
  });
});
