<script setup lang="ts">
import type { AdminInboxItem } from '#shared/schemas/admin';

// Home: an inbox, not a dashboard (docs/design.md). One raised section with a row per queue the
// role can act on, most important first, from /api/admin/inbox. Counts of things to handle only.
const { t, locale } = useI18n();
const { user } = useAuth();
const { data, error, pending } = useAdminInbox();

const ICONS: Record<AdminInboxItem['id'], string> = {
  appeals: 'i-lucide-message-square',
  transfers: 'i-lucide-arrow-left-right',
  anticheat: 'i-lucide-shield-check',
  apiKeys: 'i-lucide-key-round',
  rateLimit: 'i-lucide-gauge',
  eventWaitlists: 'i-lucide-calendar-clock',
  suggestions: 'i-lucide-lightbulb',
  modpackUpdates: 'i-lucide-blocks',
  inactive: 'i-lucide-clock',
  siteBans: 'i-lucide-ban',
};

const date = (iso: string | null) => (iso ? formatWardenDate(iso, locale.value) : '');

interface Row {
  id: AdminInboxItem['id'];
  icon: string;
  title: string;
  detail: string;
  to: string;
  action: string;
}

function toRow(item: AdminInboxItem): Row {
  const key = `admin.home.items.${item.id}`;
  const base = { id: item.id, icon: ICONS[item.id], to: item.to, action: t(`${key}.action`) };
  switch (item.id) {
    case 'anticheat':
      return {
        ...base,
        title: item.review
          ? t(`${key}.review`, { n: item.review }, item.review)
          : t(`${key}.alerts`, { n: item.alerts ?? 0 }, item.alerts ?? 0),
        detail:
          item.review && item.alerts
            ? t(`${key}.alerts`, { n: item.alerts }, item.alerts)
            : t(`${key}.detail`),
      };
    case 'rateLimit':
      return {
        ...base,
        icon: item.mode === 'off' ? 'i-lucide-shield-off' : 'i-lucide-party-popper',
        title: t(`${key}.${item.mode ?? 'event'}`),
        detail: t(`${key}.${item.mode ?? 'event'}Detail`),
      };
    case 'eventWaitlists':
      return {
        ...base,
        title: t(`${key}.title`, { n: item.count }, item.count),
        detail: t(`${key}.detail`, {
          name: item.name ?? '',
          date: date(item.at),
          waiting: item.waiting ?? 0,
        }),
      };
    case 'modpackUpdates':
      return {
        ...base,
        title: t(`${key}.title`, { n: item.count }, item.count),
        detail: t(`${key}.detail`, { name: item.name ?? '' }),
      };
    default:
      return {
        ...base,
        title: t(`${key}.title`, { n: item.count }, item.count),
        detail: item.at ? t(`${key}.detail`, { date: date(item.at) }) : t(`${key}.detail`),
      };
  }
}

const rows = computed(() => (data.value?.items ?? []).map(toRow));
// The activity log moves to Settings (docs/plans/admin-redesign.md): link it for those who can open it.
const canSeeActivity = computed(() =>
  settingsSections(user.value?.role).some((section) => section.id === 'activity'),
);
</script>

<template>
  <UAlert
    v-if="error"
    color="error"
    variant="subtle"
    icon="i-lucide-circle-alert"
    :description="t('admin.home.loadFailed')"
  />

  <div v-else-if="pending && !data" class="flex max-w-4xl flex-col gap-2" aria-hidden="true">
    <USkeleton v-for="n in 3" :key="n" class="h-16 w-full" />
  </div>

  <div v-else class="flex max-w-4xl flex-col gap-4">
    <ul v-if="rows.length" class="flex flex-col divide-y divide-default rounded-lg bg-elevated">
      <li v-for="row in rows" :key="row.id" class="flex flex-wrap items-center gap-4 px-4 py-3">
        <IconTile :icon="row.icon" />
        <div class="flex min-w-0 flex-1 basis-64 flex-col">
          <span class="font-semibold text-highlighted">{{ row.title }}</span>
          <span class="text-sm text-muted">{{ row.detail }}</span>
        </div>
        <UButton :to="row.to" color="neutral" variant="soft" size="md" :label="row.action" />
      </li>
    </ul>

    <div v-else class="flex flex-col items-center gap-3 py-16 text-center">
      <IconTile icon="i-lucide-inbox" />
      <h2 class="text-lg font-medium text-highlighted">{{ t('admin.home.emptyTitle') }}</h2>
      <p class="max-w-md text-muted">{{ t('admin.home.emptyLede') }}</p>
      <UButton
        to="/admin/people"
        color="neutral"
        variant="soft"
        size="md"
        :label="t('admin.home.emptyAction')"
      />
    </div>

    <div v-if="canSeeActivity" class="flex">
      <UButton
        to="/admin/settings/activity"
        color="neutral"
        variant="link"
        size="md"
        :label="t('admin.home.activity')"
      />
    </div>
  </div>
</template>
