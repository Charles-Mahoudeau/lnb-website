<script setup lang="ts">
// Individual quests (docs/quests.md): categories beside chains of cumulative tiers. A tier shows
// as claimed, ready to claim (on the site or in the game), in progress, or locked until the one
// before it is done.
import type { QuestOverview } from '~/composables/useQuests';

const props = defineProps<{ data: QuestOverview }>();
const emit = defineEmits<{ claimed: [] }>();

const { t, locale } = useI18n();
const toast = useToast();

const categories = ['mining', 'combat', 'fishing', 'exploration', 'crafting', 'delivery'] as const;
const quests = computed(() =>
  props.data.quests.flatMap((quest) => (quest.family === 'individual' ? [quest] : [])),
);
const counts = computed(() =>
  Object.fromEntries(
    categories.map((c) => [c, quests.value.filter((q) => q.category === c).length]),
  ),
);
const category = ref<(typeof categories)[number]>(
  categories.find((c) => quests.value.some((q) => q.category === c)) ?? 'mining',
);
const shown = computed(() => quests.value.filter((quest) => quest.category === category.value));

function completion(questId: string, tier: number) {
  return props.data.me?.completions.find((c) => c.quest === questId && c.tier === tier);
}

type TierState = 'claimed' | 'ready' | 'progress' | 'locked';
function state(questId: string, tier: number): TierState {
  const done = completion(questId, tier);
  if (done) return done.claimedAt ? 'claimed' : 'ready';
  if (tier > 1 && !completion(questId, tier - 1)) return 'locked';
  return 'progress';
}

const kPlayer = computed(() => props.data.me?.kPlayer ?? 1);
const percentBonus = computed(() =>
  new Intl.NumberFormat(locale.value, { maximumFractionDigits: 1 }).format(
    (kPlayer.value - 1) * 100,
  ),
);

