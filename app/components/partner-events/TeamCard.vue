<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui';

import type {
  PartnerGameView,
  PartnerGameTeamsView,
  PartnerTeamRole,
  PartnerTeamView,
} from '#shared/schemas/partner-events';

// One team: who is in it, and what the caller can do about it. A visitor sees counts only, a
// student can ask to join, a member can leave, the captain runs the roster. Every action goes up
// to the Teams panel, which calls the API.

const props = defineProps<{
  team: PartnerTeamView;
  game: PartnerGameView;
  me: NonNullable<PartnerGameTeamsView['me']>;
  /** Whether new requests and invitations are allowed (teams not paused). */
  open: boolean;
  busy: boolean;
}>();
const emit = defineEmits<{
  join: [];
  withdrawRequest: [inviteId: number];
  leave: [];
  disband: [];
  edit: [];
  kick: [userId: string];
  role: [userId: string, role: PartnerTeamRole];
  captain: [userId: string];
  answer: [inviteId: number, accept: boolean];
  cancelInvite: [inviteId: number];
  toggleRequests: [];
}>();

const { t } = useI18n();

const myRequest = computed(() => props.me.requested.find((r) => r.teamId === props.team.id));
const canAsk = computed(
  () =>
    props.open &&
    props.me.interested &&
    props.me.teamId === null &&
    props.team.acceptsRequests &&
    !myRequest.value &&
    props.team.starters + props.team.substitutes < props.game.starters + props.game.substitutes &&
    props.me.requestsLeft > 0,
);

function memberMenu(member: PartnerTeamView['members'] extends (infer M)[] | null ? M : never) {
  const items: DropdownMenuItem[] = [];
  if (!member.captain) {
    const to = member.role === 'starter' ? 'substitute' : 'starter';
    items.push({
      label: t(`partnerEvents.teams.makeRole.${to}`),
      icon: 'i-lucide-arrow-left-right',
      onSelect: () => {
        emit('role', member.userId, to);
      },
    });
    items.push({
      label: t('partnerEvents.teams.makeCaptain'),
      icon: 'i-lucide-crown',
      onSelect: () => {
        emit('captain', member.userId);
      },
    });
    items.push({
      label: t('partnerEvents.teams.remove'),
      icon: 'i-lucide-user-x',
      color: 'error',
      onSelect: () => {
        emit('kick', member.userId);
      },
    });
  }
  return items;
}
</script>

