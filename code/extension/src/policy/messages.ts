import type { Enrolment, GovernanceEvent, Policy } from './types';

/** Content script -> background. Mirrors src/detection/l2/messages.ts's shape. */
export type PolicyRequest =
  | { kind: 'policy-get' }
  | { kind: 'policy-enrol'; token: string }
  | { kind: 'policy-request-access'; llmId: string; reason: string }
  | { kind: 'policy-event'; event: GovernanceEvent };

export type PolicyResponse =
  | { kind: 'policy-result'; ok: true; policy: Policy | null; enrolment: Enrolment | null }
  | { kind: 'policy-result'; ok: false; error: string };

export function isPolicyRequest(msg: unknown): msg is PolicyRequest {
  return typeof (msg as PolicyRequest)?.kind === 'string'
    && (msg as PolicyRequest).kind.startsWith('policy-');
}
