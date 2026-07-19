// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OversizedDialog } from '../src/ui/oversized-dialog';
import { hideOversizedDialog, showOversizedDialog } from '../src/ui/mount';

afterEach(() => {
  cleanup();
  hideOversizedDialog();
  vi.restoreAllMocks();
});

describe('OversizedDialog', () => {
  it('explains the limit and calls Proceed', () => {
    const onProceed = vi.fn();
    render(
      <OversizedDialog
        fileName="big.pdf"
        sizeBytes={12 * 1024 * 1024}
        onProceed={onProceed}
        onDecline={() => {}}
      />,
    );
    expect(screen.getByText(/File too large to check/i)).toBeTruthy();
    expect(screen.getByText(/big\.pdf/)).toBeTruthy();
    expect(screen.getByText(/up to 10 MB/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Proceed' }));
    expect(onProceed).toHaveBeenCalledOnce();
  });

  it('calls Don\'t attach on decline', () => {
    const onDecline = vi.fn();
    render(
      <OversizedDialog
        fileName="big.pdf"
        sizeBytes={12 * 1024 * 1024}
        onProceed={() => {}}
        onDecline={onDecline}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: "Don't attach" }));
    expect(onDecline).toHaveBeenCalledOnce();
  });

  it('mounts into a vanguard UI host', () => {
    showOversizedDialog({
      fileName: 'x.bin',
      sizeBytes: 11 * 1024 * 1024,
      onProceed: () => {},
      onDecline: () => {},
    });
    const host = document.querySelector('[data-vanguard-ui="oversized"]');
    expect(host).toBeTruthy();
    hideOversizedDialog();
    expect(document.querySelector('[data-vanguard-ui="oversized"]')).toBeNull();
  });
});
