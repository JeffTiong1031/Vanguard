import { describe, it, expect, vi } from 'vitest';
import { ApprovalStore } from '../src/gate/approval-token';

describe('ApprovalStore', () => {
  it('matches once then is consumed', () => {
    const s = new ApprovalStore(); s.approve('h', 60_000);
    expect(s.consumeIfMatch('h')).toBe(true);
    expect(s.consumeIfMatch('h')).toBe(false); // single-use
  });
  it('does not match a different hash (an edit changes the hash)', () => {
    const s = new ApprovalStore(); s.approve('h', 60_000);
    expect(s.consumeIfMatch('h2')).toBe(false);
    expect(s.currentHash()).toBe('h'); // unconsumed by a miss
  });
  it('expires after its TTL', () => {
    vi.useFakeTimers(); const s = new ApprovalStore(); s.approve('h', 1000);
    vi.advanceTimersByTime(1001);
    expect(s.consumeIfMatch('h')).toBe(false);
    vi.useRealTimers();
  });
});
