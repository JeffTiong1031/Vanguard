/**
 * Every client-side Slice 2 limit, in one place, each tagged (estimate).
 * `code/README.md`: "the scaffold does not launder an estimate into a
 * constant by writing it in code." These are team-test values and the team
 * test is what replaces them.
 */
export const CLIENT_LIMITS = {
  /** Refuse locally before spending an upload. Mirrors backend MAX_UPLOAD_BYTES. */
  maxUploadBytes: 10 * 1024 * 1024, // (estimate)
  /** Generous: the backend's own wall clock is 30s and this must not fire first. */
  requestTimeoutMs: 45_000, // (estimate)
  /** L2 over a full extract is seconds, not milliseconds -- doc 06 section 1's
   *  SOFT deadline. The prompt's HARD gate is unaffected. */
  fileScanTimeoutMs: 180_000, // (estimate)
} as const;

/**
 * Shared demo bearer token, baked into the team-test build. Path A only, NOT a
 * secret (it ships in the private repo build) -- a casual-abuse deterrent for the
 * public host. Must equal VANGUARD_DEMO_TOKEN in the Render environment.
 * See docs/superpowers/specs/2026-07-21-hosted-demo-file-backend-design.md.
 * Replaced with the real value at deploy time (Task 7).
 */
export const DEMO_TOKEN = 'REPLACE_WITH_DEMO_TOKEN';

// Path A demo host (Render). Local dev: set `vg_api_base` in Options to http://localhost:8000.
// Replaced with the real onrender.com URL at deploy time (Task 7).
const DEFAULT_BASE = 'https://vanguard-extract.onrender.com';
const KEY = 'vg_api_base';

export async function getApiBase(): Promise<string> {
  const stored = (await chrome.storage.local.get(KEY))[KEY] as string | undefined;
  return (stored || DEFAULT_BASE).replace(/\/+$/, '');
}

export async function setApiBase(base: string): Promise<void> {
  await chrome.storage.local.set({ [KEY]: base.replace(/\/+$/, '') });
}
