import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const manifest = JSON.parse(
  readFileSync(resolve(__dirname, '../dist/chrome-mv3/manifest.json'), 'utf8'),
) as { host_permissions: string[]; permissions: string[] };

describe('manifest host_permissions', () => {
  // 🔴 A missing host permission does not raise. The fetch is blocked inside the offscreen
  // document, the model load never completes, every entity stays masked, and the user sees
  // "still blocked" — identical to the classifier disagreeing with them. That symptom had
  // three different causes in one session (no timeout, wrong bundle layout, missing
  // permission), so the invariant is pinned here rather than left to be rediscovered.

  it('covers both loopback spellings for every local port', () => {
    const ports = [8000, 8765];
    for (const port of ports) {
      for (const host of ['localhost', '127.0.0.1']) {
        expect(
          manifest.host_permissions,
          `${host}:${port} — localhost and 127.0.0.1 are different origins for matching`,
        ).toContain(`http://${host}:${port}/*`);
      }
    }
  });

  it('still covers the two provider surfaces', () => {
    expect(manifest.host_permissions).toContain('https://chatgpt.com/*');
    expect(manifest.host_permissions).toContain('https://claude.ai/*');
  });

  it('does not request <all_urls> (ADR 0017 §6.2)', () => {
    expect(manifest.host_permissions).not.toContain('<all_urls>');
    expect(manifest.host_permissions.some((p) => p.includes('*://*/'))).toBe(false);
  });

  it('keeps permissions minimal — no webRequest', () => {
    expect(manifest.permissions).not.toContain('webRequest');
    expect(manifest.permissions).toEqual(expect.arrayContaining(['storage', 'offscreen']));
  });
});
