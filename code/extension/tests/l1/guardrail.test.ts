import { describe, it, expect } from 'vitest';
import { runL1 } from '../../src/detection/l1';

describe('L1 fires on identifier grammars, never on bare numbers', () => {
  for (const clean of [
    '1+1',
    '1 + 1 = 2',
    'the year 2024',
    'chapter 12',
    'I need 3 apples',
    '100%',
    '$4.50',
    'page 42 of 100',
    '2024-01-01 is a date',
    'call me at 3pm',
    '12345',
    'order #7890',
    'v1.2.3',
    'aisle 9',
    'RM 250',
    '-5 degrees',
  ]) {
    it(`no finding: ${clean}`, () => expect(runL1(clean)).toEqual([]));
  }
});
