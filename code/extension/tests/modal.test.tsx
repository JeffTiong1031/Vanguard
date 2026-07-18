// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HeldFile } from '../src/files/types';
import { SessionNumbering } from '../src/mask/placeholder';
import type { Finding } from '../src/detection/l1/types';
import { Modal, placePopover } from '../src/ui/modal';
import {
  hideModal,
  hideProtectionDegraded,
  showModal,
  showProtectionDegraded,
} from '../src/ui/mount';

afterEach(() => {
  cleanup();
  hideModal();
  hideProtectionDegraded();
  vi.restoreAllMocks();
});

const noopFileAck = () => {};

const emailFinding: Finding = {
  cls: 'EMAIL',
  start: 9,
  end: 22,
  text: 'a@example.com',
};

describe('placePopover', () => {
  it('prefers the right side of the word when there is room', () => {
    const pos = placePopover(
      {
        top: 200,
        bottom: 220,
        left: 100,
        right: 180,
        width: 80,
        height: 20,
        x: 100,
        y: 200,
        toJSON: () => '',
      },
      800,
      600,
    );
    expect(pos.left).toBe(188);
    expect(pos.top).toBe(200);
  });

  it('flips to the left when the word is near the right edge', () => {
    const pos = placePopover(
      {
        top: 200,
        bottom: 220,
        left: 700,
        right: 780,
        width: 80,
        height: 20,
        x: 700,
        y: 200,
        toJSON: () => '',
      },
      800,
      600,
    );
    expect(pos.left).toBe(392);
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
        files={[]}
        onAcknowledgeFileError={noopFileAck}
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
        files={[]}
        onAcknowledgeFileError={noopFileAck}
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
        files: [],
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
        files={[]}
        onAcknowledgeFileError={noopFileAck}
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
        files: [],
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
        files={[]}
        onAcknowledgeFileError={noopFileAck}
        onProceed={onProceed}
      />,
    );

    fireEvent.click(getByRole('button', { name: /Accept all/i }));
    await waitFor(() => expect(onProceed).toHaveBeenCalled());
    expect(onProceed.mock.calls[0]![0].finalText).toBe('email me EMAIL_1');
  });

  it('shows a File tab that reads Checking while the scan is in flight', async () => {
    const held: HeldFile = {
      id: 'f1',
      file: new File(['x'], 'payroll.pdf'),
      status: { kind: 'scanning' },
    };
    render(
      <Modal
        text="hello"
        findings={[]}
        numbering={new SessionNumbering()}
        files={[held]}
        onAcknowledgeFileError={noopFileAck}
        onProceed={() => {}}
      />,
    );
    expect(screen.getByRole('tab', { name: /payroll\.pdf/ })).toBeTruthy();
    expect(screen.getByText(/Checking/)).toBeTruthy();
  });

  it('keeps Proceed disabled while a file span is pending', async () => {
    const held: HeldFile = {
      id: 'f1',
      file: new File(['x'], 'payroll.pdf'),
      status: { kind: 'scanned' },
      extract: '880101-14-5566',
      findings: [{ cls: 'NRIC', start: 0, end: 14, text: '880101-14-5566' }],
      decisions: new Map(),
    };
    render(
      <Modal
        text="a clean prompt"
        findings={[]}
        numbering={new SessionNumbering()}
        files={[held]}
        onAcknowledgeFileError={noopFileAck}
        onProceed={() => {}}
      />,
    );
    const proceed = screen.getByRole('button', { name: /Proceed/ }) as HTMLButtonElement;
    expect(proceed.disabled).toBe(true);
  });

  it('renders the not-read coverage line so the boundary of the check is visible', () => {
    const held: HeldFile = {
      id: 'f1',
      file: new File(['x'], 'scan.pdf'),
      status: { kind: 'scanned' },
      extract: 'body text',
      findings: [],
      decisions: new Map(),
      coverage: {
        read: ['text layer'],
        not_read: ['4 pages with no text layer (no OCR)'],
        pages_total: 10,
        pages_with_text: 6,
      },
    };
    render(
      <Modal
        text="hi"
        findings={[]}
        numbering={new SessionNumbering()}
        files={[held]}
        onAcknowledgeFileError={noopFileAck}
        onProceed={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('tab', { name: /scan\.pdf/ }));
    expect(screen.getByText(/4 pages with no text layer/)).toBeTruthy();
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
      files: [],
      onAcknowledgeFileError: noopFileAck,
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
