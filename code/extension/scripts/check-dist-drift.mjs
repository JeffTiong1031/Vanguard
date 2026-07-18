// scripts/check-dist-drift.mjs
// Build to a temp dir, hash every output file, compare to committed dist/chrome-mv3.
// --write mode (postbuild) just refreshes committed dist. Default mode verifies + exits 1 on drift.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const wxtBin = join(process.cwd(), 'node_modules', 'wxt', 'bin', 'wxt.mjs');

export const COMMITTED = 'dist/chrome-mv3';

export function hashTree(root) {
  const out = {};
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else out[relative(root, p).replace(/\\/g, '/')] = createHash('sha256').update(readFileSync(p)).digest('hex');
    }
  };
  walk(root);
  return out;
}

/** Paths whose content hashes differ between two hashTree manifests. */
export function diffTrees(fresh, committed) {
  const keys = new Set([...Object.keys(fresh), ...Object.keys(committed)]);
  return [...keys].filter((k) => fresh[k] !== committed[k]);
}

function runVerify() {
  if (!existsSync(COMMITTED)) {
    console.error(`Missing ${COMMITTED}. Run \`npm run build\` and commit.`);
    process.exit(1);
  }

  const tmp = mkdtempSync(join(tmpdir(), 'vanguard-build-'));
  // WXT 0.19 has no `wxt build --outDir` CLI flag. Override outDir via a
  // generated config that spreads the real wxt.config.ts (no manifest copy).
  const driftConfigPath = join(process.cwd(), '.wxt-drift.config.mjs');
  writeFileSync(
    driftConfigPath,
    `import base from './wxt.config.ts';
export default {
  ...base,
  outDir: ${JSON.stringify(tmp)},
};
`,
  );
  try {
    execFileSync(process.execPath, [wxtBin, 'build', '--config', driftConfigPath], {
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'production' },
    });
  } finally {
    try {
      unlinkSync(driftConfigPath);
    } catch {
      // ignore cleanup errors
    }
  }

  const fresh = hashTree(join(tmp, 'chrome-mv3'));
  const committed = hashTree(COMMITTED);
  const drift = diffTrees(fresh, committed);
  if (drift.length) {
    console.error('dist/ is stale. Run `npm run build` and commit. Drifted:\n' + drift.join('\n'));
    process.exit(1);
  }
  console.log('dist/ matches a fresh build.');
}

const isDirectRun =
  process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);

if (isDirectRun) {
  if (process.argv.includes('--write')) process.exit(0); // postbuild already produced dist/
  runVerify();
}
