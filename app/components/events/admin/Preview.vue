<script setup lang="ts">
// How the event being edited will look: on its page and the home hero, in the agenda, and as a
// link shared on Discord. Follows the form as it's typed.
const props = defineProps<{
  name: string;
  startsAt: string | null;
  endsAt: string | null;
  room: string;
  type?: { label: string; icon: string };
  description: string;
  banner?: string;
  thumb?: string;
  embed?: string;
}>();

const { t, locale } = useI18n();

const when = computed(() =>
  props.startsAt
    ? formatEventDate(props.startsAt, locale.value, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      })
    : t('admin.events.form.noDate'),
);

// Markdown marks left out, roughly as the server's plain text does.
const summary = computed(() => {
  const text = props.description
    .replace(/[*_`>#]/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > 140 ? `${text.slice(0, 139)}…` : text;
});
</script>

<template>
  <aside class="flex flex-col gap-3">
    <span class="font-semibold text-highlighted">{{ t('admin.events.preview.title') }}</span>

    <div
      class="dark relative isolate flex min-h-36 items-end overflow-hidden rounded-lg bg-banner-fallback"
    >
      <template v-if="banner">
        <img :src="banner" alt="" class="absolute inset-0 -z-1 size-full object-cover" />
        <div
          class="absolute inset-0 -z-1 bg-linear-to-t from-banner via-banner/60 to-transparent"
        />
      </template>
      <div class="flex flex-col gap-1 p-4">
        <span class="font-display font-bold text-on-banner">{{ name }}</span>
        <span class="text-sm text-on-banner-muted tabular-nums first-letter:uppercase">
          {{ when }}<template v-if="room">, {{ room }}</template>
        </span>
      </div>
    </div>

    <span class="text-sm text-muted">{{ t('admin.events.preview.agenda') }}</span>
    <div class="flex items-center gap-3 rounded-lg bg-elevated p-2">
      <div
        class="relative aspect-video w-24 shrink-0 overflow-hidden rounded-sm bg-banner-fallback"
      >
        <img v-if="thumb" :src="thumb" alt="" class="absolute inset-0 size-full object-cover" />
      </div>
      <div class="flex min-w-0 flex-col">
        <span class="truncate text-sm font-bold text-highlighted">{{ name }}</span>
        <span class="flex items-center gap-1.5 text-sm text-muted">
          <UIcon v-if="type" :name="type.icon" class="size-3.5 shrink-0" />
          <span class="truncate">{{ type?.label }}</span>
        </span>
      </div>
    </div>

    <span class="text-sm text-muted">{{ t('admin.events.preview.embed') }}</span>
    <div class="flex flex-col gap-2 rounded-md border-s-4 border-accented bg-elevated p-3">
      <span class="text-sm font-bold text-highlighted">{{ name }}</span>
      <span v-if="summary" class="text-sm text-muted">{{ summary }}</span>
      <div class="relative aspect-embed overflow-hidden rounded-sm bg-banner-fallback">
        <img v-if="embed" :src="embed" alt="" class="absolute inset-0 size-full object-cover" />
      </div>
    </div>
  </aside>
</template>
