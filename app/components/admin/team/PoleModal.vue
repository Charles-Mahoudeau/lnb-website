<script setup lang="ts">
import { TEAM_ICONS, teamPoleBody } from '#shared/schemas/team';
import type { TeamAdminPole } from '#shared/schemas/team';

// Adds a pole, or edits one. Closes with true once saved, or false.
const props = defineProps<{ pole?: TeamAdminPole }>();
const emit = defineEmits<{ close: [saved: boolean] }>();

const { t } = useI18n();
const toast = useToast();

const state = reactive({
  name: { en: props.pole?.name.en ?? '', fr: props.pole?.name.fr ?? '' },
  description: { en: props.pole?.description.en ?? '', fr: props.pole?.description.fr ?? '' },
  icon: (props.pole?.icon ?? TEAM_ICONS[0]) as (typeof TEAM_ICONS)[number],
  featured: props.pole?.featured ?? false,
});
const pending = ref(false);

const iconItems = TEAM_ICONS.map((icon) => ({
  value: icon,
  icon,
  label: t(`admin.team.icons.${icon.replace('i-lucide-', '')}`),
}));

async function onSubmit() {
  pending.value = true;
  try {
    if (props.pole) await teamActions.updatePole(props.pole.id, state);
    else await teamActions.addPole(state);
    toast.add({
      title: t(props.pole ? 'admin.team.pole.saved' : 'admin.team.pole.added'),
      color: 'success',
      icon: 'i-lucide-circle-check',
    });
    emit('close', true);
  } catch (error) {
    const problem = error instanceof TeamError ? error.problem : 'failed';
    toast.add({
      title: t(`admin.team.errors.${problem}`),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <UModal
    :title="t(props.pole ? 'admin.team.pole.editTitle' : 'admin.team.pole.addTitle')"
    :close="false"
  >
    <template #body>
      <UForm
        id="team-pole"
        :schema="teamPoleBody"
        :state="state"
        class="flex flex-col gap-5"
        @submit="onSubmit"
      >
        <UFormField :label="t('admin.team.pole.nameEn')" name="name.en" required>
          <UInput v-model="state.name.en" :maxlength="60" autofocus class="w-full" />
        </UFormField>
        <UFormField :label="t('admin.team.pole.nameFr')" name="name.fr" required>
          <UInput v-model="state.name.fr" :maxlength="60" class="w-full" />
        </UFormField>
        <UFormField :label="t('admin.team.pole.descriptionEn')" name="description.en">
          <UTextarea v-model="state.description.en" :maxlength="200" :rows="2" class="w-full" />
        </UFormField>
        <UFormField :label="t('admin.team.pole.descriptionFr')" name="description.fr">
          <UTextarea v-model="state.description.fr" :maxlength="200" :rows="2" class="w-full" />
        </UFormField>
        <UFormField :label="t('admin.team.pole.icon')" name="icon">
          <USelect v-model="state.icon" :items="iconItems" value-key="value" class="w-full" />
        </UFormField>
        <UFormField name="featured" :help="t('admin.team.pole.featuredHelp')">
          <USwitch v-model="state.featured" :label="t('admin.team.pole.featured')" />
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
          form="team-pole"
          :loading="pending"
          :label="t(props.pole ? 'admin.team.pole.save' : 'admin.team.pole.add')"
        />
      </div>
    </template>
  </UModal>
</template>
