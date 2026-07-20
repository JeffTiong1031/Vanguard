/**
 * Governance event shipping. BACKGROUND SERVICE WORKER ONLY (see client.ts).
 *
 * 🔴 I3. A GovernanceEvent has no field for prompt text, and Plan A's server
 * sets extra="forbid" so an event carrying one is REJECTED with a 422 rather
 * than silently accepted. If this module ever starts 422-ing, something began
 * putting user text in an event -- treat that as a leak, not a bug.
 */
import { POLICY_CONFIG, getPolicyBase } from './config';
import { getEnrolment } from './store';
import type { GovernanceEvent } from './types';

let queue: GovernanceEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

export function queueEvent(event: GovernanceEvent): void {
  queue.push(event);
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    void flushNow();
  }, POLICY_CONFIG.eventDebounceMs);
}

export async function flushNow(): Promise<void> {
  if (queue.length === 0) return;
  const enrolment = await getEnrolment();
  if (!enrolment) {
    // Not enrolled: there is no org to attribute these to. Drop rather than
    // grow an unbounded queue in a worker that may be killed anyway.
    queue = [];
    return;
  }

  const batch = queue;
  queue = [];
  try {
    const base = await getPolicyBase();
    const response = await fetch(`${base}/v1/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pseudo_id: enrolment.pseudo_id, events: batch }),
    });
    if (!response.ok) throw new Error(String(response.status));
  } catch {
    // Put them back at the front so ordering survives a transient failure.
    queue = [...batch, ...queue];
  }
}
