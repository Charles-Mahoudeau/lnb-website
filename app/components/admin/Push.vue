<script setup lang="ts">
import { PUSH_KINDS } from '#shared/schemas/push';
import type { PushOverview, PushSubscriberRow } from '#shared/schemas/push';

// The Notifications page: this week's counts for admins and events managers, and for admins alone
// who turned notifications on. The settings are in Settings, Notifications. The weekly limit only
// warns, it never blocks.
const { t, locale } = useI18n();
const { user } = useAuth();
const admin = computed(() => isAdmin(user.value?.role));

const { data: overview, error } = await useFetch<PushOverview>('/api/admin/push/overview', {
  key: 'push-overview',
});
const { data: subscribers } = await useFetch<{ items: PushSubscriberRow[] }>(
  '/api/admin/push/subscribers',
  { key: 'push-subscribers', immediate: admin.value },
);
const biggest = computed(() =>
  Math.max(1, ...PUSH_KINDS.map((kind) => overview.value?.byKind[kind] ?? 0)),
);

function categories(row: PushSubscriberRow) {
  const values = Object.values(row.preferences);
  const on = values.filter(Boolean).length;
  if (on === values.length) return t('admin.push.all');
  if (on === 0) return t('admin.push.none');
  return t('admin.push.some', { count: on });
}

function since(iso: string) {
  return new Intl.DateTimeFormat(locale.value, {
    dateStyle: 'medium',
    timeZone: 'Europe/Paris',
  }).format(new Date(iso));
}
</script>

<template>
  <UAlert
    v-if="error || !overview"
    color="error"
    variant="subtle"
    icon="i-lucide-circle-alert"
    :description="t('admin.push.loadFailed')"
  />

  <div v-else class="flex max-w-5xl flex-col gap-6">
    <div class="grid gap-4 sm:grid-cols-3">
      <div class="flex flex-col gap-1 rounded-lg bg-elevated p-5">
        <span class="text-sm text-muted">{{ t('admin.push.week') }}</span>
        <span class="font-display text-3xl text-highlighted tabular-nums">
          {{ overview.sentThisWeek }}
        </span>
      </div>
      <div class="flex flex-col gap-1 rounded-lg bg-elevated p-5">
        <span class="text-sm text-muted">{{ t('admin.push.max') }}</span>
        <span
          class="font-display text-3xl tabular-nums"
          :class="overview.mostReceived > overview.weeklyCap ? 'text-warning' : 'text-highlighted'"
        >
          {{ overview.mostReceived }}
        </span>
        <span class="text-sm text-muted tabular-nums">
          {{ t('admin.push.limit', { cap: overview.weeklyCap }) }}
        </span>
      </div>
      <div class="flex flex-col gap-1 rounded-lg bg-elevated p-5">
        <span class="text-sm text-muted">{{ t('admin.push.subs') }}</span>
        <span class="font-display text-3xl text-highlighted tabular-nums">
          {{ overview.subscribers }}
        </span>
        <span class="text-sm text-muted tabular-nums">
          {{ t('admin.push.ofAccounts', { count: overview.accounts }) }}
        </span>
      </div>
    </div>

    <UAlert
      v-if="overview.overCap > 0"
      color="warning"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      :description="t('admin.push.warn', { count: overview.overCap, cap: overview.weeklyCap })"
    />

    <section class="flex flex-col gap-4 rounded-lg bg-elevated p-5">
      <h2 class="text-lg font-bold text-highlighted">{{ t('admin.push.byKind') }}</h2>
      <ul class="flex flex-col gap-3">
        <li v-for="kind in PUSH_KINDS" :key="kind" class="flex items-center gap-4">
          <span class="w-48 shrink-0 text-sm">{{ t(`admin.push.kinds.${kind}`) }}</span>
          <UProgress
            :model-value="(overview.byKind[kind] / biggest) * 100"
            color="secondary"
            size="sm"
            class="flex-1"
          />
          <span class="w-10 text-right font-semibold tabular-nums">{{
            overview.byKind[kind]
          }}</span>
        </li>
      </ul>
    </section>

    <template v-if="admin">
      <section class="flex flex-col gap-4 rounded-lg bg-elevated p-5">
        <h2 class="text-lg font-bold text-highlighted">{{ t('admin.push.subscribers') }}</h2>
        <p v-if="!subscribers?.items.length" class="text-muted">{{ t('admin.push.empty') }}</p>
        <div v-else class="overflow-x-auto">
          <table class="w-full min-w-xl text-left text-sm">
            <thead class="text-muted">
              <tr>
                <th class="py-2 pr-4 font-medium">{{ t('admin.push.name') }}</th>
                <th class="py-2 pr-4 font-medium">{{ t('admin.push.school') }}</th>
                <th class="py-2 pr-4 font-medium">{{ t('admin.push.categories') }}</th>
                <th class="py-2 pr-4 text-right font-medium">{{ t('admin.push.devices') }}</th>
                <th class="py-2 pr-4 font-medium">{{ t('admin.push.since') }}</th>
                <th class="py-2 text-right font-medium">{{ t('admin.push.last7') }}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-default">
              <tr v-for="row in subscribers.items" :key="row.userId">
                <td class="py-2.5 pr-4 font-medium text-highlighted">{{ row.name }}</td>
                <td class="py-2.5 pr-4">{{ row.school }}</td>
                <td class="py-2.5 pr-4">{{ categories(row) }}</td>
                <td class="py-2.5 pr-4 text-right tabular-nums">{{ row.devices }}</td>
                <td class="py-2.5 pr-4 tabular-nums">{{ since(row.since) }}</td>
                <td class="py-2.5 text-right tabular-nums">
                  <UBadge
                    v-if="row.receivedLast7Days > overview.weeklyCap"
                    color="warning"
                    variant="subtle"
                    :label="String(row.receivedLast7Days)"
                  />
                  <template v-else>{{ row.receivedLast7Days }}</template>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
    <UAlert
      v-else
      color="neutral"
      variant="subtle"
      icon="i-lucide-info"
      :description="t('admin.push.managersSee')"
    />
  </div>
</template>
