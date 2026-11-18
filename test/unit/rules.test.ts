import { describe, expect, it } from 'vitest';

import { numberRules, ruleAnchor, ruleText } from '../../shared/utils/rules.ts';

const category = (id: string) => ({ id });
const rule = (id: string, categoryId: string, retired = false) => ({ id, categoryId, retired });

describe('numberRules', () => {
  it('numbers categories and their rules from 1', () => {
    const numbered = numberRules(
      [category('a'), category('b')],
      [rule('1', 'a'), rule('2', 'a'), rule('3', 'b')],
    );
    expect(numbered.map((entry) => entry.number)).toEqual([1, 2]);
    expect(numbered.flatMap((entry) => entry.rules.map((item) => item.number))).toEqual([
      '1.1',
      '1.2',
      '2.1',
    ]);
  });

  it('gives retired rules no number and closes the gap', () => {
    const numbered = numberRules(
      [category('a')],
      [rule('1', 'a'), rule('2', 'a', true), rule('3', 'a')],
    );
    expect(numbered[0]!.rules.map((item) => [item.rule.id, item.number])).toEqual([
      ['1', '1.1'],
      ['3', '1.2'],
    ]);
  });

  it('skips a category with nothing left and numbers the next one in its place', () => {
    const numbered = numberRules(
      [category('a'), category('b'), category('c')],
      [rule('1', 'a', true), rule('2', 'b'), rule('3', 'c')],
    );
    expect(numbered.map((entry) => [entry.category.id, entry.number])).toEqual([
      ['b', 1],
      ['c', 2],
    ]);
    expect(numbered[1]!.rules[0]!.number).toBe('2.1');
  });

  it('keeps the order it is given', () => {
    const numbered = numberRules([category('b'), category('a')], [rule('1', 'a'), rule('2', 'b')]);
    expect(numbered.map((entry) => entry.category.id)).toEqual(['b', 'a']);
  });
});

describe('ruleText', () => {
  it('shows French when there is some, and English when it is empty', () => {
    expect(ruleText({ en: 'Hello', fr: 'Bonjour' }, 'fr')).toBe('Bonjour');
    expect(ruleText({ en: 'Hello', fr: '  ' }, 'fr')).toBe('Hello');
    expect(ruleText({ en: 'Hello', fr: 'Bonjour' }, 'en')).toBe('Hello');
  });
});

describe('ruleAnchor', () => {
  it('is r followed by the stable ref', () => {
    expect(ruleAnchor(7)).toBe('r7');
  });
});
