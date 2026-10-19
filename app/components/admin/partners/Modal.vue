<script setup lang="ts">
import { PARTNER_KINDS, partnerBody } from '#shared/schemas/partners';
import type { PartnerAdminItem } from '#shared/schemas/partners';

// Adds a partner, or edits one. Closes with true once saved, or false. The logo is uploaded as
// soon as it's picked and attached when the form is saved.
const props = defineProps<{ partner?: PartnerAdminItem }>();
const emit = defineEmits<{ close: [saved: boolean] }>();

const { t } = useI18n();
const toast = useToast();

const state = reactive({
  kind: props.partner?.kind ?? PARTNER_KINDS[0],
  name: props.partner?.name ?? '',
  description: { en: props.partner?.description.en ?? '', fr: props.partner?.description.fr ?? '' },
  url: props.partner?.url ?? '',
  logoKey: props.partner?.logoKey ?? '',
  visible: props.partner?.visible ?? true,
});
const logo = ref(props.partner?.logo ?? '');
const picker = ref<HTMLInputElement | null>(null);
const uploading = ref(false);
const pending = ref(false);
const logoMissing = ref(false);

const kindItems = PARTNER_KINDS.map((kind) => ({
  value: kind,
  label: t(`partners.kinds.${kind}.name`),
}));

function fail(error: unknown) {
  const problem = error instanceof PartnerError ? error.problem : 'failed';
  toast.add({
    title: t(`admin.partners.errors.${problem}`),
    color: 'error',
    icon: 'i-lucide-circle-alert',
  });
}

async function onPick(event: Event) {
  const input = event.target as HTMLInputElement;
  const picked = input.files?.[0];
  input.value = '';
  if (!picked) return;
  uploading.value = true;
  try {
    const stored = await partnerActions.uploadLogo(picked);
    state.logoKey = stored.logoKey;
    logo.value = stored.logo;
    logoMissing.value = false;
  } catch (error) {
    fail(error);
  } finally {
    uploading.value = false;
  }
}

async function onSubmit() {
  if (!state.logoKey) {
    logoMissing.value = true;
    return;
  }
  pending.value = true;
  try {
    if (props.partner) await partnerActions.update(props.partner.id, state);
    else await partnerActions.add(state);
    toast.add({
      title: t(props.partner ? 'admin.partners.partner.saved' : 'admin.partners.partner.added'),
      color: 'success',
      icon: 'i-lucide-circle-check',
    });
    emit('close', true);
  } catch (error) {
    fail(error);
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <UModal
    :title="
      t(props.partner ? 'admin.partners.partner.editTitle' : 'admin.partners.partner.addTitle')
    "
    :close="false"
  >
    <template #body>
      <UForm
        id="partner-form"
        :schema="partnerBody"
        :state="state"
        class="flex flex-col gap-5"
        @submit="onSubmit"
      >
        <UFormField
          :label="t('admin.partners.partner.logo')"
          name="logoKey"
          :help="t('admin.partners.partner.logoHelp')"
          :error="logoMissing ? t('admin.partners.partner.logoMissing') : undefined"
        >
          <div class="flex flex-wrap items-center gap-4">
            <PartnersLogo v-if="logo" :name="state.name" :src="logo" size="small" />
            <UButton
              color="neutral"
              variant="soft"
              icon="i-lucide-upload"
              :loading="uploading"
              :label="
                t(logo ? 'admin.partners.partner.logoReplace' : 'admin.partners.partner.logoChoose')
              "
              @click="picker?.click()"
            />
            <input
              ref="picker"
              type="file"
              accept="image/png,image/webp,image/svg+xml"
              class="sr-only"
              tabindex="-1"
              aria-hidden="true"
              @change="onPick"
            />
          </div>
        </UFormField>
        <UFormField :label="t('admin.partners.partner.kind')" name="kind">
          <USelect v-model="state.kind" :items="kindItems" value-key="value" class="w-full" />
        </UFormField>
        <UFormField :label="t('admin.partners.partner.name')" name="name" required>
          <UInput v-model="state.name" :maxlength="80" autofocus class="w-full" />
        </UFormField>
        <UFormField
          :label="t('admin.partners.partner.descriptionEn')"
          name="description.en"
          required
        >
          <UTextarea v-model="state.description.en" :maxlength="300" :rows="2" class="w-full" />
        </UFormField>
        <UFormField
          :label="t('admin.partners.partner.descriptionFr')"
          name="description.fr"
          :help="t('admin.partners.partner.descriptionHelp')"
        >
          <UTextarea v-model="state.description.fr" :maxlength="300" :rows="2" class="w-full" />
        </UFormField>
        <UFormField
          :label="t('admin.partners.partner.url')"
          name="url"
          :help="t('admin.partners.partner.urlHelp')"
        >
          <UInput
            v-model="state.url"
            type="url"
            inputmode="url"
            placeholder="https://"
            :maxlength="500"
            class="w-full"
          />
        </UFormField>
        <UFormField name="visible">
          <USwitch v-model="state.visible" :label="t('admin.partners.partner.visible')" />
        </UFormField>
      </UForm>
    </template>
    <template #footer>
      <div class="flex w-full flex-wrap justify-end gap-3">
        <UButton
          color="neutral"
          variant="soft"
          :label="t('admin.cancel')"
          @click="emit('close', false)"
        />
        <UButton
          type="submit"
          form="partner-form"
          :loading="pending"
          :disabled="uploading"
          :label="t(props.partner ? 'admin.partners.partner.save' : 'admin.partners.partner.add')"
        />
      </div>
    </template>
  </UModal>
</template>
