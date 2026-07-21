// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';
import { ReportWrongFlag } from '../src/ui/modal';

describe('ReportWrongFlag (PII redressal)', () => {
  it('reports a pii appeal with class + reason, no disclosed text by default', () => {
    const send = vi.fn(async () => ({}));
    vi.stubGlobal('chrome', { runtime: { sendMessage: send } });
    render(<ReportWrongFlag cls="NRIC" matched="880101-14-5566" />);
    fireEvent.click(screen.getByRole('button', { name: /report a wrong flag/i }));
    fireEvent.input(screen.getByPlaceholderText(/why/i), { target: { value: 'that is a product code' } });
    fireEvent.click(screen.getByRole('button', { name: /send report/i }));
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'appeal-submit', decisionType: 'pii', category: 'NRIC', reason: 'that is a product code',
    }));
    // 🔴 no disclosed text unless opted in
    expect(send.mock.calls[0]![0].disclosedText).toBeUndefined();
  });

  it('includes the flagged text only when opted in', () => {
    const send = vi.fn(async () => ({}));
    vi.stubGlobal('chrome', { runtime: { sendMessage: send } });
    render(<ReportWrongFlag cls="NRIC" matched="880101-14-5566" />);
    fireEvent.click(screen.getByRole('button', { name: /report a wrong flag/i }));
    fireEvent.input(screen.getByPlaceholderText(/why/i), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /send report/i }));
    expect(send.mock.calls[0]![0].disclosedText).toBe('880101-14-5566');
  });
});
