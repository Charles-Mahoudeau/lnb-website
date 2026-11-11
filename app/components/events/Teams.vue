<script setup lang="ts">
import type { EventTeamsView } from '#shared/schemas/event-teams';
import type { EventView } from '#shared/schemas/events';

// The teams of a tournament, in the main column of the event page: the size asked for, every
// team with its players for signed-in people, and a form to start one. Emits `changed` after any
// action, so the page reloads the teams and the event.
const props = defineProps<{ event: EventView; teams: EventTeamsView }>();
const emit = defineEmits<{ changed: [] }>();

const { t } = useI18n();
const toast = useToast();
const { isEnabled } = useFlags();

const config = computed(() => props.event.teams!);
const size = computed(() =>
  config.value.min === config.value.max
    ? t('events.teamSizeExact', { count: config.value.min })
    : t('events.teamSize', { min: config.value.min, max: config.value.max }),
);

const phase = computed(() => eventPhase(props.event));
const open = computed(() => {
  if (props.event.cancelled || phase.value !== 'upcoming') return false;
  const closes = props.event.registrationClosesAt;
  return !closes || Date.now() < Date.parse(closes);
});
const live = computed(
  () => isEnabled('events.teams') && isEnabled('events.registration') && !props.event.cancelled,
);
// Players can leave, rename and disband until the start.
const editable = computed(() => live.value && phase.value === 'upcoming');
const canCreate = computed(
  () =>
    live.value &&
    open.value &&
    props.teams.me?.registered === true &&
    props.teams.me.teamIds.length === 0,
);

const name = ref('');
const pending = ref(false);

async function onCreate() {
  pending.value = true;
  try {
    await eventTeamActions.create(props.event.id, { name: name.value });
    name.value = '';
    toast.add({
      title: t('events.teams.created'),
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
    pending.value = false;
    emit('changed');
  }
}
</script>

<template>
  <section class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h2 class="text-2xl font-bold text-highlighted">{{ t('events.teams.title') }}</h2>
      <UBadge color="neutral" variant="soft" icon="i-lucide-users" :label="size" />
    </div>

    <form
      v-if="canCreate"
      class="flex flex-wrap items-end gap-2 rounded-lg bg-elevated p-4"
      @submit.prevent="onCreate"
    >
      <UFormField
        :label="t('events.teams.createLabel')"
        :hint="t('events.teams.createHint')"
        class="min-w-0 flex-1"
      >
        <UInput v-model="name" :maxlength="60" class="w-full" />
      </UFormField>
      <UButton
        type="submit"
        :loading="pending"
        :disabled="name.trim().length < 3"
        icon="i-lucide-plus"
        :label="t('events.teams.create')"
      />
    </form>

    <p v-if="!teams.teams.length" class="rounded-lg bg-elevated p-4 text-muted">
      {{ t('events.teams.none') }}
    </p>
    <ul v-else class="flex flex-col gap-3">
      <li v-for="team in teams.teams" :key="team.id">
        <EventsTeamsCard
          :event-id="event.id"
          :team="team"
          :min="config.min"
          :max="config.max"
          :editable="editable"
          @changed="emit('changed')"
        />
      </li>
    </ul>
    <p v-if="!teams.teams.every((team) => team.members)" class="text-sm text-muted">
      {{ t('events.teams.signInToSeeMembers') }}
    </p>
  </section>
</template>
