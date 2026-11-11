<script setup lang="ts">
import type { PartnerGameKey } from '#shared/schemas/partner-events';

// The Partner events admin, laid out by game: a list on the left (the event itself, then each
// game), and the selected one's panel on the right. See docs/partner-events.md.
const props = defineProps<{ slug: string }>();

const { t, d } = useI18n();
const { data, error, refresh } = await useAdminPartnerEvent(props.slug);

const selected = ref<'event' | PartnerGameKey>('event');
const entries = computed(() => [
  {
    key: 'event' as const,
    label: t('admin.partnerEvents.event.title'),
    hint: t('admin.partnerEvents.event.hint'),
  },
  ...(data.value?.games.map((game) => ({
    key: game.key,
    label: t(`partnerEvents.games.${partnerGameMessageKey(game.key)}`),
    hint: t('admin.partnerEvents.gameHint', { interested: game.interested, teams: game.teams }),
  })) ?? []),
]);
const game = computed(() => data.value?.games.find((g) => g.key === selected.value) ?? null);
const missingReferent = computed(
  () =>
    data.value?.games.filter(
      (g) => g.status === 'confirmed' && g.teams > 0 && g.referent.pseudo === '',
    ) ?? [],
);
</script>

<template>
  <UAlert
    v-if="error || !data"
    color="error"
    variant="subtle"
    icon="i-lucide-circle-alert"
    :title="t('admin.partnerEvents.loadFailed')"
  />
  <div v-else class="flex flex-col gap-6">
    <div class="flex flex-wrap items-center gap-3">
      <UBadge
        :color="data.closedAt ? 'neutral' : 'success'"
        variant="soft"
        :label="data.closedAt ? t('admin.partnerEvents.closed') : t('admin.partnerEvents.open')"
      />
      <NuxtLink :to="`/special/${data.slug}`" class="text-sm text-muted hover:text-highlighted">
        /special/{{ data.slug }}
      </NuxtLink>
    </div>

    <UAlert
      v-if="data.closedAt && data.purgeAt"
      color="neutral"
      variant="subtle"
      icon="i-lucide-lock"
      :title="
        t('admin.partnerEvents.closedNotice', {
          date: d(data.purgeAt, { dateStyle: 'long', timeZone: 'Europe/Paris' }),
        })
      "
    />
    <UAlert
      v-for="g in missingReferent"
      :key="g.key"
      color="warning"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      :title="
        t('admin.partnerEvents.missingReferent', {
          game: t(`partnerEvents.games.${partnerGameMessageKey(g.key)}`),
        })
      "
    />

    <div class="grid gap-6 lg:grid-cols-4">
      <nav
        class="flex gap-2 overflow-x-auto lg:flex-col lg:self-start"
        :aria-label="t('admin.partnerEvents.title')"
      >
        <button
          v-for="entry in entries"
          :key="entry.key"
          type="button"
          class="flex min-w-40 flex-col items-start gap-0.5 rounded-lg px-3 py-2 text-left transition-colors"
          :class="selected === entry.key ? 'bg-primary/10 text-primary' : 'hover:bg-elevated'"
          :aria-pressed="selected === entry.key"
          @click="selected = entry.key"
        >
          <span class="font-semibold">{{ entry.label }}</span>
          <span class="text-sm text-muted">{{ entry.hint }}</span>
        </button>
      </nav>

      <div class="flex min-w-0 flex-col gap-6 lg:col-span-3">
        <AdminPartnerEventsEventPanel
          v-if="selected === 'event'"
          :event="data"
          @changed="refresh"
        />
        <AdminPartnerEventsGamePanel
          v-else-if="game"
          :key="game.key"
          :slug="data.slug"
          :game="game"
          :teams="data.teams.filter((team) => team.game === selected)"
          :interest="data.interest.filter((row) => row.game === selected)"
          :closed="data.closedAt !== null"
          @changed="refresh"
        />
      </div>
    </div>
  </div>
</template>
