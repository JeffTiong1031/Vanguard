// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { attachFiles } from '../../src/files/attach';

describe('attachFiles', () => {
  it('sets input.files and fires a change the page can see', () => {
    const input = document.createElement('input');
    input.type = 'file';
    document.body.append(input);
    const seen = vi.fn();
    input.addEventListener('change', seen);

    const ok = attachFiles(input, [new File(['clean'], 'a.redacted.docx', { type: 'text/plain' })]);

    expect(ok).toBe(true);
    expect(input.files!.length).toBe(1);
    expect(input.files![0].name).toBe('a.redacted.docx');
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it('removes the bypass marker afterwards so the next real attach is captured', () => {
    const input = document.createElement('input');
    input.type = 'file';
    attachFiles(input, [new File(['x'], 'a.txt')]);
    expect(input.hasAttribute('data-vanguard-reattach')).toBe(false);
  });
});
