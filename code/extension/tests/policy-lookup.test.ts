import { describe, it, expect } from 'vitest';
import { isApproved, toolForHost } from '../src/policy/lookup';
import type { Policy } from '../src/policy/types';

const policy: Policy = {
  org_id: 'o1', org_name: 'Acme Corp', version: 3,
  tools: [
    { llm_id: 'openai', host: 'chatgpt.com', display_name: 'ChatGPT', status: 'approved' },
    { llm_id: 'google', host: 'gemini.google.com', display_name: 'Google Gemini', status: 'blocked' },
  ],
  categories: [],
};

describe('toolForHost', () => {
  it('matches an exact host', () => {
    expect(toolForHost(policy, 'chatgpt.com')?.llm_id).toBe('openai');
  });
  it('matches a subdomain of a registry host', () => {
    expect(toolForHost(policy, 'www.chatgpt.com')?.llm_id).toBe('openai');
  });
  it('does NOT match a lookalike domain', () => {
    // "notchatgpt.com".endsWith("chatgpt.com") is true — a naive endsWith is a
    // real bug here, so the boundary must be a dot.
    expect(toolForHost(policy, 'notchatgpt.com')).toBeNull();
  });
  it('returns null for a host that is not in the registry at all', () => {
    expect(toolForHost(policy, 'example.com')).toBeNull();
  });
});

describe('isApproved', () => {
  it('is true for an approved tool', () => {
    expect(isApproved(policy, 'chatgpt.com')).toBe(true);
  });
  it('is false for a blocked tool', () => {
    expect(isApproved(policy, 'gemini.google.com')).toBe(false);
  });
  it('is true for a host we do not govern — we warn about known tools, not the whole web', () => {
    expect(isApproved(policy, 'example.com')).toBe(true);
  });
  it('is true when there is no policy at all, so an unenrolled user is never blocked', () => {
    expect(isApproved(null, 'gemini.google.com')).toBe(true);
  });
});
