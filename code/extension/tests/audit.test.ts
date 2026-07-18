import { describe, it, expect, beforeEach, vi } from 'vitest';

const store: Record<string, unknown> = {};
const writes: Record<string, unknown>[] = [];
let overlapAuditGets = false;
let auditGetCount = 0;
let releaseAuditGets: (() => void) | undefined;
vi.stubGlobal('chrome', {
  storage: { local: {
    get: async (k: string) => {
      if (overlapAuditGets && k === 'vg_audit') {
        auditGetCount++;
        if (auditGetCount === 2) releaseAuditGets?.();
        else await new Promise<void>((resolve) => {
          releaseAuditGets = resolve;
          setTimeout(resolve, 10);
        });
      }
      return { [k]: store[k] };
    },
    set: async (o: Record<string, unknown>) => {
      writes.push(o);
      Object.assign(store, o);
    },
  } },
});

import { recordFindings, recordIgnore, ignoreRateByClass } from '../src/audit/audit';

describe('audit', () => {
  beforeEach(() => {
    for (const k of Object.keys(store)) delete store[k];
    writes.length = 0;
    overlapAuditGets = false;
    auditGetCount = 0;
    releaseAuditGets = undefined;
  });
  it('never persists the raw finding text', async () => {
    await recordFindings([{ cls: 'PERSON', start: 0, end: 5, text: 'Ahmad' }]);
    expect(JSON.stringify(store)).not.toContain('Ahmad');
  });
  it('redacts raw finding text from an ignore reason', async () => {
    await recordIgnore(
      [{ cls: 'PERSON', start: 0, end: 5, text: 'Ahmad' }],
      'Ahmad is a public figure',
    );
    expect(JSON.stringify(store)).not.toContain('Ahmad');
  });
  it('initializes one salt for concurrent callers', async () => {
    await Promise.all([
      recordFindings([{ cls: 'PERSON', start: 0, end: 5, text: 'Ahmad' }]),
      recordFindings([{ cls: 'ORG', start: 0, end: 5, text: 'Apple' }]),
    ]);
    expect(writes.filter((write) => 'vg_salt' in write)).toHaveLength(1);
  });
  it('preserves rows from overlapping audit calls', async () => {
    overlapAuditGets = true;
    await Promise.all([
      recordFindings([{ cls: 'PERSON', start: 0, end: 5, text: 'Ahmad' }]),
      recordIgnore([{ cls: 'ORG', start: 0, end: 5, text: 'Apple' }], 'public company'),
    ]);
    expect(store.vg_audit).toHaveLength(2);
  });
  it('computes ignore-rate per class', async () => {
    await recordFindings([{ cls: 'ORG', start: 0, end: 5, text: 'Apple' }]);
    await recordIgnore([{ cls: 'ORG', start: 0, end: 5, text: 'Apple' }], 'public company');
    const r = await ignoreRateByClass();
    expect(r.ORG).toEqual({ flagged: 1, ignored: 1 });
  });
});
