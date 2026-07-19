// src/detection/l2/status-store.ts
//
// The engine's last reported state, so the options page can show it.
//
// 🔴 Written from the SERVICE WORKER only. The offscreen document — where the classifier
// actually runs — has no `chrome.storage` at all (measured 2026-07-20), so it reports its state
// in the `l2-result` message and the SW persists it. Putting this write in the offscreen
// document would reintroduce the exact bug this whole change exists to fix.

import type { SensitivityStatus } from './messages';

const KEY = 'vg_sensitivity_last_status';

export async function recordStatus(s: SensitivityStatus): Promise<void> {
  await chrome.storage.local.set({ [KEY]: s });
}

export async function readStatus(): Promise<SensitivityStatus | null> {
  const got = await chrome.storage.local.get(KEY);
  return (got[KEY] as SensitivityStatus | undefined) ?? null;
}
