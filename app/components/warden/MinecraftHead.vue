<script setup lang="ts">
// A Minecraft skin head, served by the site (/api/warden/heads/:uuid), with a plain fallback
// when it can't be loaded. See docs/design.md for the sizes.
const props = withDefaults(defineProps<{ uuid: string; size?: 'sm' | 'md' | 'lg' }>(), {
  size: 'md',
});

const failed = ref(false);
watch(
  () => props.uuid,
  () => (failed.value = false),
);

const sizeClass = computed(() => ({ sm: 'size-7', md: 'size-10', lg: 'size-14' })[props.size]);
</script>

<template>
  <img
    v-if="!failed"
    :src="`/api/warden/heads/${uuid}`"
    alt=""
    loading="lazy"
    :class="['shrink-0 rounded-sm bg-accented pixelated', sizeClass]"
    @error="failed = true"
  />
  <span
    v-else
    :class="['grid shrink-0 place-items-center rounded-sm bg-accented text-muted', sizeClass]"
  >
    <UIcon name="i-lucide-user-round" class="size-1/2" />
  </span>
</template>
