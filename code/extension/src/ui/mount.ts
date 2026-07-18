import { h, render } from 'preact';
import { Modal, type ModalProps } from './modal';

let host: HTMLElement | null = null;
let shadowRoot: ShadowRoot | null = null;
let showKey = 0;
let degradedHost: HTMLElement | null = null;

export function showModal(props: ModalProps): void {
  if (!host) {
    host = document.createElement('div');
    host.style.cssText =
      'position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;background:rgba(0,0,0,.35)';
    (document.body || document.documentElement).appendChild(host);
    shadowRoot = host.attachShadow({ mode: 'closed' });
  }

  showKey += 1;
  render(h(Modal, { ...props, key: showKey }), shadowRoot!);
}

export function hideModal(): void {
  if (!host || !shadowRoot) return;

  render(null, shadowRoot);
  host.remove();
  host = null;
  shadowRoot = null;
}

export function showProtectionDegraded(): void {
  if (degradedHost) return;

  degradedHost = document.createElement('div');
  degradedHost.style.cssText =
    'position:fixed;top:16px;right:16px;z-index:2147483647;pointer-events:none';
  const root = degradedHost.attachShadow({ mode: 'closed' });
  const notice = document.createElement('div');
  notice.setAttribute('role', 'status');
  notice.style.cssText =
    'all:initial;display:block;max-width:320px;padding:12px 16px;border-radius:8px;background:#7f1d1d;color:#fff;font:600 14px/1.4 system-ui;box-shadow:0 4px 16px rgba(0,0,0,.3)';
  notice.textContent = 'Protection degraded — on-device model unavailable. Sends are advisory only.';
  root.appendChild(notice);
  (document.body || document.documentElement).appendChild(degradedHost);
}

export function hideProtectionDegraded(): void {
  degradedHost?.remove();
  degradedHost = null;
}
