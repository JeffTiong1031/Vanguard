// tests/offscreen-no-storage.test.ts
//
// 🔴 `chrome.storage` is UNDEFINED inside an offscreen document. Measured 2026-07-20 in
// chrome-extension://<id>/offscreen.html:
//
//     await chrome.storage.local.get('vg_sensitivity_model_url')
//     → Uncaught TypeError: Cannot read properties of undefined (reading 'local')
//
// The `storage` permission is present and correct in the manifest; the API is simply not
// exposed in that context. The sensitivity classifier read its config there, the read threw, a
// bare catch reported it as "no model configured", and the feature was skipped in total silence
// on every prompt from the day it was written. The config now arrives in the `l2-run` message,
// sent by the service worker, which does have storage (ADR 0030).
//
// This test is static on purpose. The behavioural tests in sensitivity.test.ts inject `classify`
// and `markSpan` as callbacks — the fixture supplies exactly what the runtime failed to provide,
// so the seam sits inboard of the break and no behavioural test could ever have caught this.
// CLAUDE.md §2 ledger #11: the instrument was correct and the measurement was still wrong.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = readFileSync(
  resolve(__dirname, '../entrypoints/offscreen/main.ts'),
  'utf8',
);

/** Strip comments so the prohibition is about code, not about documentation of the bug. */
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('the offscreen document is a pure compute context', () => {
  it('never references chrome.storage', () => {
    expect(CODE).not.toMatch(/chrome\s*\.\s*storage/);
  });

  it('never calls loadConfig — that is the service worker\'s job', () => {
    expect(CODE).not.toMatch(/\bloadConfig\s*\(/);
  });

  it('handles l2-run, not l2-scan (sendMessage broadcasts to every context)', () => {
    expect(CODE).toMatch(/'l2-run'/);
    expect(CODE).not.toMatch(/kind\s*!==\s*'l2-scan'/);
  });

  it('the comment-stripping is real, so the guards above are not vacuous', () => {
    // Guards against a regex that accidentally deletes everything.
    expect(CODE).toMatch(/chrome\.runtime\.onMessage\.addListener/);
    expect(CODE.length).toBeGreaterThan(1000);
  });
});
