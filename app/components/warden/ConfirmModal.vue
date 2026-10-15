<script setup lang="ts">
// A yes-or-no question before a change that's hard to undo. Opened with useOverlay(); closes
// with true when confirmed.
withDefaults(
  defineProps<{
    title: string;
    description: string;
    confirmLabel: string;
    cancelLabel: string;
    /** Destructive actions use the error outline, never a solid red (docs/design.md). */
    destructive?: boolean;
  }>(),
  { destructive: false },
);

const emit = defineEmits<{ close: [confirmed: boolean] }>();
</script>

<template>
  <UModal :title="title" :description="description" :close="false">
    <template #footer>
      <div class="flex w-full flex-wrap justify-end gap-3">
        <UButton
          color="neutral"
          variant="soft"
          :label="cancelLabel"
          @click="emit('close', false)"
        />
        <UButton
          :color="destructive ? 'error' : 'primary'"
          :variant="destructive ? 'outline' : 'solid'"
          :label="confirmLabel"
          @click="emit('close', true)"
        />
      </div>
    </template>
  </UModal>
</template>
