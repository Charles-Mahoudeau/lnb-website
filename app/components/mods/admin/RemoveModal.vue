<script setup lang="ts">
import { modRemoveBody } from '#shared/schemas/mods';

// Asks for the reason a suggestion is removed. Closes with the reason, or false.
const props = defineProps<{ name: string }>();
const emit = defineEmits<{ close: [reason: string | false] }>();

const { t } = useI18n();
const state = reactive({ reason: '' });
</script>

<template>
  <UModal
    :title="t('admin.mods.removeModal.title', { name: props.name })"
    :description="t('admin.mods.removeModal.note')"
    :close="false"
  >
    <template #body>
      <UForm
        id="mods-remove"
        :schema="modRemoveBody"
        :state="state"
        @submit="emit('close', state.reason.trim())"
      >
        <UFormField
          :label="t('admin.mods.removeModal.reason')"
          :help="t('admin.mods.removeModal.reasonHelp')"
          name="reason"
        >
          <UTextarea
            v-model="state.reason"
            :placeholder="t('admin.mods.removeModal.placeholder')"
            :rows="3"
            :maxlength="300"
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
          :label="t('mods.cancel')"
          @click="emit('close', false)"
        />
        <UButton
          type="submit"
          form="mods-remove"
          color="error"
          variant="outline"
          :label="t('admin.mods.removeModal.submit')"
        />
      </div>
    </template>
  </UModal>
</template>
