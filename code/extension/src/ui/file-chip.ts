import type { HeldFile } from '../files/types';

/**
 * Our own attachment chip. The provider never rendered one because the
 * provider never received the file -- so this chip is the only signal the
 * user has that their attachment exists. It has to be unmissable.
 */
let host: HTMLElement | null = null;
let root: ShadowRoot | null = null;

const LABEL: Record<string, string> = {
  held: 'Queued',
  extracting: 'Reading…',
  scanning: 'Checking…',
  scanned: 'Checked',
  error: 'Not checked',
  error_acknowledged: 'Sending anyway',
};

export function renderChips(files: HeldFile[], onRemove: (id: string) => void): void {
  if (files.length === 0) return clearChips();

  if (!host) {
    host = document.createElement('div');
    host.setAttribute('data-vanguard-ui', 'file-chips');
    host.style.cssText =
      'position:fixed;bottom:96px;left:50%;transform:translateX(-50%);z-index:2147483646';
    (document.body || document.documentElement).appendChild(host);
    root = host.attachShadow({ mode: 'open' });
  }

  root!.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.style.cssText = 'all:initial;display:flex;gap:8px;flex-wrap:wrap;font:13px Segoe UI,system-ui,sans-serif';

  for (const held of files) {
    const chip = document.createElement('div');
    const bad = held.status.kind === 'error';
    chip.style.cssText =
      'display:flex;align-items:center;gap:8px;padding:7px 12px;border-radius:999px;' +
      `background:${bad ? '#fff7ed' : '#fff1f2'};border:1px solid ${bad ? '#fed7aa' : '#fecdd3'};` +
      `color:${bad ? '#7c2d12' : '#9f1239'};box-shadow:0 4px 12px rgba(15,23,42,.12)`;
    chip.textContent = `${held.file.name} — ${LABEL[held.status.kind]}`;

    const remove = document.createElement('button');
    remove.textContent = '×';
    remove.setAttribute('aria-label', `Remove ${held.file.name}`);
    remove.style.cssText = 'border:none;background:none;cursor:pointer;font-size:16px;color:inherit;padding:0 2px';
    remove.addEventListener('click', () => onRemove(held.id));
    chip.append(remove);
    wrap.append(chip);
  }

  root!.append(wrap);
}

export function clearChips(): void {
  host?.remove();
  host = null;
  root = null;
}

/**
 * Shown when /v1/redact fails on Proceed. The modal stays open behind it.
 *
 * This exists because the alternatives are both dishonest: attaching the
 * original leaks, and attaching a .txt silently changes the format the user
 * chose. Neither is a fallback -- they are two different ways of lying about
 * what happened (Global Constraint 15).
 */
export function showRedactionFailure(message: string): void {
  const banner = document.createElement('div');
  banner.setAttribute('data-vanguard-ui', 'redact-error');
  banner.setAttribute('role', 'alert');
  banner.style.cssText =
    'position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:2147483647;' +
    'max-width:420px;padding:12px 16px;border-radius:8px;background:#7c2d12;color:#fff;' +
    'font:600 14px/1.45 system-ui;box-shadow:0 6px 20px rgba(15,23,42,.35)';
  banner.textContent = `${message} Nothing was attached.`;
  (document.body || document.documentElement).appendChild(banner);
  setTimeout(() => banner.remove(), 8000);
}
