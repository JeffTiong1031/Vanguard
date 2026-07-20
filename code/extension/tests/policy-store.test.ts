// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  clearEnrolment, getCachedPolicy, getEnrolment, getEtag, saveEnrolment, savePolicy,
} from '../src/policy/store';
import type { Enrolment, Policy } from '../src/policy/types';

const enrolment: Enrolment = {
  org_id: 'o1', org_name: 'Acme Corp', pseudo_id: 'p1', department: 'Engineering',
};
const policy: Policy = {
  org_id: 'o1', org_name: 'Acme Corp', version: 1, tools: [], categories: [],
};

beforeEach(() => {
  const bag: Record<string, unknown> = {};
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: async (k: string | string[]) => {
          const keys = Array.isArray(k) ? k : [k];
          return Object.fromEntries(keys.filter((x) => x in bag).map((x) => [x, bag[x]]));
        },
        set: async (o: Record<string, unknown>) => { Object.assign(bag, o); },
        remove: async (k: string | string[]) => {
          for (const x of Array.isArray(k) ? k : [k]) delete bag[x];
        },
      },
    },
  });
});

describe('policy store', () => {
  it('round-trips an enrolment', async () => {
    await saveEnrolment(enrolment, policy);
    expect(await getEnrolment()).toEqual(enrolment);
    expect(await getCachedPolicy()).toEqual(policy);
  });

  it('returns null before enrolment rather than throwing', async () => {
    expect(await getEnrolment()).toBeNull();
    expect(await getCachedPolicy()).toBeNull();
  });

  it('stores the etag alongside the policy', async () => {
    await savePolicy(policy, 'W/"o1-1"');
    expect(await getEtag()).toBe('W/"o1-1"');
    expect((await getCachedPolicy())?.version).toBe(1);
  });

  it('a newer policy replaces the old one and its etag', async () => {
    await savePolicy(policy, 'W/"o1-1"');
    await savePolicy({ ...policy, version: 2 }, 'W/"o1-2"');
    expect((await getCachedPolicy())?.version).toBe(2);
    expect(await getEtag()).toBe('W/"o1-2"');
  });

  it('clearing removes the enrolment, the policy, and the etag together', async () => {
    await saveEnrolment(enrolment, policy);
    await savePolicy(policy, 'W/"o1-1"');
    await clearEnrolment();
    expect(await getEnrolment()).toBeNull();
    expect(await getCachedPolicy()).toBeNull();
    expect(await getEtag()).toBeNull();
  });
});
