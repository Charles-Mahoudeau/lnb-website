import { RULE_PROBLEMS } from '#shared/schemas/rules';
import type {
  RuleAdminView,
  RuleBody,
  RuleCategoryBody,
  RuleCategoryPatchBody,
  RulePatchBody,
  RuleProblem,
  RulePublicView,
} from '#shared/schemas/rules';

// The server rules page (/minecraft/rules) and the Rules section of the admin area. See docs/rules.md.

/** The rules, grouped by category. `enabled` is false while the `rules` flag is off. */
export function usePublicRules() {
  return useFetch<RulePublicView>('/api/rules', { key: 'rules' });
}

/** Every category and rule for the admin, retired rules too. */
export function useAdminRules() {
  return useFetch<RuleAdminView>('/api/admin/rules', { key: 'rules-admin' });
}

/** A refused rules request, with the reason the API gave. */
export class RuleError extends Error {
  constructor(readonly problem: RuleProblem | 'failed') {
    super(`Rules request refused: ${problem}`);
  }
}

async function call<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    const problem = (error as { data?: { data?: { problem?: unknown } } }).data?.data?.problem;
    throw new RuleError(
      RULE_PROBLEMS.includes(problem as RuleProblem) ? (problem as RuleProblem) : 'failed',
    );
  }
}

/** What admins can do to the rules. Each throws a RuleError when refused. */
export const ruleActions = {
  addRule: (body: RuleBody) =>
    call(() => $fetch<{ id: string }>('/api/admin/rules', { method: 'POST', body })),
  updateRule: (id: string, body: RulePatchBody) =>
    call(() => $fetch(`/api/admin/rules/${id}`, { method: 'PATCH', body })),
  setRetired: (id: string, retired: boolean) =>
    call(() => $fetch(`/api/admin/rules/${id}/retired`, { method: 'PUT', body: { retired } })),
  moveRule: (id: string, direction: 'up' | 'down') =>
    call(() => $fetch(`/api/admin/rules/${id}/move`, { method: 'POST', body: { direction } })),
  addCategory: (body: RuleCategoryBody) =>
    call(() => $fetch<{ id: string }>('/api/admin/rules/categories', { method: 'POST', body })),
  updateCategory: (id: string, body: RuleCategoryPatchBody) =>
    call(() => $fetch(`/api/admin/rules/categories/${id}`, { method: 'PATCH', body })),
  removeCategory: (id: string) =>
    call(() => $fetch(`/api/admin/rules/categories/${id}`, { method: 'DELETE' })),
  moveCategory: (id: string, direction: 'up' | 'down') =>
    call(() =>
      $fetch(`/api/admin/rules/categories/${id}/move`, { method: 'POST', body: { direction } }),
    ),
  loadDraft: () =>
    call(() => $fetch<{ rules: number }>('/api/admin/rules/draft', { method: 'POST' })),
};
