// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFileCapture } from '../../src/files/capture';

describe('installFileCapture', () => {
  let teardown: (() => void) | undefined;

  beforeEach(() => {
    teardown?.();
    teardown = undefined;
    document.body.innerHTML = '';
  });

  afterEach(() => {
    teardown?.();
    teardown = undefined;
  });

  it('takes the files and stops the page from seeing the change event', () => {
    const onFiles = vi.fn();
    const pageHandler = vi.fn();
    teardown = installFileCapture({ onFiles });

    const input = document.createElement('input');
    input.type = 'file';
    document.body.append(input);
    input.addEventListener('change', pageHandler);

    const dt = new DataTransfer();
    dt.items.add(new File(['x'], 'a.txt', { type: 'text/plain' }));
    Object.defineProperty(input, 'files', { value: dt.files, configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));

    expect(onFiles).toHaveBeenCalledTimes(1);
    expect(onFiles.mock.calls[0][0][0].name).toBe('a.txt');
    expect(pageHandler).not.toHaveBeenCalled();
  });

  it('ignores a change event that we ourselves dispatched', () => {
    // Otherwise re-attaching the cleaned file re-triggers capture forever.
    const onFiles = vi.fn();
    teardown = installFileCapture({ onFiles });

    const input = document.createElement('input');
    input.type = 'file';
    input.setAttribute('data-vanguard-reattach', '1');
    document.body.append(input);
    input.dispatchEvent(new Event('change', { bubbles: true }));

    expect(onFiles).not.toHaveBeenCalled();
  });

  it('captures a drop and prevents the default', () => {
    const onFiles = vi.fn();
    teardown = installFileCapture({ onFiles });

    const dt = new DataTransfer();
    dt.items.add(new File(['x'], 'b.pdf', { type: 'application/pdf' }));
    const evt = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt });
    window.dispatchEvent(evt);

    expect(onFiles).toHaveBeenCalledTimes(1);
    expect(evt.defaultPrevented).toBe(true);
  });

  it('leaves a text-only paste alone so the prompt path still works', () => {
    const onFiles = vi.fn();
    teardown = installFileCapture({ onFiles });
    const dt = new DataTransfer();
    dt.setData('text/plain', 'just text');
    const evt = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt });
    window.dispatchEvent(evt);
    expect(onFiles).not.toHaveBeenCalled();
    expect(evt.defaultPrevented).toBe(false);
  });

  it('uninstalls cleanly', () => {
    const onFiles = vi.fn();
    const off = installFileCapture({ onFiles });
    teardown = off;
    off();
    const dt = new DataTransfer();
    dt.items.add(new File(['x'], 'c.txt'));
    window.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    expect(onFiles).not.toHaveBeenCalled();
  });
});
