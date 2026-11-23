<script setup lang="ts">
// The face of an anonymous post: a head-sized square on the raised background with a mask, never
// the wolf, which stands for a site account (docs/design.md, Feed).
const props = withDefaults(defineProps<{ size?: 'sm' | 'md' }>(), { size: 'md' });
const { t } = useI18n();
</script>

<template>
  <span
    role="img"
    :aria-label="t('feed.post.anonymous')"
    :class="[
      'grid shrink-0 place-items-center rounded-sm bg-accented text-muted',
      props.size === 'sm' ? 'size-7' : 'size-10',
    ]"
  >
    <UIcon name="i-lucide-venetian-mask" :class="props.size === 'sm' ? 'size-4' : 'size-5'" />
  </span>
</template>
