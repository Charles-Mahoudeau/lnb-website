<script setup lang="ts">
import {
  TEAM_ABBREVIATION_MAX,
  TEAM_ABBREVIATION_MIN,
  birthDate as birthDateSchema,
} from '#shared/schemas/partner-events';
import { TEAM_NAME_MAX, TEAM_NAME_MIN, isValidTeamName } from '#shared/utils/event-teams';
import { cleanAbbreviation, isValidAbbreviation } from '#shared/utils/partner-teams';

// One dialog for the three things that ask for team details: creating a team (name,
// abbreviation and the captain's date of birth), editing it (name and abbreviation), and giving a
// date of birth alone, to ask to join a team or accept an invitation.

const props = defineProps<{
  mode: 'create' | 'edit' | 'birth';
  pending: boolean;
  name?: string;
  abbreviation?: string;
}>();
const open = defineModel<boolean>('open', { required: true });
const emit = defineEmits<{
  submit: [values: { name: string; abbreviation: string; birthDate: string }];
}>();

const { t } = useI18n();

const name = ref(props.name ?? '');
const abbreviation = ref(props.abbreviation ?? '');
const birthDate = ref('');

watch(open, (isOpen) => {
  if (isOpen) {
    name.value = props.name ?? '';
    abbreviation.value = props.abbreviation ?? '';
    birthDate.value = '';
  }
});

const needsTeam = computed(() => props.mode !== 'birth');
const needsBirth = computed(() => props.mode !== 'edit');
const valid = computed(
  () =>
    (!needsTeam.value ||
      (isValidTeamName(name.value) && isValidAbbreviation(abbreviation.value))) &&
    (!needsBirth.value || birthDateSchema.safeParse(birthDate.value).success),
);

function submit() {
  if (!valid.value) return;
  emit('submit', {
    name: name.value,
    abbreviation: cleanAbbreviation(abbreviation.value),
    birthDate: birthDate.value,
  });
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t(`partnerEvents.teams.dialog.${mode}.title`)"
    :description="t(`partnerEvents.teams.dialog.${mode}.description`)"
  >
    <template #body>
      <form id="partner-team-form" class="flex flex-col gap-4" @submit.prevent="submit">
        <template v-if="needsTeam">
          <UFormField
            :label="t('partnerEvents.teams.dialog.name')"
            :hint="
              t('partnerEvents.teams.dialog.nameHint', { min: TEAM_NAME_MIN, max: TEAM_NAME_MAX })
            "
          >
            <UInput v-model="name" :maxlength="TEAM_NAME_MAX * 2" class="w-full" autofocus />
          </UFormField>
          <UFormField
            :label="t('partnerEvents.teams.dialog.abbreviation')"
            :hint="
              t('partnerEvents.teams.dialog.abbreviationHint', {
                min: TEAM_ABBREVIATION_MIN,
                max: TEAM_ABBREVIATION_MAX,
              })
            "
          >
            <UInput
              v-model="abbreviation"
              :maxlength="TEAM_ABBREVIATION_MAX * 2"
              class="w-full uppercase"
            />
          </UFormField>
        </template>
        <UFormField
          v-if="needsBirth"
          :label="t('partnerEvents.teams.dialog.birthDate')"
          :hint="t('partnerEvents.teams.dialog.birthDateHint')"
        >
          <UInput v-model="birthDate" type="date" class="w-full" />
        </UFormField>
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
        form="partner-team-form"
        :label="t(`partnerEvents.teams.dialog.${mode}.submit`)"
        :loading="pending"
        :disabled="!valid"
      />
    </template>
  </UModal>
</template>
