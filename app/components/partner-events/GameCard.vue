<script setup lang="ts">
import type { PartnerGameView } from '#shared/schemas/partner-events';

// A game of a partner event (docs/design.md, Partner event page): its art fills the card under a
// scrim from the bottom, over the name, the status, the counts and the interest toggle. It stays
// dark in both color modes, so it's a `dark` scope. Without art it sits on the tinted fallback.
// The toggle only shows to signed-in students.
const props = defineProps<{
  game: PartnerGameView;
  interested: boolean;
  /** Shows the toggle. */
  canTick: boolean;
  disabled?: boolean;
}>();
defineEmits<{ toggle: [] }>();

const { t } = useI18n();
const study = computed(() => props.game.status === 'study');
const name = computed(() => t(`partnerEvents.games.${partnerGameMessageKey(props.game.key)}`));
</script>

<template>
  <article
    class="dark relative isolate flex min-h-65 flex-col justify-end overflow-hidden rounded-lg bg-banner-fallback"
  >
    <template v-if="game.art">
      <img
        :src="game.art"
        alt=""
        class="absolute inset-0 -z-1 size-full object-cover"
        :class="study && 'opacity-50'"
      />
      <div
        class="absolute inset-0 -z-1 bg-linear-to-t from-banner from-15% via-banner/70 via-55% to-transparent to-95%"
      />
    </template>
    <EventsArtFallback v-else :icon="partnerGameIcon(game.key)" size="lg" class="-z-1" />

    <div class="flex items-end justify-between gap-4 p-5">
      <div class="flex min-w-0 flex-col items-start gap-2">
        <h3 class="text-2xl text-on-banner">{{ name }}</h3>
        <UBadge
          :label="t(study ? 'partnerEvents.status.study' : 'partnerEvents.status.confirmed')"
          color="neutral"
          variant="soft"
          class="bg-accented"
        />
        <p class="text-sm text-on-banner-muted tabular-nums">
          {{ t('partnerEvents.counts', { count: game.interested }, game.interested) }}
        </p>
      </div>
      <UButton
        v-if="canTick"
        size="md"
        color="neutral"
        :variant="interested ? 'solid' : 'soft'"
        :icon="interested ? 'i-lucide-check' : undefined"
        :class="interested ? '' : 'bg-accented'"
        :aria-pressed="interested"
        :disabled="disabled"
        :label="t(interested ? 'partnerEvents.interested' : 'partnerEvents.imInterested')"
        class="shrink-0"
        @click="$emit('toggle')"
      />
    </div>
  </article>
</template>
