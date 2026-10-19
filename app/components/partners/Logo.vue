<script setup lang="ts">
// A partner's logo on its plate. The plate stays light in both color modes so one upload works
// everywhere (docs/design.md, Partners page). The image fills the plate and is contained in it:
// its height can't depend on the plate's, or a tall logo would grow past it. With a link, the whole plate is the link.
defineProps<{
  name: string;
  src: string;
  url?: string | null;
  /** The plate's size: `row` on the public page, `small` in the admin. */
  size?: 'row' | 'small';
}>();

const { t } = useI18n();
</script>

<template>
  <component
    :is="url ? 'a' : 'div'"
    :href="url ?? undefined"
    :target="url ? '_blank' : undefined"
    :rel="url ? 'noopener noreferrer' : undefined"
    :aria-label="url ? name : undefined"
    class="relative shrink-0 overflow-hidden rounded-md bg-plate"
    :class="size === 'small' ? 'h-12 w-24' : 'h-16 w-36 sm:h-20 sm:w-44'"
  >
    <img
      :src="src"
      :alt="url ? '' : t('partners.logoAlt', { name })"
      class="absolute inset-0 size-full object-contain"
      :class="size === 'small' ? 'p-2' : 'p-3'"
      loading="lazy"
    />
  </component>
</template>
