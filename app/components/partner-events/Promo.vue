<script setup lang="ts">
import { FEATURED_PARTNER_EVENT } from '#shared/schemas/partner-events';

// The promo for the partner event on the home page (`card`) and the events list (`banner`),
// shown while the event is open. See docs/partner-events.md.
defineProps<{ variant: 'card' | 'banner' }>();

const { t, locale } = useI18n();
const { isEnabled } = useFlags();

const enabled = isEnabled('partnerEvents');
const { data: event } = enabled
  ? await usePartnerEvent(FEATURED_PARTNER_EVENT)
  : { data: ref(null) };

const visible = computed(() => enabled && !!event.value && !event.value.closedAt);
const teams = computed(() => event.value?.games.reduce((sum, game) => sum + game.teams, 0) ?? 0);
const joined = computed(() => (event.value?.mine?.length ?? 0) > 0);
const dateText = computed(
  () =>
    event.value?.dateText[locale.value === 'fr' ? 'fr' : 'en'] ||
    t('partnerEvents.arenaLeague2027.dateNotFixed'),
);
const to = `/special/${FEATURED_PARTNER_EVENT}`;
</script>

<template>
  <section
    v-if="visible && event"
    class="flex rounded-lg text-on-banner bg-promo"
    :class="
      variant === 'card'
        ? 'flex-col items-start gap-3 p-5'
        : 'flex-col gap-4 p-5 sm:flex-row sm:items-center sm:gap-6'
    "
    :aria-label="t('partnerEvents.arenaLeague2027.title')"
  >
    <div class="flex min-w-0 flex-1 flex-col items-start gap-2">
      <UBadge :label="t('partnerEvents.promo.badge')" color="secondary" variant="solid" />
      <h2 class="text-xl text-on-banner" :class="variant === 'card' && 'sm:text-2xl'">
        {{ t('partnerEvents.arenaLeague2027.title') }}
      </h2>
      <p class="text-on-banner-muted">{{ t('partnerEvents.promo.lede') }}</p>
      <p v-if="variant === 'card'" class="text-sm text-on-banner-muted">{{ dateText }}</p>
    </div>

    <dl
      v-if="event.students > 0"
      class="flex gap-6 text-on-banner-muted tabular-nums"
      :class="variant === 'card' && 'order-last'"
    >
      <div>
        <dt class="sr-only">{{ t('partnerEvents.promo.studentsLabel') }}</dt>
        <dd>
          <span class="font-display text-2xl text-on-banner">{{ event.students }}</span>
          {{ t('partnerEvents.promo.students', event.students) }}
        </dd>
      </div>
      <div v-if="teams > 0">
        <dt class="sr-only">{{ t('partnerEvents.promo.teamsLabel') }}</dt>
        <dd>
          <span class="font-display text-2xl text-on-banner">{{ teams }}</span>
          {{ t('partnerEvents.promo.teams', teams) }}
        </dd>
      </div>
    </dl>

    <UButton
      :to="to"
      color="neutral"
      size="lg"
      class="shrink-0 bg-plate text-on-plate hover:bg-plate/90"
      :icon="joined ? 'i-lucide-check' : undefined"
      :label="
        joined
          ? t('partnerEvents.promo.joined')
          : event.interestOpen
            ? t('partnerEvents.imInterested')
            : t('partnerEvents.promo.see')
      "
    />
  </section>
</template>