const claiming = ref<string | null>(null);
async function claim(id: string) {
  claiming.value = id;
  try {
    const result = await questActions.claim(id);
    toast.add({
      title: t('quests.individual.claimed', { n: formatLnbits(result.amount, locale.value) }),
      description: result.mailboxItems
        ? t('quests.individual.claimedItems', result.mailboxItems)
        : undefined,
      color: 'success',
      icon: 'i-lucide-circle-check',
    });
    emit('claimed');
  } catch (error) {
    const problem = error instanceof QuestError ? error.problem : 'failed';
    toast.add({
      title: t(
        `quests.errors.${problem === 'alreadyClaimed' || problem === 'frozen' ? problem : 'failed'}`,
      ),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  } finally {
    claiming.value = null;
  }
}
</script>

<template>
  <div class="grid gap-6 lg:grid-cols-12">
    <nav
      class="flex gap-1 self-start overflow-x-auto rounded-lg bg-elevated p-2 lg:col-span-3 lg:flex-col"
      :aria-label="t('quests.individual.categories')"
    >
      <button
        v-for="c in categories"
        :key="c"
        type="button"
        class="flex shrink-0 items-center gap-3 rounded-md px-2.5 py-2 text-left font-medium"
        :class="
          c === category ? 'bg-secondary/15 text-secondary' : 'text-default hover:bg-accented'
        "
        :aria-pressed="c === category"
        @click="category = c"
      >
        <IconTile :icon="QUEST_ICONS[c]!" />
        <span class="flex-1">{{ t(`quests.category.${c}`) }}</span>
        <span class="text-sm text-muted tabular-nums">{{ counts[c] }}</span>
      </button>
    </nav>

    <div class="flex min-w-0 flex-col gap-4 lg:col-span-9">
      <p v-if="!shown.length" class="rounded-lg bg-elevated p-6 text-muted">
        {{ t('quests.individual.empty') }}
      </p>
      <article
        v-for="quest in shown"
        :key="quest.id"
        class="flex flex-col gap-4 rounded-lg bg-elevated px-6 py-5"
      >
        <div class="flex items-center gap-3">
          <IconTile :icon="QUEST_ICONS[quest.category]!" />
          <div class="min-w-0">
            <h3 class="font-bold text-highlighted">{{ questName(quest.name, locale) }}</h3>
            <p class="text-sm text-muted">
              {{
                quest.description
                  ? questName(quest.description, locale)
                  : t(`quests.objective.${quest.objective.type}`)
              }}
              {{ t('quests.individual.cumulative') }}
            </p>
          </div>
        </div>
        <ol class="grid gap-3 sm:grid-cols-3">
          <li
            v-for="(tier, index) in quest.tiers"
            :key="index"
            class="flex flex-col gap-2 rounded-md bg-default p-4"
            :class="state(quest.id, index + 1) === 'locked' ? 'opacity-60' : ''"
          >
            <div class="flex flex-wrap items-center justify-between gap-2">
              <span class="text-sm text-muted">{{
                t('quests.individual.tier', { n: index + 1 })
              }}</span>
              <UBadge
                v-if="state(quest.id, index + 1) === 'claimed'"
                color="neutral"
                variant="outline"
                icon="i-lucide-check"
                :label="t('quests.individual.state.claimed')"
              />
              <UBadge
                v-else-if="state(quest.id, index + 1) === 'ready'"
                color="success"
                variant="subtle"
                icon="i-lucide-gift"
                :label="t('quests.individual.state.ready')"
              />
              <UBadge
                v-else-if="state(quest.id, index + 1) === 'progress' && data.me"
                color="secondary"
                variant="subtle"
                :label="t('quests.individual.state.progress')"
              />
              <UIcon
                v-else-if="state(quest.id, index + 1) === 'locked'"
                name="i-lucide-lock"
                class="size-4 text-dimmed"
              />
            </div>
            <template v-if="state(quest.id, index + 1) === 'locked'">
              <p class="text-sm text-muted">{{ t('quests.individual.locked', { n: index }) }}</p>
            </template>
            <template v-else>
              <span class="font-semibold text-highlighted tabular-nums">{{
                formatLnbits(tier.amount, locale)
              }}</span>
              <template v-if="state(quest.id, index + 1) === 'progress' && data.me">
                <UProgress
                  color="neutral"
                  size="sm"
                  :model-value="Math.min(data.me.progress[quest.id] ?? 0, tier.amount)"
                  :max="tier.amount"
                />
                <span class="text-xs text-muted tabular-nums">
                  {{ formatLnbits(data.me.progress[quest.id] ?? 0, locale) }} /
                  {{ formatLnbits(tier.amount, locale) }}
                </span>
              </template>
              <UButton
                v-if="state(quest.id, index + 1) === 'ready'"
                class="self-start"
                size="md"
                :loading="claiming === completion(quest.id, index + 1)?.id"
                :label="t('quests.individual.claim')"
                @click="claim(completion(quest.id, index + 1)!.id)"
              />
              <div>
                <span class="font-display text-lg font-medium text-highlighted tabular-nums">
                  <template v-if="completion(quest.id, index + 1)">
                    {{ formatLnbits(completion(quest.id, index + 1)!.amount, locale) }}
                  </template>
                  <template v-else
                    >≈ {{ formatLnbits(quest.today[index]! * kPlayer, locale) }}</template
                  >
                </span>
                <span class="text-sm text-muted"> LNBits</span>
              </div>
              <span v-if="tier.items.length" class="text-xs text-muted">
                {{
                  t('quests.individual.plusItems', {
                    items: tier.items.map((item) => `${item.count} × ${item.name}`).join(', '),
                  })
                }}
              </span>
            </template>
          </li>
        </ol>
      </article>
      <p class="border-l-2 border-secondary pl-3 text-sm text-muted">
        {{
          data.me
            ? t('quests.individual.note', { bonus: percentBonus })
            : t('quests.individual.noteSignedOut')
        }}
      </p>
    </div>
  </div>
</template>
