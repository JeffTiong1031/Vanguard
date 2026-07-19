// tests/l2-messages.test.ts
import { describe, it, expect } from 'vitest';
import {
  attachCharOffsets, buildRunRequest, describeStatus, mergeNerTokens,
} from '../src/detection/l2/messages';

describe('describeStatus — every branch names itself', () => {
  it('renders each state as human text', () => {
    expect(describeStatus({ state: 'disabled' })).toBe('Off — no model configured');
    expect(describeStatus({ state: 'loading' })).toBe('Loading model…');
    expect(describeStatus({ state: 'ready', spans: 3, released: 2, kept: 1, failed: 0, ms: 210 }))
      .toBe('Ready — 3 spans in 210 ms, 2 released, 1 masked');
    expect(describeStatus({ state: 'failed', reason: 'HTTP 404' })).toBe('Failed — HTTP 404');
    expect(describeStatus({ state: 'skipped', why: 'too-long' }))
      .toBe('Skipped — prompt too long for the classifier');
    expect(describeStatus({ state: 'skipped', why: 'file-path' }))
      .toBe('Skipped — files are not sensitivity-filtered (ADR 0018)');
    expect(describeStatus({ state: 'skipped', why: 'no-entities' }))
      .toBe('Skipped — nothing to judge');
  });
});

describe('buildRunRequest — the config the offscreen document cannot read for itself', () => {
  const cfg = { modelId: 'vanguard/sens-v0.2.0-trim70k', maxTokens: 96 };

  it('carries the config across the hop, under a distinct kind', () => {
    expect(buildRunRequest({ kind: 'l2-scan', id: 'a', text: 'hello', purpose: 'chat' }, cfg))
      .toEqual({ kind: 'l2-run', id: 'a', text: 'hello', purpose: 'chat', sensitivity: cfg });
  });

  it('preserves purpose:file so ADR 0018 survives the hop', () => {
    expect(buildRunRequest({ kind: 'l2-scan', id: 'b', text: 'x', purpose: 'file' }, cfg).purpose)
      .toBe('file');
  });
});

describe('mergeNerTokens', () => {
  it('merges B-/I- PER tokens into one PERSON span and drops LOC', () => {
    const merged = mergeNerTokens([
      { entity: 'B-PER', start: 13, end: 18, word: 'Ahmad' },
      { entity: 'I-PER', start: 19, end: 22, word: 'Ali' },
      { entity: 'B-LOC', start: 30, end: 36, word: 'Penang' },
    ]);
    expect(merged).toEqual([{ type: 'PERSON', start: 13, end: 22, text: 'Ahmad Ali' }]);
  });

  it('keeps ORG and separates adjacent entities of different type', () => {
    const merged = mergeNerTokens([
      { entity: 'B-ORG', start: 0, end: 5, word: 'Apple' },
      { entity: 'B-PER', start: 6, end: 9, word: 'Tim' },
    ]);
    expect(merged.map((m) => m.type)).toEqual(['ORG', 'PERSON']);
  });

  it('merges a wordpiece continuation ("##") into the preceding entity without the marker', () => {
    const merged = mergeNerTokens([
      { entity: 'B-PER', start: 0, end: 4, word: 'Ahm' },
      { entity: 'I-PER', start: 4, end: 6, word: '##ad' },
    ]);
    expect(merged).toEqual([{ type: 'PERSON', start: 0, end: 6, text: 'Ahmad' }]);
  });
});

describe('attachCharOffsets', () => {
  it('locates each decoded token in the source text and strips "##" before searching', () => {
    const text = 'Please email Ahmad about the Apple deal';
    const tokens = attachCharOffsets(text, [
      { entity: 'O', word: 'Please' },
      { entity: 'O', word: 'email' },
      { entity: 'B-PER', word: 'Ahm' },
      { entity: 'I-PER', word: '##ad' },
      { entity: 'O', word: 'about' },
      { entity: 'B-ORG', word: 'Apple' },
    ]);
    expect(tokens).toEqual([
      { entity: 'O', start: 0, end: 6, word: 'Please' },
      { entity: 'O', start: 7, end: 12, word: 'email' },
      { entity: 'B-PER', start: 13, end: 16, word: 'Ahm' },
      { entity: 'I-PER', start: 16, end: 18, word: '##ad' },
      { entity: 'O', start: 19, end: 24, word: 'about' },
      { entity: 'B-ORG', start: 29, end: 34, word: 'Apple' },
    ]);
  });

  it('drops a token it cannot align rather than guessing a span', () => {
    const tokens = attachCharOffsets('hello world', [
      { entity: 'O', word: 'hello' },
      { entity: 'O', word: 'nowhere-in-text' },
      { entity: 'O', word: 'world' },
    ]);
    expect(tokens.map((t) => t.word)).toEqual(['hello', 'world']);
  });

  // CRITICAL regression: recurring substring + entity-only stream (pipeline default
  // ignore_labels:['O']) mislocates the tagged mention onto the FIRST occurrence.
  // Production must pass the FULL ordered stream (ignore_labels:[]) so O tokens advance
  // the cursor. This test uses the production-shaped full stream and asserts the LATER
  // occurrence; the companion check below documents that entity-only is wrong.
  it('points at the later occurrence of a recurring word when given the full ordered stream', () => {
    // "I love Apple and my friend has an apple; call Apple Inc"
    //  indices:         ^7                           ^46
    const text = 'I love Apple and my friend has an apple; call Apple Inc';
    const firstApple = text.indexOf('Apple'); // 7
    const lastApple = text.lastIndexOf('Apple'); // 46
    expect(firstApple).toBe(7);
    expect(lastApple).toBe(46);

    // Entity-only stream (old production shape) — MUST land on the WRONG (first) span.
    const entityOnly = attachCharOffsets(text, [{ entity: 'B-ORG', word: 'Apple' }]);
    expect(entityOnly[0]!.start).toBe(firstApple);
    expect(entityOnly[0]!.start).not.toBe(lastApple);

    // Full ordered stream as the real pipeline emits with ignore_labels:[] — O tokens
    // between the three "Apple"/"apple" mentions advance the cursor past the early ones.
    const fullStream = attachCharOffsets(text, [
      { entity: 'O', word: 'I' },
      { entity: 'O', word: 'love' },
      { entity: 'O', word: 'Apple' }, // first Apple — not the tagged entity
      { entity: 'O', word: 'and' },
      { entity: 'O', word: 'my' },
      { entity: 'O', word: 'friend' },
      { entity: 'O', word: 'has' },
      { entity: 'O', word: 'an' },
      { entity: 'O', word: 'apple' }, // lowercase apple — not the tagged entity
      { entity: 'O', word: ';' },
      { entity: 'O', word: 'call' },
      { entity: 'B-ORG', word: 'Apple' }, // the tagged mention — LATER occurrence
      { entity: 'I-ORG', word: 'Inc' },
    ]);
    const orgTokens = fullStream.filter((t) => t.entity.endsWith('ORG'));
    expect(orgTokens).toEqual([
      { entity: 'B-ORG', start: lastApple, end: lastApple + 5, word: 'Apple' },
      { entity: 'I-ORG', start: lastApple + 6, end: lastApple + 9, word: 'Inc' },
    ]);
    // End-to-end: merge must also land on the later span, not the first.
    const merged = mergeNerTokens(fullStream);
    expect(merged).toEqual([
      { type: 'ORG', start: lastApple, end: lastApple + 9, text: 'Apple Inc' },
    ]);
  });
});
