<script setup lang="ts">
import type { InterestDraft } from '~/utils/partner-events';

import type { PartnerGameKey } from '#shared/schemas/partner-events';

// Arena League University 2027, an inter-school esports league LNB doesn't run: what it is, and
// the students' interest in each game. See docs/partner-events.md.
definePageMeta({ auth: false, flag: 'partnerEvents' });

const SLUG = 'arena-league-university-2027';

const { t, locale } = useI18n();
const route = useRoute();
const toast = useToast();
const { user } = useAuth();

const { data: event, error } = await usePartnerEvent(SLUG);
if (error.value || !event.value) {
  throw createError({ status: 404, statusText: 'Not Found', fatal: true });
}

useSeoMeta({
  title: () => t('partnerEvents.arenaLeague2027.title'),
  description: () => t('partnerEvents.arenaLeague2027.lede'),
});

const signedIn = computed(() => user.value !== null);
const signInLink = computed(() => ({ path: '/sign-in', query: { redirect: route.fullPath } }));

// The form's state: the ticked games with their details, and the consent. It starts from what the
// student saved, and is reset from the server's answer after saving.
const draft = ref<Partial<Record<PartnerGameKey, InterestDraft>>>({});
const consent = ref(false);
const pending = ref(false);

function load() {
  const mine = event.value?.mine ?? [];
  draft.value = Object.fromEntries(
    mine.map((entry) => [entry.game, { inGameName: entry.inGameName, rank: entry.rank }]),
  );
  // They agreed when they saved, so the line stays ticked.
  consent.value = mine.length > 0;
}
load();

const saved = computed(() => (event.value?.mine?.length ?? 0) > 0);
const ticked = computed(
  () => event.value?.games.map((game) => game.key).filter((key) => draft.value[key]) ?? [],
);

function toggle(key: PartnerGameKey) {
  if (draft.value[key]) delete draft.value[key];
  else draft.value[key] = { inGameName: '', rank: '' };
}

async function run(games: PartnerGameKey[], success: string) {
  pending.value = true;
  try {
    event.value = await savePartnerInterest(SLUG, {
      consent: consent.value,
      games: games.map((game) => ({
        game,
        inGameName: draft.value[game]?.inGameName ?? '',
        rank: draft.value[game]?.rank ?? '',
      })),
    });
    load();
    toast.add({ title: success, color: 'success', icon: 'i-lucide-circle-check' });
  } catch (cause) {
    const problem = cause instanceof PartnerEventError ? cause.problem : 'failed';
    toast.add({
      title: t(`partnerEvents.problems.${problem}`),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  } finally {
    pending.value = false;
  }
}

const save = () => run(ticked.value, t('partnerEvents.toasts.saved'));
const withdraw = () => run([], t('partnerEvents.toasts.withdrawn'));

const chips = computed(() => [
  {
    icon: 'i-lucide-calendar',
    label:
      (locale.value === 'fr' ? event.value?.dateText.fr : event.value?.dateText.en) ||
      t('partnerEvents.arenaLeague2027.dateNotFixed'),
  },
  { icon: 'i-lucide-ticket', label: t('partnerEvents.arenaLeague2027.free') },
  { icon: 'i-lucide-monitor', label: t('partnerEvents.arenaLeague2027.online') },
]);
const links = computed(() => [
  ...(event.value?.websiteUrl
    ? [{ label: t('partnerEvents.links.website'), url: event.value.websiteUrl }]
    : []),
  ...(event.value?.discordUrl
    ? [{ label: t('partnerEvents.links.discord'), url: event.value.discordUrl }]
    : []),
]);

const facts = [
  { icon: 'i-lucide-user-check', key: 'interest' },
  { icon: 'i-lucide-users', key: 'teams' },
  { icon: 'i-lucide-monitor', key: 'free' },
] as const;
</script>

<template>
  <div v-if="event">
    <PartnerEventsHero
      :title="t('partnerEvents.arenaLeague2027.title')"
      :lede="t('partnerEvents.arenaLeague2027.lede')"
      :art="event.hero"
      :chips="chips"
      :links="links"
    />

    <UContainer class="flex flex-col gap-12 py-12">
      <p class="flex max-w-3xl items-start gap-3 rounded-lg bg-secondary/15 p-4">
        <UIcon name="i-lucide-info" class="mt-0.5 size-5 shrink-0 text-secondary" />
        <span>{{ t('partnerEvents.arenaLeague2027.notice') }}</span>
      </p>

      <section class="flex flex-col gap-6">
        <h2 class="text-2xl font-bold text-highlighted">{{ t('partnerEvents.how.title') }}</h2>
        <ul class="grid gap-8 sm:grid-cols-3">
          <li v-for="fact in facts" :key="fact.key" class="flex flex-col items-start gap-3">
            <IconTile :icon="fact.icon" />
            <h3 class="font-sans text-base font-semibold text-highlighted">
              {{ t(`partnerEvents.arenaLeague2027.facts.${fact.key}.title`) }}
            </h3>
            <p class="text-muted">
              {{ t(`partnerEvents.arenaLeague2027.facts.${fact.key}.text`) }}
            </p>
          </li>
        </ul>
      </section>

      <section class="flex flex-col gap-6">
        <h2 class="text-2xl font-bold text-highlighted">{{ t('partnerEvents.games.title') }}</h2>
        <div class="grid gap-4 sm:grid-cols-2">
          <PartnerEventsGameCard
            v-for="game in event.games"
            :key="game.key"
            :game="game"
            :interested="!!draft[game.key]"
            :can-tick="signedIn"
            :disabled="!event.interestOpen || pending"
            @toggle="toggle(game.key)"
          />
        </div>

        <div class="max-w-3xl">
          <div v-if="!signedIn" class="flex flex-col items-start gap-4 rounded-lg bg-elevated p-6">
            <p class="text-muted">{{ t('partnerEvents.signIn.text') }}</p>
            <UButton :to="signInLink" :label="t('partnerEvents.signIn.button')" />
          </div>
          <template v-else>
            <p
              v-if="!event.interestOpen"
              class="mb-4 flex items-start gap-3 rounded-lg bg-secondary/15 p-4"
            >
              <UIcon name="i-lucide-info" class="mt-0.5 size-5 shrink-0 text-secondary" />
              <span>{{ t('partnerEvents.paused') }}</span>
            </p>
            <PartnerEventsInterestForm
              v-if="ticked.length > 0"
              v-model:draft="draft"
              v-model:consent="consent"
              :games="ticked"
              :saved="saved"
              :pending="pending"
              @save="save"
              @withdraw="withdraw"
            />
            <div v-else class="flex flex-col items-start gap-4 rounded-lg bg-elevated p-6">
              <p class="text-muted">{{ t('partnerEvents.form.empty') }}</p>
              <UButton
                v-if="saved"
                color="neutral"
                variant="ghost"
                :label="t('partnerEvents.form.withdraw')"
                :loading="pending"
                @click="withdraw"
              />
            </div>
          </template>
        </div>
      </section>
    </UContainer>
  </div>
</template>
