// tests/dist-drift.test.ts
import { execFileSync } from 'node:child_process';
import { describe, it, expect } from 'vitest';

describe('dist drift', () => {
  it('committed dist matches a fresh build', () => {
    // check:dist exits 0 when in sync, 1 when stale. A non-zero exit throws.
    expect(() =>
      execFileSync('node', ['scripts/check-dist-drift.mjs'], { cwd: process.cwd() }),
    ).not.toThrow();
  });
});
