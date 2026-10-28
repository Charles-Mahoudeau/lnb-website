<script setup lang="ts">
import { API_KEY_DEFAULT_OVERLAP_DAYS, API_KEY_OVERLAP_CHOICES } from '#shared/api-keys';
import type { ApiKeyCreated } from '#shared/schemas/api-keys';

// Asks how long the old key keeps working, then rotates. Closes with the new key, or null.
const props = defineProps<{ id: string; name: string }>();
const emit = defineEmits<{
  close: [rotated: { created: ApiKeyCreated; overlapDays: number } | null];
}>();

const { t } = useI18n();
const toast = useToast();

const overlapDays = ref<number>(API_KEY_DEFAULT_OVERLAP_DAYS);
const pending = ref(false);

async function onRotate() {
  pending.value = true;
  try {
    const created = await apiKeyActions.rotate(props.id, { overlapDays: overlapDays.value });
    emit('close', { created, overlapDays: overlapDays.value });
  } catch (error) {
    const problem = error instanceof ApiKeyError ? error.problem : 'failed';
    toast.add({
      title: t(`admin.apiKeys.errors.${problem}`),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
    pending.value = false;
  }
}
</script>

<template>
  <UModal
    :title="t('admin.apiKeys.rotate.title', { name })"
    :description="t('admin.apiKeys.rotate.lede')"
    :close="false"
  >
    <template #body>
      <fieldset class="flex flex-col gap-2">
        <legend class="mb-2 text-sm font-medium">{{ t('admin.apiKeys.rotate.overlap') }}</legend>
        <div class="flex flex-wrap gap-2">
          <UButton
            v-for="days in API_KEY_OVERLAP_CHOICES"
            :key="days"
            type="button"
            size="md"
            color="neutral"
            :variant="overlapDays === days ? 'soft' : 'outline'"
            :aria-pressed="overlapDays === days"
            :label="t('admin.apiKeys.rotate.days', { n: days }, days)"
            @click="overlapDays = days"
          />
        </div>
      </fieldset>
    </template>
    <template #footer>
      <div class="flex w-full flex-wrap justify-end gap-3">
        <UButton
          color="neutral"
          variant="soft"
          :label="t('admin.cancel')"
          @click="emit('close', null)"
        />
        <UButton :loading="pending" :label="t('admin.apiKeys.rotate.confirm')" @click="onRotate" />
      </div>
    </template>
  </UModal>
</template>
