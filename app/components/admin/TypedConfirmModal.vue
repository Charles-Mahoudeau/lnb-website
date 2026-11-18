<script setup lang="ts">
// A dangerous action behind a typed sentence, for the resets. `run` does the work: the modal
// closes with true once it succeeded, and shows an error if it threw.
const props = defineProps<{
  title: string;
  description: string;
  sentence: string;
  confirmLabel: string;
  run: () => Promise<unknown>;
}>();
const emit = defineEmits<{ close: [done: boolean] }>();
const { t } = useI18n();
const typed = ref('');
const running = ref(false);
const failed = ref(false);
const matches = computed(() => typed.value.trim().toLowerCase() === props.sentence);

async function onConfirm() {
  if (!matches.value) return;
  running.value = true;
  failed.value = false;
  try {
    await props.run();
    emit('close', true);
  } catch {
    failed.value = true;
  } finally {
    running.value = false;
  }
}
</script>

<template>
  <UModal :title="title" :description="description" :close="false">
    <template #body>
      <form id="typed-confirm" class="flex flex-col gap-4" @submit.prevent="onConfirm">
        <UFormField :label="t('admin.typedConfirm.type', { sentence })">
          <UInput v-model="typed" class="w-full" autocomplete="off" />
        </UFormField>
        <UAlert
          v-if="failed"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :description="t('admin.typedConfirm.failed')"
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
          form="typed-confirm"
          color="error"
          variant="outline"
          :loading="running"
          :disabled="!matches"
          :label="confirmLabel"
        />
      </div>
    </template>
  </UModal>
</template>
