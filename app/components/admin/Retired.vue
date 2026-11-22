<script setup lang="ts">
import { AdminRetiredAdd, AdminRetiredDetail } from '#components';

import type { ModpackRetiredView } from '#shared/schemas/modpack';

// Retired files: what the updater deletes from players' mods folders although it never wrote it,
// with how many players still have each. A row opens a side drawer. See docs/modpack.md.
const { t } = useI18n();
const { isEnabled } = useFlags();
defineExpose({ add: () => onAdd() });

const { data, error, refresh } = await useAdminModpackRetired();

const overlay = useOverlay();
const detail = overlay.create(AdminRetiredDetail);
const adding = overlay.create(AdminRetiredAdd);

const search = ref('');
const items = computed(() => {
  const q = search.value.trim().toLowerCase();
  return (data.value?.items ?? []).filter((item) => !q || item.fileName.toLowerCase().includes(q));
});
const totals = computed(() => {
  const all = data.value?.items ?? [];
  return {
    files: all.length,
    players: data.value?.counted ? all.reduce((sum, item) => sum + (item.players ?? 0), 0) : null,
    safe: data.value?.counted ? all.filter((item) => item.safeToDrop).length : null,
  };
});

function status(item: ModpackRetiredView) {
  if (item.players === null) return { color: 'neutral', key: 'unknown' } as const;
  if (item.safeToDrop) return { color: 'success', key: 'safe' } as const;
  if (item.players === 0) return { color: 'neutral', key: 'zero' } as const;
  return { color: 'warning', key: 'still' } as const;
}

async function onAdd() {
  const done: unknown = await adding.open().result;
  if (done === true) await refresh();
}
async function onOpen(item: ModpackRetiredView) {
  const result: unknown = await detail.open({ item, counted: data.value?.counted ?? false }).result;
  if (result === 'changed') await refresh();
}
</script>

<template>
  <UAlert
    v-if="error || !data"
    color="error"
    variant="subtle"
    icon="i-lucide-circle-alert"
    :description="t('admin.retired.errors.failed')"
  />
  <div v-else class="flex max-w-6xl flex-col gap-4">
    <p class="max-w-prose text-muted">{{ t('admin.retired.note') }}</p>
    <UAlert
      v-if="!isEnabled('modpack.retired')"
      color="warning"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      :title="t('admin.retired.flagOff.title')"
      :description="t('admin.retired.flagOff.body')"
    />
    <UAlert
      v-if="!data.counted"
      color="neutral"
      variant="subtle"
      icon="i-lucide-info"
      :description="t('admin.retired.notCounted')"
    />
    <dl class="grid grid-cols-1 gap-2 sm:grid-cols-3">
      <div class="rounded-lg bg-elevated p-4">
        <dd class="font-display text-xl text-highlighted tabular-nums">
          {{ totals.files }} <span class="text-sm text-muted">/ {{ data.max }}</span>
        </dd>
        <dt class="text-sm text-muted">{{ t('admin.retired.stats.files') }}</dt>
      </div>
      <div class="rounded-lg bg-elevated p-4">
        <dd class="font-display text-xl text-highlighted tabular-nums">
          {{ totals.players ?? '–' }}
        </dd>
        <dt class="text-sm text-muted">{{ t('admin.retired.stats.players') }}</dt>
      </div>
      <div class="rounded-lg bg-elevated p-4">
        <dd class="font-display text-xl text-highlighted tabular-nums">{{ totals.safe ?? '–' }}</dd>
        <dt class="text-sm text-muted">{{ t('admin.retired.stats.safe') }}</dt>
      </div>
    </dl>
    <section class="flex flex-col gap-4 rounded-lg bg-elevated p-5">
      <UInput
        v-model="search"
        icon="i-lucide-search"
        size="md"
        class="w-full max-w-xs"
        :placeholder="t('admin.retired.search')"
        :aria-label="t('admin.retired.search')"
      />
      <p v-if="!data.items.length" class="text-muted">{{ t('admin.retired.empty.none') }}</p>
      <p v-else-if="!items.length" class="text-muted">{{ t('admin.retired.empty.search') }}</p>
      <ul v-else class="flex flex-col divide-y divide-default">
        <li v-for="item in items" :key="item.id">
          <button
            type="button"
            class="flex w-full min-w-0 flex-wrap items-center gap-3 rounded-md px-2 py-3 text-left hover:bg-accented/50"
            @click="onOpen(item)"
          >
            <IconTile icon="i-lucide-file-x" />
            <span class="min-w-0 flex-1 basis-48">
              <span class="block font-semibold break-words text-highlighted">{{
                item.fileName
              }}</span>
              <span class="block text-sm text-muted">
                {{ item.note || t(item.sha512 ? 'admin.retired.exact' : 'admin.retired.byName') }}
              </span>
            </span>
            <UBadge
              :color="status(item).color"
              variant="soft"
              size="md"
              :label="t(`admin.retired.status.${status(item).key}`, { count: item.zeroDays ?? 0 })"
            />
            <span class="w-32 text-right tabular-nums">
              <span class="block font-semibold text-highlighted">
                {{
                  item.players === null
                    ? t('admin.retired.players.unknown')
                    : t('admin.retired.players.count', { count: item.players })
                }}
              </span>
            </span>
          </button>
        </li>
      </ul>
    </section>
  </div>
</template>
