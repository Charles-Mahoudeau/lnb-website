<script setup lang="ts">
// A change that needs a reason: freezing an account or reversing a transaction. Closes with the
// reason, or null.
const props = withDefaults(
  defineProps<{
    title: string;
    description: string;
    confirmLabel: string;
    reasonLabel: string;
    maxLength?: number;
    destructive?: boolean;
  }>(),
  { maxLength: 140, destructive: false },
);
const emit = defineEmits<{ close: [reason: string | null] }>();
const { t } = useI18n();
const reason = ref('');
</script>

<template>
  <UModal :title="title" :description="description" :close="false">
    <template #body>
      <form id="economy-reason" @submit.prevent="emit('close', reason.trim())">
        <UFormField :label="reasonLabel" required>
          <UInput v-model="reason" class="w-full" :maxlength="props.maxLength" autofocus />
        </UFormField>
      </form>
    </template>
    <template #footer>
      <div class="flex w-full flex-wrap justify-end gap-3">
        <UButton
          color="neutral"
          variant="soft"
          :label="t('admin.cancel')"
          @click="emit('close', null)"
        />
        <UButton
          type="submit"
          form="economy-reason"
          :color="destructive ? 'error' : 'primary'"
          :variant="destructive ? 'outline' : 'solid'"
          :disabled="!reason.trim()"
          :label="confirmLabel"
        />
      </div>
    </template>
  </UModal>
</template>
