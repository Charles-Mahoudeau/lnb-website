import type { QuestClaimResult, QuestProblem } from '#shared/schemas/quests';
import { QUEST_PROBLEMS, QUEST_RESET_CONFIRM } from '#shared/schemas/quests';

// The quests page (/minecraft/quests) and the Quests admin (/admin/quests/catalog). Writes throw
// a QuestError with the API's problem. See docs/quests.md.

export class QuestError extends Error {
  constructor(
    readonly problem: QuestProblem | 'failed',
    readonly detail?: string,
  ) {
    super(`Quest request refused: ${problem}`);
  }
}

async function call<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    const data = (error as { data?: { data?: { problem?: unknown }; statusMessage?: string } })
      .data;
    const problem = data?.data?.problem;
    throw new QuestError(
      QUEST_PROBLEMS.includes(problem as QuestProblem) ? (problem as QuestProblem) : 'failed',
      data?.statusMessage,
    );
  }
}

/** The public page. */
export function useQuests() {
  return useFetch('/api/quests', { key: 'quests' });
}

export type QuestOverview = NonNullable<Awaited<ReturnType<typeof useQuests>>['data']['value']>;
export type QuestCatalogEntry = QuestOverview['quests'][number];
export type QuestCommunity = NonNullable<QuestOverview['community']>;
export type QuestCategoryEntry = QuestOverview['categories'][number];

export const questActions = {
  claim: (completionId: string) =>
    call(() =>
      $fetch<QuestClaimResult>(`/api/quests/completions/${completionId}/claim`, {
        method: 'POST',
        body: { idempotencyKey: crypto.randomUUID() },
      }),
    ),
};

/** The icon of a quest category or objective. */
export const QUEST_ICONS: Record<string, string> = {
  mining: 'i-lucide-pickaxe',
  combat: 'i-lucide-sword',
  fishing: 'i-lucide-fish',
  exploration: 'i-lucide-compass',
  crafting: 'i-lucide-hammer',
  delivery: 'i-lucide-package',
  mine: 'i-lucide-pickaxe',
  kill: 'i-lucide-sword',
  fish: 'i-lucide-fish',
  travel: 'i-lucide-compass',
  craft: 'i-lucide-hammer',
  deliver: 'i-lucide-package',
  advancement: 'i-lucide-trophy',
};

/** A category's icon on the site: its own Lucide icon, else a folder. */
export function categoryIcon(category: { siteIcon?: string } | undefined) {
  return category?.siteIcon ?? 'i-lucide-folder';
}

/**
 * Quests grouped by subcategory, in the category's order: quests without one first (no heading),
 * then each subcategory that has quests.
 */
export function bySubcategory<T extends { subcategory?: string }>(
  quests: readonly T[],
  category: { subcategories: { id: string; name: { fr: string; en: string } }[] } | undefined,
) {
  const groups: { id: string | null; name: { fr: string; en: string } | null; quests: T[] }[] = [];
  const loose = quests.filter(
    (quest) =>
      !quest.subcategory || !category?.subcategories.some((sub) => sub.id === quest.subcategory),
  );
  if (loose.length) groups.push({ id: null, name: null, quests: loose });
  for (const sub of category?.subcategories ?? []) {
    const list = quests.filter((quest) => quest.subcategory === sub.id);
    if (list.length) groups.push({ id: sub.id, name: sub.name, quests: list });
  }
  return groups;
}

/** A quest's name in the page's language. */
export function questName(name: { fr: string; en: string }, locale: string) {
  return locale.startsWith('fr') ? name.fr : name.en;
}

/** Days and hours left before a date, for "ends in". */
export function timeLeft(iso: string, now = Date.now()) {
  const ms = Math.max(0, new Date(iso).getTime() - now);
  const hours = Math.floor(ms / 3_600_000);
  return { days: Math.floor(hours / 24), hours: hours % 24, minutes: Math.floor(ms / 60_000) % 60 };
}

// Admin.

export function useQuestsAdminCatalog() {
  return useFetch('/api/quests/admin/quests', { key: 'quests-admin-catalog' });
}
export function useQuestsAdminSettings() {
  return useFetch('/api/quests/admin/settings', { key: 'quests-admin-settings' });
}
export function useQuestsAdminIndex() {
  return useFetch('/api/quests/admin/reward-index', {
    key: 'quests-admin-index',
    query: { days: 60 },
  });
}
export function useQuestsAdminCommunity() {
  return useFetch('/api/quests/admin/community', { key: 'quests-admin-community' });
}
export function useQuestsAdminCategories() {
  return useFetch('/api/quests/admin/categories', { key: 'quests-admin-categories' });
}

export const questAdminActions = {
  create: (definition: unknown) =>
    call(() => $fetch('/api/quests/admin/quests', { method: 'POST', body: definition as object })),
  update: (id: string, body: { definition?: unknown; enabled?: boolean; sortOrder?: number }) =>
    call(() => $fetch(`/api/quests/admin/quests/${id}`, { method: 'PATCH', body })),
  remove: (id: string) =>
    call(() => $fetch(`/api/quests/admin/quests/${id}`, { method: 'DELETE' })),
  exportCatalog: () => call(() => $fetch('/api/quests/admin/export')),
  importCatalog: (quests: unknown[], categories: unknown[], overwrite: boolean) =>
    call(() =>
      $fetch('/api/quests/admin/import', {
        method: 'POST',
        body: { quests, categories, overwrite },
      }),
    ),
  createCategory: (category: object) =>
    call(() => $fetch('/api/quests/admin/categories', { method: 'POST', body: category })),
  updateCategory: (family: string, id: string, category: object) =>
    call(() =>
      $fetch(`/api/quests/admin/categories/${family}/${id}`, { method: 'PATCH', body: category }),
    ),
  removeCategory: (family: string, id: string) =>
    call(() => $fetch(`/api/quests/admin/categories/${family}/${id}`, { method: 'DELETE' })),
  updateSettings: (patch: object) =>
    call(() => $fetch('/api/quests/admin/settings', { method: 'PATCH', body: patch })),
  createCommunity: (body: object) =>
    call(() => $fetch('/api/quests/admin/community', { method: 'POST', body })),
  cancelCommunity: (id: string) =>
    call(() => $fetch(`/api/quests/admin/community/${id}/cancel`, { method: 'POST' })),
  contributors: (id: string) => call(() => $fetch(`/api/quests/admin/community/${id}`)),
  saveTemplate: (body: { id?: string; definition: unknown; enabled?: boolean }) =>
    call(() => $fetch('/api/quests/admin/community/templates', { method: 'POST', body })),
  reset: () =>
    call(() =>
      $fetch('/api/quests/admin/reset', {
        method: 'POST',
        body: { confirmation: QUEST_RESET_CONFIRM },
      }),
    ),
};
