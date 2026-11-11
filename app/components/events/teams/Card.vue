<script setup lang="ts">
import { WardenConfirmModal } from '#components';

import type { EventTeamView } from '#shared/schemas/event-teams';

// One team of a tournament: its name, state and players. Its own team gets the controls: the
// captain renames, hands over, removes players and disbands; the others leave.
const props = defineProps<{
  eventId: string;
  team: EventTeamView;
  /** The size asked for. Fills the "players" count. */
  min: number;
  max: number;
  /** Whether the team can be changed at all: the event is open to changes and not paused. */
  editable: boolean;
}>();
const emit = defineEmits<{ changed: [] }>();

const { t } = useI18n();
const toast = useToast();
const overlay = useOverlay();
const confirm = overlay.create(WardenConfirmModal);

const pending = ref(false);
const renaming = ref(false);
const name = ref(props.team.name);

const statusBadge = computed(() => {
  if (props.team.status === 'registered')
    return {
      color: 'success' as const,
      icon: 'i-lucide-circle-check',
      label: t('events.teams.registered'),
    };
  if (props.team.status === 'waitlist')
    return {
      color: 'warning' as const,
      icon: 'i-lucide-hourglass',
      label: t('events.teams.waitlist', { position: props.team.position ?? 1 }),
    };
  const missing = Math.max(props.min - props.team.players, 1);
  return {
    color: 'neutral' as const,
    icon: 'i-lucide-users',
    label: t('events.teams.incomplete', { missing }, missing),
  };
});

async function run(action: () => Promise<unknown>, success: string) {
  pending.value = true;
  try {
    await action();
    toast.add({ title: success, color: 'success', icon: 'i-lucide-circle-check' });
  } catch (error) {
    const problem = error instanceof EventError ? error.problem : 'failed';
    toast.add({
      title: t(`events.errors.${problem}`, t('events.errors.failed')),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  } finally {
    pending.value = false;
    emit('changed');
  }
}

async function onRename() {
  await run(
    () => eventTeamActions.update(props.eventId, props.team.id, { name: name.value }),
    t('events.teams.renamed'),
  );
  renaming.value = false;
}

async function ask(title: string, description: string, confirmLabel: string) {
  const confirmed: unknown = await confirm.open({
    title,
    description,
    confirmLabel,
    cancelLabel: t('events.teams.keep'),
    destructive: true,
  }).result;
  return confirmed === true;
}

async function onLeave() {
  if (await ask(t('events.teams.leaveTitle'), t('events.teams.leaveBody'), t('events.teams.leave')))
    await run(() => eventTeamActions.leave(props.eventId, props.team.id), t('events.teams.left'));
}

async function onDisband() {
  if (
    await ask(
      t('events.teams.disbandTitle'),
      t('events.teams.disbandBody'),
      t('events.teams.disband'),
    )
  )
    await run(
      () => eventTeamActions.disband(props.eventId, props.team.id),
      t('events.teams.disbanded'),
    );
}

async function onKick(userId: string, who: string) {
  if (
    await ask(
      t('events.teams.kickTitle', { name: who }),
      t('events.teams.kickBody'),
      t('events.teams.kick'),
    )
  )
    await run(
      () => eventTeamActions.kick(props.eventId, props.team.id, userId),
      t('events.teams.kicked', { name: who }),
    );
}

async function onTransfer(userId: string, who: string) {
  await run(
    () => eventTeamActions.transfer(props.eventId, props.team.id, userId),
    t('events.teams.handedOver', { name: who }),
  );
}
</script>

<template>
  <article
    class="flex flex-col gap-3 rounded-lg p-4"
    :class="team.mine ? 'bg-accented' : 'bg-elevated'"
  >
    <header class="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <div class="flex min-w-0 flex-wrap items-center gap-2">
        <h3 class="truncate text-lg font-bold text-highlighted">{{ team.name }}</h3>
        <UBadge
          v-if="team.mine"
          color="primary"
          variant="subtle"
          :label="t(team.captain ? 'events.teams.youCaptain' : 'events.teams.youMember')"
        />
      </div>
      <div class="flex items-center gap-3">
        <span class="text-sm text-muted tabular-nums">
          {{ t('events.teams.players', { count: team.players, max }) }}
        </span>
        <UBadge
          :color="statusBadge.color"
          variant="subtle"
          :icon="statusBadge.icon"
          :label="statusBadge.label"
        />
      </div>
    </header>

    <ul v-if="team.members" class="flex flex-col gap-2">
      <li v-for="member in team.members" :key="member.userId" class="flex items-center gap-3">
        <UAvatar :src="member.image ?? undefined" :alt="member.name" size="sm" />
        <span class="min-w-0 flex-1 truncate text-default">{{ member.name }}</span>
        <UIcon
          v-if="member.captain"
          name="i-lucide-crown"
          class="size-4 shrink-0 text-muted"
          :aria-label="t('events.teams.captain')"
        />
        <UDropdownMenu
          v-if="team.captain && editable && !member.captain"
          :items="[
            {
              label: t('events.teams.makeCaptain'),
              icon: 'i-lucide-crown',
              onSelect: () => onTransfer(member.userId, member.name),
            },
            {
              label: t('events.teams.kick'),
              icon: 'i-lucide-user-minus',
              color: 'error',
              onSelect: () => onKick(member.userId, member.name),
            },
          ]"
        >
          <UButton
            color="neutral"
            variant="ghost"
            size="xs"
            icon="i-lucide-ellipsis"
            :aria-label="t('events.teams.manage', { name: member.name })"
          />
        </UDropdownMenu>
      </li>
    </ul>

    <form v-if="renaming" class="flex flex-wrap items-end gap-2" @submit.prevent="onRename">
      <UFormField :label="t('events.teams.nameLabel')" class="min-w-0 flex-1">
        <UInput v-model="name" :maxlength="60" class="w-full" />
      </UFormField>
      <UButton type="submit" :loading="pending" :label="t('events.teams.save')" />
      <UButton
        color="neutral"
        variant="ghost"
        :label="t('events.teams.cancel')"
        @click="renaming = false"
      />
    </form>

    <div v-if="team.mine && editable && !renaming" class="flex flex-wrap gap-2">
      <UButton
        v-if="team.captain"
        color="neutral"
        variant="outline"
        icon="i-lucide-pencil"
        :label="t('events.teams.rename')"
        @click="((name = team.name), (renaming = true))"
      />
      <UButton
        v-if="team.captain"
        color="error"
        variant="outline"
        :loading="pending"
        :label="t('events.teams.disband')"
        @click="onDisband"
      />
      <UButton
        color="error"
        variant="outline"
        :loading="pending"
        :label="t('events.teams.leave')"
        @click="onLeave"
      />
    </div>
  </article>
</template>
