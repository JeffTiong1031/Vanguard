// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { flushNow, queueEvent } from '../src/policy/events';
import type { GovernanceEvent } from '../src/policy/types';

const event = (over: Partial<GovernanceEvent> = {}): GovernanceEvent => ({
  host: 'gemini.google.com', type: 'visit_unapproved',
  ts: new Date().toISOString(), ...over,
});

beforeEach(() => {
  vi.useFakeTimers();
  const bag: Record<string, unknown> = {
    vg_enrolment: { org_id: 'o1', org_name: 'A', pseudo_id: 'p1', department: 'Eng' },
  };
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: async (k: string | string[]) => {
          const keys = Array.isArray(k) ? k : [k];
          return Object.fromEntries(keys.filter((x) => x in bag).map((x) => [x, bag[x]]));
        },
        set: async (o: Record<string, unknown>) => { Object.assign(bag, o); },
        // CORRECTED BY THE CONTROLLER. The plan wrote `remove: async () => {}`
        // -- a NO-OP. The fourth test below calls remove('vg_enrolment') and
        // then asserts `expect(bag.vg_enrolment).toBeUndefined()`, which a
        // no-op can never satisfy: the key is still there, so the assertion
        // fails and the "not enrolled" path is never actually reached. Tasks 2
        // and 3 both carry a working implementation; this one was the outlier.
        // Use this real version.
        remove: async (k: string | string[]) => {
          for (const x of Array.isArray(k) ? k : [k]) delete bag[x];
        },
      },
    },
  });
});

afterEach(() => { vi.useRealTimers(); });

describe('event queue', () => {
  it('coalesces a burst into a single request', async () => {
    const fetchMock = vi.fn(async () => new Response('{"accepted":3}', { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);

    queueEvent(event());
    queueEvent(event({ type: 'warn_shown' }));
    queueEvent(event({ type: 'request_sent' }));
    expect(fetchMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(600);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.events).toHaveLength(3);
    expect(body.pseudo_id).toBe('p1');
  });

  it('never sends a field the server would reject', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);
    queueEvent(event({ category: 'covert_surveillance' }));
    await vi.advanceTimersByTimeAsync(600);

    const sent = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    const allowed = new Set(['host', 'type', 'category', 'finding_hash', 'ts']);
    for (const e of sent.events) {
      for (const key of Object.keys(e)) expect(allowed.has(key)).toBe(true);
    }
  });

  it('re-queues on a failed flush so events are not silently lost', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(new Response('{}', { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);

    queueEvent(event());
    await vi.advanceTimersByTimeAsync(600);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await flushNow();
    const body = JSON.parse((fetchMock.mock.calls[1]![1] as RequestInit).body as string);
    expect(body.events).toHaveLength(1);
  });

  it('drops events when not enrolled rather than queueing forever', async () => {
    await chrome.storage.local.remove('vg_enrolment');
    const bag = await chrome.storage.local.get('vg_enrolment');
    expect(bag.vg_enrolment).toBeUndefined();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    queueEvent(event());
    await vi.advanceTimersByTimeAsync(600);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
