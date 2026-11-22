<script setup lang="ts">
import type { AnticheatTimelineEvent } from '#shared/schemas/anticheat';

// One timeline event in a side drawer: what happened, the score change, and the event's data.
// The data is free-form (the server's events carry whatever the mod sent), so the fields we know
// get a label and the rest is listed as plain key and value.
const props = defineProps<{ event: AnticheatTimelineEvent }>();
const emit = defineEmits<{ close: [null] }>();

const { t, d } = useI18n();

const KNOWN = ['reason', 'from', 'to', 'missing', 'seconds', 'points', 'sha512', 'reportId'];

const minus = (value: number) =>
  value < 0 ? `−${String(Math.abs(value))}` : value > 0 ? `+${String(value)}` : '0';
const text = (value: unknown) =>
  typeof value === 'string' || typeof value === 'number' ? String(value) : JSON.stringify(value);

const missing = computed(() => {
  const value = props.event.data.missing;
  return Array.isArray(value) ? value.map(text) : [];
});
const extra = computed(() =>
  Object.entries(props.event.data).filter(([key]) => !KNOWN.includes(key)),
);
const rows = computed(() => {
  const { data } = props.event;
  const list: { label: string; value: string }[] = [];
  if (data.reason !== undefined) list.push({ label: 'reason', value: text(data.reason) });
  if (data.from !== undefined && data.to !== undefined)
    list.push({ label: 'change', value: `${text(data.from)} → ${text(data.to)}` });
  if (typeof data.seconds === 'number')
    list.push({ label: 'played', value: `${String(Math.round(data.seconds / 60))} min` });
  if (data.points !== undefined) list.push({ label: 'points', value: text(data.points) });
  if (data.sha512 !== undefined) list.push({ label: 'file', value: text(data.sha512) });
  if (data.reportId !== undefined) list.push({ label: 'report', value: text(data.reportId) });
  return list;
});
</script>

<template>
  <USlideover
    :title="t(`admin.anticheat.panel.events.${event.kind}`)"
    :description="
      d(event.at, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Paris' })
    "
    :close="{ onClick: () => emit('close', null) }"
    @update:open="(open: boolean) => !open && emit('close', null)"
  >
    <template #body>
      <div class="flex flex-col gap-6">
        <div class="flex items-center gap-8 rounded-lg bg-elevated p-4">
          <div class="flex flex-col">
            <span class="text-sm text-muted">{{ t('admin.anticheat.panel.detail.delta') }}</span>
            <span class="font-display text-3xl text-highlighted tabular-nums">
              {{ minus(event.delta) }}
            </span>
          </div>
          <div class="flex flex-col">
            <span class="text-sm text-muted">{{ t('admin.anticheat.panel.detail.after') }}</span>
            <span class="font-display text-3xl text-highlighted tabular-nums">
              {{ event.scoreAfter }}
            </span>
          </div>
        </div>
        <p v-if="!event.applied" class="text-sm text-muted">
          {{ t('admin.anticheat.panel.notApplied') }}
        </p>

        <section v-if="missing.length" class="flex flex-col gap-2">
          <h3 class="text-lg font-medium text-highlighted">
            {{ t('admin.anticheat.panel.detail.missing', missing.length) }}
          </h3>
          <ul class="flex flex-col divide-y divide-default" data-testid="event-missing">
            <li v-for="name in missing" :key="name" class="py-2 text-highlighted">{{ name }}</li>
          </ul>
        </section>

        <dl v-if="rows.length || extra.length || event.actor" class="flex flex-col gap-3">
          <div v-for="row in rows" :key="row.label" class="flex flex-col">
            <dt class="text-sm text-muted">
              {{ t(`admin.anticheat.panel.detail.fields.${row.label}`) }}
            </dt>
            <dd class="break-all text-highlighted">{{ row.value }}</dd>
          </div>
          <div v-for="[key, value] in extra" :key="key" class="flex flex-col">
            <dt class="text-sm text-muted">{{ key }}</dt>
            <dd class="break-all text-highlighted">{{ text(value) }}</dd>
          </div>
          <div v-if="event.actor" class="flex flex-col">
            <dt class="text-sm text-muted">{{ t('admin.anticheat.panel.detail.actor') }}</dt>
            <dd class="text-highlighted">{{ event.actor }}</dd>
          </div>
        </dl>
        <p v-if="event.kind === 'modlistIncomplete' && !missing.length" class="text-sm text-muted">
          {{ t('admin.anticheat.panel.detail.noNames') }}
        </p>
      </div>
    </template>
  </USlideover>
</template>
