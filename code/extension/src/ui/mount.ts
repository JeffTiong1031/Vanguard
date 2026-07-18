import { h, render } from 'preact';
import { Modal, type ModalProps } from './modal';

let host: HTMLElement | null = null;
let shadowRoot: ShadowRoot | null = null;

export function showModal(props: ModalProps): void {
  if (!host) {
    host = document.createElement('div');
    host.style.cssText =
      'position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;background:rgba(0,0,0,.35)';
    (document.body || document.documentElement).appendChild(host);
    shadowRoot = host.attachShadow({ mode: 'closed' });
  }

  render(h(Modal, props), shadowRoot!);
}

export function hideModal(): void {
  if (!host || !shadowRoot) return;

  render(null, shadowRoot);
  host.remove();
  host = null;
  shadowRoot = null;
}
