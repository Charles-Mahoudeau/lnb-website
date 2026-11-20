<script setup lang="ts">
// The contact link of the partners page, a setting of Settings, Partners. The partners
// themselves are in AdminPartners (/admin/site/partners). Full admins only.
const { t } = useI18n();
const toast = useToast();
const { isEnabled } = useFlags();

const { data, error, refresh } = await useAdminPartners();

const contactUrl = ref(data.value?.contactUrl ?? '');
const savingContact = ref(false);
const contactValid = computed(() => {
  const value = contactUrl.value.trim();
  return (
    !value || /^https:\/\/\S+\.\S+/.test(value) || /^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  );
});
async function saveContact() {
  savingContact.value = true;
  try {
    await partnerActions.setSettings({ contactUrl: contactUrl.value });
    toast.add({
      title: t('admin.partners.contact.saved'),
      color: 'success',
      icon: 'i-lucide-circle-check',
    });
  } catch (caught) {
    const problem = caught instanceof PartnerError ? caught.problem : 'failed';
    toast.add({
      title: t(`admin.partners.errors.${problem}`),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  }
  await refresh();
  contactUrl.value = data.value?.contactUrl ?? '';
  savingContact.value = false;
}
</script>

<template>
  <UAlert
    v-if="error || !data"
    color="error"
    variant="subtle"
    icon="i-lucide-circle-alert"
    :description="t('admin.partners.errors.failed')"
  />
  <div v-else class="max-w-4xl">
    <section class="flex flex-col gap-3 rounded-lg bg-elevated p-5">
      <h2 class="text-xl font-bold text-highlighted">{{ t('admin.partners.contact.title') }}</h2>
      <p class="text-sm text-muted">{{ t('admin.partners.contact.help') }}</p>
      <UAlert
        v-if="!isEnabled('partners.contact')"
        color="warning"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        :description="t('admin.partners.contact.flagOff')"
      />
      <form class="flex flex-wrap items-start gap-3" @submit.prevent="saveContact">
        <UFormField
          :label="t('admin.partners.contact.label')"
          name="contactUrl"
          class="min-w-64 flex-1"
          :error="contactValid ? undefined : 'https://… / mailto:…'"
        >
          <UInput
            v-model="contactUrl"
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
          :disabled="!contactValid"
          :loading="savingContact"
          :label="t('admin.partners.contact.save')"
        />
      </form>
    </section>
  </div>
</template>
