<script setup lang="ts">
// The Gamesplanet affiliate ref, a setting of Settings, Gamesplanet. The rest of the promotion is
// in AdminGamesplanet (/admin/site/gamesplanet). Full admins only.
const { t } = useI18n();
const toast = useToast();

const { data, error, refresh } = await useAdminGamesplanet();

const refCode = ref(data.value?.refCode ?? '');
const refValid = computed(() => /^[A-Za-z0-9_-]{2,40}$/.test(refCode.value.trim()));
const savingRef = ref(false);
async function saveRef() {
  savingRef.value = true;
  try {
    await gamesplanetActions.setSettings({ refCode: refCode.value.trim() });
    toast.add({
      title: t('admin.gamesplanet.ref.saved'),
      color: 'success',
      icon: 'i-lucide-circle-check',
    });
  } catch (caught) {
    const problem = caught instanceof GamesplanetError ? caught.problem : 'failed';
    toast.add({
      title: t(`admin.gamesplanet.errors.${problem}`),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  }
  await refresh();
  refCode.value = data.value?.refCode ?? '';
  savingRef.value = false;
}
</script>

<template>
  <UAlert
    v-if="error || !data"
    color="error"
    variant="subtle"
    icon="i-lucide-circle-alert"
    :description="t('admin.gamesplanet.errors.failed')"
  />
  <div v-else class="max-w-4xl">
    <section class="flex flex-col gap-3 rounded-lg bg-elevated p-5">
      <h2 class="text-xl font-bold text-highlighted">{{ t('admin.gamesplanet.ref.title') }}</h2>
      <p class="text-sm text-muted">{{ t('admin.gamesplanet.ref.help') }}</p>
      <form class="flex flex-wrap items-start gap-3" @submit.prevent="saveRef">
        <UFormField
          :label="t('admin.gamesplanet.ref.label')"
          name="refCode"
          class="min-w-64 flex-1"
          :error="refValid ? undefined : t('admin.gamesplanet.ref.invalid')"
        >
          <UInput v-model="refCode" :maxlength="40" class="w-full" />
        </UFormField>
        <UButton
          type="submit"
          color="neutral"
          variant="soft"
          class="mt-6"
          :disabled="!refValid || refCode.trim() === data.refCode"
          :loading="savingRef"
          :label="t('admin.gamesplanet.ref.save')"
        />
      </form>
    </section>
  </div>
</template>
