// scripts/check-dist-drift.mjs
// Build to a temp dir, hash every output file, compare to committed dist/chrome-mv3.
// --write mode (postbuild) just refreshes committed dist. Default mode verifies + exits 1 on drift.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';

const wxtBin = join(process.cwd(), 'node_modules', 'wxt', 'bin', 'wxt.mjs');

const COMMITTED = 'dist/chrome-mv3';

function hashTree(root) {
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

if (process.argv.includes('--write')) process.exit(0); // postbuild already produced dist/

const tmp = mkdtempSync(join(tmpdir(), 'vanguard-build-'));
// WXT 0.19 has no `wxt build --outDir` CLI flag ([verify] in task brief).
// Override outDir via a generated config passed to `--config`.
const driftConfigPath = join(process.cwd(), '.wxt-drift.config.mjs');
writeFileSync(
  driftConfigPath,
  `import { defineConfig } from 'wxt';
export default defineConfig({
  outDir: ${JSON.stringify(tmp)},
  manifest: {
    name: 'Vanguard (Slice 1)',
    description: 'On-device prompt-privacy gate for ChatGPT and Claude. Team test build.',
    version: '0.1.0',
    permissions: ['storage', 'offscreen'],
    host_permissions: ['https://chatgpt.com/*', 'https://claude.ai/*'],
  },
});
`,
);
try {
  execFileSync(process.execPath, [wxtBin, 'build', '--config', driftConfigPath], { stdio: 'inherit' });
} finally {
  try {
    unlinkSync(driftConfigPath);
  } catch {
    // ignore cleanup errors
  }
}
const fresh = hashTree(join(tmp, 'chrome-mv3'));
const committed = hashTree(COMMITTED);

const keys = new Set([...Object.keys(fresh), ...Object.keys(committed)]);
const drift = [...keys].filter((k) => fresh[k] !== committed[k]);
if (drift.length) {
  console.error('dist/ is stale. Run `npm run build` and commit. Drifted:\n' + drift.join('\n'));
  process.exit(1);
}
console.log('dist/ matches a fresh build.');
