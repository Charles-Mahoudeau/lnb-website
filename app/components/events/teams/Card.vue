<script setup lang="ts">
import { EventsTeamsInviteModal, WardenConfirmModal } from '#components';

import type { EventTeamsView, EventTeamView } from '#shared/schemas/event-teams';

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
  /** Whether players can still join: the roster is open and nothing is paused. */
  open: boolean;
  /** The caller's own invitations and requests. Null when signed out. */
  me: EventTeamsView['me'];
}>();
const emit = defineEmits<{ changed: [] }>();

const { t } = useI18n();
const toast = useToast();
const overlay = useOverlay();
const confirm = overlay.create(WardenConfirmModal);
const inviteModal = overlay.create(EventsTeamsInviteModal);

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

const requested = computed(() => props.me?.requested.find((r) => r.teamId === props.team.id));
const hasRoom = computed(() => props.team.players < props.max);
// A player without a team can ask a team that takes requests and has room.
const canAsk = computed(
  () =>
    props.open &&
    props.me?.registered === true &&
    props.me.teamIds.length === 0 &&
    props.team.acceptsRequests &&
    hasRoom.value,
);
const canInvite = computed(
  () =>
    props.open &&
    props.team.captain &&
    props.team.players + (props.team.invited?.length ?? 0) < props.max,
);

async function onAsk() {
  await run(
    () => eventInviteActions.request(props.eventId, props.team.id),
    t('events.teams.asked'),
  );
}
async function onCancelRequest(id: number) {
  await run(() => eventInviteActions.cancel(props.eventId, id), t('events.teams.withdrawn'));
}
async function onWithdrawInvite(id: number) {
  await run(() => eventInviteActions.cancel(props.eventId, id), t('events.teams.withdrawn'));
}
async function onAnswer(id: number, accept: boolean, who: string) {
  await run(
    () => eventInviteActions.answer(props.eventId, id, accept),
    t(accept ? 'events.teams.accepted' : 'events.teams.declined', { name: who }),
  );
}
async function onToggleRequests(value: boolean) {
  await run(
    () => eventTeamActions.update(props.eventId, props.team.id, { acceptsRequests: value }),
    t(value ? 'events.teams.requestsOn' : 'events.teams.requestsOff'),
  );
}
async function onInvite() {
  await inviteModal.open({ eventId: props.eventId, team: props.team, max: props.max }).result;
  emit('changed');
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
        <UserAvatar :user-id="member.userId" :name="member.name" :image="member.image" size="sm" />
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

    <!-- The captain's side: who was invited, who asks, and the switch for requests -->
    <div
      v-if="team.captain && (team.invited?.length || team.requests?.length)"
      class="flex flex-col gap-3"
    >
      <ul v-if="team.requests?.length" class="flex flex-col gap-2">
        <li v-for="r in team.requests" :key="r.id" class="flex flex-wrap items-center gap-2">
          <UserAvatar :user-id="r.userId" :name="r.name" :image="r.image" size="sm" />
          <span class="min-w-0 flex-1 truncate">
            {{ r.name }}
            <span class="text-sm text-muted">{{ t('events.teams.wantsToJoin') }}</span>
          </span>
          <template v-if="open">
            <UButton
              size="xs"
              :loading="pending"
              :label="t('events.teams.accept')"
              @click="onAnswer(r.id, true, r.name)"
            />
            <UButton
              size="xs"
              color="neutral"
              variant="outline"
              :loading="pending"
              :label="t('events.teams.decline')"
              @click="onAnswer(r.id, false, r.name)"
            />
          </template>
        </li>
      </ul>
      <ul v-if="team.invited?.length" class="flex flex-col gap-2">
        <li v-for="i in team.invited" :key="i.id" class="flex items-center gap-2">
          <UserAvatar :user-id="i.userId" :name="i.name" :image="i.image" size="sm" />
          <span class="min-w-0 flex-1 truncate">
            {{ i.name }}
            <span class="text-sm text-muted">{{ t('events.teams.invitedWaiting') }}</span>
          </span>
          <UButton
            v-if="editable"
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-lucide-x"
            :aria-label="t('events.teams.withdraw', { name: i.name })"
            @click="onWithdrawInvite(i.id)"
          />
        </li>
      </ul>
    </div>

    <div v-if="team.captain && editable" class="flex flex-wrap items-center gap-x-4 gap-y-2">
      <UButton
        v-if="canInvite"
        icon="i-lucide-user-plus"
        :label="t('events.teams.invite')"
        @click="onInvite"
      />
      <USwitch
        :model-value="team.acceptsRequests"
        :label="t('events.teams.acceptRequests')"
        @update:model-value="onToggleRequests"
      />
    </div>

    <div v-if="requested" class="flex flex-wrap items-center gap-3">
      <UBadge
        color="neutral"
        variant="soft"
        icon="i-lucide-clock"
        :label="t('events.teams.requested')"
      />
      <UButton
        color="neutral"
        variant="ghost"
        size="xs"
        :label="t('events.teams.withdrawRequest')"
        @click="onCancelRequest(requested.id)"
      />
    </div>
    <UButton
      v-else-if="canAsk"
      class="self-start"
      color="neutral"
      variant="outline"
      icon="i-lucide-hand"
      :loading="pending"
      :label="t('events.teams.ask')"
      @click="onAsk"
    />

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
