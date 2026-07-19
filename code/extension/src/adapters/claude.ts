// [verify all selectors against live claude.ai DOM]
import type { SurfaceAdapter } from './types';
const COMPOSER = ['div[contenteditable="true"].ProseMirror', 'div[contenteditable="true"]'];
const SEND = ['button[aria-label*="Send" i]', 'button[data-testid*="send" i]'];

export const claudeAdapter: SurfaceAdapter = {
  host: 'claude.ai',
  getComposer() { for (const s of COMPOSER) { const el = document.querySelector<HTMLElement>(s); if (el) return el; } return null; },
  readText() { return this.getComposer()?.innerText ?? null; },
  writeText(text) {
    const el = this.getComposer(); if (!el) return;
    el.focus(); el.textContent = text;
    el.dispatchEvent(new InputEvent('input', { bubbles: true }));
    const r = document.createRange(); r.selectNodeContents(el); r.collapse(false);
    const sel = getSelection(); sel?.removeAllRanges(); sel?.addRange(r);
  },
  isSendControl(path) {
    return path.some((n) => n instanceof Element && SEND.some((s) => n.matches?.(s) || n.closest?.(s)));
  },
  onPaste(cb) {
    document.addEventListener('paste', (e) => { const t = e.clipboardData?.getData('text'); if (t) cb(t); }, true);
  },
  fileInputs() { return [...document.querySelectorAll<HTMLInputElement>('input[type="file"]')]; },
};
