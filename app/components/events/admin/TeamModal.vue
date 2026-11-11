<script setup lang="ts">
import type { AdminTeamsView } from '#shared/schemas/event-teams';

// Makes a team around a registered player without one, or renames a team. Closes with true once
// saved.
const props = defineProps<{
  eventId: string;
  without: AdminTeamsView['without'];
  team?: { id: string; name: string };
}>();
const emit = defineEmits<{ close: [saved: boolean] }>();

const { t } = useI18n();
const toast = useToast();

const name = ref(props.team?.name ?? '');
const userId = ref<string>();
const captain = ref(true);
const pending = ref(false);

const items = computed(() =>
  props.without.map((p) => ({ label: p.name, description: p.email, value: p.userId })),
);
const valid = computed(() => name.value.trim().length >= 3 && (props.team || userId.value));

async function onSave() {
  pending.value = true;
  try {
    if (props.team) {
      await adminTeamActions.update(props.eventId, props.team.id, { name: name.value });
    } else {
      await adminTeamActions.create(props.eventId, {
        name: name.value,
        userId: userId.value!,
        captain: captain.value,
      });
    }
    toast.add({
      title: t(props.team ? 'admin.events.teams.renamed' : 'admin.events.teams.created'),
      color: 'success',
      icon: 'i-lucide-circle-check',
    });
    emit('close', true);
  } catch (error) {
    const problem = error instanceof EventError ? error.problem : 'failed';
    toast.add({
      title: t(`admin.events.errors.${problem}`, t('admin.events.errors.failed')),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <UModal :title="t(team ? 'admin.events.teams.renameTitle' : 'admin.events.teams.createTitle')">
    <template #body>
      <form id="team-form" class="flex flex-col gap-4" @submit.prevent="onSave">
        <UFormField :label="t('admin.events.teams.name')">
          <UInput v-model="name" :maxlength="60" class="w-full" autofocus />
        </UFormField>
        <template v-if="!team">
          <UFormField
            :label="t('admin.events.teams.firstPlayer')"
            :hint="t('admin.events.teams.firstPlayerHint')"
          >
            <USelectMenu
              v-model="userId"
              :items="items"
              value-key="value"
              class="w-full"
              :placeholder="t('admin.events.teams.pickPlayer')"
            />
          </UFormField>
          <USwitch
            v-model="captain"
            :label="t('admin.events.teams.makeCaptain')"
            :description="t('admin.events.teams.makeCaptainHint')"
          />
        </template>
      </form>
    </template>
    <template #footer>
      <UButton
        color="neutral"
        variant="outline"
        :label="t('admin.cancel')"
        @click="emit('close', false)"
      />
      <UButton
        type="submit"
        form="team-form"
        :loading="pending"
        :disabled="!valid"
        :label="t('admin.events.teams.save')"
      />
    </template>
  </UModal>
</template>
