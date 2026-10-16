<script setup lang="ts">
import type { TableColumn, TabsItem } from '@nuxt/ui';

import type { EventAdminRow } from '#shared/schemas/events';

// Every event, for managers: upcoming, drafts and past, with their registrations at a glance.
const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();

type Tab = 'upcoming' | 'drafts' | 'past';
const tab = computed<Tab>({
  get: () => {
    const value = route.query.tab;
    return value === 'drafts' || value === 'past' ? value : 'upcoming';
  },
  set: (value) => void router.replace({ query: { ...route.query, tab: value } }),
});
const tabs = computed<TabsItem[]>(() => [
  { label: t('admin.events.list.upcoming'), value: 'upcoming' },
  { label: t('admin.events.list.drafts'), value: 'drafts' },
  { label: t('admin.events.list.past'), value: 'past' },
]);

const { data, status } = await useAdminEvents(tab);

const columns = computed<TableColumn<EventAdminRow>[]>(() => [
  { accessorKey: 'name', header: t('admin.events.list.event') },
  { accessorKey: 'startsAt', header: t('admin.events.list.when') },
  { id: 'room', header: t('admin.events.list.room') },
  {
    id: 'registrations',
    header: t('admin.events.list.registrations'),
    meta: { class: { th: 'text-right', td: 'text-right' } },
  },
  { id: 'actions', meta: { class: { td: 'w-12 text-right' } } },
]);

function when(iso: string) {
  return formatEventDate(iso, locale.value, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <UTabs v-model="tab" :items="tabs" :content="false" class="w-auto self-start" />
    <div class="rounded-lg bg-elevated p-2">
      <UTable
        :data="data?.items ?? []"
        :columns="columns"
        :loading="status === 'pending'"
        :empty="t(`admin.events.list.empty.${tab}`)"
        class="tabular-nums"
      >
        <template #name-cell="{ row }">
          <div class="flex items-center gap-3">
            <UIcon :name="row.original.type.icon" class="size-5 shrink-0 text-muted" />
            <div class="flex min-w-0 flex-col items-start gap-1">
              <NuxtLink
                :to="`/admin/events/${row.original.id}`"
                class="font-semibold text-highlighted hover:underline"
              >
                {{ row.original.name }}
              </NuxtLink>
              <UBadge
                v-if="row.original.cancelledAt"
                color="error"
                variant="subtle"
                size="sm"
                :label="t('events.cancelled')"
              />
            </div>
          </div>
        </template>
        <template #startsAt-cell="{ row }">
          <span class="first-letter:uppercase">{{ when(row.original.startsAt) }}</span>
        </template>
        <template #room-cell="{ row }">
          {{ row.original.room.name }}
        </template>
        <template #registrations-cell="{ row }">
          <span class="text-highlighted">{{ row.original.counts.registered }}</span>
          <span v-if="row.original.capacity" class="text-muted">
            / {{ row.original.capacity }}
          </span>
          <span v-if="row.original.counts.waitlist" class="block text-sm text-muted">
            {{ t('admin.events.list.waiting', { count: row.original.counts.waitlist }) }}
          </span>
        </template>
        <template #actions-cell="{ row }">
          <UButton
            :to="`/admin/events/${row.original.id}`"
            size="md"
            color="neutral"
            variant="ghost"
            :label="t('admin.events.edit')"
          />
        </template>
      </UTable>
    </div>
  </div>
</template>
