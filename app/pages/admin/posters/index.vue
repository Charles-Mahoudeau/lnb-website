<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui';

import { PostersDuplicateModal, WardenConfirmModal } from '#components';

import type { PosterView } from '#shared/schemas/posters';

// The poster library, shared by events managers: live thumbnails, filtered by their event.
definePageMeta({ eventsManagers: true });

const { t, locale } = useI18n();
const toast = useToast();
const overlay = useOverlay();

const { data, refresh } = await usePosterList();

type Filter = 'upcoming' | 'past' | 'standalone';
const FILTERS: Filter[] = ['upcoming', 'past', 'standalone'];
const filter = ref<Filter>('upcoming');
const search = ref('');

function filterOf(poster: PosterView, now: number): Filter {
  if (!poster.event) return 'standalone';
  return Date.parse(poster.event.endsAt) > now ? 'upcoming' : 'past';
}

const posters = computed(() => {
  const now = Date.now();
  const query = search.value.trim().toLocaleLowerCase();
  return (data.value?.items ?? []).filter((poster) => {
    if (query) {
      const event = poster.event?.source.name ?? '';
      return `${poster.name} ${event}`.toLocaleLowerCase().includes(query);
    }
    return filterOf(poster, now) === filter.value;
  });
});

function subtitle(poster: PosterView): string {
  const template = t(`admin.posters.templates.${poster.template}`);
  const startsAt = poster.overrides.startsAt ?? poster.event?.source.startsAt;
  const when = startsAt
    ? formatEventDate(startsAt, locale.value, { day: 'numeric', month: 'long' })
    : t('admin.posters.card.noEvent');
  return `${when}, ${template}`;
}

const confirm = overlay.create(WardenConfirmModal);
const duplicateModal = overlay.create(PostersDuplicateModal);

async function onDuplicate(poster: PosterView) {
  const copy: unknown = await duplicateModal.open({ poster }).result;
  if (typeof copy === 'string') await navigateTo(`/admin/posters/${copy}`);
}

async function onDelete(poster: PosterView) {
  const confirmed: unknown = await confirm.open({
    title: t('admin.posters.deleteTitle', { name: poster.name }),
    description: t('admin.posters.deleteBody'),
    confirmLabel: t('admin.posters.delete'),
    cancelLabel: t('admin.posters.keep'),
    destructive: true,
  }).result;
  if (confirmed !== true) return;
  try {
    await posterActions.remove(poster.id);
    toast.add({
      title: t('admin.posters.deleted'),
      color: 'success',
      icon: 'i-lucide-circle-check',
    });
  } catch (error) {
    const problem = error instanceof PosterError ? error.problem : 'failed';
    toast.add({
      title: t(`admin.posters.errors.${problem}`),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  }
  await refresh();
}

function menu(poster: PosterView): DropdownMenuItem[][] {
  return [
    [
      {
        label: t('admin.posters.duplicate'),
        icon: 'i-lucide-copy',
        onSelect: () => void onDuplicate(poster),
      },
    ],
    [
      {
        label: t('admin.posters.delete'),
        icon: 'i-lucide-trash-2',
        color: 'error' as const,
        onSelect: () => void onDelete(poster),
      },
    ],
  ];
}
</script>

<template>
  <AdminPage :title="t('admin.posters.title')">
    <template #actions>
      <UButton icon="i-lucide-plus" :label="t('admin.posters.new')" to="/admin/posters/new" />
    </template>

    <div class="flex flex-col gap-5">
      <div class="flex flex-col gap-1.5">
        <h1 class="font-display text-2xl font-bold text-highlighted">
          {{ t('admin.posters.title') }}
        </h1>
        <p class="text-muted">{{ t('admin.posters.lede') }}</p>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <UInput
          v-model="search"
          icon="i-lucide-search"
          :placeholder="t('admin.posters.search')"
          :aria-label="t('admin.posters.search')"
          class="w-full sm:w-80"
        />
        <UButton
          v-for="key in FILTERS"
          :key="key"
          size="sm"
          :color="!search && filter === key ? 'primary' : 'neutral'"
          :variant="!search && filter === key ? 'subtle' : 'outline'"
          :aria-pressed="!search && filter === key"
          :label="t(`admin.posters.filters.${key}`)"
          class="rounded-full"
          @click="
            filter = key;
            search = '';
          "
        />
      </div>

      <p v-if="posters.length === 0" class="py-12 text-center text-muted">
        {{ t(search ? 'admin.posters.noMatch' : 'admin.posters.empty') }}
      </p>
      <ul v-else class="flex flex-wrap gap-4">
        <li
          v-for="poster in posters"
          :key="poster.id"
          class="relative flex w-52 flex-col gap-2.5 rounded-lg bg-elevated p-3"
        >
          <NuxtLink :to="`/admin/posters/${poster.id}`" class="rounded-sm">
            <PostersPreview :poster="posterRenderOf(poster)" :width="184" />
          </NuxtLink>
          <div class="flex items-start gap-1">
            <div class="flex min-w-0 grow flex-col gap-0.5">
              <NuxtLink
                :to="`/admin/posters/${poster.id}`"
                class="truncate font-semibold text-highlighted after:absolute after:inset-0"
              >
                {{ poster.name }}
              </NuxtLink>
              <span class="truncate text-sm text-muted">{{ subtitle(poster) }}</span>
            </div>
            <UDropdownMenu :items="menu(poster)" :content="{ align: 'end' }">
              <UButton
                color="neutral"
                variant="ghost"
                size="sm"
                icon="i-lucide-ellipsis"
                :aria-label="t('admin.posters.more')"
                class="relative"
              />
            </UDropdownMenu>
          </div>
          <div v-if="!poster.event || poster.event.draft || poster.event.cancelled">
            <UBadge
              v-if="!poster.event"
              color="neutral"
              variant="subtle"
              :label="t('admin.posters.card.standalone')"
            />
            <UBadge
              v-else-if="poster.event.cancelled"
              color="error"
              variant="subtle"
              :label="t('admin.posters.card.cancelled')"
            />
            <UBadge
              v-else
              color="warning"
              variant="subtle"
              :label="t('admin.posters.card.draft')"
            />
          </div>
        </li>
      </ul>
    </div>
  </AdminPage>
</template>
