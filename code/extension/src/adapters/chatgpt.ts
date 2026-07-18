// [verify all selectors against live chatgpt.com DOM]
import type { SurfaceAdapter } from './types';
const COMPOSER = ['#prompt-textarea', 'div[contenteditable="true"]'];
const SEND = ['button[data-testid="send-button"]', 'button[aria-label*="Send" i]'];

export const chatgptAdapter: SurfaceAdapter = {
  host: 'chatgpt.com',
  getComposer() { for (const s of COMPOSER) { const el = document.querySelector<HTMLElement>(s); if (el) return el; } return null; },
  readText() { return this.getComposer()?.innerText ?? null; },
  writeText(text) {
    const el = this.getComposer(); if (!el) return;
    el.focus(); el.textContent = text;
    el.dispatchEvent(new InputEvent('input', { bubbles: true })); // let the app's state sync
    const r = document.createRange(); r.selectNodeContents(el); r.collapse(false);
    const sel = getSelection(); sel?.removeAllRanges(); sel?.addRange(r); // caret to end (doc 05 §6)
  },
  isSendControl(path) {
    return path.some((n) => n instanceof Element && SEND.some((s) => n.matches?.(s) || n.closest?.(s)));
  },
  onPaste(cb) {
    document.addEventListener('paste', (e) => {
      const t = e.clipboardData?.getData('text'); if (t) cb(t);
    }, true);
  },
};
