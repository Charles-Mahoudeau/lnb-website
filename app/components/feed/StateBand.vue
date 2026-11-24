<script setup lang="ts">
import type { FeedMe } from '#shared/schemas/feed';

// What shows instead of a composer when the person can't write (docs/feed.md, "Bands"): how to
// link a Minecraft account, a Warden ban with its end, or a quiet note while posting is paused.
// Reading stays open in every case.
const props = defineProps<{ me: FeedMe }>();

const { t, locale } = useI18n();

const kind = computed(() => {
  if (!props.me.linked) return 'noLink';
  if (props.me.banned) return 'banned';
  if (!props.me.writing) return 'paused';
  return null;
});

const banTitle = computed(() =>
  props.me.banExpiresAt
    ? t('feed.bands.bannedUntil', { date: formatWardenDate(props.me.banExpiresAt, locale.value) })
    : t('feed.bands.banned'),
);
</script>

<template>
  <section
    v-if="kind === 'noLink'"
    class="flex flex-wrap items-center justify-between gap-x-5 gap-y-3 rounded-lg bg-elevated px-4 py-4 sm:px-5"
  >
    <div class="flex min-w-0 flex-1 basis-72 flex-col gap-0.5">
      <p class="font-semibold text-highlighted">{{ t('feed.bands.noLinkTitle') }}</p>
      <p class="text-muted">{{ t('feed.bands.noLinkText') }}</p>
    </div>
    <UButton
      color="neutral"
      variant="soft"
      :label="t('feed.bands.noLinkAction')"
      to="/minecraft/account"
    />
  </section>
  <UAlert
    v-else-if="kind === 'banned'"
    color="error"
    variant="subtle"
    icon="i-lucide-ban"
    :title="banTitle"
    :description="t('feed.bands.bannedText')"
    :actions="[
      {
        label: t('feed.bands.bannedAction'),
        to: '/minecraft/account',
        color: 'neutral',
        variant: 'outline',
        size: 'md',
      },
    ]"
    orientation="horizontal"
  />
  <p v-else-if="kind === 'paused'" class="flex items-center gap-2 text-muted">
    <UIcon name="i-lucide-pause" class="size-4 shrink-0" />
    {{ t('feed.bands.paused') }}
  </p>
</template>
