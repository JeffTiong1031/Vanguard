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

const DEFAULT_BASE = 'http://localhost:8000';
const KEY = 'vg_api_base';

export async function getApiBase(): Promise<string> {
  const stored = (await chrome.storage.local.get(KEY))[KEY] as string | undefined;
  return (stored || DEFAULT_BASE).replace(/\/+$/, '');
}

export async function setApiBase(base: string): Promise<void> {
  await chrome.storage.local.set({ [KEY]: base.replace(/\/+$/, '') });
}
