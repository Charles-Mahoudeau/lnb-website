<script setup lang="ts">
import type { EventAdminView } from '#shared/schemas/events';

// Where an event stands on the BDE website: there (with a link), waiting for a retry, or refused
// with the BDE's own messages. Emits `retry` for the Try again button.
const props = defineProps<{ event: EventAdminView; paused?: boolean }>();
const emit = defineEmits<{ retry: [] }>();

const { t, locale } = useI18n();

const status = computed(() => props.event.bdeStatus);
const errors = computed(() =>
  Object.entries(props.event.bde.lastError ?? {})
    .filter(([field]) => field !== 'status')
    .map(([field, value]) => {
      const messages = Array.isArray(value) ? value.join(', ') : String(value);
      return field === 'detail' ? messages : `${field}: ${messages}`;
    }),
);
const next = computed(() =>
  props.event.bde.nextAttemptAt
    ? formatEventDate(props.event.bde.nextAttemptAt, locale.value, {
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      })
    : null,
);
</script>

<template>
  <div class="flex items-start gap-3 rounded-md bg-default p-3">
    <UIcon
      :name="
        status === 'synced'
          ? 'i-lucide-circle-check'
          : status === 'failed'
            ? 'i-lucide-circle-alert'
            : 'i-lucide-clock'
      "
      class="mt-0.5 size-5 shrink-0"
      :class="
        status === 'synced' ? 'text-success' : status === 'failed' ? 'text-error' : 'text-muted'
      "
    />
    <div class="flex min-w-0 flex-col items-start gap-1.5">
      <span class="font-semibold text-highlighted">
        {{
          status === 'synced'
            ? t('admin.events.bde.synced')
            : status === 'failed'
              ? t('admin.events.bde.failed')
              : status === 'pending'
                ? t('admin.events.bde.pending')
                : t('admin.events.bde.notThere')
        }}
      </span>
      <ULink
        v-if="status === 'synced' && event.bde.pageUrl"
        :to="event.bde.pageUrl"
        target="_blank"
        class="text-sm text-primary hover:underline"
      >
        {{ t('admin.events.bde.seeThere') }}
      </ULink>
      <p v-if="paused" class="text-sm text-muted">{{ t('admin.events.bde.paused') }}</p>
      <p v-else-if="status === 'pending' && next" class="text-sm text-muted tabular-nums">
        {{ t('admin.events.bde.nextTry', { time: next, count: event.bde.attempts }) }}
      </p>
      <ul v-if="errors.length && status !== 'synced'" class="flex flex-col text-sm text-muted">
        <li v-for="line in errors" :key="line">{{ line }}</li>
      </ul>
      <UButton
        v-if="status === 'failed' || status === 'pending'"
        size="md"
        color="neutral"
        variant="soft"
        icon="i-lucide-refresh-cw"
        :label="t('admin.events.bde.retry')"
        @click="emit('retry')"
      />
    </div>
  </div>
</template>
