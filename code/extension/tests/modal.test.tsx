// @vitest-environment jsdom

import { cleanup, fireEvent, render, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessionNumbering } from '../src/mask/placeholder';
import { Modal, placePopover } from '../src/ui/modal';
import {
  hideModal,
  hideProtectionDegraded,
  showModal,
  showProtectionDegraded,
} from '../src/ui/mount';
import type { Finding } from '../src/detection/l1/types';

afterEach(() => {
  cleanup();
  hideModal();
  hideProtectionDegraded();
  vi.restoreAllMocks();
});

const emailFinding: Finding = {
  cls: 'EMAIL',
  start: 9,
  end: 22,
  text: 'a@example.com',
};

describe('placePopover', () => {
  it('prefers the left side of the word when there is room', () => {
    const pos = placePopover(
      { top: 200, bottom: 220, left: 400, right: 480, width: 80, height: 20, x: 400, y: 200, toJSON: () => '' },
      800,
      600,
    );
    // 400 - 300 - 8 = 92
    expect(pos.left).toBe(92);
    expect(pos.top).toBe(200);
  });

  it('flips to the right when the word is near the left edge', () => {
    const pos = placePopover(
      { top: 200, bottom: 220, left: 40, right: 100, width: 60, height: 20, x: 40, y: 200, toJSON: () => '' },
      800,
      600,
    );
    expect(pos.left).toBe(108); // right + gap
  });
});

describe('Modal (Send review)', () => {
  it('shows review copy and disables Proceed until spans are resolved', () => {
    const numbering = new SessionNumbering();
    const { getByRole, getByText } = render(
      <Modal
        text="email me a@example.com"
        findings={[emailFinding]}
        numbering={numbering}
        onProceed={() => {}}
      />,
    );

    expect(getByText(/Review before send/i)).toBeTruthy();
    expect((getByRole('button', { name: /^Proceed$/i }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('Accept enables Proceed and reports masked text', async () => {
    const numbering = new SessionNumbering();
    const onProceed = vi.fn();
    const { getByRole, getByText } = render(
      <Modal
        text="email me a@example.com"
        findings={[emailFinding]}
        numbering={numbering}
        onProceed={onProceed}
      />,
    );

    fireEvent.click(getByText('a@example.com'));
    fireEvent.click(getByRole('button', { name: /^Accept$/i }));

    const proceed = getByRole('button', { name: /^Proceed$/i }) as HTMLButtonElement;
    await waitFor(() => expect(proceed.disabled).toBe(false));
    fireEvent.click(proceed);

    expect(onProceed).toHaveBeenCalledWith(
      expect.objectContaining({
        finalText: 'email me EMAIL_1',
        ignored: [],
      }),
    );
  });

  it('Ignore requires a reason and keeps the original span', async () => {
    const numbering = new SessionNumbering();
    const onProceed = vi.fn();
    const { getByRole, getByText, getByPlaceholderText } = render(
      <Modal
        text="email me a@example.com"
        findings={[emailFinding]}
        numbering={numbering}
        onProceed={onProceed}
      />,
    );

    fireEvent.click(getByText('a@example.com'));
    const ignore = getByRole('button', { name: /^Ignore$/i }) as HTMLButtonElement;
    expect(ignore.disabled).toBe(true);

    fireEvent.input(getByPlaceholderText(/Reason required/i), {
      target: { value: 'public support alias' },
    });
    expect(ignore.disabled).toBe(false);
    fireEvent.click(ignore);

    const proceed = getByRole('button', { name: /^Proceed$/i }) as HTMLButtonElement;
    await waitFor(() => expect(proceed.disabled).toBe(false));
    fireEvent.click(proceed);

    expect(onProceed).toHaveBeenCalledWith(
      expect.objectContaining({
        finalText: 'email me a@example.com',
        ignored: [expect.objectContaining({ reason: 'public support alias' })],
      }),
    );
  });

  it('Accept all proceeds with every span masked', async () => {
    const numbering = new SessionNumbering();
    const onProceed = vi.fn();
    const { getByRole } = render(
      <Modal
        text="email me a@example.com"
        findings={[emailFinding]}
        numbering={numbering}
        onProceed={onProceed}
      />,
    );

    fireEvent.click(getByRole('button', { name: /Accept all/i }));
    await waitFor(() => expect(onProceed).toHaveBeenCalled());
    expect(onProceed.mock.calls[0]![0].finalText).toBe('email me EMAIL_1');
  });
});

describe('modal mount', () => {
  it('renders into an open shadow root with focus trap host marker', () => {
    hideModal();
    const attachShadow = Element.prototype.attachShadow;
    let capturedRoot: ShadowRoot | undefined;
    const attachSpy = vi
      .spyOn(Element.prototype, 'attachShadow')
      .mockImplementation(function (this: Element, init) {
        capturedRoot = attachShadow.call(this, init);
        return capturedRoot;
      });

    const numbering = new SessionNumbering();
    showModal({
      text: 'x',
      findings: [],
      numbering,
      onProceed: () => {},
    });

    expect(attachSpy).toHaveBeenCalledWith({ mode: 'open' });
    expect(capturedRoot?.querySelector('[role="dialog"]')).not.toBeNull();
    expect(capturedRoot?.host.getAttribute('data-vanguard-ui')).toBe('modal');

    hideModal();
  });

  it('shows a non-blocking protection degraded notice', () => {
    const attachShadow = Element.prototype.attachShadow;
    let capturedRoot: ShadowRoot | undefined;
    vi.spyOn(Element.prototype, 'attachShadow').mockImplementation(function (this: Element, init) {
      capturedRoot = attachShadow.call(this, init);
      return capturedRoot;
    });

    showProtectionDegraded();

    const notice = capturedRoot?.querySelector('[role="status"]');
    expect(notice?.textContent).toContain('Protection degraded');
    expect((document.body.lastElementChild as HTMLElement).style.pointerEvents).toBe('none');
  });
});
