<script setup lang="ts">
import { AdminModlistAdd, AdminModlistDetail, AdminModlistExport } from '#components';

import type { ModpackModView } from '#shared/schemas/modpack';

// The Modlist: the numbers of the pack, the filters, then the mods. A mod opens in a side drawer.
// See docs/modpack.md.
const { t, d, locale } = useI18n();
const toast = useToast();
const checking = ref(false);

// The page's buttons open the Add modal and run the check.
defineExpose({
  add: () => onAdd(),
  check: () => onCheck(),
  exportVote: () => onExport(),
  checking,
});
const { data, error, refresh } = await useAdminModpack();

const overlay = useOverlay();
const detail = overlay.create(AdminModlistDetail);
const adding = overlay.create(AdminModlistAdd);
const exporting = overlay.create(AdminModlistExport);

type Filter = 'all' | 'update' | 'attention';
const filter = ref<Filter>('all');
const search = ref('');

const counts = computed(() => {
  const items = data.value?.items ?? [];
  return {
    all: items.length,
    update: items.filter((mod) => mod.status === 'update').length,
    attention: items.filter((mod) => mod.status === 'attention').length,
  };
});
const filters = computed(() =>
  (['all', 'update', 'attention'] as const).map((value) => ({
    value,
    label: t(`admin.modlist.filters.${value}`, { count: counts.value[value] }),
  })),
);
const mods = computed(() => {
  const q = search.value.trim().toLowerCase();
  return (data.value?.items ?? []).filter(
    (mod) =>
      (filter.value === 'all' || mod.status === filter.value) &&
      (!q || mod.name.toLowerCase().includes(q)),
  );
});

