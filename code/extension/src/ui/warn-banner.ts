/**
 * The unapproved-tool banner.
 *
 * 🔴 It WARNS. It does not block. Spec section 7: "which tool you use is
 * advisory, what you ask it to do is blocking." The case study's own finding is
 * that outright bans push usage out of sight, and a blocked page sends the
 * employee to their phone, where we see nothing at all.
 */
import { explain } from '../detection/explanations';

const HOST_ATTR = 'data-vanguard-ui';

export type WarnBannerOptions = {
  toolName: string;
  orgName: string;
  onRequest: (reason: string) => Promise<void>;
  onDismiss: () => void;
};

export function hideWarnBanner(): void {
  document.querySelector(`[${HOST_ATTR}="warn-banner"]`)?.remove();
}

export function showWarnBanner(options: WarnBannerOptions): void {
  hideWarnBanner();

  const host = document.createElement('div');
  host.setAttribute(HOST_ATTR, 'warn-banner');
  const root = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  // A top strip, never an overlay. Deliberately no inset/height rules that
  // would cover the page -- warn-banner.test.ts asserts their absence.
  style.textContent = `
    .bar { position: fixed; top: 0; left: 0; right: 0; z-index: 2147483646;
           display: flex; gap: 12px; align-items: center; flex-wrap: wrap;
           padding: 10px 16px; background: #fef3c7; border-bottom: 1px solid #f59e0b;
           font: 14px/1.4 system-ui, sans-serif; color: #78350f; }
    button { border: none; border-radius: 6px; padding: 6px 12px; cursor: pointer;
             background: #b45309; color: #fff; font-size: 13px; }
    button.ghost { background: transparent; color: #78350f; text-decoration: underline; }
    input { flex: 1; min-width: 200px; padding: 6px 8px; font-size: 13px;
            border: 1px solid #d97706; border-radius: 6px; }
  `;

  const bar = document.createElement('div');
  bar.className = 'bar';

  const render = (mode: 'warn' | 'form' | 'sent') => {
    bar.innerHTML = '';
    if (mode === 'sent') {
      bar.append(text(`Request sent to ${options.orgName}. You'll be notified when it's reviewed.`));
      bar.append(button('Dismiss', 'dismiss', 'ghost'));
      wire();
      return;
    }
    if (mode === 'form') {
      bar.append(text(`Why do you need ${options.toolName}?`));
      const input = document.createElement('input');
      input.setAttribute('data-act', 'reason');
      input.placeholder = 'e.g. translation QA for the SEA launch';
      bar.append(input);
      bar.append(button('Send request', 'send'));
      bar.append(button('Cancel', 'cancel', 'ghost'));
      wire();
      return;
    }
    bar.append(text(
      `${options.toolName} is not approved at ${options.orgName}. ` +
      `You can still use it — this is a notice, not a block.`,
    ));
    bar.append(text(explain('tool', '').why));
    bar.append(button('Request access', 'open-request'));
    bar.append(button('Dismiss', 'dismiss', 'ghost'));
    wire();
  };

  function text(content: string): HTMLSpanElement {
    const span = document.createElement('span');
    span.textContent = content;
    return span;
  }

  function button(label: string, act: string, cls = ''): HTMLButtonElement {
    const el = document.createElement('button');
    el.textContent = label;
    el.setAttribute('data-act', act);
    if (cls) el.className = cls;
    return el;
  }

  let reason = '';
  function wire(): void {
    bar.querySelector('[data-act="reason"]')?.addEventListener('input', (e) => {
      reason = (e.target as HTMLInputElement).value;
    });
    bar.querySelector('[data-act="open-request"]')?.addEventListener('click', () => render('form'));
    bar.querySelector('[data-act="cancel"]')?.addEventListener('click', () => render('warn'));
    bar.querySelector('[data-act="dismiss"]')?.addEventListener('click', () => {
      hideWarnBanner();
      options.onDismiss();
    });
    bar.querySelector('[data-act="send"]')?.addEventListener('click', () => {
      void options.onRequest(reason).then(() => render('sent'));
    });
  }

  render('warn');
  root.append(style, bar);
  document.documentElement.append(host);
}
