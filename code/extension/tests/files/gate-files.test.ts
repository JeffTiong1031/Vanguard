// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FileStore } from '../../src/files/store';
import { installGate } from '../../src/gate/gate';
import { VerdictCache } from '../../src/detection/verdict-cache';

describe('the gate with files held', () => {
  const addEventListener = vi.fn();
  let keydownHandler: (e: Event) => void;

  beforeEach(() => {
    addEventListener.mockImplementation((type: string, handler: (e: Event) => void) => {
      if (type === 'keydown') keydownHandler = handler;
    });
    vi.stubGlobal('window', { addEventListener });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function fireEnter() {
    const event = {
      eventPhase: Event.CAPTURING_PHASE,
      isComposing: false,
      composedPath: () => [document.body],
      stopImmediatePropagation: vi.fn(),
      preventDefault: vi.fn(),
      key: 'Enter',
    } as unknown as KeyboardEvent;
    keydownHandler(event);
    return event;
  }

  it('blocks Send on a CLEAN prompt when a file is still scanning', () => {
    const cache = new VerdictCache();
    const store = new FileStore();
    const id = store.add(new File(['x'], 'a.pdf'));
    store.update(id, { status: { kind: 'scanning' } });

    const onBlocked = vi.fn();
    cache.setClean('h', []);

    installGate({
      cache,
      getComposerText: () => 'a clean prompt',
      isSendIntent: () => true,
      hashOf: () => 'h',
      approvedHash: () => null,
      hasHeldFiles: () => store.hasHeld(),
      onBlocked,
    });

    const event = fireEnter();

    expect(onBlocked).toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('blocks Send on a CLEAN prompt when a clean file is Checked but not yet handed off', () => {
    const cache = new VerdictCache();
    const store = new FileStore();
    const id = store.add(new File(['hello'], 'clean.txt'));
    store.update(id, { status: { kind: 'scanned' }, findings: [], decisions: new Map() });

    const onBlocked = vi.fn();
    cache.setClean('h', []);

    installGate({
      cache,
      getComposerText: () => 'a clean prompt',
      isSendIntent: () => true,
      hashOf: () => 'h',
      approvedHash: () => null,
      hasHeldFiles: () => store.hasHeld(),
      onBlocked,
    });

    const event = fireEnter();
    expect(onBlocked).toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('lets a clean prompt through when there is no file', () => {
    const cache = new VerdictCache();
    cache.setClean('h', []);
    const onBlocked = vi.fn();

    installGate({
      cache,
      getComposerText: () => 'a clean prompt',
      isSendIntent: () => true,
      hashOf: () => 'h',
      approvedHash: () => null,
      hasHeldFiles: () => false,
      onBlocked,
    });

    fireEnter();
    expect(onBlocked).not.toHaveBeenCalled();
  });
});