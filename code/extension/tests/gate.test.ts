import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { decideGate, installGate, isVanguardUiPath } from '../src/gate/gate';
import { VerdictCache } from '../src/detection/verdict-cache';

describe('isVanguardUiPath', () => {
  it('is true when a path node carries data-vanguard-ui', () => {
    const el = document.createElement('div');
    el.setAttribute('data-vanguard-ui', 'modal');
    expect(isVanguardUiPath([el])).toBe(true);
  });
  it('is false for ordinary page nodes', () => {
    expect(isVanguardUiPath([document.createElement('div')])).toBe(false);
  });
});

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
  it('passes an explicit degraded advisory verdict', () => {
    const c = new VerdictCache();
    c.setAdvisory('h');
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

  it('does not block Enter when the event path is inside extension UI', () => {
    const onBlocked = vi.fn();
    const isSendIntent = vi.fn(() => true);
    installGate({
      cache: new VerdictCache(),
      getComposerText: () => 'text',
      isSendIntent,
      hashOf: () => 'h',
      approvedHash: () => null,
      onBlocked,
    });
    const keydown = addEventListener.mock.calls.find((c) => c[0] === 'keydown')![1] as (
      e: Event,
    ) => void;

    const ui = document.createElement('div');
    ui.setAttribute('data-vanguard-ui', 'modal');
    const e = {
      eventPhase: Event.CAPTURING_PHASE,
      isComposing: false,
      composedPath: () => [ui],
      stopImmediatePropagation: vi.fn(),
      preventDefault: vi.fn(),
    } as unknown as KeyboardEvent;

    keydown(e);
    expect(isSendIntent).not.toHaveBeenCalled();
    expect(onBlocked).not.toHaveBeenCalled();
  });
});
