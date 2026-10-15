<script setup lang="ts">
// A player's own account limit, or the default. Closes with { maxAccounts }, or null.
const props = defineProps<{ name: string; current: number | null; defaultMax: number }>();
const emit = defineEmits<{ close: [result: { maxAccounts: number | null } | null] }>();

const { t } = useI18n();
const useDefault = ref(props.current === null);
const own = ref(props.current ?? props.defaultMax);
</script>

<template>
  <UModal
    :title="t('wardenAdmin.limitModal.title', { name })"
    :description="t('wardenAdmin.limitModal.lede')"
    :close="false"
  >
    <template #body>
      <form
        id="warden-limit"
        class="flex flex-col gap-5"
        @submit.prevent="emit('close', { maxAccounts: useDefault ? null : own })"
      >
        <UCheckbox
          v-model="useDefault"
          :label="t('wardenAdmin.limitModal.useDefault', { count: defaultMax })"
        />
        <UFormField v-if="!useDefault" :label="t('wardenAdmin.limitModal.own')">
          <UInputNumber v-model="own" :min="0" :max="20" class="w-36" />
        </UFormField>
      </form>
    </template>
    <template #footer>
      <div class="flex w-full flex-wrap justify-end gap-3">
        <UButton
          color="neutral"
          variant="soft"
          :label="t('wardenAdmin.limitModal.cancel')"
          @click="emit('close', null)"
        />
        <UButton type="submit" form="warden-limit" :label="t('wardenAdmin.limitModal.submit')" />
      </div>
    </template>
  </UModal>
</template>
