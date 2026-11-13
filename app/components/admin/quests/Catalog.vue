<script setup lang="ts">
// The quest catalogue (docs/quests.md): a table with a family filter, import and export of the
// server's quests.json, and a drawer to create or edit a quest. A row's switch turns it on or off.
import { AdminQuestsEditor } from '#components';

import type { QuestDefinitionInput } from '#shared/schemas/quests';

const { t, locale } = useI18n();
const toast = useToast();
const overlay = useOverlay();
const editor = overlay.create(AdminQuestsEditor);

const { data, error, refresh } = await useQuestsAdminCatalog();
const filter = ref<'all' | 'individual' | 'server' | 'flash'>('all');
const rows = computed(() =>
  (data.value ?? []).filter((row) => filter.value === 'all' || row.family === filter.value),
);

function summary(row: NonNullable<typeof data.value>[number]) {
  const quest = row.definition;
  if (!quest) return { objective: t('admin.quests.catalog.broken'), base: '—' };
  if (quest.family === 'individual') {
    return {
      objective: quest.objective.target ?? t(`admin.quests.objective.${quest.objective.type}`),
      base: quest.tiers.map((tier) => formatLnbits(tier.reward, locale.value)).join(' / '),
    };
  }
  if (quest.family === 'server') {
    return { objective: quest.advancement, base: formatLnbits(quest.reward, locale.value) };
  }
  return {
    objective: t('admin.quests.catalog.range', {
      min: quest.range.min,
      max: quest.range.max,
      type: t(`admin.quests.objective.${quest.objective.type}`),
    }),
    base: t('admin.quests.catalog.perUnit', { n: quest.rewardPerUnit }),
  };
}

async function open(quest?: QuestDefinitionInput) {
  if (await editor.open({ quest }).result) await refresh();
}

async function toggle(id: string, enabled: boolean) {
  try {
    await questAdminActions.update(id, { enabled });
    await refresh();
  } catch {
    toast.add({
      title: t('admin.quests.errors.failed'),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  }
}

async function exportJson() {
  try {
    const result = await questAdminActions.exportCatalog();
    const blob = new Blob([`${JSON.stringify(result, null, 2)}\n`], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'quests.json';
    link.click();
    URL.revokeObjectURL(link.href);
  } catch {
    toast.add({
      title: t('admin.quests.errors.failed'),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  }
}

const fileInput = ref<HTMLInputElement | null>(null);
const overwrite = ref(false);
async function importJson(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  try {
    const parsed: unknown = JSON.parse(await file.text());
    const quests = Array.isArray(parsed)
      ? parsed
      : ((parsed as { quests?: unknown[] }).quests ?? []);
    const result = await questAdminActions.importCatalog(quests, overwrite.value);
    toast.add({
      title: t('admin.quests.catalog.imported', {
        added: result.added.length,
        replaced: result.replaced.length,
      }),
      color: 'success',
      icon: 'i-lucide-circle-check',
    });
    await refresh();
  } catch (error) {
    toast.add({
      title: t('admin.quests.errors.invalid'),
      description: error instanceof QuestError ? error.detail : undefined,
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  } finally {
    if (fileInput.value) fileInput.value.value = '';
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex flex-wrap gap-2" role="group" :aria-label="t('admin.quests.catalog.filter')">
        <UButton
          v-for="option in ['all', 'individual', 'server', 'flash'] as const"
          :key="option"
          size="md"
          :color="filter === option ? 'secondary' : 'neutral'"
          :variant="filter === option ? 'subtle' : 'outline'"
          :label="
            option === 'all' ? t('admin.quests.catalog.all') : t(`admin.quests.family.${option}`)
          "
          @click="filter = option"
        />
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <UCheckbox v-model="overwrite" :label="t('admin.quests.catalog.overwrite')" />
        <input
          ref="fileInput"
          type="file"
          accept="application/json,.json"
          class="hidden"
          @change="importJson"
        />
        <UButton
          color="neutral"
          variant="outline"
          size="md"
          icon="i-lucide-upload"
          :label="t('admin.quests.catalog.import')"
          @click="fileInput?.click()"
        />
        <UButton
          color="neutral"
          variant="outline"
          size="md"
          icon="i-lucide-download"
          :label="t('admin.quests.catalog.export')"
          @click="exportJson"
        />
        <UButton
          size="md"
          icon="i-lucide-plus"
          :label="t('admin.quests.catalog.new')"
          @click="open()"
        />
      </div>
    </div>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :description="t('admin.quests.loadFailed')"
    />
    <div
      v-else-if="data && !data.length"
      class="flex flex-col items-center gap-3 rounded-lg bg-elevated px-5 py-10 text-center"
    >
      <IconTile icon="i-lucide-trophy" />
      <h3 class="text-xl font-medium text-highlighted">
        {{ t('admin.quests.catalog.empty.title') }}
      </h3>
      <p class="max-w-md text-muted">{{ t('admin.quests.catalog.empty.body') }}</p>
    </div>
    <div v-else class="overflow-x-auto rounded-lg bg-elevated px-2 py-1">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-default text-left text-highlighted">
            <th class="px-3 py-2.5 font-semibold">{{ t('admin.quests.catalog.quest') }}</th>
            <th class="px-3 py-2.5 font-semibold">{{ t('admin.quests.catalog.family') }}</th>
            <th class="px-3 py-2.5 font-semibold">{{ t('admin.quests.catalog.objective') }}</th>
            <th class="px-3 py-2.5 text-right font-semibold">
              {{ t('admin.quests.catalog.base') }}
            </th>
            <th class="px-3 py-2.5 text-right font-semibold">
              {{ t('admin.quests.catalog.completions') }}
            </th>
            <th class="px-3 py-2.5 font-semibold">{{ t('admin.quests.catalog.enabled') }}</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-default">
          <tr v-for="row in rows" :key="row.id">
            <td class="px-3 py-2.5">
              <button
                type="button"
                class="text-left font-semibold text-highlighted hover:underline"
                :disabled="!row.definition"
                @click="row.definition && open(row.definition)"
              >
                {{ row.definition ? questName(row.definition.name, locale) : row.id }}
              </button>
              <div class="text-xs text-muted">{{ row.id }}</div>
            </td>
            <td class="px-3 py-2.5">
              <UBadge
                color="neutral"
                variant="outline"
                :label="t(`admin.quests.family.${row.family}`)"
              />
            </td>
            <td class="px-3 py-2.5 text-muted">{{ summary(row).objective }}</td>
            <td class="px-3 py-2.5 text-right tabular-nums">{{ summary(row).base }}</td>
            <td class="px-3 py-2.5 text-right tabular-nums">{{ row.completions }}</td>
            <td class="px-3 py-2.5">
              <USwitch
                :model-value="row.enabled"
                :aria-label="t('admin.quests.catalog.toggle', { id: row.id })"
                @update:model-value="(value: boolean) => toggle(row.id, value)"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="border-l-2 border-secondary pl-3 text-sm text-muted">
      {{ t('admin.quests.catalog.note') }}
    </p>
  </div>
</template>
