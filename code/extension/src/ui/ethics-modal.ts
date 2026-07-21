/**
 * The blocking ethics modal.
 *
 * Spec section 7: "which tool you use is advisory, what you ask it to do is
 * blocking." There is no Ignore here and no rewrite -- a covert-surveillance
 * script is not fixable by masking a name, so the only ways out are editing the
 * prompt or abandoning it.
 */
import { explain } from '../detection/explanations';

const HOST_ATTR = 'data-vanguard-ui';

export type EthicsModalOptions = {
  label: string;
  category: string;
  orgName: string;
  promptText?: string;                       // present only so the employee CAN opt in to share it
  onEdit: () => void;
  onRequestReview: (reason: string, disclosedText?: string) => void;
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
    .foot { padding: 0 20px 20px; display: flex; gap: 10px; justify-content: flex-end; align-items: center; }
    button { border: none; border-radius: 6px; padding: 9px 16px; cursor: pointer;
             background: #b91c1c; color: #fff; font-size: 14px; }
    .why { margin: 12px 0 0; }
    .note { margin: 8px 0 0; color: #64748b; font-size: 13px; }
    .review { margin-top: 14px; }
    .review label { display: block; font-size: 13px; color: #334155; }
    .review textarea { width: 100%; box-sizing: border-box; margin-top: 6px; padding: 8px;
                       border: 1px solid #cbd5e1; border-radius: 6px; font: inherit; }
    .review .optin { display: flex; gap: 8px; align-items: flex-start; margin-top: 10px; font-size: 13px; color: #334155; }
    button.ghost { background: #fff; color: #b91c1c; border: 1px solid #fecaca; margin-right: auto; }
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
        <p class="why"></p>
        <p class="note"></p>
        <div class="review" hidden>
          <label>If you believe this is wrong, tell a reviewer why:</label>
          <textarea data-act="reason" rows="3" placeholder="e.g. I was asking how to defend our own systems"></textarea>
          <label class="optin"><input type="checkbox" data-act="opt-in" />
            Include the exact text I was blocked on, so a person can review it.</label>
        </div>
      </div>
      <div class="foot">
        <button class="ghost" data-act="open-review">Request a review</button>
        <button data-act="send-review" hidden>Send review</button>
        <button data-act="edit">Edit my prompt</button>
      </div>
    </div>
  `;
  // textContent, not innerHTML: the label is data, and data never becomes markup.
  scrim.querySelector('.policy')!.textContent = options.label;

  const ex = explain('ethics', options.category);
  scrim.querySelector('.why')!.textContent = ex.why;
  scrim.querySelector('.note')!.textContent = ex.note;

  const review = scrim.querySelector<HTMLDivElement>('.review')!;
  const sendBtn = scrim.querySelector<HTMLButtonElement>('[data-act="send-review"]')!;
  const openBtn = scrim.querySelector<HTMLButtonElement>('[data-act="open-review"]')!;
  let reason = '';
  scrim.querySelector('[data-act="reason"]')!.addEventListener('input', (e) => {
    reason = (e.target as HTMLTextAreaElement).value;
  });
  openBtn.addEventListener('click', () => { review.hidden = false; openBtn.hidden = true; sendBtn.hidden = false; });
  sendBtn.addEventListener('click', () => {
    const optIn = scrim.querySelector<HTMLInputElement>('[data-act="opt-in"]')!.checked;
    options.onRequestReview(reason, optIn ? options.promptText : undefined);
    hideEthicsModal();
  });

  scrim.querySelector('[data-act="edit"]')!.addEventListener('click', () => {
    hideEthicsModal();
    options.onEdit();
  });

  root.append(style, scrim);
  document.documentElement.append(host);
}

/**
 * Shown when an overturned appeal grants a one-time pass on this exact prompt.
 * The gate already stopped the current send, so — per decision #8 (the user
 * always presses Send) — we tell them to press Send again; the approved hash
 * then lets it through, once.
 */
export function showReviewApprovedModal(onClose: () => void): void {
  hideEthicsModal();
  const host = document.createElement('div');
  host.setAttribute(HOST_ATTR, 'ethics-modal');
  const root = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `
    .scrim { position: fixed; inset: 0; z-index: 2147483647; display: grid;
             place-items: center; background: rgb(15 23 42 / 55%); }
    .box { max-width: 460px; background: #fff; border-radius: 12px; overflow: hidden;
           font: 15px/1.5 system-ui, sans-serif; box-shadow: 0 20px 50px rgb(0 0 0 / 30%); }
    .head { background: #15803d; color: #fff; padding: 16px 20px; font-weight: 600; }
    .body { padding: 20px; color: #0f172a; }
    .foot { padding: 0 20px 20px; display: flex; justify-content: flex-end; }
    button { border: none; border-radius: 6px; padding: 9px 16px; cursor: pointer;
             background: #15803d; color: #fff; font-size: 14px; }
  `;
  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  scrim.innerHTML = `
    <div class="box" role="alertdialog" aria-modal="true">
      <div class="head">Review approved</div>
      <div class="body"><p>Your review was approved. <strong>Press Send again</strong> to send this
        prompt once — this is a one-time pass for this exact prompt.</p></div>
      <div class="foot"><button data-act="ok">OK</button></div>
    </div>
  `;
  scrim.querySelector('[data-act="ok"]')!.addEventListener('click', () => { hideEthicsModal(); onClose(); });
  root.append(style, scrim);
  document.documentElement.append(host);
}
