import { describe, it, expect } from 'vitest';
import { VerdictCache } from '../src/detection/verdict-cache';
import { saltedFingerprint } from '../src/detection/hash';

describe('VerdictCache monotonic-toward-dirty', () => {
  it('setClean does not overwrite an existing DIRTY (ADR 0013)', () => {
    const c = new VerdictCache();
    c.setDirty('h', [{ cls: 'NRIC', start: 0, end: 1, text: 'x' }]);
    c.setClean('h', []);
    expect(c.getSync('h')!.state).toBe('DIRTY');
  });
  it('a fresh hash is undefined (cold cache -> caller must treat as unknown)', () => {
    expect(new VerdictCache().getSync('nope')).toBeUndefined();
  });
  it('setClean on a cold hash sets CLEAN with complete:true', () => {
    const c = new VerdictCache();
    c.setClean('cold', []);
    const v = c.getSync('cold')!;
    expect(v.state).toBe('CLEAN');
    expect(v.complete).toBe(true);
  });
});

describe('saltedFingerprint', () => {
  it('returns a 16-char hex string and different salts yield different fingerprints', async () => {
    const fp1 = await saltedFingerprint('hello', 'salt-a');
    const fp2 = await saltedFingerprint('hello', 'salt-b');
    expect(fp1).toMatch(/^[0-9a-f]{16}$/);
    expect(fp2).toMatch(/^[0-9a-f]{16}$/);
    expect(fp1).not.toBe(fp2);
  });
});
