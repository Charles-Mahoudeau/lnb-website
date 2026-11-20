<script setup lang="ts">
import type { AdminPersonSummary } from '#shared/schemas/admin';

// The Events tab of the Person page: what they are registered to, newest event first.
const props = defineProps<{ summary: AdminPersonSummary }>();
const { t, locale } = useI18n();
const rows = computed(() => props.summary.events?.registrations ?? []);
</script>

<template>
  <p v-if="!rows.length" class="text-muted">{{ t('admin.person.events.empty') }}</p>
  <ul v-else class="flex flex-col divide-y divide-default rounded-lg bg-elevated">
    <li v-for="row in rows" :key="row.eventId" class="flex flex-wrap items-center gap-4 px-5 py-4">
      <div class="flex min-w-0 flex-1 basis-60 flex-col gap-1">
        <NuxtLink
          :to="`/admin/events/${row.eventId}`"
          class="font-semibold text-highlighted hover:underline"
        >
          {{ row.name }}
        </NuxtLink>
        <span class="text-sm text-muted tabular-nums">
          {{ formatWardenDateTime(row.startsAt, locale) }}
        </span>
      </div>
      <span v-if="row.team" class="text-sm text-muted">
        {{ t('admin.person.events.team', { team: row.team }) }}
      </span>
      <UBadge
        :color="row.status === 'registered' ? 'success' : 'neutral'"
        variant="subtle"
        :label="t(`admin.person.events.${row.status}`)"
      />
    </li>
  </ul>
</template>
