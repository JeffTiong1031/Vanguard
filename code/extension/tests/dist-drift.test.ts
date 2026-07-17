// tests/dist-drift.test.ts
import { execFileSync } from 'node:child_process';
import { appendFileSync, cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterAll, describe, expect, it } from 'vitest';
import { COMMITTED, diffTrees, hashTree } from '../scripts/check-dist-drift.mjs';

describe('dist drift', () => {
  it('committed dist matches a fresh build', () => {
    // check:dist exits 0 when in sync, 1 when stale. A non-zero exit throws.
    expect(() =>
      execFileSync('node', ['scripts/check-dist-drift.mjs'], { cwd: process.cwd() }),
    ).not.toThrow();
  });

  it('detects drift when an output file byte differs', () => {
    const fixture = mkdtempSync(join(tmpdir(), 'vanguard-drift-neg-'));
    const clean = join(fixture, 'clean');
    const dirty = join(fixture, 'dirty');
    try {
      cpSync(COMMITTED, clean, { recursive: true });
      cpSync(COMMITTED, dirty, { recursive: true });
      appendFileSync(join(dirty, 'manifest.json'), 'x');

      const drift = diffTrees(hashTree(clean), hashTree(dirty));
      expect(drift).toContain('manifest.json');
      expect(drift.length).toBeGreaterThan(0);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it('exits non-zero when committed dist is stale, then restores it', () => {
    const target = join(COMMITTED, 'manifest.json');
    const original = readFileSync(target);
    try {
      appendFileSync(target, 'x');
      expect(() =>
        execFileSync('node', ['scripts/check-dist-drift.mjs'], {
          cwd: process.cwd(),
          stdio: 'pipe',
        }),
      ).toThrow();
    } finally {
      writeFileSync(target, original);
    }
  });
});

afterAll(() => {
  // Working tree must be pristine after mutate-and-restore.
  const status = execFileSync('git', ['status', '--porcelain', 'code/extension/dist'], {
    cwd: join(process.cwd(), '..', '..'),
    encoding: 'utf8',
  });
  expect(status.trim()).toBe('');
});
