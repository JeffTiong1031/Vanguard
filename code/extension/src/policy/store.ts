import type { Enrolment, Policy } from './types';

const K_ENROL = 'vg_enrolment';
const K_POLICY = 'vg_policy';
const K_ETAG = 'vg_policy_etag';

export async function saveEnrolment(enrolment: Enrolment, policy: Policy): Promise<void> {
  await chrome.storage.local.set({ [K_ENROL]: enrolment, [K_POLICY]: policy });
}

export async function getEnrolment(): Promise<Enrolment | null> {
  return ((await chrome.storage.local.get(K_ENROL))[K_ENROL] as Enrolment | undefined) ?? null;
}

export async function savePolicy(policy: Policy, etag: string | null): Promise<void> {
  await chrome.storage.local.set({ [K_POLICY]: policy, [K_ETAG]: etag });
}

export async function getCachedPolicy(): Promise<Policy | null> {
  return ((await chrome.storage.local.get(K_POLICY))[K_POLICY] as Policy | undefined) ?? null;
}

export async function getEtag(): Promise<string | null> {
  return ((await chrome.storage.local.get(K_ETAG))[K_ETAG] as string | undefined) ?? null;
}

/** Removes all three together. Leaving a stale policy behind after an
 *  unenrol would keep enforcing an org the user has left. */
export async function clearEnrolment(): Promise<void> {
  await chrome.storage.local.remove([K_ENROL, K_POLICY, K_ETAG]);
}
