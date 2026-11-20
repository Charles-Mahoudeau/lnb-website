<script setup lang="ts">
import type { AdminActivityEntry } from '#shared/schemas/admin';

// One line of the activity log: the sentence of the action, with the names in semibold and
// linking to their Person page, the time muted on the right, and the area as a small pill.
// The sentence is a message from admin.activity.actions, keyed by the action in camelCase, and
// the names are slots, so no markup goes through v-html.
const props = defineProps<{ entry: AdminActivityEntry }>();
const i18n = useI18n();
const { t, locale } = i18n;

const key = computed(
  () =>
    `admin.activity.actions.${props.entry.action.replace(/\.([a-z])/g, (_, char: string) => char.toUpperCase())}`,
);

// What the sentence may name: the scalar values of the entry's data, such as `name`.
const params = computed(() => {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(props.entry.data)) {
    if (name === 'actor' || name === 'target') continue;
    if (typeof value === 'string' || typeof value === 'number') out[name] = String(value);
  }
  return out;
});

const actorFallback = computed(() => {
  if (props.entry.actorMinecraftName) return props.entry.actorMinecraftName;
  if (props.entry.source === 'server') return t('admin.activity.actors.server');
  if (props.entry.source === 'system') return t('admin.activity.actors.system');
  return t('admin.activity.actors.deleted');
});
const targetFallback = computed(() => t('admin.activity.actors.someone'));

const actor = computed(() => ({
  id: props.entry.actor?.userId ?? null,
  label: props.entry.actor?.name ?? actorFallback.value,
}));
const target = computed(() => ({
  id: props.entry.target?.userId ?? null,
  label: props.entry.target?.name ?? targetFallback.value,
}));

const area = computed(() => t(`admin.activity.areas.${auditAreaOf(props.entry.action)}`));
const known = computed(() => i18n.te(key.value));

const sameDay = (iso: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date(iso)) ===
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
const time = computed(() =>
  sameDay(props.entry.at)
    ? formatWardenRelative(props.entry.at, locale.value)
    : formatWardenDate(props.entry.at, locale.value),
);
</script>

<template>
  <li class="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
    <p class="min-w-0 flex-1 basis-72 text-default">
      <i18n-t v-if="known" :keypath="key" tag="span" scope="parent" :plural="1">
        <template #actor>
          <NuxtLink
            v-if="actor.id"
            :to="`/admin/people/${actor.id}/summary`"
            class="font-semibold text-highlighted hover:underline"
          >
            {{ actor.label }}
          </NuxtLink>
          <span v-else class="font-semibold text-highlighted">{{ actor.label }}</span>
        </template>
        <template #target>
          <NuxtLink
            v-if="target.id"
            :to="`/admin/people/${target.id}/summary`"
            class="font-semibold text-highlighted hover:underline"
          >
            {{ target.label }}
          </NuxtLink>
          <span v-else class="font-semibold text-highlighted">{{ target.label }}</span>
        </template>
        <template v-for="(value, name) in params" :key="name" #[name]>
          <span class="font-semibold text-highlighted">{{ value }}</span>
        </template>
      </i18n-t>
      <span v-else class="font-semibold text-highlighted">{{ entry.action }}</span>
    </p>
    <UBadge color="neutral" variant="subtle" size="sm" :label="area" />
    <time
      :datetime="entry.at"
      :title="formatWardenDateTime(entry.at, locale)"
      class="w-28 text-right text-sm text-muted"
    >
      {{ time }}
    </time>
  </li>
</template>
