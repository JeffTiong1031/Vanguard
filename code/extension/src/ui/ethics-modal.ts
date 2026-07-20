/**
 * The blocking ethics modal.
 *
 * Spec section 7: "which tool you use is advisory, what you ask it to do is
 * blocking." There is no Ignore here and no rewrite -- a covert-surveillance
 * script is not fixable by masking a name, so the only ways out are editing the
 * prompt or abandoning it.
 */
const HOST_ATTR = 'data-vanguard-ui';

export type EthicsModalOptions = {
  label: string;
  orgName: string;
  onEdit: () => void;
};

export function hideEthicsModal(): void {
  document.querySelector(`[${HOST_ATTR}="ethics-modal"]`)?.remove();
}

export function showEthicsModal(options: EthicsModalOptions): void {
  hideEthicsModal();

  const host = document.createElement('div');
  host.setAttribute(HOST_ATTR, 'ethics-modal');
  const root = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = `
    .scrim { position: fixed; inset: 0; z-index: 2147483647; display: grid;
             place-items: center; background: rgb(15 23 42 / 55%); }
    .box { max-width: 520px; background: #fff; border-radius: 12px; overflow: hidden;
           font: 15px/1.5 system-ui, sans-serif; box-shadow: 0 20px 50px rgb(0 0 0 / 30%); }
    .head { background: #b91c1c; color: #fff; padding: 16px 20px; font-weight: 600; }
    .body { padding: 20px; color: #0f172a; }
    .policy { margin: 14px 0; padding: 12px 14px; background: #fef2f2;
              border-left: 3px solid #b91c1c; border-radius: 4px; font-weight: 600; }
    .foot { padding: 0 20px 20px; display: flex; justify-content: flex-end; }
    button { border: none; border-radius: 6px; padding: 9px 16px; cursor: pointer;
             background: #b91c1c; color: #fff; font-size: 14px; }
  `;

  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  scrim.innerHTML = `
    <div class="box" role="alertdialog" aria-modal="true">
      <div class="head">This prompt was blocked</div>
      <div class="body">
        <p>It appears to ask for something ${options.orgName} does not permit AI tools
           to be used for.</p>
        <div class="policy"></div>
        <p>Nothing was sent. Edit your prompt and try again — if you believe this is
           wrong, your admin can review the policy.</p>
      </div>
      <div class="foot"><button data-act="edit">Edit my prompt</button></div>
    </div>
  `;
  // textContent, not innerHTML: the label is data, and data never becomes markup.
  scrim.querySelector('.policy')!.textContent = options.label;
  scrim.querySelector('[data-act="edit"]')!.addEventListener('click', () => {
    hideEthicsModal();
    options.onEdit();
  });

  root.append(style, scrim);
  document.documentElement.append(host);
}
