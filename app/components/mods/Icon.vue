<script setup lang="ts">
// A mod's icon, served by the site, or its initials on a plain tile when it has none.
const props = withDefaults(
  defineProps<{ name: string; src: string | null; size?: 'sm' | 'lg' }>(),
  {
    size: 'lg',
  },
);

const failed = ref(false);
const initials = computed(() => modInitials(props.name));
</script>

<template>
  <img
    v-if="props.src && !failed"
    :src="props.src"
    alt=""
    loading="lazy"
    :class="[
      'shrink-0 rounded-sm bg-accented object-cover',
      props.size === 'lg' ? 'size-14' : 'size-10',
    ]"
    @error="failed = true"
  />
  <span
    v-else
    aria-hidden="true"
    :class="[
      'grid shrink-0 place-items-center rounded-sm bg-accented font-display font-bold text-muted',
      props.size === 'lg' ? 'size-14 text-base' : 'size-10 text-xs',
    ]"
  >
    {{ initials }}
  </span>
</template>
