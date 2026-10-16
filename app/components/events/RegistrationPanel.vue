<script setup lang="ts">
import type { EventView } from '#shared/schemas/events';

// The side panel of an event page: how many places are taken, and whether registration is open.
const props = defineProps<{ event: EventView }>();

const { t, locale } = useI18n();

const phase = computed(() => eventPhase(props.event));
const full = computed(
  () => props.event.capacity !== null && props.event.registered >= props.event.capacity,
);

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

/** Why registration is closed, or null while it's open. */
const closedReason = computed(() => {
  const now = Date.now();
  const { registrationOpensAt, registrationClosesAt } = props.event;
  if (props.event.cancelled) return null;
  if (phase.value !== 'upcoming') return null;
  if (registrationOpensAt && now < Date.parse(registrationOpensAt))
    return {
      icon: 'i-lucide-clock',
      text: t('events.opensOn', { date: when(registrationOpensAt) }),
    };
  if (registrationClosesAt && now >= Date.parse(registrationClosesAt))
    return {
      icon: 'i-lucide-lock',
      text: t('events.closedOn', { date: when(registrationClosesAt) }),
    };
  return null;
});
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
    <template v-else-if="phase === 'past'">
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
    <template v-else>
      <div v-if="event.capacity" class="flex flex-col gap-2">
        <div class="flex items-center justify-between gap-3 tabular-nums">
          <span class="text-muted">
            <span class="font-semibold text-highlighted">{{ event.registered }}</span>
            {{ t('events.ofPlaces', { capacity: event.capacity }) }}
          </span>
          <UBadge v-if="full" color="warning" variant="subtle" :label="t('events.full')" />
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
      <UBadge
        v-if="phase === 'ongoing'"
        class="self-start"
        color="success"
        variant="subtle"
        icon="i-lucide-radio"
        :label="t('events.happeningNow')"
      />
      <UBadge
        v-else-if="closedReason"
        class="self-start"
        color="neutral"
        variant="soft"
        :icon="closedReason.icon"
        :label="closedReason.text"
      />
      <slot />
    </template>
  </section>
</template>