<template>
  <article class="flex flex-col gap-4 rounded-lg bg-elevated p-5">
    <header class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0">
        <h3 class="truncate text-lg text-highlighted">
          {{ team.name }}
          <span class="font-sans text-sm font-semibold text-muted">{{ team.abbreviation }}</span>
        </h3>
        <p class="text-sm text-muted">
          {{
            t('partnerEvents.teams.places', {
              starters: team.starters,
              maxStarters: game.starters,
              substitutes: team.substitutes,
              maxSubstitutes: game.substitutes,
            })
          }}
        </p>
      </div>
      <UBadge
        v-if="team.complete"
        color="success"
        variant="soft"
        :label="t('partnerEvents.teams.complete')"
      />
    </header>

    <ul v-if="team.members" class="flex flex-col gap-3">
      <li v-for="member in team.members" :key="member.userId" class="flex items-center gap-3">
        <UAvatar :src="member.image ?? undefined" :alt="member.name" size="sm" />
        <div class="min-w-0 flex-1">
          <p class="truncate font-medium text-highlighted">
            {{ member.name }}
            <UBadge
              v-if="member.captain"
              color="neutral"
              variant="outline"
              size="sm"
              :label="t('partnerEvents.teams.captain')"
            />
          </p>
          <p class="truncate text-sm text-muted">
            {{
              [
                t(`partnerEvents.teams.role.${member.role}`),
                member.inGameName,
                member.rank,
                member.school,
              ]
                .filter(Boolean)
                .join(', ')
            }}
          </p>
        </div>
        <UDropdownMenu v-if="team.captain && !member.captain" :items="memberMenu(member)">
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-ellipsis"
            :aria-label="t('partnerEvents.teams.manage', { name: member.name })"
            :disabled="busy"
          />
        </UDropdownMenu>
      </li>
    </ul>

    <template v-if="team.captain">
      <section
        v-if="team.requests?.length"
        class="flex flex-col gap-3 border-t border-default pt-4"
      >
        <h4 class="font-sans text-sm font-semibold text-highlighted">
          {{ t('partnerEvents.teams.requests') }}
        </h4>
        <ul class="flex flex-col gap-3">
          <li v-for="person in team.requests" :key="person.id" class="flex items-center gap-3">
            <UAvatar :src="person.image ?? undefined" :alt="person.name" size="sm" />
            <p class="min-w-0 flex-1 truncate text-sm">
              {{ [person.name, person.inGameName, person.rank].filter(Boolean).join(', ') }}
            </p>
            <UButton
              size="sm"
              :label="t('partnerEvents.teams.accept')"
              :disabled="busy"
              @click="emit('answer', person.id, true)"
            />
            <UButton
              size="sm"
              color="neutral"
              variant="outline"
              :label="t('partnerEvents.teams.decline')"
              :disabled="busy"
              @click="emit('answer', person.id, false)"
            />
          </li>
        </ul>
      </section>
      <section v-if="team.invited?.length" class="flex flex-col gap-3 border-t border-default pt-4">
        <h4 class="font-sans text-sm font-semibold text-highlighted">
          {{ t('partnerEvents.teams.invited') }}
        </h4>
        <ul class="flex flex-col gap-2">
          <li v-for="person in team.invited" :key="person.id" class="flex items-center gap-3">
            <p class="min-w-0 flex-1 truncate text-sm">{{ person.name }}</p>
            <UButton
              size="sm"
              color="neutral"
              variant="ghost"
              :label="t('partnerEvents.teams.withdraw')"
              :disabled="busy"
              @click="emit('cancelInvite', person.id)"
            />
          </li>
        </ul>
      </section>
    </template>

    <footer class="flex flex-wrap items-center gap-3">
      <UButton
        v-if="canAsk"
        size="sm"
        :label="t('partnerEvents.teams.ask')"
        :disabled="busy"
        @click="emit('join')"
      />
      <template v-if="myRequest">
        <UBadge color="neutral" variant="soft" :label="t('partnerEvents.teams.requestSent')" />
        <UButton
          size="sm"
          color="neutral"
          variant="ghost"
          :label="t('partnerEvents.teams.withdraw')"
          :disabled="busy"
          @click="emit('withdrawRequest', myRequest.id)"
        />
      </template>
      <UButton
        v-if="team.mine && !team.captain"
        size="sm"
        color="neutral"
        variant="outline"
        :label="t('partnerEvents.teams.leave')"
        :disabled="busy"
        @click="emit('leave')"
      />
      <template v-if="team.captain">
        <UButton
          size="sm"
          color="neutral"
          variant="outline"
          :label="t('partnerEvents.teams.edit')"
          :disabled="busy"
          @click="emit('edit')"
        />
        <UButton
          size="sm"
          color="neutral"
          variant="ghost"
          :label="
            t(
              team.acceptsRequests
                ? 'partnerEvents.teams.closeRequests'
                : 'partnerEvents.teams.openRequests',
            )
          "
          :disabled="busy"
          @click="emit('toggleRequests')"
        />
        <UButton
          size="sm"
          color="neutral"
          variant="ghost"
          :label="t('partnerEvents.teams.leave')"
          :disabled="busy"
          @click="emit('leave')"
        />
        <UButton
          size="sm"
          color="neutral"
          variant="ghost"
          :label="t('partnerEvents.teams.disband')"
          :disabled="busy"
          @click="emit('disband')"
        />
      </template>
    </footer>
  </article>
</template>
