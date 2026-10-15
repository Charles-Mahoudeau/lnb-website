<script setup lang="ts">
import { wardenAppealBody } from '#shared/schemas/warden';

// Sends the player's one appeal for their active ban. Closes with true once it's sent.
const props = defineProps<{ banId: string }>();
const emit = defineEmits<{ close: [sent: boolean] }>();

const { t } = useI18n();
const toast = useToast();
const { appeal } = useWarden();

const state = reactive({ body: '' });
const pending = ref(false);

async function onSubmit() {
  pending.value = true;
  try {
    await appeal(props.banId, state.body);
    toast.add({ title: t('warden.appeal.toast'), color: 'success', icon: 'i-lucide-circle-check' });
    emit('close', true);
  } catch (error) {
    const problem = error instanceof WardenError ? error.problem : 'failed';
    toast.add({
      title: t(
        `warden.errors.${problem === 'appealExists' || problem === 'notFound' ? problem : 'failed'}`,
      ),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <UModal :title="t('warden.appeal.title')" :description="t('warden.appeal.lede')" :close="false">
    <template #body>
      <UForm id="warden-appeal" :schema="wardenAppealBody" :state="state" @submit="onSubmit">
        <UFormField :label="t('warden.appeal.label')" name="body">
          <UTextarea
            v-model="state.body"
            :placeholder="t('warden.appeal.placeholder')"
            :rows="4"
            :maxlength="2000"
            autoresize
            class="w-full"
          />
        </UFormField>
      </UForm>
    </template>
    <template #footer>
      <div class="flex w-full flex-wrap justify-end gap-3">
        <UButton
          color="neutral"
          variant="soft"
          :label="t('warden.appeal.cancel')"
          :disabled="pending"
          @click="emit('close', false)"
        />
        <UButton
          type="submit"
          form="warden-appeal"
          :label="t('warden.appeal.send')"
          :loading="pending"
        />
      </div>
    </template>
  </UModal>
</template>
