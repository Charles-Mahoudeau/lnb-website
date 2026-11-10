<script setup lang="ts">
import { AdminEconomyResetModal } from '#components';

import type { EconomySettingsBody } from '#shared/schemas/economy';
import { economySettingsBody } from '#shared/schemas/economy';

// The economy settings, and for site admins the export and the reset.
const { t } = useI18n();
const toast = useToast();
const overlay = useOverlay();
const { user } = useAuth();
const { data, refresh } = await useEconomySettings();
const resetModal = overlay.create(AdminEconomyResetModal);

const state = reactive<Required<EconomySettingsBody>>({
  startingBalance: 0,
  maxOwnedShared: 3,
  maxMembers: 20,
});
watchEffect(() => {
  if (!data.value) return;
  state.startingBalance = data.value.startingBalance;
  state.maxOwnedShared = data.value.maxOwnedShared;
  state.maxMembers = data.value.maxMembers;
});

const saving = ref(false);
async function onSave() {
  saving.value = true;
  try {
    await economyAdminActions.updateSettings({ ...state });
    toast.add({
      title: t('admin.economy.settings.saved'),
      color: 'success',
      icon: 'i-lucide-circle-check',
    });
    await refresh();
  } catch {
    toast.add({ title: t('economy.errors.failed'), color: 'error', icon: 'i-lucide-circle-alert' });
  } finally {
    saving.value = false;
  }
}

async function onExport() {
  try {
    const dump = await economyAdminActions.exportAll();
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `lnb-economy-${dump.exportedAt.slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  } catch {
    toast.add({ title: t('economy.errors.failed'), color: 'error', icon: 'i-lucide-circle-alert' });
  }
}

async function onReset() {
  if ((await resetModal.open().result) !== true) return;
  toast.add({
    title: t('admin.economy.reset.done'),
    color: 'success',
    icon: 'i-lucide-circle-check',
  });
}
</script>

<template>
  <div class="flex max-w-2xl flex-col gap-6">
    <UForm
      :schema="economySettingsBody"
      :state="state"
      class="flex flex-col gap-5 rounded-lg bg-elevated p-6"
      @submit="onSave"
    >
      <UFormField
        name="startingBalance"
        :label="t('admin.economy.settings.startingBalance')"
        :help="t('admin.economy.settings.startingBalanceHelp')"
      >
        <UInputNumber v-model="state.startingBalance" :min="0" :step="10" class="w-48" />
      </UFormField>
      <UFormField
        name="maxOwnedShared"
        :label="t('admin.economy.settings.maxOwnedShared')"
        :help="t('admin.economy.settings.maxOwnedSharedHelp')"
      >
        <UInputNumber v-model="state.maxOwnedShared" :min="0" :max="50" class="w-48" />
      </UFormField>
      <UFormField
        name="maxMembers"
        :label="t('admin.economy.settings.maxMembers')"
        :help="t('admin.economy.settings.maxMembersHelp')"
      >
        <UInputNumber v-model="state.maxMembers" :min="1" :max="200" class="w-48" />
      </UFormField>
      <UButton
        type="submit"
        class="self-start"
        :loading="saving"
        :label="t('admin.economy.settings.save')"
      />
    </UForm>

    <section
      v-if="isAdmin(user?.role)"
      class="flex flex-col items-start gap-3 rounded-lg bg-elevated p-6"
    >
      <h2 class="text-lg font-medium text-highlighted">{{ t('admin.economy.reset.heading') }}</h2>
      <p class="text-muted">{{ t('admin.economy.reset.lede') }}</p>
      <div class="flex flex-wrap gap-3">
        <UButton
          color="neutral"
          variant="soft"
          icon="i-lucide-download"
          :label="t('admin.economy.reset.export')"
          @click="onExport"
        />
        <UButton
          color="error"
          variant="outline"
          :label="t('admin.economy.reset.open')"
          @click="onReset"
        />
      </div>
    </section>
  </div>
</template>
