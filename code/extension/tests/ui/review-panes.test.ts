import { describe, expect, it } from 'vitest';
import { buildPanes, canProceed } from '../../src/ui/review-panes';
import type { HeldFile } from '../../src/files/types';

const nric = { cls: 'NRIC' as const, start: 0, end: 14, text: '880101-14-5566' };

const scannedFile = (over: Partial<HeldFile> = {}): HeldFile => ({
  id: 'f1',
  file: new File(['x'], 'payroll.pdf'),
  status: { kind: 'scanned' },
  extract: '880101-14-5566 is the IC',
  findings: [nric],
  decisions: new Map([['NRIC:0:14:880101-14-5566', { kind: 'pending' }]]),
  ...over,
});

describe('buildPanes', () => {
  it('always puts the prompt pane first', () => {
    const panes = buildPanes('hello', [], new Map(), [scannedFile()]);
    expect(panes[0].id).toBe('prompt');
    expect(panes[1].id).toBe('file:f1');
  });

  it('labels a scanning file so the tab reads as in-progress', () => {
    const panes = buildPanes('hello', [], new Map(), [
      scannedFile({ status: { kind: 'scanning' }, findings: undefined, decisions: undefined }),
    ]);
    expect(panes[1].state).toBe('busy');
    expect(panes[1].badge).toBe('Checking…');
  });

  it('badges a scanned pane with its pending count', () => {
    const panes = buildPanes('hello', [], new Map(), [scannedFile()]);
    expect(panes[1].state).toBe('dirty');
    expect(panes[1].badge).toBe('1');
  });

  it('badges a clean file as clear', () => {
    const panes = buildPanes('hello', [], new Map(), [
      scannedFile({ findings: [], decisions: new Map() }),
    ]);
    expect(panes[1].state).toBe('clean');
    expect(panes[1].badge).toBe('No issues');
  });

  it('surfaces an error pane with the backend message', () => {
    const panes = buildPanes('hello', [], new Map(), [
      scannedFile({ status: { kind: 'error', code: 'no_text_layer', message: 'It is a scan.' } }),
    ]);
    expect(panes[1].state).toBe('error');
    expect(panes[1].message).toBe('It is a scan.');
  });
});

describe('canProceed', () => {
  it('is false while any pane is busy', () => {
    expect(
      canProceed(
        buildPanes('hi', [], new Map(), [
          scannedFile({ status: { kind: 'scanning' }, findings: undefined, decisions: undefined }),
        ]),
      ),
    ).toBe(false);
  });

  it('is false while a file span is pending', () => {
    expect(canProceed(buildPanes('hi', [], new Map(), [scannedFile()]))).toBe(false);
  });

  it('is false while a prompt span is pending even if the file is clean', () => {
    const panes = buildPanes(
      'call Ahmad',
      [{ cls: 'PERSON', start: 5, end: 10, text: 'Ahmad' }],
      new Map([['PERSON:5:10:Ahmad', { kind: 'pending' }]]),
      [scannedFile({ findings: [], decisions: new Map() })],
    );
    expect(canProceed(panes)).toBe(false);
  });

  it('is true when everything is resolved', () => {
    const panes = buildPanes('hi', [], new Map(), [
      scannedFile({
        decisions: new Map([['NRIC:0:14:880101-14-5566', { kind: 'accepted', placeholder: 'NRIC_1' }]]),
      }),
    ]);
    expect(canProceed(panes)).toBe(true);
  });

  it('is true with no file at all', () => {
    expect(canProceed(buildPanes('hi', [], new Map(), []))).toBe(true);
  });
});
