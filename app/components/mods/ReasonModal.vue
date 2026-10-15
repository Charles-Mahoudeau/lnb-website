<script setup lang="ts">
import { REASON_MAX, modReasonBody } from '#shared/schemas/mods';

// Edits the reason of your own suggestion. The votes stay. Closes with true once saved.
const props = defineProps<{ id: number; name: string; reason: string }>();
const emit = defineEmits<{ close: [saved: boolean] }>();

const { t } = useI18n();
const toast = useToast();
const { editReason } = useModList();

const state = reactive({ reason: props.reason });
const pending = ref(false);

async function onSubmit() {
  pending.value = true;
  try {
    await editReason(props.id, state.reason);
    toast.add({ title: t('mods.reason.saved'), color: 'success', icon: 'i-lucide-circle-check' });
    emit('close', true);
  } catch (error) {
    const problem = error instanceof ModError ? error.problem : 'failed';
    toast.add({
      title: t(`mods.errors.${problem}`),
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
    :title="t('mods.reason.title', { name: props.name })"
    :description="t('mods.reason.lede')"
    :close="false"
  >
    <template #body>
      <UForm id="mods-reason" :schema="modReasonBody" :state="state" @submit="onSubmit">
        <UFormField :label="t('mods.suggest.reason')" name="reason">
          <UTextarea
            v-model="state.reason"
            :rows="4"
            :maxlength="REASON_MAX"
            autoresize
            class="w-full"
          />
          <template #hint>
            <span class="tabular-nums">{{ state.reason.length }} / {{ REASON_MAX }}</span>
          </template>
        </UFormField>
      </UForm>
    </template>
    <template #footer>
      <div class="flex w-full flex-wrap justify-end gap-3">
        <UButton
          color="neutral"
          variant="soft"
          :label="t('mods.cancel')"
          :disabled="pending"
          @click="emit('close', false)"
        />
        <UButton
          type="submit"
          form="mods-reason"
          :label="t('mods.reason.save')"
          :loading="pending"
        />
      </div>
    </template>
  </UModal>
</template>
