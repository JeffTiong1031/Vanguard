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

// Path A demo host (Render). Local dev: set `vg_api_base` in Options to http://localhost:8000.
const DEFAULT_BASE = 'https://vanguard-extract.onrender.com';
const BASE_KEY = 'vg_api_base';
/** Pasted in Options; never committed. Must match VANGUARD_DEMO_TOKEN on Render. */
const TOKEN_KEY = 'vg_demo_token';

export async function getApiBase(): Promise<string> {
  const stored = (await chrome.storage.local.get(BASE_KEY))[BASE_KEY] as string | undefined;
  return (stored || DEFAULT_BASE).replace(/\/+$/, '');
}

export async function setApiBase(base: string): Promise<void> {
  await chrome.storage.local.set({ [BASE_KEY]: base.replace(/\/+$/, '') });
}

/** Empty string when unset — teammate pastes the shared demo key in Options. */
export async function getDemoToken(): Promise<string> {
  const stored = (await chrome.storage.local.get(TOKEN_KEY))[TOKEN_KEY] as string | undefined;
  return (stored ?? '').trim();
}

export async function setDemoToken(token: string): Promise<void> {
  await chrome.storage.local.set({ [TOKEN_KEY]: token.trim() });
}

/** True when the configured base is a local backend (token gate usually unset). */
export function isLocalApiBase(base: string): boolean {
  try {
    const host = new URL(base).hostname;
    return host === 'localhost' || host === '127.0.0.1';
  } catch {
    return false;
  }
}
