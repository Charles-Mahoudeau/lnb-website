<script setup lang="ts">
import type { FeedName } from '#shared/schemas/feed';

// An empty feed: what will show up there, and "Write a post" for those who can.
const props = defineProps<{ feed: FeedName; canPost: boolean }>();
const emit = defineEmits<{ write: [] }>();
const { t } = useI18n();
</script>

<template>
  <div
    class="flex flex-col items-center gap-2.5 rounded-lg bg-elevated px-6 py-12 text-center"
    role="status"
  >
    <IconTile :icon="props.feed === 'announcements' ? 'i-lucide-megaphone' : 'i-lucide-inbox'" />
    <h2 class="text-lg font-bold text-highlighted">
      {{ t(`feed.empty.${props.feed}.title`) }}
    </h2>
    <p class="max-w-md text-muted">{{ t(`feed.empty.${props.feed}.text`) }}</p>
    <UButton
      v-if="props.canPost"
      color="neutral"
      variant="soft"
      icon="i-lucide-square-pen"
      :label="t('feed.empty.write')"
      class="mt-1"
      @click="emit('write')"
    />
  </div>
</template>
