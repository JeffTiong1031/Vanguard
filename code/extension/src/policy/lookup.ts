import type { Policy, Tool } from './types';

/**
 * Find the registry entry governing a hostname.
 *
 * The dot boundary matters: a bare `endsWith('chatgpt.com')` also matches
 * `notchatgpt.com`, which would hand an attacker-controlled domain the policy
 * of a tool we approved.
 */
export function toolForHost(policy: Policy | null, hostname: string): Tool | null {
  if (!policy) return null;
  const host = hostname.toLowerCase();
  return policy.tools.find(
    (t) => host === t.host || host.endsWith(`.${t.host}`),
  ) ?? null;
}

/**
 * Governed and blocked → false. Everything else → true.
 *
 * An unknown host is approved by design: we warn about a curated set of known
 * AI tools, not about the whole web. An unenrolled user is never warned at all.
 */
export function isApproved(policy: Policy | null, hostname: string): boolean {
  const tool = toolForHost(policy, hostname);
  return tool === null || tool.status === 'approved';
}
