<script setup lang="ts">
import { AdminTypedConfirmModal } from '#components';

import { WARDEN_RESET_SANCTIONS_CONFIRM } from '#shared/schemas/warden';

// The settings tab: the default account limit, and the sanctions reset for site admins.
const { t } = useI18n();
const toast = useToast();
const overlay = useOverlay();
const { user } = useAuth();
const { settings, save, resetSanctions: runResetSanctions } = useWardenSettings();
const { data, refresh } = await settings;

const state = reactive({ defaultMaxAccounts: 1 });
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

async function resetSanctions() {
  const reset: unknown = await overlay.create(AdminTypedConfirmModal).open({
    title: t('wardenAdmin.settings.reset.title'),
    description: t('wardenAdmin.settings.reset.warning'),
    sentence: WARDEN_RESET_SANCTIONS_CONFIRM,
    confirmLabel: t('wardenAdmin.settings.reset.confirm'),
    run: () => runResetSanctions(WARDEN_RESET_SANCTIONS_CONFIRM),
  }).result;
  if (reset !== true) return;
  toast.add({
    title: t('wardenAdmin.settings.reset.done'),
    color: 'success',
    icon: 'i-lucide-circle-check',
  });
}
</script>

<template>
  <div class="flex max-w-2xl flex-col gap-6">
    <form class="flex flex-col gap-5 rounded-lg bg-elevated p-5" @submit.prevent="onSave">
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
      <div>
        <UButton type="submit" :label="t('wardenAdmin.settings.save')" :loading="pending" />
      </div>
    </form>
    <section
      v-if="isAdmin(user?.role)"
      class="flex flex-col items-start gap-3 rounded-lg bg-elevated p-5"
    >
      <h2 class="text-lg font-medium text-highlighted">
        {{ t('wardenAdmin.settings.reset.heading') }}
      </h2>
      <p class="text-muted">{{ t('wardenAdmin.settings.reset.lede') }}</p>
      <UButton
        color="error"
        variant="outline"
        :label="t('wardenAdmin.settings.reset.open')"
        @click="resetSanctions"
      />
    </section>
  </div>
</template>
