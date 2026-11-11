<script setup lang="ts">
import {
  PARTNER_REFERENT_ROLES,
  birthDate as birthDateSchema,
} from '#shared/schemas/partner-events';
import type { PartnerReferentRole } from '#shared/schemas/partner-events';

// The referent of one team, replacing its game's in the export. Empty clears it.
const props = defineProps<{
  teamName: string;
  referent: {
    pseudo: string;
    email: string;
    birthDate: string | null;
    role: PartnerReferentRole;
  } | null;
  pending: boolean;
}>();
const open = defineModel<boolean>('open', { required: true });
const emit = defineEmits<{
  save: [
    referent: {
      pseudo: string;
      email: string;
      birthDate: string | null;
      role: PartnerReferentRole;
    } | null,
  ];
}>();

const { t } = useI18n();
const pseudo = ref('');
const email = ref('');
const birth = ref('');
const role = ref<PartnerReferentRole>('Manager');

watch(open, (isOpen) => {
  if (!isOpen) return;
  pseudo.value = props.referent?.pseudo ?? '';
  email.value = props.referent?.email ?? '';
  birth.value = props.referent?.birthDate ?? '';
  role.value = props.referent?.role ?? 'Manager';
});

const valid = computed(
  () =>
    pseudo.value.trim() === '' ||
    birth.value === '' ||
    birthDateSchema.safeParse(birth.value).success,
);

function submit() {
  if (!valid.value) return;
  emit(
    'save',
    pseudo.value.trim() === ''
      ? null
      : {
          pseudo: pseudo.value.trim(),
          email: email.value.trim(),
          birthDate: birth.value || null,
          role: role.value,
        },
  );
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t('admin.partnerEvents.referent.title', { team: teamName })"
    :description="t('admin.partnerEvents.referent.description')"
  >
    <template #body>
      <form id="referent-form" class="flex flex-col gap-4" @submit.prevent="submit">
        <UFormField :label="t('admin.partnerEvents.referent.pseudo')">
          <UInput
            v-model="pseudo"
            class="w-full"
            :maxlength="60"
            :placeholder="t('admin.partnerEvents.referent.same')"
          />
        </UFormField>
        <UFormField :label="t('admin.partnerEvents.referent.email')">
          <UInput v-model="email" type="email" class="w-full" :maxlength="120" />
        </UFormField>
        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField :label="t('admin.partnerEvents.referent.birthDate')">
            <UInput v-model="birth" type="date" class="w-full" />
          </UFormField>
          <UFormField :label="t('admin.partnerEvents.referent.role')">
            <USelect v-model="role" :items="[...PARTNER_REFERENT_ROLES]" class="w-full" />
          </UFormField>
        </div>
      </form>
    </template>
    <template #footer>
      <UButton
        color="neutral"
        variant="outline"
        :label="t('partnerEvents.teams.cancel')"
        @click="open = false"
      />
      <UButton
        type="submit"
        form="referent-form"
        :label="t('admin.partnerEvents.save')"
        :loading="pending"
        :disabled="!valid"
      />
    </template>
  </UModal>
</template>
