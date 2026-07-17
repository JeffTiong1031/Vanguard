import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { decideGate, installGate } from '../src/gate/gate';
import { VerdictCache } from '../src/detection/verdict-cache';

describe('decideGate (pure core of the listener)', () => {
  it('blocks when the current text is DIRTY and unapproved', () => {
    const c = new VerdictCache();
    c.setDirty('h', [{ cls: 'NRIC', start: 0, end: 1, text: 'x' }]);
    expect(decideGate({ hash: 'h', cache: c, approvedHash: null })).toBe('BLOCK');
  });
  it('passes when the DIRTY text has a matching approval', () => {
    const c = new VerdictCache();
    c.setDirty('h', []);
    expect(decideGate({ hash: 'h', cache: c, approvedHash: 'h' })).toBe('PASS');
  });
  it('passes CLEAN', () => {
    const c = new VerdictCache();
    c.setClean('h', []);
    expect(decideGate({ hash: 'h', cache: c, approvedHash: null })).toBe('PASS');
  });
  it('blocks UNKNOWN (cold cache) to stay fail-safe until a scan lands', () => {
    expect(decideGate({ hash: 'cold', cache: new VerdictCache(), approvedHash: null })).toBe(
      'BLOCK',
    );
  });
  it('blocks when DIRTY and approvedHash is a different hash', () => {
    const c = new VerdictCache();
    c.setDirty('b', [{ cls: 'NRIC', start: 0, end: 1, text: 'x' }]);
    expect(decideGate({ hash: 'b', cache: c, approvedHash: 'a' })).toBe('BLOCK');
  });
  it('passes CLEAN regardless of approvedHash being null', () => {
    const c = new VerdictCache();
    c.setClean('h', []);
    expect(decideGate({ hash: 'h', cache: c, approvedHash: null })).toBe('PASS');
    expect(decideGate({ hash: 'h', cache: c, approvedHash: 'other' })).toBe('PASS');
  });
});

describe('installGate', () => {
  const addEventListener = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('window', { addEventListener });
    addEventListener.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('registers keydown and click listeners at window capture phase', () => {
    installGate({
      cache: new VerdictCache(),
      getComposerText: () => null,
      isSendIntent: () => false,
      hashOf: () => 'h',
      approvedHash: () => null,
      onBlocked: () => {},
    });

    expect(addEventListener).toHaveBeenCalledTimes(2);
    expect(addEventListener).toHaveBeenCalledWith('keydown', expect.any(Function), {
      capture: true,
    });
    expect(addEventListener).toHaveBeenCalledWith('click', expect.any(Function), {
      capture: true,
    });
  });
});
