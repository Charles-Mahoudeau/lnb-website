<script setup lang="ts">
import { EventsAdminAddToTeamModal, EventsAdminTeamModal, WardenConfirmModal } from '#components';

import type { AdminTeamsView } from '#shared/schemas/event-teams';
import type { EventAdminView } from '#shared/schemas/events';

// The teams of a tournament, for managers: every team with its players and emails, the registered
// players in no team beside them, and the changes managers can make that players can't (see
// docs/tournaments.md). Each change is in the audit log.
const props = defineProps<{ event: EventAdminView }>();
const emit = defineEmits<{ changed: [] }>();

const { t } = useI18n();
const toast = useToast();
const overlay = useOverlay();

const { data, refresh } = await useAdminTeams(props.event.id);

const teamModal = overlay.create(EventsAdminTeamModal);
const addModal = overlay.create(EventsAdminAddToTeamModal);
const confirmModal = overlay.create(WardenConfirmModal);

async function changed() {
  await refresh();
  emit('changed');
}

async function run(action: () => Promise<unknown>, success: string) {
  try {
    await action();
    toast.add({ title: success, color: 'success', icon: 'i-lucide-circle-check' });
  } catch (error) {
    const problem = error instanceof EventError ? error.problem : 'failed';
    toast.add({
      title: t(`admin.events.errors.${problem}`, t('admin.events.errors.failed')),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  }
  await changed();
}

async function ask(title: string, description: string, confirmLabel: string) {
  const confirmed: unknown = await confirmModal.open({
    title,
    description,
    confirmLabel,
    cancelLabel: t('admin.cancel'),
    destructive: true,
  }).result;
  return confirmed === true;
}

async function onCreate() {
  if (!data.value) return;
  const saved: unknown = await teamModal.open({
    eventId: props.event.id,
    without: data.value.without,
  }).result;
  if (saved === true) await changed();
}

async function onRename(team: AdminTeamsView['teams'][number]) {
  const saved: unknown = await teamModal.open({
    eventId: props.event.id,
    without: [],
    team: { id: team.id, name: team.name },
  }).result;
  if (saved === true) await changed();
}

async function onAddTo(player: { userId: string; name: string }) {
  if (!data.value) return;
  const added: unknown = await addModal.open({
    eventId: props.event.id,
    player,
    teams: data.value.teams,
    max: data.value.max,
  }).result;
  if (added === true) await changed();
}

async function onDelete(team: AdminTeamsView['teams'][number]) {
  if (
    await ask(
      t('admin.events.teams.deleteTitle', { name: team.name }),
      t('admin.events.teams.deleteBody'),
      t('admin.events.teams.delete'),
    )
  )
    await run(
      () => adminTeamActions.remove(props.event.id, team.id),
      t('admin.events.teams.deleted'),
    );
}

async function onRemovePlayer(team: AdminTeamsView['teams'][number], userId: string, name: string) {
  if (
    await ask(
      t('admin.events.teams.removeTitle', { name }),
      t('admin.events.teams.removeBody'),
      t('admin.events.teams.remove'),
    )
  )
    await run(
      () => adminTeamActions.removeMember(props.event.id, team.id, userId),
      t('admin.events.teams.removed'),
    );
}

const statusColor = { registered: 'success', waitlist: 'warning', incomplete: 'neutral' } as const;
const readOnly = computed(() => props.event.cancelledAt !== null);
</script>

<template>
  <div v-if="data" class="flex flex-col gap-6">
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div
        v-for="tile in ['registered', 'waitlist', 'incomplete', 'without'] as const"
        :key="tile"
        class="rounded-lg bg-elevated p-4"
      >
        <p class="text-2xl font-bold text-highlighted tabular-nums">{{ data.counts[tile] }}</p>
        <p class="text-sm text-muted">{{ t(`admin.events.teams.tiles.${tile}`) }}</p>
      </div>
    </div>

    <div class="flex flex-wrap items-center justify-between gap-3">
      <p class="text-muted tabular-nums">
        {{ t('admin.events.teams.size', { min: data.min, max: data.max }) }}
        <template v-if="data.capacity"
          >, {{ t('admin.events.teams.capacity', { count: data.capacity }) }}</template
        >
      </p>
      <div class="flex flex-wrap gap-2">
        <UButton
          v-if="!readOnly"
          size="md"
          color="neutral"
          variant="soft"
          icon="i-lucide-plus"
          :label="t('admin.events.teams.create')"
          :disabled="!data.without.length"
          @click="onCreate"
        />
        <UButton
          size="md"
          color="neutral"
          variant="ghost"
          icon="i-lucide-download"
          :to="`/api/admin/events/${event.id}/registrations.csv`"
          external
          :label="t('admin.events.registrations.export')"
        />
      </div>
    </div>

    <div class="grid items-start gap-6 lg:grid-cols-12">
      <section class="flex flex-col gap-3 lg:col-span-8">
        <p v-if="!data.teams.length" class="rounded-lg bg-elevated p-4 text-muted">
          {{ t('admin.events.teams.none') }}
        </p>
        <article
          v-for="team in data.teams"
          :key="team.id"
          class="flex flex-col gap-3 rounded-lg bg-elevated p-4"
        >
          <header class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex min-w-0 flex-wrap items-center gap-2">
              <h3 class="truncate text-lg font-bold text-highlighted">{{ team.name }}</h3>
              <UBadge
                :color="statusColor[team.status]"
                variant="subtle"
                :label="
                  t(`admin.events.teams.status.${team.status}`, { position: team.position ?? 0 })
                "
              />
              <UBadge
                v-if="team.forced"
                color="warning"
                variant="subtle"
                icon="i-lucide-hand"
                :label="t('admin.events.teams.forced')"
              />
              <span class="text-sm text-muted tabular-nums">{{
                t('admin.events.teams.players', { count: team.members.length, max: data.max })
              }}</span>
              <span v-if="team.pendingInvites" class="text-sm text-muted">{{
                t('admin.events.teams.pending', { count: team.pendingInvites })
              }}</span>
            </div>
            <UDropdownMenu
              v-if="!readOnly"
              :items="[
                [
                  {
                    label: t('admin.events.teams.rename'),
                    icon: 'i-lucide-pencil',
                    onSelect: () => void onRename(team),
                  },
                  {
                    label: t(
                      team.forced ? 'admin.events.teams.unforce' : 'admin.events.teams.forceValid',
                    ),
                    icon: 'i-lucide-hand',
                    onSelect: () =>
                      void run(
                        () => adminTeamActions.update(event.id, team.id, { forced: !team.forced }),
                        t('admin.events.teams.saved'),
                      ),
                  },
                ],
                [
                  {
                    label: t('admin.events.teams.delete'),
                    icon: 'i-lucide-trash-2',
                    color: 'error',
                    onSelect: () => void onDelete(team),
                  },
                ],
              ]"
              :content="{ align: 'end' }"
            >
              <UButton
                color="neutral"
                variant="ghost"
                icon="i-lucide-ellipsis"
                :aria-label="t('admin.events.more')"
              />
            </UDropdownMenu>
          </header>
          <ul class="flex flex-col gap-2">
            <li v-for="member in team.members" :key="member.userId" class="flex items-center gap-3">
              <UserAvatar
                :user-id="member.userId"
                :name="member.name"
                :image="member.image"
                size="sm"
              />
              <div class="min-w-0 flex-1">
                <p class="truncate">
                  {{ member.name }}
                  <UIcon
                    v-if="member.captain"
                    name="i-lucide-crown"
                    class="ms-1 size-4 align-text-bottom text-muted"
                    :aria-label="t('events.teams.captain')"
                  />
                  <UBadge
                    v-if="member.otherTeams"
                    class="ms-1"
                    color="warning"
                    variant="subtle"
                    :label="t('admin.events.teams.double')"
                  />
                </p>
                <p class="truncate text-sm text-muted">
                  {{ [member.school, member.email].filter(Boolean).join(', ') }}
                </p>
              </div>
              <UDropdownMenu
                v-if="!readOnly"
                :items="[
                  ...(member.captain
                    ? []
                    : [
                        {
                          label: t('events.teams.makeCaptain'),
                          icon: 'i-lucide-crown',
                          onSelect: () =>
                            void run(
                              () =>
                                adminTeamActions.update(event.id, team.id, {
                                  captainUserId: member.userId,
                                }),
                              t('admin.events.teams.saved'),
                            ),
                        },
                      ]),
                  {
                    label: t('admin.events.teams.addToAnother'),
                    icon: 'i-lucide-users',
                    onSelect: () => void onAddTo(member),
                  },
                  {
                    label: t('admin.events.teams.remove'),
                    icon: 'i-lucide-user-minus',
                    color: 'error',
                    onSelect: () => void onRemovePlayer(team, member.userId, member.name),
                  },
                ]"
                :content="{ align: 'end' }"
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
        </article>
      </section>

      <section class="flex flex-col gap-3 rounded-lg bg-accented p-5 lg:col-span-4">
        <h2 class="text-xl font-bold text-highlighted">
          {{ t('admin.events.teams.withoutTitle') }}
        </h2>
        <p v-if="!data.without.length" class="text-sm text-muted">
          {{ t('admin.events.teams.withoutNone') }}
        </p>
        <ul v-else class="flex flex-col gap-3">
          <li v-for="player in data.without" :key="player.userId" class="flex items-center gap-3">
            <UserAvatar
              :user-id="player.userId"
              :name="player.name"
              :image="player.image"
              size="sm"
            />
            <div class="min-w-0 flex-1">
              <p class="truncate">{{ player.name }}</p>
              <p class="truncate text-sm text-muted">
                {{ [player.school, player.email].filter(Boolean).join(', ') }}
              </p>
            </div>
            <UButton
              v-if="!readOnly && data.teams.length"
              size="xs"
              color="neutral"
              variant="outline"
              :label="t('admin.events.teams.addShort')"
              @click="onAddTo(player)"
            />
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
