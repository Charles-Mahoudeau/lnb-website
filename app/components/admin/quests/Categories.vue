<script setup lang="ts">
// Quest categories (docs/quests.md): individual chapters and Records groups side by side, each
// with its subcategories and how many quests use it. A drawer creates or edits one.
import { AdminQuestsCategoryEditor } from '#components';

import type { QuestCategory, QuestCategoryFamily } from '#shared/schemas/quests';

const { t, locale } = useI18n();
const overlay = useOverlay();
const editor = overlay.create(AdminQuestsCategoryEditor);

const { data, error, refresh } = await useQuestsAdminCategories();
const { data: catalog } = await useQuestsAdminCatalog();

const families = ['individual', 'server'] as const;
const listOf = (family: QuestCategoryFamily) =>
  (data.value ?? []).filter((category) => category.family === family);

/** How many quests of the catalogue each category holds, by `family:id`. */
const counts = computed(() => {
  const result: Record<string, number> = {};
  for (const row of catalog.value ?? []) {
    const quest = row.definition;
    if (!quest || (quest.family !== 'individual' && quest.family !== 'server')) continue;
    if (!quest.category) continue;
    const key = `${quest.family}:${quest.category}`;
    result[key] = (result[key] ?? 0) + 1;
  }
  return result;
});

async function open(category?: QuestCategory, family?: QuestCategoryFamily) {
  if (await editor.open({ category, family }).result) await refresh();
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :description="t('admin.quests.loadFailed')"
    />
    <div v-else class="grid items-start gap-6 lg:grid-cols-2">
      <section
        v-for="family in families"
        :key="family"
        class="flex flex-col gap-3 rounded-lg bg-elevated px-6 py-5"
      >
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="text-lg font-medium text-highlighted">
              {{ t(`admin.quests.categories.family.${family}`) }}
            </h2>
            <p class="text-sm text-muted">{{ t(`admin.quests.categories.help.${family}`) }}</p>
          </div>
          <UButton
            size="md"
            color="neutral"
            variant="outline"
            icon="i-lucide-plus"
            :label="t('admin.quests.categories.new')"
            @click="open(undefined, family)"
          />
        </div>
        <p v-if="!listOf(family).length" class="text-sm text-muted">
          {{ t('admin.quests.categories.empty') }}
        </p>
        <ul v-else class="flex flex-col divide-y divide-default">
          <li v-for="category in listOf(family)" :key="category.id">
            <button
              type="button"
              class="flex w-full items-center gap-3 py-2.5 text-left hover:bg-accented/40"
              @click="open(category)"
            >
              <IconTile :icon="categoryIcon(category)" />
              <span class="flex min-w-0 flex-1 flex-col">
                <span class="font-semibold text-highlighted">{{
                  questName(category.name, locale)
                }}</span>
                <span class="truncate text-xs text-muted">
                  {{ category.id }}
                  <template v-if="category.subcategories.length">
                    ·
                    {{
                      category.subcategories.map((sub) => questName(sub.name, locale)).join(', ')
                    }}
                  </template>
                </span>
              </span>
              <span class="text-sm text-muted tabular-nums">{{
                t('admin.quests.categories.quests', counts[`${family}:${category.id}`] ?? 0)
              }}</span>
            </button>
          </li>
        </ul>
      </section>
    </div>
    <p class="border-l-2 border-secondary pl-3 text-sm text-muted">
      {{ t('admin.quests.categories.note') }}
    </p>
  </div>
</template>
