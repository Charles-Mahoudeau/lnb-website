// Server rules: pure helpers shared by the server and the pages. See docs/rules.md.

export interface Numbered<C, R> {
  category: C;
  number: number;
  rules: { rule: R; number: string }[];
}

/**
 * Numbers rules from their order: the categories that still have a rule that is not retired are
 * numbered from 1, and each rule is "category.rule". Retired rules have no number, and a category
 * with none left is skipped. Both inputs must already be in order.
 */
export function numberRules<
  C extends { id: string },
  R extends { categoryId: string; retired: boolean },
>(categories: readonly C[], rules: readonly R[]): Numbered<C, R>[] {
  const result: Numbered<C, R>[] = [];
  for (const category of categories) {
    const active = rules.filter((rule) => rule.categoryId === category.id && !rule.retired);
    if (!active.length) continue;
    const number = result.length + 1;
    result.push({
      category,
      number,
      rules: active.map((rule, index) => ({
        rule,
        number: `${String(number)}.${String(index + 1)}`,
      })),
    });
  }
  return result;
}

/** The text in the language shown, or the English one when the French is empty. */
export function ruleText(text: { en: string; fr: string }, locale: string): string {
  return (locale === 'fr' && text.fr.trim()) || text.en;
}

/** The anchor of a rule on the rules page, stable when rules are moved. */
export function ruleAnchor(ref: number): string {
  return `r${String(ref)}`;
}
