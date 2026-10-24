<script setup lang="ts">
// A poster field that can come from the event: "From event" while it follows it, "Pinned" with
// a reset once edited. Without an event there's nothing to follow, so no badge.
const props = defineProps<{
  label: string;
  /** The poster has an event to follow. */
  follows: boolean;
  pinned: boolean;
  help?: string;
}>();
const emit = defineEmits<{ reset: [] }>();

const { t } = useI18n();
</script>

<template>
  <UFormField :label="props.label" :help="props.help">
    <template v-if="props.follows" #hint>
      <span class="flex items-center gap-1">
        <template v-if="props.pinned">
          <UBadge color="primary" variant="subtle" :label="t('admin.posters.source.pinned')" />
          <UButton
            color="neutral"
            variant="ghost"
            size="xs"
            :label="t('admin.posters.source.reset')"
            @click="emit('reset')"
          />
        </template>
        <UBadge
          v-else
          color="neutral"
          variant="subtle"
          :label="t('admin.posters.source.fromEvent')"
        />
      </span>
    </template>
    <slot />
  </UFormField>
</template>
