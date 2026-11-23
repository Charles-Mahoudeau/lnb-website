<script setup lang="ts">
// The announcer badge beside a name: a soft neutral pill with a megaphone. The site keeps its own
// neutral look here, not the phone's violet (docs/design.md, Feed). On phones only the megaphone
// shows, so the name keeps its room; the label stays for screen readers.
const { t } = useI18n();
</script>

<template>
  <UBadge
    color="neutral"
    variant="soft"
    size="md"
    icon="i-lucide-megaphone"
    :label="t('feed.post.announcer')"
    class="shrink-0"
    :ui="{ label: 'max-sm:sr-only' }"
  />
</template>
