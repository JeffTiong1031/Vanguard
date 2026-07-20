import { describe, it, expect } from 'vitest';
import { charWbNgrams, wordNgrams, wordTokens } from '../src/detection/ethics/vectorize';

describe('wordTokens — sklearn token_pattern (?u)\\b\\w\\w+\\b', () => {
  it('lowercases', () => {
    expect(wordTokens('Monitor Employees')).toEqual(['monitor', 'employees']);
  });
  it('drops single-character tokens, as \\w\\w+ requires two', () => {
    expect(wordTokens('a big cat')).toEqual(['big', 'cat']);
  });
  it('drops punctuation entirely', () => {
    expect(wordTokens('monitor, covertly!')).toEqual(['monitor', 'covertly']);
  });
  it('keeps digits, because \\w includes them', () => {
    expect(wordTokens('cve 2026 exploit')).toEqual(['cve', '2026', 'exploit']);
  });
  it('splits on apostrophes rather than keeping contractions whole', () => {
    // sklearn's default pattern does NOT keep "don't" together; "don" and "il"
    // survive, "t" does not. Matching that exactly is the point.
    expect(wordTokens("don't stop")).toEqual(['don', 'stop']);
  });
});

describe('wordNgrams', () => {
  it('emits unigrams then bigrams', () => {
    expect(wordNgrams('monitor staff quietly')).toEqual([
      'monitor', 'staff', 'quietly',
      'monitor staff', 'staff quietly',
    ]);
  });
});

describe('charWbNgrams — sklearn analyzer="char_wb"', () => {
  it('pads each word with a single space on both sides', () => {
    expect(charWbNgrams('ab', 3, 3)).toEqual([' ab', 'ab ']);
  });
  it('yields the padded word itself when it is shorter than n', () => {
    expect(charWbNgrams('a', 3, 3)).toEqual([' a ']);
  });
  it('does not run n-grams across a word boundary', () => {
    const grams = charWbNgrams('ab cd', 3, 3);
    expect(grams).not.toContain('b c');
    expect(grams).toEqual([' ab', 'ab ', ' cd', 'cd ']);
  });
  it('covers the whole requested range', () => {
    expect(charWbNgrams('abc', 3, 4)).toEqual([' ab', 'abc', 'bc ', ' abc', 'abc ']);
  });
});