const statusColor = { ok: 'success', update: 'warning', attention: 'error' } as const;
const initials = (name: string) =>
  name
    .replace(/[^\p{L}\p{N} ]/gu, '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();

async function onAdd() {
  const added: unknown = await adding.open().result;
  if (added === true) await refresh();
}

async function onExport() {
  const done: unknown = await exporting.open().result;
  if (done === true) await refresh();
}

const { isEnabled } = useFlags();
const manifestUrl = `${useRequestURL().origin}/modpack/manifest.json`;
const copied = ref(false);
async function copyManifest() {
  try {
    await navigator.clipboard.writeText(manifestUrl);
    copied.value = true;
    setTimeout(() => (copied.value = false), 2000);
  } catch {
    // Clipboard blocked: the address is on screen to copy by hand.
  }
}

const adoptingAll = ref(false);

async function onCheck() {
  checking.value = true;
  try {
    const result = await modpackActions.check();
    await refresh();
    toast.add({
      title: t('admin.modlist.checkDone', { count: result.updates }),
      description: result.failed
        ? t('admin.modlist.checkFailed', { count: result.failed })
        : undefined,
      color: result.failed ? 'warning' : 'success',
      icon: 'i-lucide-circle-check',
    });
  } catch (error) {
    const problem = error instanceof ModpackError ? error.problem : 'failed';
    toast.add({
      title: t(`admin.modlist.errors.${problem}`),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  } finally {
    checking.value = false;
  }
}

async function onAdoptAll() {
  adoptingAll.value = true;
  try {
    const { adopted } = await modpackActions.adoptAll();
    await refresh();
    toast.add({
      title: t('admin.modlist.adoptedAll', { count: adopted }),
      color: 'success',
      icon: 'i-lucide-circle-check',
    });
  } catch (error) {
    const problem = error instanceof ModpackError ? error.problem : 'failed';
    toast.add({
      title: t(`admin.modlist.errors.${problem}`),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  } finally {
    adoptingAll.value = false;
  }
}

async function onOpen(mod: ModpackModView) {
  const result: unknown = await detail.open({ mod }).result;
  if (result === 'changed') await refresh();
}
</script>

<template>
  <UAlert
    v-if="error || !data"
    color="error"
    variant="subtle"
    icon="i-lucide-circle-alert"
    :description="t('admin.modlist.errors.failed')"
  />
  <div v-else class="flex max-w-6xl flex-col gap-4">
    <p class="max-w-prose text-muted">{{ t('admin.modlist.note') }}</p>

    <dl class="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <div class="rounded-lg bg-elevated p-4">
        <dd class="font-display text-xl text-highlighted tabular-nums">{{ data.revision }}</dd>
        <dt class="text-sm text-muted">{{ t('admin.modlist.stats.revision') }}</dt>
      </div>
      <div class="rounded-lg bg-elevated p-4">
        <dd class="font-display text-xl text-highlighted tabular-nums">{{ data.items.length }}</dd>
        <dt class="text-sm text-muted">{{ t('admin.modlist.stats.mods') }}</dt>
      </div>
      <div class="rounded-lg bg-elevated p-4">
        <dd class="font-display text-xl text-highlighted tabular-nums">
          {{ formatBytes(data.totalBytes, locale) }}
        </dd>
        <dt class="text-sm text-muted">{{ t('admin.modlist.stats.size') }}</dt>
      </div>
      <div class="rounded-lg bg-elevated p-4">
        <dd class="font-display text-xl text-highlighted">
          {{ d(data.changedAt, { dateStyle: 'medium', timeZone: 'Europe/Paris' }) }}
        </dd>
        <dt class="text-sm text-muted">{{ t('admin.modlist.stats.changed') }}</dt>
      </div>
    </dl>

    <div
      v-if="isEnabled('modpack')"
      class="flex flex-wrap items-center gap-3 rounded-lg bg-elevated p-4"
    >
      <div class="flex min-w-0 flex-col">
        <span class="text-sm text-muted">{{ t('admin.modlist.manifest.label') }}</span>
        <code class="truncate text-sm text-highlighted">{{ manifestUrl }}</code>
      </div>
      <div class="ml-auto flex gap-2">
        <UButton
          color="neutral"
          variant="soft"
          :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
          :label="copied ? t('admin.modlist.manifest.copied') : t('admin.modlist.manifest.copy')"
          @click="copyManifest"
        />
        <UButton
          color="neutral"
          variant="soft"
          icon="i-lucide-external-link"
          :label="t('admin.modlist.manifest.open')"
          :to="manifestUrl"
          target="_blank"
        />
      </div>
    </div>

    <section class="flex flex-col gap-4 rounded-lg bg-elevated p-5">
      <div class="flex flex-wrap items-center gap-3">
        <UInput
          v-model="search"
          icon="i-lucide-search"
          size="md"
          class="w-full max-w-xs"
          :placeholder="t('admin.modlist.search')"
          :aria-label="t('admin.modlist.search')"
        />
        <div class="flex flex-wrap gap-2" role="group" :aria-label="t('admin.modlist.filter')">
          <UButton
            v-for="item in filters"
            :key="item.value"
            size="md"
            color="neutral"
            :variant="filter === item.value ? 'soft' : 'ghost'"
            :aria-pressed="filter === item.value"
            :label="item.label"
            @click="filter = item.value"
          />
        </div>
        <UButton
          v-if="counts.update > 0 && filter === 'update'"
          class="ml-auto"
          color="neutral"
          variant="soft"
          icon="i-lucide-check-check"
          :label="t('admin.modlist.adoptAll', { count: counts.update })"
          :loading="adoptingAll"
          @click="onAdoptAll"
        />
      </div>

      <p v-if="!data.items.length" class="text-muted">{{ t('admin.modlist.empty.none') }}</p>
      <p v-else-if="!mods.length" class="text-muted">
        {{ search.trim() ? t('admin.modlist.empty.search') : t(`admin.modlist.empty.${filter}`) }}
      </p>
      <ul v-else class="flex flex-col divide-y divide-default">
        <li v-for="mod in mods" :key="mod.id">
          <button
            type="button"
            class="flex w-full min-w-0 items-center gap-3 rounded-md px-2 py-3 text-left hover:bg-accented/50"
            @click="onOpen(mod)"
          >
            <span
              class="grid size-9 shrink-0 place-items-center rounded-md bg-secondary/15 text-sm font-semibold text-secondary"
              aria-hidden="true"
            >
              {{ initials(mod.name) }}
            </span>
            <span class="min-w-0 flex-1">
              <span class="block font-semibold break-words text-highlighted">{{ mod.name }}</span>
              <span class="block text-sm text-muted">
                {{
                  mod.attention
                    ? t(`admin.modlist.attention.${mod.attention}`)
                    : mod.latest && mod.status === 'update'
                      ? t('admin.modlist.updateTo', { version: mod.latest.version })
                      : mod.latestCheckedAt
                        ? t('admin.modlist.checkedOn', {
                            date: d(mod.latestCheckedAt, {
                              dateStyle: 'medium',
                              timeZone: 'Europe/Paris',
                            }),
                          })
                        : t('admin.modlist.notChecked')
                }}
              </span>
            </span>
            <span class="hidden w-28 md:block">
              <UBadge
                color="neutral"
                variant="outline"
                :label="t(`admin.modlist.sources.${mod.source}`)"
              />
            </span>
            <span class="hidden w-20 text-sm text-muted md:block">
              {{ t(`admin.modlist.sides.${mod.side}`) }}
            </span>
            <span class="hidden w-24 truncate text-sm tabular-nums sm:block">
              {{ mod.pinned?.version ?? '–' }}
            </span>
            <span class="flex w-40 justify-end">
              <UBadge
                :color="statusColor[mod.status]"
                variant="soft"
                :label="t(`admin.modlist.status.${mod.status}`)"
              />
            </span>
          </button>
        </li>
      </ul>
    </section>
  </div>
</template>
