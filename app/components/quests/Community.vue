<script setup lang="ts">
// The Community tab (docs/quests.md): the running quest, the player's part in it, then the past
// ones with the tier they reached.
import type { QuestOverview } from '~/composables/useQuests';

const props = defineProps<{ data: QuestOverview }>();
const { t, locale } = useI18n();

const threshold = computed(() =>
  props.data.community
    ? Math.ceil((props.data.community.goal * props.data.community.thresholdPercent) / 100)
    : 0,
);
function reachedTier(community: QuestOverview['pastCommunity'][number]) {
  const share = (community.progress / community.goal) * 100;
  return [...community.tiers].reverse().find((tier) => share >= tier.at)?.name ?? null;
}
const dateFormat = computed(
  () =>
    new Intl.DateTimeFormat(locale.value, {
      day: 'numeric',
      month: 'short',
      timeZone: 'Europe/Paris',
    }),
);
</script>

<template>
  <div class="flex flex-col gap-6">
    <template v-if="data.community">
      <QuestsCommunityBand :community="data.community" :contribution="data.me?.community" />
      <section
        v-if="data.me?.community"
        class="flex flex-col gap-2 rounded-lg bg-elevated px-6 py-5"
      >
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 class="text-lg font-medium text-highlighted">{{ t('quests.community.yourPart') }}</h3>
          <UBadge
            :color="data.me.community.qualified ? 'success' : 'neutral'"
            :variant="data.me.community.qualified ? 'subtle' : 'outline'"
            :icon="data.me.community.qualified ? 'i-lucide-check' : undefined"
            :label="
              t(
                data.me.community.qualified
                  ? 'quests.community.qualified'
                  : 'quests.community.notQualified',
              )
            "
          />
        </div>
        <p class="text-muted">
          {{
            t('quests.community.threshold', {
              n: formatLnbits(threshold, locale),
              percent: data.community.thresholdPercent,
              mine: formatLnbits(data.me.community.contribution, locale),
              bonus: data.community.topBonusPercent,
            })
          }}
        </p>
      </section>
    </template>
    <div
      v-else
      class="flex flex-col items-center gap-3 rounded-lg bg-elevated px-5 py-10 text-center"
    >
      <IconTile icon="i-lucide-users" />
      <h3 class="text-xl font-medium text-highlighted">{{ t('quests.community.none.title') }}</h3>
      <p class="max-w-md text-muted">{{ t('quests.community.none.body') }}</p>
    </div>

    <section v-if="data.pastCommunity.length" class="flex flex-col gap-3">
      <h3 class="text-xl font-medium text-highlighted">{{ t('quests.community.past') }}</h3>
      <ul class="flex flex-col divide-y divide-default rounded-lg bg-elevated">
        <li
          v-for="community in data.pastCommunity"
          :key="community.id"
          class="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3"
        >
          <span class="w-32 text-sm text-muted">
            {{
              t('quests.community.week', { date: dateFormat.format(new Date(community.startsAt)) })
            }}
          </span>
          <span class="min-w-0 flex-1 font-semibold text-highlighted">{{
            questName(community.title, locale)
          }}</span>
          <UBadge
            color="neutral"
            variant="outline"
            :label="
              community.status === 'cancelled'
                ? t('quests.community.cancelled')
                : reachedTier(community)
                  ? t('quests.community.reachedTier', { tier: reachedTier(community) })
                  : t('quests.community.noTier')
            "
          />
          <span class="text-sm text-muted tabular-nums">
            {{
              t(
                'quests.community.contributors',
                { n: community.contributors },
                community.contributors,
              )
            }}
          </span>
        </li>
      </ul>
    </section>
  </div>
</template>
