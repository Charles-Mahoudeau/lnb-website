<script setup lang="ts">
// Lifts a ban, with an optional reason. Closes with the reason ('' for none), or null.
defineProps<{ name: string }>();
const emit = defineEmits<{ close: [reason: string | null] }>();

const { t } = useI18n();
const reason = ref('');
</script>

<template>
  <UModal :title="t('wardenAdmin.unbanModal.title', { name })" :close="false">
    <template #body>
      <form id="warden-unban" @submit.prevent="emit('close', reason.trim())">
        <UFormField :label="t('wardenAdmin.unbanModal.reason')">
          <UInput
            v-model="reason"
            :placeholder="t('wardenAdmin.unbanModal.placeholder')"
            :maxlength="500"
            class="w-full"
          />
        </UFormField>
      </form>
    </template>
    <template #footer>
      <div class="flex w-full flex-wrap justify-end gap-3">
        <UButton
          color="neutral"
          variant="soft"
          :label="t('wardenAdmin.unbanModal.cancel')"
          @click="emit('close', null)"
        />
        <UButton type="submit" form="warden-unban" :label="t('wardenAdmin.unbanModal.submit')" />
      </div>
    </template>
  </UModal>
</template>
