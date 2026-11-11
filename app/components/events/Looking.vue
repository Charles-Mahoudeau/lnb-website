<script setup lang="ts">
import type { EventTeamsView } from '#shared/schemas/event-teams';

// The registered players who are in no team yet, in the side column of a tournament's page. The
// names are for signed-in people; a player can hide themselves from the list.
const props = defineProps<{ eventId: string; teams: EventTeamsView; editable: boolean }>();
const emit = defineEmits<{ changed: [] }>();

const { t } = useI18n();
const toast = useToast();

const SHOWN = 6;
const shown = computed(() => props.teams.looking.players?.slice(0, SHOWN) ?? []);
const more = computed(() => props.teams.looking.count - shown.value.length);

// Only someone registered and in no team is on the list, so only they get the switch.
const canHide = computed(
  () => props.editable && props.teams.me?.registered && props.teams.me.teamIds.length === 0,
);
const hidden = computed(() => props.teams.me?.lookingHidden ?? false);

async function onToggle(value: boolean) {
  try {
    await eventTeamActions.setLookingHidden(props.eventId, value);
  } catch (error) {
    const problem = error instanceof EventError ? error.problem : 'failed';
    toast.add({
      title: t(`events.errors.${problem}`, t('events.errors.failed')),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  } finally {
    emit('changed');
  }
}
</script>

<template>
  <section class="flex flex-col gap-3 rounded-lg bg-accented p-5">
    <h2 class="text-xl font-bold text-highlighted">{{ t('events.teams.lookingTitle') }}</h2>
    <p class="text-sm text-muted tabular-nums">
      {{ t('events.teams.lookingCount', { count: teams.looking.count }, teams.looking.count) }}
    </p>
    <ul v-if="shown.length" class="flex flex-col gap-2">
      <li v-for="player in shown" :key="player.userId" class="flex items-center gap-3">
        <UAvatar :src="player.image ?? undefined" :alt="player.name" size="sm" />
        <span class="min-w-0 flex-1 truncate">{{ player.name }}</span>
      </li>
      <li v-if="more > 0" class="text-sm text-muted">
        {{ t('events.teams.lookingMore', { count: more }) }}
      </li>
    </ul>
    <USwitch
      v-if="canHide"
      :model-value="hidden"
      :label="t('events.teams.hideMe')"
      :description="t('events.teams.hideMeHint')"
      @update:model-value="onToggle"
    />
  </section>
</template>
