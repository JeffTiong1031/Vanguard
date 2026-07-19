import { describe, expect, it } from 'vitest';
import { FileStore } from '../../src/files/store';

const f = (name: string) => new File(['hello'], name, { type: 'text/plain' });

describe('FileStore', () => {
  it('assigns a stable id and starts held', () => {
    const s = new FileStore();
    const id = s.add(f('a.txt'));
    expect(s.get(id)!.status.kind).toBe('held');
    expect(s.get(id)!.file.name).toBe('a.txt');
  });

  it('is not resolved while a file is still scanning', () => {
    const s = new FileStore();
    const id = s.add(f('a.txt'));
    s.update(id, { status: { kind: 'scanning' } });
    expect(s.allResolved()).toBe(false);
  });

  it('is resolved when a scanned file has no findings', () => {
    const s = new FileStore();
    const id = s.add(f('a.txt'));
    s.update(id, {
      status: { kind: 'scanned' },
      extract: 'nothing here',
      findings: [],
      decisions: new Map(),
    });
    expect(s.allResolved()).toBe(true);
  });

  it('is not resolved while a finding is pending', () => {
    const s = new FileStore();
    const id = s.add(f('a.txt'));
    s.update(id, {
      status: { kind: 'scanned' },
      extract: 'x 880101-14-5566',
      findings: [{ cls: 'NRIC', start: 2, end: 16, text: '880101-14-5566' }],
      decisions: new Map([['NRIC:2:16:880101-14-5566', { kind: 'pending' }]]),
    });
    expect(s.allResolved()).toBe(false);
  });

  it('is NOT resolved on an error until the user acknowledges it', () => {
    // ADR 0014: never fail-closed -- but never fail SILENTLY either. An
    // unreadable file must be surfaced and consciously escaped, not skipped.
    const s = new FileStore();
    const id = s.add(f('a.pdf'));
    s.update(id, { status: { kind: 'error', code: 'no_text_layer', message: 'scanned' } });
    expect(s.allResolved()).toBe(false);
    s.update(id, {
      status: {
        kind: 'error_acknowledged',
        code: 'no_text_layer',
        message: 'scanned',
        reason: 'internal doc, reviewed by me',
      },
    });
    expect(s.allResolved()).toBe(true);
  });

  it('holds nothing after clear -- the store never outlives the tab', () => {
    const s = new FileStore();
    s.add(f('a.txt'));
    s.clear();
    expect(s.list()).toEqual([]);
  });
});
