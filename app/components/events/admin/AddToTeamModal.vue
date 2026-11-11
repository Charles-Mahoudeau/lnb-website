<script setup lang="ts">
import type { AdminTeamsView } from '#shared/schemas/event-teams';

// Puts a registered player in a team. A full team or a second team is a bypass: the dialog says
// so and asks for a tick. Closes with true once added.
const props = defineProps<{
  eventId: string;
  player: { userId: string; name: string };
  teams: AdminTeamsView['teams'];
  max: number;
}>();
const emit = defineEmits<{ close: [added: boolean] }>();

const { t } = useI18n();
const toast = useToast();

const teamId = ref<string>();
const force = ref(false);
const pending = ref(false);

const items = computed(() =>
  props.teams.map((team) => ({
    label: team.name,
    description: t('admin.events.teams.players', { count: team.members.length, max: props.max }),
    value: team.id,
  })),
);
const picked = computed(() => props.teams.find((team) => team.id === teamId.value));
const full = computed(() => (picked.value?.members.length ?? 0) >= props.max);
const double = computed(() =>
  props.teams.some((team) => team.members.some((m) => m.userId === props.player.userId)),
);
const needsForce = computed(() => full.value || double.value);

async function onAdd() {
  if (!teamId.value) return;
  pending.value = true;
  try {
    await adminTeamActions.addMember(props.eventId, teamId.value, {
      userId: props.player.userId,
      force: force.value,
    });
    toast.add({
      title: t('admin.events.teams.added', { name: props.player.name }),
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
  <UModal :title="t('admin.events.teams.addTitle', { name: player.name })">
    <template #body>
      <div class="flex flex-col gap-4">
        <USelectMenu
          v-model="teamId"
          :items="items"
          value-key="value"
          class="w-full"
          :placeholder="t('admin.events.teams.pickTeam')"
        />
        <UAlert
          v-if="double"
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          :description="t('admin.events.teams.doubleWarning')"
        />
        <UAlert
          v-if="full"
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          :description="t('admin.events.teams.fullWarning', { max })"
        />
        <UCheckbox
          v-if="teamId && needsForce"
          v-model="force"
          :label="t('admin.events.teams.force')"
        />
      </div>
    </template>
    <template #footer>
      <UButton
        color="neutral"
        variant="outline"
        :label="t('admin.cancel')"
        @click="emit('close', false)"
      />
      <UButton
        :loading="pending"
        :disabled="!teamId || (needsForce && !force)"
        :label="t('admin.events.teams.add')"
        @click="onAdd"
      />
    </template>
  </UModal>
</template>
