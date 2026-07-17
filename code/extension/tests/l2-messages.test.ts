// tests/l2-messages.test.ts
import { describe, it, expect } from 'vitest';
import { attachCharOffsets, mergeNerTokens } from '../src/detection/l2/messages';

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
});
