import { describe, it, expect } from 'vitest';
import { explain } from '../src/detection/explanations';

describe('explain', () => {
  it('gives a specific reason for a known ethics category', () => {
    const e = explain('ethics', 'covert_surveillance');
    expect(e.why.toLowerCase()).toContain('monitor');
    expect(e.note).toContain('on your device');       // the "AI was involved" line
  });

  it('gives a specific reason for a known PII class', () => {
    expect(explain('pii', 'NRIC').why).toMatch(/IC|identity/i);
  });

  it('has a tool entry', () => {
    expect(explain('tool', 'any').why.toLowerCase()).toContain('reviewed');
  });

  it('falls back to a generic explanation for an unknown key, never blank', () => {
    const e = explain('ethics', 'something_new');
    expect(e.title.length).toBeGreaterThan(0);
    expect(e.why.length).toBeGreaterThan(0);
    expect(e.note.length).toBeGreaterThan(0);
  });
});
