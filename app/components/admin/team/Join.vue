<script setup lang="ts">
// The link behind the team page's "Join the team" button, a setting of Settings, Team. The poles
// and members are in AdminTeam (/admin/site/team). Full admins only.
const { t } = useI18n();
const toast = useToast();
const { isEnabled } = useFlags();

const { data, error, refresh } = await useAdminTeam();

const joinUrl = ref(data.value?.joinUrl ?? '');
const savingJoin = ref(false);
const joinValid = computed(
  () => !joinUrl.value.trim() || /^https:\/\/\S+\.\S+/.test(joinUrl.value.trim()),
);
async function saveJoin() {
  savingJoin.value = true;
  try {
    await teamActions.setSettings({ joinUrl: joinUrl.value });
    toast.add({
      title: t('admin.team.join.saved'),
      color: 'success',
      icon: 'i-lucide-circle-check',
    });
  } catch (caught) {
    const problem = caught instanceof TeamError ? caught.problem : 'failed';
    toast.add({
      title: t(`admin.team.errors.${problem}`),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  }
  await refresh();
  joinUrl.value = data.value?.joinUrl ?? '';
  savingJoin.value = false;
}
</script>

<template>
  <UAlert
    v-if="error || !data"
    color="error"
    variant="subtle"
    icon="i-lucide-circle-alert"
    :description="t('admin.team.errors.failed')"
  />
  <div v-else class="max-w-4xl">
    <section class="flex flex-col gap-3 rounded-lg bg-elevated p-5">
      <h2 class="text-xl font-bold text-highlighted">{{ t('admin.team.join.title') }}</h2>
      <p class="text-sm text-muted">{{ t('admin.team.join.help') }}</p>
      <UAlert
        v-if="!isEnabled('team.join')"
        color="warning"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        :description="t('admin.team.join.flagOff')"
      />
      <form class="flex flex-wrap items-start gap-3" @submit.prevent="saveJoin">
        <UFormField
          :label="t('admin.team.join.label')"
          name="joinUrl"
          class="min-w-64 flex-1"
          :error="joinValid ? undefined : 'https://…'"
        >
          <UInput
            v-model="joinUrl"
            type="url"
            inputmode="url"
            placeholder="https://"
            :maxlength="500"
            class="w-full"
          />
        </UFormField>
        <UButton
          type="submit"
          color="neutral"
          variant="soft"
          class="mt-6"
          :disabled="!joinValid"
          :loading="savingJoin"
          :label="t('admin.team.join.save')"
        />
      </form>
    </section>
  </div>
</template>
