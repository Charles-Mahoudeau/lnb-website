<script setup lang="ts">
// The corner mark of an event without banner art (docs/design.md, Imagery): the event type's icon,
// large and faint, tilted and cropped by the bottom right corner. Goes inside a relative,
// overflow-hidden box on `bg-banner-fallback`. Decoration only, so it's hidden from screen readers.
const props = withDefaults(defineProps<{ icon: string; size?: 'xs' | 'sm' | 'lg' }>(), {
  size: 'sm',
});

const sizes = {
  xs: 'size-14 -right-2 -bottom-3',
  sm: 'size-24 -right-3 -bottom-4',
  lg: 'size-48 -right-5 -bottom-7',
};
</script>

<template>
  <UIcon
    :name="props.icon"
    aria-hidden="true"
    class="pointer-events-none absolute -rotate-12 text-secondary opacity-25"
    :class="sizes[props.size]"
  />
</template>
