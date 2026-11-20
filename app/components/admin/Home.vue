<script setup lang="ts">
import type { AdminInboxItem } from '#shared/schemas/admin';

// Home (docs/design.md): the inbox comes first, one raised section with a row per queue the role
// can act on, from /api/admin/inbox. Under it the latest activity, beside it the quick actions
// (the same as Ctrl K), and above all a strip of plain figures for the week (/api/admin/week).
const { t, locale } = useI18n();
const { user } = useAuth();
const { data, error, pending } = useAdminInbox();
const { data: week } = useAdminWeek();
const { data: recent } = useAdminRecentActivity();

const quickActions = computed(() => adminActions(user.value?.role));
const recentEntries = computed(() => (recent.value?.items ?? []).slice(0, 6));
const number = (n: number) => new Intl.NumberFormat(locale.value).format(n);

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
// The activity log is in Settings, and every role reads its own part of it.
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

  <div v-else class="flex max-w-6xl flex-col gap-6">
    <dl
      v-if="week?.stats.length"
      class="flex flex-wrap gap-x-8 gap-y-3 rounded-lg bg-elevated px-5 py-4"
    >
      <div class="w-full text-xs font-semibold tracking-wide text-muted uppercase">
        {{ t('admin.home.week.title') }}
      </div>
      <div v-for="stat in week.stats" :key="stat.id" class="flex min-w-32 flex-col">
        <dt class="text-sm text-muted">{{ t(`admin.home.week.${stat.id}`) }}</dt>
        <dd class="font-semibold text-highlighted tabular-nums">{{ number(stat.value) }}</dd>
      </div>
    </dl>

    <div class="grid items-start gap-6 lg:grid-cols-3">
      <div class="flex min-w-0 flex-col gap-6 lg:col-span-2">
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

        <div
          v-else
          class="flex flex-col items-center gap-3 rounded-lg bg-elevated py-12 text-center"
        >
          <IconTile icon="i-lucide-inbox" />
          <h2 class="text-lg font-medium text-highlighted">{{ t('admin.home.emptyTitle') }}</h2>
          <p class="max-w-md px-4 text-muted">{{ t('admin.home.emptyLede') }}</p>
          <UButton
            to="/admin/people"
            color="neutral"
            variant="soft"
            size="md"
            :label="t('admin.home.emptyAction')"
          />
        </div>

        <section v-if="canSeeActivity" class="flex flex-col rounded-lg bg-elevated">
          <div class="flex items-center justify-between gap-3 px-4 pt-4 pb-1">
            <h2 class="text-lg font-medium text-highlighted">{{ t('admin.home.recent') }}</h2>
            <UButton
              to="/admin/settings/activity"
              color="neutral"
              variant="link"
              size="md"
              :label="t('admin.home.activity')"
            />
          </div>
          <ul v-if="recentEntries.length" class="flex flex-col divide-y divide-default pb-1">
            <AdminActivityRow v-for="entry in recentEntries" :key="entry.id" :entry="entry" />
          </ul>
          <p v-else class="px-4 pt-2 pb-5 text-sm text-muted">{{ t('admin.home.noActivity') }}</p>
        </section>
      </div>

      <section v-if="quickActions.length" class="flex flex-col gap-3 rounded-lg bg-elevated p-4">
        <h2 class="text-lg font-medium text-highlighted">{{ t('admin.home.actions') }}</h2>
        <div class="flex flex-col gap-2">
          <UButton
            v-for="action in quickActions"
            :key="action.id"
            :to="action.to"
            :icon="action.icon"
            color="neutral"
            variant="soft"
            size="md"
            class="justify-start"
            :label="t(action.labelKey)"
          />
        </div>
        <p class="text-sm text-muted">{{ t('admin.home.searchHint') }}</p>
      </section>
    </div>
  </div>
</template>
