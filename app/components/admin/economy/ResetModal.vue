<script setup lang="ts">
import { ECONOMY_RESET_CONFIRM } from '#shared/schemas/economy';

// The reset, behind a typed sentence. Closes with true once the economy is reset.
const emit = defineEmits<{ close: [done: boolean] }>();
const { t } = useI18n();
const typed = ref('');
const running = ref(false);
const failed = ref(false);
const matches = computed(() => typed.value.trim().toLowerCase() === ECONOMY_RESET_CONFIRM);

async function onConfirm() {
  running.value = true;
  failed.value = false;
  try {
    await economyAdminActions.reset(typed.value);
    emit('close', true);
  } catch {
    failed.value = true;
  } finally {
    running.value = false;
  }
}
</script>

<template>
  <UModal
    :title="t('admin.economy.reset.title')"
    :description="t('admin.economy.reset.warning')"
    :close="false"
  >
    <template #body>
      <form id="economy-reset" class="flex flex-col gap-4" @submit.prevent="onConfirm">
        <UFormField :label="t('admin.economy.reset.type', { sentence: ECONOMY_RESET_CONFIRM })">
          <UInput v-model="typed" class="w-full" autocomplete="off" />
        </UFormField>
        <UAlert
          v-if="failed"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :description="t('economy.errors.failed')"
        />
      </form>
    </template>
    <template #footer>
      <div class="flex w-full flex-wrap justify-end gap-3">
        <UButton
          color="neutral"
          variant="soft"
          :label="t('admin.cancel')"
          @click="emit('close', false)"
        />
        <UButton
          type="submit"
          form="economy-reset"
          color="error"
          variant="outline"
          :loading="running"
          :disabled="!matches"
          :label="t('admin.economy.reset.confirm')"
        />
      </div>
    </template>
  </UModal>
</template>
