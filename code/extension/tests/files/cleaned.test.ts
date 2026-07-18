import { describe, expect, it, vi } from 'vitest';
import { SessionNumbering } from '../../src/mask/placeholder';
import { buildCleanedFile } from '../../src/files/cleaned';
import { ExtractError } from '../../src/files/api';
import type { HeldFile } from '../../src/files/types';

const nric = { cls: 'NRIC' as const, start: 6, end: 20, text: '880101-14-5566' };

const held = (over: Partial<HeldFile> = {}): HeldFile => ({
  id: 'f1',
  file: new File(['original bytes'], 'payroll.docx', {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  }),
  status: { kind: 'scanned' },
  extract: 'Ahmad 880101-14-5566 is the IC',
  extractSha256: 'abc123',
  findings: [nric],
  ...over,
});

const accepted = new Map([
  ['NRIC:6:20:880101-14-5566', { kind: 'accepted' as const, placeholder: 'NRIC_1' }],
]);

describe('buildCleanedFile', () => {
  it('returns the ORIGINAL file object, untouched, when every span was ignored', async () => {
    const redact = vi.fn();
    const source = held();
    const out = await buildCleanedFile(
      source,
      new Map([['NRIC:6:20:880101-14-5566', { kind: 'ignored', reason: 'my own IC' }]]),
      new SessionNumbering(),
      { redact },
    );
    expect(out).toBe(source.file);
    expect(redact).not.toHaveBeenCalled();
  });

  it('returns the original file when there were no findings at all', async () => {
    const redact = vi.fn();
    const source = held({ findings: [] });
    const out = await buildCleanedFile(source, new Map(), new SessionNumbering(), { redact });
    expect(out).toBe(source.file);
    expect(redact).not.toHaveBeenCalled();
  });

  it('sends ONLY accepted spans to the backend and returns its file verbatim', async () => {
    const redacted = new File(['docx bytes'], 'payroll.redacted.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    const redact = vi.fn(async () => redacted);
    const email = { cls: 'EMAIL' as const, start: 0, end: 5, text: 'Ahmad' };

    const out = await buildCleanedFile(
      held({ findings: [email, nric] }),
      new Map([
        ['EMAIL:0:5:Ahmad', { kind: 'ignored', reason: 'public figure' }],
        ['NRIC:6:20:880101-14-5566', { kind: 'accepted', placeholder: 'NRIC_1' }],
      ]),
      new SessionNumbering(),
      { redact },
    );

    expect(out).toBe(redacted);
    expect(out.name).toBe('payroll.redacted.docx');
    expect(out.type).toContain('wordprocessingml');

    const [file, sha, spans] = redact.mock.calls[0];
    expect(file.name).toBe('payroll.docx');
    expect(sha).toBe('abc123');
    expect(spans).toEqual([{ start: 6, end: 20, text: '880101-14-5566', placeholder: 'NRIC_1' }]);
  });

  it('mints a placeholder when the decision did not carry one', async () => {
    const redact = vi.fn(async () => new File(['x'], 'payroll.redacted.docx'));
    await buildCleanedFile(
      held(),
      new Map([['NRIC:6:20:880101-14-5566', { kind: 'accepted', placeholder: '' }]]),
      new SessionNumbering(),
      { redact },
    );
    expect(redact.mock.calls[0][2][0].placeholder).toMatch(/^NRIC_\d+$/);
  });

  it('PROPAGATES a redaction failure rather than falling back to text', async () => {
    const redact = vi.fn(async () => {
      throw new ExtractError('redaction_failed', 'Could not apply 1 of the masks.');
    });
    await expect(
      buildCleanedFile(held(), accepted, new SessionNumbering(), { redact }),
    ).rejects.toMatchObject({ code: 'redaction_failed' });
  });
});
