// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { hideWarnBanner, showWarnBanner } from '../src/ui/warn-banner';

function host(): ShadowRoot {
  return document.querySelector('[data-vanguard-ui="warn-banner"]')!.shadowRoot!;
}

beforeEach(() => { document.body.innerHTML = ''; hideWarnBanner(); });

describe('warn banner', () => {
  it('names the tool and the organisation', () => {
    showWarnBanner({
      toolName: 'Google Gemini', orgName: 'Acme Corp',
      onRequest: async () => {}, onDismiss: () => {},
    });
    expect(host().textContent).toContain('Google Gemini');
    expect(host().textContent).toContain('Acme Corp');
  });

  it('is dismissible — it warns, it does not block', () => {
    const onDismiss = vi.fn();
    showWarnBanner({
      toolName: 'Google Gemini', orgName: 'Acme Corp',
      onRequest: async () => {}, onDismiss,
    });
    host().querySelector<HTMLButtonElement>('[data-act="dismiss"]')!.click();
    expect(onDismiss).toHaveBeenCalled();
    expect(document.querySelector('[data-vanguard-ui="warn-banner"]')).toBeNull();
  });

  it('does not cover the page — no full-screen overlay', () => {
    showWarnBanner({
      toolName: 'X', orgName: 'Y', onRequest: async () => {}, onDismiss: () => {},
    });
    const style = host().querySelector('style')!.textContent!;
    // A banner that blocks the page would contradict spec section 7's
    // advisory-for-tools rule, so assert the absence of a blocking overlay.
    expect(style).not.toContain('inset: 0');
    expect(style).not.toContain('height: 100vh');
  });

  it('sends the typed reason with the access request', async () => {
    const onRequest = vi.fn(async () => {});
    showWarnBanner({
      toolName: 'Google Gemini', orgName: 'Acme Corp', onRequest, onDismiss: () => {},
    });
    host().querySelector<HTMLButtonElement>('[data-act="open-request"]')!.click();
    const input = host().querySelector<HTMLInputElement>('[data-act="reason"]')!;
    input.value = 'Translation QA';
    input.dispatchEvent(new Event('input'));
    host().querySelector<HTMLButtonElement>('[data-act="send"]')!.click();
    await Promise.resolve();
    expect(onRequest).toHaveBeenCalledWith('Translation QA');
  });

  it('confirms after a request is sent so the user does not click twice', async () => {
    showWarnBanner({
      toolName: 'G', orgName: 'A', onRequest: async () => {}, onDismiss: () => {},
    });
    host().querySelector<HTMLButtonElement>('[data-act="open-request"]')!.click();
    host().querySelector<HTMLButtonElement>('[data-act="send"]')!.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(host().textContent).toContain('Request sent');
  });
});
