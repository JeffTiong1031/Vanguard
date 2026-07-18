import { h, render } from 'preact';
import { Modal, type ModalProps } from './modal';
import { OversizedDialog, type OversizedDialogProps } from './oversized-dialog';

let host: HTMLElement | null = null;
let shadowRoot: ShadowRoot | null = null;
let showKey = 0;
let degradedHost: HTMLElement | null = null;
let tearDownFocusTrap: (() => void) | null = null;
let oversizeHost: HTMLElement | null = null;
let oversizeRoot: ShadowRoot | null = null;
let oversizeTrap: (() => void) | null = null;

/**
 * While the modal is open, Claude/ChatGPT will yank focus back to the composer
 * and our Ignore field never receives keys (keys appear in the composer instead).
 * Trap: stop key events at the host, refocus dialog when the page steals focus.
 */
function installFocusTrap(hostEl: HTMLElement, root: ShadowRoot): () => void {
  const stopPageKeys = (e: Event) => {
    // Capture on host: page listeners further down the path still see bubble from
    // window first — so also bind on window while open (see below).
    e.stopPropagation();
  };

  const windowCapture = (e: KeyboardEvent) => {
    // Open shadow: activeElement is the real input; walk via isVanguardUiFocused logic.
    let node: Node | null = document.activeElement;
    let inOurUi = false;
    while (node) {
      if (node instanceof Element && node.hasAttribute('data-vanguard-ui')) {
        inOurUi = true;
        break;
      }
      if (node instanceof ShadowRoot) {
        node = node.host;
        continue;
      }
      node = node.parentNode;
    }
    if (inOurUi) {
      // Do NOT stopPropagation here — that would kill delivery to the input.
      return;
    }
    // Page stole focus (composer). Drop the keystroke; pull focus back.
    e.stopImmediatePropagation();
    e.preventDefault();
    const focusable = root.querySelector<HTMLElement>(
      'input:not([disabled]),textarea,button,[data-vg-autofocus]',
    );
    focusable?.focus();
  };

  const onFocusIn = (e: FocusEvent) => {
    const t = e.target;
    if (t === hostEl) return;
    if (t instanceof Node && root.contains(t)) return;
    // Focus moved to page (composer). Steal back.
    const focusable = root.querySelector<HTMLElement>(
      'input:not([disabled]),textarea,[data-vg-autofocus]',
    );
    queueMicrotask(() => focusable?.focus());
  };

  hostEl.addEventListener('keydown', stopPageKeys, true);
  hostEl.addEventListener('keyup', stopPageKeys, true);
  hostEl.addEventListener('keypress', stopPageKeys, true);
  window.addEventListener('keydown', windowCapture, true);
  window.addEventListener('keyup', windowCapture, true);
  document.addEventListener('focusin', onFocusIn, true);

  queueMicrotask(() => {
    root.querySelector<HTMLElement>('[data-vg-autofocus]')?.focus();
  });

  return () => {
    hostEl.removeEventListener('keydown', stopPageKeys, true);
    hostEl.removeEventListener('keyup', stopPageKeys, true);
    hostEl.removeEventListener('keypress', stopPageKeys, true);
    window.removeEventListener('keydown', windowCapture, true);
    window.removeEventListener('keyup', windowCapture, true);
    document.removeEventListener('focusin', onFocusIn, true);
  };
}

export function showModal(props: ModalProps): void {
  if (host && !host.isConnected) {
    tearDownFocusTrap?.();
    tearDownFocusTrap = null;
    host = null;
    shadowRoot = null;
  }

  if (!host) {
    host = document.createElement('div');
    host.setAttribute('data-vanguard-ui', 'modal');
    host.setAttribute('tabindex', '-1');
    host.style.cssText =
      'position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;background:rgba(15,23,42,.45)';
    // No backdrop-filter: it creates a containing block that breaks position:fixed popovers.
    (document.body || document.documentElement).appendChild(host);
    // open mode so focus/devtools behave; page still cannot style us (shadow boundary).
    shadowRoot = host.attachShadow({ mode: 'open' });
  }

  tearDownFocusTrap?.();
  showKey += 1;
  render(h(Modal, { ...props, key: showKey }), shadowRoot!);
  tearDownFocusTrap = installFocusTrap(host, shadowRoot!);
}

export function hideModal(): void {
  if (!host || !shadowRoot) return;

  tearDownFocusTrap?.();
  tearDownFocusTrap = null;
  render(null, shadowRoot);
  host.remove();
  host = null;
  shadowRoot = null;
}

export function showProtectionDegraded(): void {
  if (degradedHost) return;

  degradedHost = document.createElement('div');
  degradedHost.setAttribute('data-vanguard-ui', 'degraded');
  degradedHost.style.cssText =
    'position:fixed;top:16px;right:16px;z-index:2147483647;pointer-events:none';
  const root = degradedHost.attachShadow({ mode: 'closed' });
  const notice = document.createElement('div');
  notice.setAttribute('role', 'status');
  notice.style.cssText =
    'all:initial;display:block;max-width:320px;padding:12px 16px;border-radius:8px;background:#9f1239;color:#fff;font:600 14px/1.4 system-ui;box-shadow:0 4px 16px rgba(15,23,42,.3)';
  notice.textContent = 'Protection degraded — on-device model unavailable. Sends are advisory only.';
  root.appendChild(notice);
  (document.body || document.documentElement).appendChild(degradedHost);
}

export function hideProtectionDegraded(): void {
  degradedHost?.remove();
  degradedHost = null;
}

export function showOversizedDialog(props: OversizedDialogProps): void {
  hideOversizedDialog();
  oversizeHost = document.createElement('div');
  oversizeHost.setAttribute('data-vanguard-ui', 'oversized');
  oversizeHost.setAttribute('tabindex', '-1');
  oversizeHost.style.cssText =
    'position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;background:rgba(15,23,42,.45)';
  (document.body || document.documentElement).appendChild(oversizeHost);
  oversizeRoot = oversizeHost.attachShadow({ mode: 'open' });
  render(h(OversizedDialog, props), oversizeRoot);
  oversizeTrap = installFocusTrap(oversizeHost, oversizeRoot);
}

export function hideOversizedDialog(): void {
  if (!oversizeHost || !oversizeRoot) return;
  oversizeTrap?.();
  oversizeTrap = null;
  render(null, oversizeRoot);
  oversizeHost.remove();
  oversizeHost = null;
  oversizeRoot = null;
}
