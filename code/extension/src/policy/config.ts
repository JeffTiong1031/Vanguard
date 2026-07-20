/**
 * Policy-service settings. Every value that is a guess is tagged, matching
 * src/files/config.ts: "the scaffold does not launder an estimate into a
 * constant by writing it in code."
 */
export const POLICY_CONFIG = {
  /** Content script asks the background this often. NOT a background timer --
   *  the service worker is terminated after ~30s idle (U10), so it cannot hold
   *  one. This message traffic is also what keeps the worker alive.
   *
   *  5s rather than the spec's 30s (estimate): the demo's pivotal beat is an
   *  admin approving while the employee's tab is on screen, and 30s of dead air
   *  kills it. Recorded as a deliberate deviation in the plan header. */
  pollMs: 5_000,
  /** Coalesce event bursts before shipping. Immediate-ish, because the usage
   *  dashboard must reflect a block within a second or two on stage. (estimate) */
  eventDebounceMs: 500,
  /** A poll that hangs must not wedge the banner. (estimate) */
  requestTimeoutMs: 8_000,
} as const;

const KEY = 'vg_policy_base';
/** Overridden in the options page. Default matches Plan A's uvicorn port. */
const DEFAULT_BASE = 'http://localhost:8001';

export async function getPolicyBase(): Promise<string> {
  const stored = (await chrome.storage.local.get(KEY))[KEY] as string | undefined;
  return (stored || DEFAULT_BASE).replace(/\/+$/, '');
}

export async function setPolicyBase(base: string): Promise<void> {
  await chrome.storage.local.set({ [KEY]: base.replace(/\/+$/, '') });
}
