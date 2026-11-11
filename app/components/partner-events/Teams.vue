<script setup lang="ts">
import type {
  PartnerGameKey,
  PartnerGameView,
  PartnerTeamRole,
  PartnerTeamView,
} from '#shared/schemas/partner-events';

// The teams of a partner event, one confirmed game at a time: the teams, the students looking for
// one, the invitations the caller received, and the dialogs to create, edit and join. Visitors only
// see counts. See docs/partner-events.md.

const props = defineProps<{
  slug: string;
  /** Games that take teams. */
  games: PartnerGameView[];
  signedIn: boolean;
  /** Changes when the student's interest does, so the panel reloads who they are. */
  interestVersion: string;
  teamsOpen: boolean;
  signInLink: { path: string; query: { redirect: string } };
}>();
const emit = defineEmits<{ changed: [] }>();

const { t } = useI18n();
const toast = useToast();

const selected = ref<PartnerGameKey>(props.games[0]?.key ?? 'lol');
const game = computed(() => props.games.find((g) => g.key === selected.value) ?? props.games[0]!);
const tabs = computed(() =>
  props.games.map((g) => ({
    label: t(`partnerEvents.games.${partnerGameMessageKey(g.key)}`),
    value: g.key,
  })),
);

const { data, refresh } = usePartnerTeams(props.slug, selected);

watch(
  () => props.interestVersion,
  () => refresh(),
);

const busy = ref(false);
type Dialog =
  | { kind: 'create' }
  | { kind: 'edit'; team: PartnerTeamView }
  | { kind: 'join'; teamId: string }
  | { kind: 'accept'; inviteId: number };
const dialog = ref<Dialog | null>(null);
const dialogOpen = computed({
  get: () => dialog.value !== null,
  set: (open) => {
    if (!open) dialog.value = null;
  },
});
const dialogMode = computed(() => {
  const kind = dialog.value?.kind;
  return kind === 'create' ? 'create' : kind === 'edit' ? 'edit' : 'birth';
});

