<script setup lang="ts">
// The settings tab: the default account limit and whether cracked accounts may play.
const { t } = useI18n();
const toast = useToast();
const { settings, save } = useWardenSettings();
const { data, refresh } = await settings;

const state = reactive({ defaultMaxAccounts: 1, allowCracked: true });
watch(
  data,
  (value) => {
    if (value) Object.assign(state, value);
  },
  { immediate: true },
);

const pending = ref(false);
async function onSave() {
  pending.value = true;
  try {
    await save({ ...state });
    toast.add({
      title: t('wardenAdmin.settings.saved'),
      color: 'success',
      icon: 'i-lucide-circle-check',
    });
    await refresh();
  } catch {
    toast.add({
      title: t('wardenAdmin.errors.failed'),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <form class="flex max-w-2xl flex-col gap-5 rounded-lg bg-elevated p-5" @submit.prevent="onSave">
    <div class="flex flex-wrap items-center justify-between gap-6">
      <div class="flex max-w-md flex-col gap-1">
        <label for="warden-max-accounts" class="font-semibold text-highlighted">
          {{ t('wardenAdmin.settings.maxAccounts') }}
        </label>
        <span class="text-sm text-muted">{{ t('wardenAdmin.settings.maxAccountsHelp') }}</span>
      </div>
      <UInputNumber
        id="warden-max-accounts"
        v-model="state.defaultMaxAccounts"
        :min="0"
        :max="20"
        class="w-36"
      />
    </div>
    <USeparator />
    <USwitch
      v-model="state.allowCracked"
      :label="t('wardenAdmin.settings.allowCracked')"
      :description="t('wardenAdmin.settings.allowCrackedHelp')"
      :ui="{
        root: 'flex-row-reverse justify-between gap-6',
        label: 'font-semibold text-highlighted',
      }"
    />
    <div>
      <UButton type="submit" :label="t('wardenAdmin.settings.save')" :loading="pending" />
    </div>
  </form>
</template>
