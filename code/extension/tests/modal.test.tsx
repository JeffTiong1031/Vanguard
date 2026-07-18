// @vitest-environment jsdom

import { cleanup, fireEvent, render } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Modal } from '../src/ui/modal';
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

describe('Modal', () => {
  it('shows only the finding summary and rewritten preview', () => {
    const { getByText } = render(
      <Modal
        rewritten="call PERSON_1 at ORG_1"
        summary={[
          { cls: 'PERSON', count: 1 },
          { cls: 'ORG', count: 2 },
        ]}
        onApprove={() => {}}
        onIgnore={() => {}}
      />,
    );

    expect(getByText('PERSON: 1')).toBeTruthy();
    expect(getByText('ORG: 2')).toBeTruthy();
    expect(getByText('call PERSON_1 at ORG_1')).toBeTruthy();
  });

  it('calls onApprove without submitting anything', () => {
    const onApprove = vi.fn();
    const { getByRole } = render(
      <Modal
        rewritten="call PERSON_1"
        summary={[{ cls: 'PERSON', count: 1 }]}
        onApprove={onApprove}
        onIgnore={() => {}}
      />,
    );

    const approve = getByRole('button', { name: /approve/i });
    expect(approve.getAttribute('type')).toBe('button');
    fireEvent.click(approve);

    expect(onApprove).toHaveBeenCalledOnce();
  });

  it('disables Ignore until a reason is entered', () => {
    const onIgnore = vi.fn();
    const { getByPlaceholderText, getByRole } = render(
      <Modal
        rewritten="x"
        summary={[]}
        onApprove={() => {}}
        onIgnore={onIgnore}
      />,
    );
    const ignore = getByRole('button', { name: /^ignore$/i }) as HTMLButtonElement;

    expect(ignore.disabled).toBe(true);
    fireEvent.click(ignore);
    expect(onIgnore).not.toHaveBeenCalled();

    fireEvent.input(getByPlaceholderText(/reason/i), {
      target: { value: 'false positive' },
    });
    expect(ignore.disabled).toBe(false);
    fireEvent.click(ignore);

    expect(onIgnore).toHaveBeenCalledWith('false positive');
  });

  it('does not call onIgnore for whitespace-only reasons', () => {
    const onIgnore = vi.fn();
    const { getByPlaceholderText, getByRole } = render(
      <Modal
        rewritten="x"
        summary={[]}
        onApprove={() => {}}
        onIgnore={onIgnore}
      />,
    );
    const ignore = getByRole('button', { name: /^ignore$/i }) as HTMLButtonElement;

    fireEvent.input(getByPlaceholderText(/reason/i), {
      target: { value: '   ' },
    });
    expect(ignore.disabled).toBe(true);
    fireEvent.click(ignore);
    expect(onIgnore).not.toHaveBeenCalled();
  });

  it('passes trimmed reason to onIgnore', () => {
    const onIgnore = vi.fn();
    const { getByPlaceholderText, getByRole } = render(
      <Modal
        rewritten="x"
        summary={[]}
        onApprove={() => {}}
        onIgnore={onIgnore}
      />,
    );

    fireEvent.input(getByPlaceholderText(/reason/i), {
      target: { value: '  false positive  ' },
    });
    fireEvent.click(getByRole('button', { name: /^ignore$/i }));

    expect(onIgnore).toHaveBeenCalledWith('false positive');
  });

  it('resets reason when remounted via key', () => {
    const props = {
      rewritten: 'x',
      summary: [] as Array<{ cls: string; count: number }>,
      onApprove: () => {},
      onIgnore: () => {},
    };
    const { getByPlaceholderText, rerender } = render(<Modal {...props} key={1} />);

    fireEvent.input(getByPlaceholderText(/reason/i), {
      target: { value: 'stale reason' },
    });

    rerender(<Modal {...props} key={2} />);

    expect((getByPlaceholderText(/reason/i) as HTMLInputElement).value).toBe('');
  });
});

describe('modal mount', () => {
  it('renders into a closed shadow root and removes its host', () => {
    const attachShadow = Element.prototype.attachShadow;
    let capturedRoot: ShadowRoot | undefined;
    const attachSpy = vi
      .spyOn(Element.prototype, 'attachShadow')
      .mockImplementation(function (this: Element, init) {
        capturedRoot = attachShadow.call(this, init);
        return capturedRoot;
      });

    showModal({
      rewritten: 'PERSON_1',
      summary: [{ cls: 'PERSON', count: 1 }],
      onApprove: () => {},
      onIgnore: () => {},
    });

    const host = document.body.lastElementChild as HTMLElement;
    expect(attachSpy).toHaveBeenCalledWith({ mode: 'closed' });
    expect(host.shadowRoot).toBeNull();
    expect(capturedRoot?.querySelector('[role="dialog"]')).not.toBeNull();

    hideModal();

    expect(host.isConnected).toBe(false);
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
