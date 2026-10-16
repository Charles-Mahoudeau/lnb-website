<script setup lang="ts">
import { WardenConfirmModal } from '#components';

import type { EventView } from '#shared/schemas/events';

// The side panel of an event page: the places taken, the caller's registration and what they
// can do about it, then who's going. Emits `changed` after registering or cancelling, so the
// page reloads the event.
const props = defineProps<{ event: EventView }>();
const emit = defineEmits<{ changed: [] }>();

const { t, locale } = useI18n();
const route = useRoute();
const toast = useToast();
const overlay = useOverlay();
const { user } = useAuth();
const { isEnabled } = useFlags();

const state = computed(() => props.event.registration.state);
const me = computed(() => props.event.registration.me);
const phase = computed(() => eventPhase(props.event));
const paused = computed(() => !isEnabled('events.registration'));
const canChange = computed(() => phase.value === 'upcoming' && !props.event.cancelled);
const pending = ref(false);

const signInLink = computed(() => ({ path: '/sign-in', query: { redirect: route.fullPath } }));
const schools = computed(() => eventSchools(props.event.schools, locale.value));

function when(iso: string) {
  return formatEventDate(iso, locale.value, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
}

const attendees = computed<EventAttendees | null>(() =>
  props.event.attendees
    ? {
        registered: props.event.registered,
        capacity: props.event.capacity ?? undefined,
        people: props.event.attendees,
      }
    : null,
);

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

// Registers, or joins the waitlist: the toast says which, and where they stand.
async function onJoin() {
  pending.value = true;
  try {
    const result = await eventRegistrationActions.register(props.event.id);
    toast.add({
      title:
        result.status === 'waitlist'
          ? t('events.joinedWaitlist', { position: result.position ?? 1 })
          : t('events.registered'),
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

const confirm = overlay.create(WardenConfirmModal);

async function onCancel() {
  const waitlist = me.value?.status === 'waitlist';
  const confirmed: unknown = await confirm.open({
    title: t(waitlist ? 'events.leaveWaitlistTitle' : 'events.cancelTitle'),
    description: t(waitlist ? 'events.leaveWaitlistBody' : 'events.cancelBody'),
    confirmLabel: t(waitlist ? 'events.leaveWaitlist' : 'events.cancelRegistration'),
    cancelLabel: t('events.keepPlace'),
    destructive: true,
  }).result;
  if (confirmed !== true) return;
  await run(
    () => eventRegistrationActions.unregister(props.event.id),
    t(waitlist ? 'events.leftWaitlist' : 'events.unregistered'),
  );
}
</script>

<template>
  <section class="flex flex-col gap-4 rounded-lg bg-elevated p-5">
    <template v-if="event.cancelled">
      <UBadge
        class="self-start"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-x"
        :label="t('events.cancelled')"
      />
      <p class="text-muted">{{ t('events.cancelledBody') }}</p>
    </template>

    <template v-else>
      <!-- Places -->
      <template v-if="phase === 'past'">
        <UBadge
          class="self-start"
          color="neutral"
          variant="soft"
          icon="i-lucide-history"
          :label="t('events.over')"
        />
        <p class="text-muted tabular-nums">
          {{ t('events.went', { count: event.registered }, event.registered) }}
        </p>
      </template>
      <div v-else-if="event.capacity" class="flex flex-col gap-2">
        <div class="flex items-center justify-between gap-3 tabular-nums">
          <span class="text-muted">
            <span class="font-semibold text-highlighted">{{ event.registered }}</span>
            {{ t('events.ofPlaces', { capacity: event.capacity }) }}
          </span>
          <UBadge
            v-if="event.registered >= event.capacity"
            color="warning"
            variant="subtle"
            :label="t('events.full')"
          />
          <span v-else class="text-muted">
            {{ t('events.left', { count: event.capacity - event.registered }) }}
          </span>
        </div>
        <UProgress
          :model-value="Math.min(event.registered / event.capacity, 1) * 100"
          color="neutral"
          size="sm"
        />
      </div>
      <p v-else class="text-muted tabular-nums">
        {{ t('events.attendees.registered', { count: event.registered }, event.registered) }}
      </p>

      <!-- The caller's registration, whatever the state of the event -->
      <template v-if="me">
        <UBadge
          v-if="me.status === 'registered'"
          class="self-start"
          color="success"
          variant="subtle"
          icon="i-lucide-circle-check"
          :label="t(phase === 'past' ? 'events.youWent' : 'events.youreRegistered')"
        />
        <template v-else>
          <UBadge
            class="self-start"
            color="warning"
            variant="subtle"
            icon="i-lucide-hourglass"
            :label="t('events.waitlistPosition', { position: me.position ?? 1 })"
          />
          <p v-if="canChange" class="text-sm text-muted">{{ t('events.waitlistHint') }}</p>
        </template>
        <UButton
          v-if="canChange && !paused"
          color="error"
          variant="outline"
          :loading="pending"
          :label="
            t(me.status === 'waitlist' ? 'events.leaveWaitlist' : 'events.cancelRegistration')
          "
          class="self-start"
          @click="onCancel"
        />
      </template>

      <!-- Not registered -->
      <template v-else-if="phase === 'ongoing'">
        <UBadge
          class="self-start"
          color="success"
          variant="subtle"
          icon="i-lucide-radio"
          :label="t('events.happeningNow')"
        />
      </template>
      <template v-else-if="phase === 'upcoming'">
        <UBadge
          v-if="paused"
          class="self-start"
          color="neutral"
          variant="soft"
          icon="i-lucide-pause"
          :label="t('events.paused')"
        />
        <UBadge
          v-else-if="state === 'notYet' && event.registrationOpensAt"
          class="self-start"
          color="neutral"
          variant="soft"
          icon="i-lucide-clock"
          :label="t('events.opensOn', { date: when(event.registrationOpensAt) })"
        />
        <UBadge
          v-else-if="state === 'closed' && event.registrationClosesAt"
          class="self-start"
          color="neutral"
          variant="soft"
          icon="i-lucide-lock"
          :label="t('events.closedOn', { date: when(event.registrationClosesAt) })"
        />
        <template v-else-if="state === 'wrongSchool'">
          <UBadge
            class="self-start"
            color="neutral"
            variant="soft"
            icon="i-lucide-graduation-cap"
            :label="t('events.openTo', { schools })"
          />
          <p class="text-sm text-muted">{{ t('events.wrongSchoolHint') }}</p>
        </template>
        <template v-else-if="!user">
          <UButton
            :to="signInLink"
            icon="i-lucide-log-in"
            :label="t('events.signInToRegister')"
            block
          />
          <p class="text-sm text-muted">{{ t('events.signInHint', { schools }) }}</p>
        </template>
        <template v-else-if="state === 'full'">
          <UButton :loading="pending" :label="t('events.joinWaitlist')" block @click="onJoin" />
          <p class="text-sm text-muted">
            {{
              t(
                'events.waitlistCount',
                { count: event.registration.waitlist },
                event.registration.waitlist,
              )
            }}
          </p>
        </template>
        <template v-else>
          <UButton :loading="pending" :label="t('events.register')" block @click="onJoin" />
          <p class="text-sm text-muted">{{ t('events.canCancel') }}</p>
        </template>
      </template>

      <!-- Who's going: names for members only -->
      <EventsAttendees v-if="attendees && attendees.people.length" :attendees="attendees" />
      <p v-else-if="!user && event.registered > 0" class="text-sm text-muted">
        {{ t('events.signInToSeeWho') }}
      </p>
    </template>
  </section>
</template>