async function run(action: () => Promise<void>, success?: string): Promise<boolean> {
  busy.value = true;
  try {
    await action();
    await refresh();
    emit('changed');
    if (success) toast.add({ title: success, color: 'success', icon: 'i-lucide-circle-check' });
    return true;
  } catch (cause) {
    const problem = cause instanceof PartnerEventError ? cause.problem : 'failed';
    toast.add({
      title: t(`partnerEvents.problems.${problem}`),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
    return false;
  } finally {
    busy.value = false;
  }
}

const call = (method: 'POST' | 'PATCH' | 'DELETE', path: string, body?: Record<string, unknown>) =>
  partnerTeamCall(props.slug, selected.value, method, path, body);

async function submitDialog(values: { name: string; abbreviation: string; birthDate: string }) {
  const current = dialog.value;
  if (!current) return;
  let done = false;
  if (current.kind === 'create') {
    done = await run(() => call('POST', '/teams', values), t('partnerEvents.teams.toasts.created'));
  } else if (current.kind === 'edit') {
    done = await run(
      () =>
        call('PATCH', `/teams/${current.team.id}`, {
          name: values.name,
          abbreviation: values.abbreviation,
        }),
      t('partnerEvents.teams.toasts.edited'),
    );
  } else if (current.kind === 'join') {
    done = await run(
      () => call('POST', `/teams/${current.teamId}/requests`, { birthDate: values.birthDate }),
      t('partnerEvents.teams.toasts.requested'),
    );
  } else {
    done = await run(
      () =>
        call('POST', `/invites/${String(current.inviteId)}`, {
          accept: true,
          birthDate: values.birthDate,
        }),
      t('partnerEvents.teams.toasts.joined'),
    );
  }
  if (done) dialog.value = null;
}

const me = computed(() => data.value?.me ?? null);
const myCaptainTeam = computed(() => data.value?.teams.find((team) => team.captain) ?? null);
const invitedIds = computed(
  () => new Set(myCaptainTeam.value?.invited?.map((person) => person.userId) ?? []),
);
const canInvite = computed(
  () =>
    props.teamsOpen &&
    myCaptainTeam.value !== null &&
    myCaptainTeam.value.starters +
      myCaptainTeam.value.substitutes +
      (myCaptainTeam.value.invited?.length ?? 0) <
      game.value.starters + game.value.substitutes,
);
const canCreate = computed(
  () => props.teamsOpen && me.value !== null && me.value.interested && me.value.teamId === null,
);

const toggleRequests = (team: PartnerTeamView) =>
  run(() => call('PATCH', `/teams/${team.id}`, { acceptsRequests: !team.acceptsRequests }));
const setRole = (team: PartnerTeamView, userId: string, role: PartnerTeamRole) =>
  run(() => call('PATCH', `/teams/${team.id}/members/${userId}`, { role }));
</script>

<template>
  <section class="flex flex-col gap-6">
    <div class="flex flex-col gap-2">
      <h2 class="text-2xl font-bold text-highlighted">{{ t('partnerEvents.teams.title') }}</h2>
      <p class="max-w-3xl text-muted">{{ t('partnerEvents.teams.lede') }}</p>
    </div>

    <UTabs v-model="selected" :items="tabs" :content="false" class="w-full" />

    <p v-if="!teamsOpen" class="flex items-start gap-3 rounded-lg bg-secondary/15 p-4">
      <UIcon name="i-lucide-info" class="mt-0.5 size-5 shrink-0 text-secondary" />
      <span>{{ t('partnerEvents.teams.paused') }}</span>
    </p>

    <div v-if="!signedIn" class="flex flex-col items-start gap-4 rounded-lg bg-elevated p-6">
      <p class="text-muted">
        {{
          t('partnerEvents.teams.visitor', {
            teams: game.teams,
            looking: data?.looking.count ?? 0,
          })
        }}
      </p>
      <UButton :to="signInLink" :label="t('partnerEvents.signIn.button')" />
    </div>

    <template v-if="signedIn && data">
      <p v-if="me && !me.interested" class="flex items-start gap-3 rounded-lg bg-secondary/15 p-4">
        <UIcon name="i-lucide-info" class="mt-0.5 size-5 shrink-0 text-secondary" />
        <span>{{ t('partnerEvents.teams.needInterest') }}</span>
      </p>

      <ul v-if="me?.invitations.length" class="flex flex-col gap-3">
        <li
          v-for="invitation in me.invitations"
          :key="invitation.id"
          class="flex flex-wrap items-center gap-3 rounded-lg bg-elevated p-4"
        >
          <p class="min-w-0 flex-1">
            {{
              t('partnerEvents.teams.invitation', {
                from: invitation.from ?? t('partnerEvents.teams.someone'),
                team: invitation.teamName,
              })
            }}
          </p>
          <UButton
            size="sm"
            :label="t('partnerEvents.teams.accept')"
            :disabled="busy || me.teamId !== null"
            @click="dialog = { kind: 'accept', inviteId: invitation.id }"
          />
          <UButton
            size="sm"
            color="neutral"
            variant="outline"
            :label="t('partnerEvents.teams.decline')"
            :disabled="busy"
            @click="run(() => call('POST', `/invites/${invitation.id}`, { accept: false }))"
          />
        </li>
      </ul>

      <div v-if="canCreate">
        <UButton
          :label="t('partnerEvents.teams.create')"
          icon="i-lucide-plus"
          :disabled="busy"
          @click="dialog = { kind: 'create' }"
        />
      </div>

      <div v-if="data.teams.length && me" class="grid gap-4 lg:grid-cols-2">
        <PartnerEventsTeamCard
          v-for="team in data.teams"
          :key="team.id"
          :team="team"
          :game="game"
          :me="me"
          :open="teamsOpen"
          :busy="busy"
          @join="dialog = { kind: 'join', teamId: team.id }"
          @withdraw-request="(id) => run(() => call('DELETE', `/invites/${id}`))"
          @leave="
            run(() => call('POST', `/teams/${team.id}/leave`), t('partnerEvents.teams.toasts.left'))
          "
          @disband="
            run(
              () => call('DELETE', `/teams/${team.id}`),
              t('partnerEvents.teams.toasts.disbanded'),
            )
          "
          @edit="dialog = { kind: 'edit', team }"
          @kick="(userId) => run(() => call('DELETE', `/teams/${team.id}/members/${userId}`))"
          @role="(userId, role) => setRole(team, userId, role)"
          @captain="
            (userId) =>
              run(() => call('PATCH', `/teams/${team.id}/members/${userId}`, { captain: true }))
          "
          @answer="(id, accept) => run(() => call('POST', `/invites/${id}`, { accept }))"
          @cancel-invite="(id) => run(() => call('DELETE', `/invites/${id}`))"
          @toggle-requests="toggleRequests(team)"
        />
      </div>
      <p v-else class="text-muted">{{ t('partnerEvents.teams.none') }}</p>

      <section class="flex flex-col gap-4">
        <h3 class="text-xl text-highlighted">
          {{ t('partnerEvents.teams.looking', { count: data.looking.count }) }}
        </h3>
        <ul v-if="data.looking.players?.length" class="grid gap-3 sm:grid-cols-2">
          <li
            v-for="player in data.looking.players"
            :key="player.userId"
            class="flex items-center gap-3 rounded-lg bg-elevated p-3"
          >
            <UAvatar :src="player.image ?? undefined" :alt="player.name" size="sm" />
            <div class="min-w-0 flex-1">
              <p class="truncate font-medium text-highlighted">{{ player.name }}</p>
              <p class="truncate text-sm text-muted">
                {{ [player.inGameName, player.rank, player.school].filter(Boolean).join(', ') }}
              </p>
            </div>
            <UBadge
              v-if="invitedIds.has(player.userId)"
              color="neutral"
              variant="soft"
              :label="t('partnerEvents.teams.invitedBadge')"
            />
            <UButton
              v-else-if="myCaptainTeam"
              size="sm"
              color="neutral"
              variant="outline"
              :label="t('partnerEvents.teams.invite')"
              :disabled="busy || !canInvite"
              @click="
                run(
                  () =>
                    call('POST', `/teams/${myCaptainTeam!.id}/invites`, { userId: player.userId }),
                  t('partnerEvents.teams.toasts.invited', { name: player.name }),
                )
              "
            />
          </li>
        </ul>
        <p v-else class="text-muted">{{ t('partnerEvents.teams.noOneLooking') }}</p>
      </section>
    </template>

    <PartnerEventsTeamDialog
      v-model:open="dialogOpen"
      :mode="dialogMode"
      :pending="busy"
      :name="dialog?.kind === 'edit' ? dialog.team.name : undefined"
      :abbreviation="dialog?.kind === 'edit' ? dialog.team.abbreviation : undefined"
      @submit="submitDialog"
    />
  </section>
</template>
