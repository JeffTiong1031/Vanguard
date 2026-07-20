import { describe, it, expect } from 'vitest';
import fixtures from './fixtures/ethics-parity.json';
import model from '../src/detection/ethics/model.json';
import { scoreAll } from '../src/detection/ethics/classify';
import type { EthicsModel } from '../src/detection/ethics/vectorize';

/**
 * 🔴 The test Plan C exists around.
 *
 * ethics-vectorize.test.ts proves the JS matches my DESCRIPTION of sklearn. It
 * cannot prove it matches sklearn. This does, by running both on identical
 * input and comparing numbers.
 *
 * Regenerate the fixtures with:
 *   cd code/classifier && python parity_fixtures.py
 * after ANY change to train.py, the corpus, or export.py.
 */
const EPSILON = 1e-4;   // float64 in Python vs float64 in JS, plus 6dp rounding

describe('Python <-> JavaScript parity', () => {
  for (const fixture of fixtures) {
    it(`agrees on ${JSON.stringify(fixture.text.slice(0, 44))}`, () => {
      const actual = scoreAll(fixture.text, model as unknown as EthicsModel);
      for (const [category, expected] of Object.entries(fixture.scores)) {
        expect(
          Math.abs(actual[category]! - (expected as number)),
          `${category}: JS ${actual[category]} vs Python ${expected}`,
        ).toBeLessThan(EPSILON);
      }
    });
  }
});
