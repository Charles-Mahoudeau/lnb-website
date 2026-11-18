<script setup lang="ts">
import { mapSettingsBody } from '#shared/schemas/map';

// The address of the live map the /minecraft/map page shows. Full admins only.
const { t } = useI18n();
const toast = useToast();
const { isEnabled } = useFlags();

const { data, error, refresh } = await useAdminMap();

const url = ref(data.value?.url ?? '');
const valid = computed(() => mapSettingsBody.safeParse({ url: url.value }).success);
const unchanged = computed(() => url.value.trim() === (data.value?.url ?? ''));
const saving = ref(false);

async function save() {
  saving.value = true;
  try {
    await mapActions.setSettings({ url: url.value });
    toast.add({
      title: t('admin.map.address.saved'),
      color: 'success',
      icon: 'i-lucide-circle-check',
    });
  } catch {
    toast.add({
      title: t('admin.map.errors.failed'),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  }
  await refresh();
  url.value = data.value?.url ?? '';
  saving.value = false;
}
</script>

<template>
  <UAlert
    v-if="error || !data"
    color="error"
    variant="subtle"
    icon="i-lucide-circle-alert"
    :description="t('admin.map.errors.loadFailed')"
  />
  <div v-else class="flex max-w-4xl flex-col gap-8">
    <p class="text-muted">{{ t('admin.map.note') }}</p>
    <UAlert
      v-if="!isEnabled('map')"
      color="warning"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      :description="t('admin.map.flagOff')"
    />

    <section class="flex flex-col gap-3 rounded-lg bg-elevated p-5">
      <h2 class="text-xl font-bold text-highlighted">{{ t('admin.map.address.title') }}</h2>
      <p class="text-sm text-muted">{{ t('admin.map.address.help') }}</p>
      <form class="flex flex-wrap items-start gap-3" @submit.prevent="save">
        <UFormField
          :label="t('admin.map.address.label')"
          name="url"
          class="min-w-64 flex-1"
          :help="t('admin.map.address.default', { url: data.defaultUrl })"
          :error="valid ? undefined : t('admin.map.address.invalid')"
        >
          <UInput
            v-model="url"
            inputmode="url"
            :placeholder="data.defaultUrl"
            :maxlength="500"
            class="w-full"
          />
        </UFormField>
        <UButton
          type="submit"
          color="neutral"
          variant="soft"
          class="mt-6"
          :disabled="!valid || unchanged"
          :loading="saving"
          :label="t('admin.map.address.save')"
        />
      </form>
    </section>
  </div>
</template>
