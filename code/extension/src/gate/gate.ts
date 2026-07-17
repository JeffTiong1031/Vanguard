import type { VerdictCache } from '../detection/verdict-cache';

export function decideGate(a: { hash: string; cache: VerdictCache; approvedHash: string | null }): 'PASS' | 'BLOCK' {
  if (a.approvedHash === a.hash) return 'PASS';
  const v = a.cache.getSync(a.hash);
  if (!v) return 'BLOCK';               // cold cache -> modal resolves it
  return v.state === 'CLEAN' ? 'PASS' : 'BLOCK';
}

export type GateDeps = {
  cache: VerdictCache;
  getComposerText: (path: EventTarget[]) => string | null;
  isSendIntent: (e: Event, path: EventTarget[]) => boolean;
  hashOf: (text: string) => string;          // sync hash lookup memoized by the scanner
  approvedHash: () => string | null;
  onBlocked: (text: string) => void;
};

export function installGate(deps: GateDeps): void {
  const handler = (e: KeyboardEvent | MouseEvent) => {
    if (e.eventPhase !== Event.CAPTURING_PHASE) return;
    if (e instanceof KeyboardEvent && e.isComposing) return; // U12-b: IME commit, not a send
    const path = e.composedPath();
    if (!deps.isSendIntent(e, path)) return;
    const text = deps.getComposerText(path);
    if (text == null) return;
    const decision = decideGate({ hash: deps.hashOf(text), cache: deps.cache, approvedHash: deps.approvedHash() });
    if (decision === 'BLOCK') {
      e.stopImmediatePropagation();
      e.preventDefault();
      deps.onBlocked(text);
    }
  };
  window.addEventListener('keydown', handler, { capture: true });
  window.addEventListener('click', handler, { capture: true });
}
