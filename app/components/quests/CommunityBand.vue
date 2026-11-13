<script setup lang="ts">
// The running community quest as a band (docs/design.md, Quests): the banner fallback with the
// corner mark, the goal and its tiers on a neutral meter. Dark in both color modes, like the
// event hero. On the home page under the hero, and at the top of the Community tab.
import type { QuestCommunity } from '~/composables/useQuests';

const props = defineProps<{
  community: QuestCommunity;
  contribution?: { contribution: number; qualified: boolean } | null;
  link?: boolean;
}>();

const { t, locale } = useI18n();

const maxAt = computed(() => Math.max(...props.community.tiers.map((tier) => tier.at), 100));
const share = computed(() => (props.community.progress / props.community.goal) * 100);
const fill = computed(() => Math.min(100, (share.value / maxAt.value) * 100));
const reached = computed(() => props.community.tiers.filter((tier) => share.value >= tier.at));
const next = computed(() => props.community.tiers.find((tier) => share.value < tier.at));
const left = computed(() => timeLeft(props.community.endsAt));
const threshold = computed(() =>
  Math.ceil((props.community.goal * props.community.thresholdPercent) / 100),
);
const icon = computed(() => QUEST_ICONS[props.community.objective.type] ?? 'i-lucide-users');
const percent = computed(() =>
  new Intl.NumberFormat(locale.value, { maximumFractionDigits: 1 }).format(share.value),
);
</script>

<template>
  <section
    class="dark relative overflow-hidden rounded-lg bg-banner-fallback text-on-banner"
    :aria-label="t('quests.community.label')"
  >
    <UIcon
      :name="icon"
      class="pointer-events-none absolute -right-16 -bottom-28 size-44 -rotate-12 text-secondary opacity-25"
      aria-hidden="true"
    />
    <div class="relative grid gap-x-10 gap-y-5 p-6 sm:p-7 lg:grid-cols-5 lg:items-center">
      <div class="flex flex-col gap-3 lg:col-span-2">
        <div class="flex flex-wrap gap-2">
          <UBadge
            color="neutral"
            variant="soft"
            icon="i-lucide-users"
            :label="t('quests.community.label')"
          />
          <UBadge
            color="neutral"
            variant="soft"
            icon="i-lucide-clock"
            :label="t('quests.community.endsIn', { d: left.days, h: left.hours })"
          />
        </div>
        <h2 class="text-2xl font-bold">{{ questName(community.title, locale) }}</h2>
        <p class="text-on-banner-muted">
          {{
            t('quests.community.lede', {
              goal: formatLnbits(community.goal, locale),
              threshold: formatLnbits(threshold, locale),
            })
          }}
        </p>
        <div class="flex flex-wrap items-center gap-3">
          <UButton
            v-if="link"
            to="/minecraft/quests?tab=community"
            class="bg-plate text-on-plate hover:bg-plate/90"
            size="md"
            :label="t('quests.community.see')"
          />
          <span class="text-sm text-on-banner-muted">
            {{
              t(
                'quests.community.contributors',
                { n: community.contributors },
                community.contributors,
              )
            }}
            <template v-if="contribution">
              {{
                t('quests.community.yours', { n: formatLnbits(contribution.contribution, locale) })
              }}
            </template>
          </span>
        </div>
      </div>

      <div class="flex flex-col gap-2 lg:col-span-3">
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <span class="font-display text-3xl font-bold tabular-nums">
            {{ formatLnbits(community.progress, locale) }}
          </span>
          <span class="text-on-banner-muted tabular-nums">
            {{ t('quests.community.ofGoal', { percent }) }}
          </span>
        </div>
        <div
          class="relative h-3 rounded-full bg-on-banner/15"
          role="meter"
          :aria-valuenow="community.progress"
          :aria-valuemin="0"
          :aria-valuemax="community.goal"
          :aria-label="t('quests.community.progress')"
        >
          <span class="block h-full rounded-full bg-on-banner/75" :style="{ width: `${fill}%` }" />
        </div>
        <ol class="relative mt-1 h-12">
          <li
            v-for="(tier, index) in community.tiers"
            :key="tier.name"
            class="absolute flex flex-col text-xs leading-tight whitespace-nowrap"
            :class="
              index === community.tiers.length - 1
                ? '-translate-x-full items-end text-right'
                : '-translate-x-1/2 items-center text-center'
            "
            :style="{ left: `${(tier.at / maxAt) * 100}%` }"
          >
            <span class="mb-1 h-3 w-0.5 rounded-full bg-on-banner/55" aria-hidden="true" />
            <span class="font-semibold capitalize">{{ tier.name }}</span>
            <span class="text-on-banner-muted tabular-nums">
              {{ t('quests.community.tierReward', { n: formatLnbits(tier.rewardToday, locale) }) }}
            </span>
          </li>
        </ol>
        <p class="text-sm text-on-banner-muted">
          <template v-if="reached.length">
            {{
              t('quests.community.reached', { tiers: reached.map((tier) => tier.name).join(', ') })
            }}
          </template>
          {{ ' ' }}
          <template v-if="next">
            {{
              t('quests.community.missing', {
                n: formatLnbits(
                  Math.ceil((community.goal * next.at) / 100 - community.progress),
                  locale,
                ),
                tier: next.name,
              })
            }}
          </template>
        </p>
      </div>
    </div>
  </section>
</template>
