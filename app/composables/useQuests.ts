import type { QuestClaimResult, QuestProblem } from '#shared/schemas/quests';
import { QUEST_PROBLEMS } from '#shared/schemas/quests';

// The quests page (/minecraft/quests) and the Quests admin (/admin/economy/quests). Writes throw
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

/** The public page, for one season (the current one without it). */
export function useQuests(season: Ref<number | undefined>) {
  return useFetch('/api/quests', {
    key: computed(() => `quests-${String(season.value ?? 'current')}`),
    query: computed(() => (season.value ? { season: season.value } : {})),
  });
}

export type QuestOverview = NonNullable<Awaited<ReturnType<typeof useQuests>>['data']['value']>;
export type QuestCatalogEntry = QuestOverview['quests'][number];
export type QuestCommunity = NonNullable<QuestOverview['community']>;

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
export function useQuestsAdminSeasons() {
  return useFetch('/api/quests/admin/seasons', { key: 'quests-admin-seasons' });
}

export const questAdminActions = {
  create: (definition: unknown) =>
    call(() => $fetch('/api/quests/admin/quests', { method: 'POST', body: definition as object })),
  update: (id: string, body: { definition?: unknown; enabled?: boolean; sortOrder?: number }) =>
    call(() => $fetch(`/api/quests/admin/quests/${id}`, { method: 'PATCH', body })),
  remove: (id: string) =>
    call(() => $fetch(`/api/quests/admin/quests/${id}`, { method: 'DELETE' })),
  exportCatalog: () => call(() => $fetch('/api/quests/admin/export')),
  importCatalog: (quests: unknown[], overwrite: boolean) =>
    call(() => $fetch('/api/quests/admin/import', { method: 'POST', body: { quests, overwrite } })),
  updateSettings: (patch: object) =>
    call(() => $fetch('/api/quests/admin/settings', { method: 'PATCH', body: patch })),
  createCommunity: (body: object) =>
    call(() => $fetch('/api/quests/admin/community', { method: 'POST', body })),
  cancelCommunity: (id: string) =>
    call(() => $fetch(`/api/quests/admin/community/${id}/cancel`, { method: 'POST' })),
  contributors: (id: string) => call(() => $fetch(`/api/quests/admin/community/${id}`)),
  saveTemplate: (body: { id?: string; definition: unknown; enabled?: boolean }) =>
    call(() => $fetch('/api/quests/admin/community/templates', { method: 'POST', body })),
  newSeason: () =>
    call(() =>
      $fetch('/api/quests/admin/seasons', { method: 'POST', body: { confirmation: 'new season' } }),
    ),
};
