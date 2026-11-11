<script setup lang="ts">
import type { EventPlayerOption, EventTeamView } from '#shared/schemas/event-teams';

// The captain's search for players to invite. Results show the school and the email, to tell
// two people with the same name apart; the hint says why someone may be missing.
const props = defineProps<{ eventId: string; team: EventTeamView; max: number }>();
const emit = defineEmits<{ close: [] }>();

const { t } = useI18n();
const toast = useToast();

const query = ref('');
const results = ref<EventPlayerOption[]>([]);
const pending = ref<string | null>(null);
const searched = ref(false);

let timer: ReturnType<typeof setTimeout> | undefined;
watch(query, (q) => {
  clearTimeout(timer);
  searched.value = false;
  if (q.trim().length < 3) {
    results.value = [];
    return;
  }
  timer = setTimeout(() => {
    eventInviteActions
      .search(props.eventId, q.trim(), props.team.id)
      .then((found) => {
        results.value = found.items;
        searched.value = true;
      })
      .catch(() => {
        results.value = [];
      });
  }, 300);
});
onBeforeUnmount(() => {
  clearTimeout(timer);
});

async function onInvite(player: EventPlayerOption) {
  pending.value = player.userId;
  try {
    await eventInviteActions.invite(props.eventId, props.team.id, player.userId);
    player.invited = true;
    toast.add({
      title: t('events.teams.inviteSent', { name: player.name }),
      color: 'success',
      icon: 'i-lucide-circle-check',
    });
  } catch (error) {
    const problem = error instanceof EventError ? error.problem : 'failed';
    toast.add({
      title: t(`events.errors.${problem}`, t('events.errors.failed')),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  } finally {
    pending.value = null;
  }
}
</script>

<template>
  <UModal
    :title="t('events.teams.inviteTitle', { team: team.name })"
    :description="t('events.teams.inviteHint')"
  >
    <template #body>
      <div class="flex flex-col gap-4">
        <UInput
          v-model="query"
          icon="i-lucide-search"
          :placeholder="t('events.teams.invitePlaceholder')"
          class="w-full"
          autofocus
        />
        <ul v-if="results.length" class="flex flex-col gap-3">
          <li v-for="player in results" :key="player.userId" class="flex items-center gap-3">
            <UAvatar :src="player.image ?? undefined" :alt="player.name" />
            <div class="min-w-0 flex-1">
              <p class="truncate font-medium text-highlighted">{{ player.name }}</p>
              <p class="truncate text-sm text-muted">
                {{ [player.school, player.email].filter(Boolean).join(', ') }}
              </p>
            </div>
            <UBadge
              v-if="player.invited"
              color="neutral"
              variant="soft"
              :label="t('events.teams.alreadyInvited')"
            />
            <UButton
              v-else
              size="sm"
              :loading="pending === player.userId"
              :label="t('events.teams.inviteAction')"
              @click="onInvite(player)"
            />
          </li>
        </ul>
        <p v-else-if="searched" class="text-muted">{{ t('events.teams.inviteNone') }}</p>
      </div>
    </template>
    <template #footer>
      <UButton
        color="neutral"
        variant="outline"
        :label="t('events.teams.done')"
        @click="emit('close')"
      />
    </template>
  </UModal>
</template>
