<script setup lang="ts">
// Retire files by pasting a list: one per line, an optional SHA-512 after a space. Closes with
// true once the files were added, so the list refreshes.
const emit = defineEmits<{ close: [done: boolean] }>();

const { t } = useI18n();
const toast = useToast();

const text = ref('');
const note = ref('');
const pending = ref(false);

const items = computed(() =>
  text.value
    .split('\n')
    .map((line) => line.trim().split(/\s+/))
    .filter(([name]) => name)
    .map(([fileName, sha512]) => ({ fileName: fileName!, ...(sha512 ? { sha512 } : {}) })),
);

async function onSubmit() {
  pending.value = true;
  try {
    const { added, skipped } = await modpackActions.retire({
      items: items.value,
      note: note.value,
    });
    toast.add({
      title: t('admin.retired.add.done', { added, skipped }),
      color: 'success',
      icon: 'i-lucide-circle-check',
    });
    emit('close', true);
  } catch (error) {
    const problem = error instanceof ModpackError ? error.problem : 'failed';
    toast.add({
      title: t(`admin.retired.errors.${problem}`),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <UModal
    :title="t('admin.retired.add.title')"
    :description="t('admin.retired.add.lede')"
    :close="false"
  >
    <template #body>
      <form id="retired-add" class="flex flex-col gap-4" @submit.prevent="onSubmit">
        <UFormField
          :label="t('admin.retired.add.list')"
          :help="t('admin.retired.add.listHelp')"
          name="list"
          required
        >
          <UTextarea
            v-model="text"
            :rows="6"
            class="w-full"
            placeholder="sodium-0.5.0.jar&#10;iris-1.7.0.jar"
          />
        </UFormField>
        <UFormField :label="t('admin.retired.add.note')" name="note">
          <UInput v-model="note" :maxlength="300" class="w-full" />
        </UFormField>
        <p class="text-sm text-muted">{{ t('admin.retired.add.rules') }}</p>
      </form>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          color="neutral"
          variant="ghost"
          :label="t('admin.retired.detail.cancel')"
          @click="emit('close', false)"
        />
        <UButton
          type="submit"
          form="retired-add"
          :label="t('admin.retired.add.submit', { count: items.length })"
          :disabled="!items.length"
          :loading="pending"
        />
      </div>
    </template>
  </UModal>
</template>
