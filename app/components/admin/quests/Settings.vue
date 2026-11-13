<script setup lang="ts">
// Quest settings (docs/quests.md): the reward formula from the economy spec, who counts as
// active, the 30-day cap and its family shares, flash races, anti-cheat and the server's polling.
// A preview recomputes today's index with the values being edited. New seasons start here too.
import type { QuestSettings } from '#shared/schemas/quests';

const { t, locale } = useI18n();
const toast = useToast();

const { data, refresh } = await useQuestsAdminSettings();
const { data: index } = await useQuestsAdminIndex();
const { data: seasons, refresh: refreshSeasons } = await useQuestsAdminSeasons();

const state = ref<QuestSettings | null>(null);
watch(
  data,
  (value) => {
    if (value) state.value = structuredClone(toRaw(value.values));
  },
  { immediate: true },
);

const pending = ref(false);
async function save() {
  if (!state.value) return;
  pending.value = true;
  try {
    await questAdminActions.updateSettings(state.value);
    toast.add({
      title: t('admin.quests.settings.saved'),
      color: 'success',
      icon: 'i-lucide-circle-check',
    });
    await refresh();
  } catch (error) {
    toast.add({
      title: t('admin.quests.errors.invalid'),
      description: error instanceof QuestError ? error.detail : undefined,
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  } finally {
    pending.value = false;
  }
}

// Today's index with the formula being edited, from the median, Q3 and mean the site measured.
const preview = computed(() => {
  const p = index.value?.preview;
  const f = state.value?.formula;
  if (!p || !f) return null;
  const fallback = p.activePlayers < (state.value?.active.minPlayers ?? 5) || p.median <= 0;
  const value = fallback ? f.baselineIndex : f.wMedian * p.median + f.wQ3 * p.q3 + f.wMean * p.mean;
  const k = fallback
    ? 1
    : Math.min(f.kMax, Math.max(f.kMin, Math.pow(value / f.baselineIndex, f.alpha)));
  const bonus = (balance: number) => (balance >= value ? 1 : 1 + f.bMax * (1 - balance / value));
  return {
    ...p,
    index: value,
    kGlobal: k,
    fallback,
    examples: [50, 1000, 5000].map((base) => ({
      base,
      values: [0, value / 2, value].map((balance) => Math.round(base * k * bonus(balance))),
    })),
  };
});
const decimal = (n: number, digits = 2) =>
  new Intl.NumberFormat(locale.value, { maximumFractionDigits: digits }).format(n);
const sharesTotal = computed(() =>
  state.value ? Object.values(state.value.cap.shares).reduce((a, b) => a + b, 0) : 0,
);

const confirmation = ref('');
const seasonPending = ref(false);
async function newSeason() {
  seasonPending.value = true;
  try {
    await questAdminActions.newSeason();
    confirmation.value = '';
    toast.add({
      title: t('admin.quests.season.started'),
      color: 'success',
      icon: 'i-lucide-circle-check',
    });
    await refreshSeasons();
  } catch {
    toast.add({
      title: t('admin.quests.errors.failed'),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  } finally {
    seasonPending.value = false;
  }
}
const current = computed(() => seasons.value?.find((season) => !season.endedAt));
</script>

<template>
  <div v-if="state" class="grid items-start gap-6 xl:grid-cols-3">
    <div class="flex flex-col gap-6 xl:col-span-2">
      <section class="flex flex-col gap-4 rounded-lg bg-elevated px-6 py-5">
        <div>
          <h2 class="text-lg font-medium text-highlighted">
            {{ t('admin.quests.settings.formula') }}
          </h2>
          <p class="text-sm text-muted">{{ t('admin.quests.settings.formulaHelp') }}</p>
        </div>
        <div class="grid gap-4 sm:grid-cols-4">
          <UFormField :label="t('admin.quests.settings.wMedian')" name="wMedian">
            <UInput
              v-model.number="state.formula.wMedian"
              type="number"
              step="0.05"
              min="0"
              max="1"
              class="w-full"
            />
          </UFormField>
          <UFormField :label="t('admin.quests.settings.wQ3')" name="wQ3">
            <UInput
              v-model.number="state.formula.wQ3"
              type="number"
              step="0.05"
              min="0"
              max="1"
              class="w-full"
            />
          </UFormField>
          <UFormField :label="t('admin.quests.settings.wMean')" name="wMean">
            <UInput
              v-model.number="state.formula.wMean"
              type="number"
              step="0.05"
              min="0"
              max="1"
              class="w-full"
            />
          </UFormField>
          <UFormField :label="t('admin.quests.settings.baseline')" name="baselineIndex">
            <UInput
              v-model.number="state.formula.baselineIndex"
              type="number"
              min="1"
              class="w-full"
            />
          </UFormField>
          <UFormField :label="t('admin.quests.settings.alpha')" name="alpha">
            <UInput
              v-model.number="state.formula.alpha"
              type="number"
              step="0.05"
              min="0"
              class="w-full"
            />
          </UFormField>
          <UFormField :label="t('admin.quests.settings.kMin')" name="kMin">
            <UInput
              v-model.number="state.formula.kMin"
              type="number"
              step="0.05"
              min="0"
              class="w-full"
            />
          </UFormField>
          <UFormField :label="t('admin.quests.settings.kMax')" name="kMax">
            <UInput
              v-model.number="state.formula.kMax"
              type="number"
              step="0.1"
              min="0.1"
              class="w-full"
            />
          </UFormField>
          <UFormField :label="t('admin.quests.settings.bMax')" name="bMax">
            <UInput
              v-model.number="state.formula.bMax"
              type="number"
              step="0.05"
              min="0"
              class="w-full"
            />
          </UFormField>
        </div>
      </section>

      <section class="flex flex-col gap-4 rounded-lg bg-elevated px-6 py-5">
        <div>
          <h2 class="text-lg font-medium text-highlighted">
            {{ t('admin.quests.settings.active') }}
          </h2>
          <p class="text-sm text-muted">{{ t('admin.quests.settings.activeHelp') }}</p>
        </div>
        <div class="grid gap-4 sm:grid-cols-3">
          <UFormField :label="t('admin.quests.settings.activeHours')" name="activeHours">
            <UInput v-model.number="state.active.hours" type="number" min="1" class="w-full" />
          </UFormField>
          <UFormField :label="t('admin.quests.settings.minPlaytime')" name="minPlaytime">
            <UInput
              v-model.number="state.active.minPlaytimeMinutes"
              type="number"
              min="0"
              class="w-full"
            />
          </UFormField>
          <UFormField
            :label="t('admin.quests.settings.minPlayers')"
            name="minPlayers"
            :help="t('admin.quests.settings.minPlayersHelp')"
          >
            <UInput v-model.number="state.active.minPlayers" type="number" min="1" class="w-full" />
          </UFormField>
        </div>
      </section>

      <section class="flex flex-col gap-4 rounded-lg bg-elevated px-6 py-5">
        <div>
          <h2 class="text-lg font-medium text-highlighted">{{ t('admin.quests.settings.cap') }}</h2>
          <p class="text-sm text-muted">{{ t('admin.quests.settings.capHelp') }}</p>
        </div>
        <UFormField
          :label="t('admin.quests.settings.capPercent')"
          name="capPercent"
          class="max-w-48"
        >
          <UInput
            v-model.number="state.cap.percent"
            type="number"
            step="0.5"
            min="0"
            max="100"
            class="w-full"
          />
        </UFormField>
        <ul class="flex flex-col divide-y divide-default">
          <li
            v-for="family in ['individual', 'server', 'community', 'flash'] as const"
            :key="family"
            class="grid grid-cols-2 items-center gap-3 py-2.5 sm:grid-cols-4"
          >
            <span class="text-sm">{{ t(`admin.quests.family.${family}`) }}</span>
            <UProgress
              class="max-sm:hidden"
              color="neutral"
              size="sm"
              :model-value="index?.cap.find((c) => c.family === family)?.spent ?? 0"
              :max="Math.max(1, index?.cap.find((c) => c.family === family)?.budget ?? 1)"
            />
            <UInput
              v-model.number="state.cap.shares[family]"
              type="number"
              min="0"
              max="100"
              size="md"
              :aria-label="t('admin.quests.settings.share', { family })"
            />
            <span class="text-xs text-muted tabular-nums max-sm:hidden">
              {{
                t('admin.quests.settings.used', {
                  spent: formatLnbits(
                    index?.cap.find((c) => c.family === family)?.spent ?? 0,
                    locale,
                  ),
                  budget: formatLnbits(
                    index?.cap.find((c) => c.family === family)?.budget ?? 0,
                    locale,
                  ),
                })
              }}
            </span>
          </li>
        </ul>
        <p v-if="sharesTotal !== 100" class="text-sm text-warning">
          {{ t('admin.quests.settings.sharesTotal', { n: sharesTotal }) }}
        </p>
      </section>

      <section class="flex flex-col gap-4 rounded-lg bg-elevated px-6 py-5">
        <div>
          <h2 class="text-lg font-medium text-highlighted">
            {{ t('admin.quests.settings.flash') }}
          </h2>
          <p class="text-sm text-muted">{{ t('admin.quests.settings.flashHelp') }}</p>
        </div>
        <div class="grid gap-4 sm:grid-cols-3">
          <UFormField :label="t('admin.quests.settings.interval')" name="interval">
            <UInput
              v-model.number="state.flash.intervalMinutes"
              type="number"
              min="1"
              class="w-full"
            />
          </UFormField>
          <UFormField :label="t('admin.quests.settings.flashPlayers')" name="flashPlayers">
            <UInput v-model.number="state.flash.minPlayers" type="number" min="1" class="w-full" />
          </UFormField>
          <UFormField :label="t('admin.quests.settings.duration')" name="duration">
            <UInput
              v-model.number="state.flash.durationMinutes"
              type="number"
              min="1"
              class="w-full"
            />
          </UFormField>
          <UFormField
            :label="t('admin.quests.settings.poll')"
            name="poll"
            :help="t('admin.quests.settings.pollHelp')"
          >
            <UInput v-model.number="state.pollSeconds" type="number" min="30" class="w-full" />
          </UFormField>
        </div>
      </section>

      <section class="flex flex-col gap-3 rounded-lg bg-elevated px-6 py-5">
        <h2 class="text-lg font-medium text-highlighted">
          {{ t('admin.quests.settings.antiCheat') }}
        </h2>
        <USwitch
          v-for="key in [
            'ignorePlacedBlocks',
            'ignoreSpawnerMobs',
            'ignoreMachineBreaks',
            'countFluidBlocks',
            'excludeCreative',
          ] as const"
          :key="key"
          v-model="state.antiCheat[key]"
          :label="t(`admin.quests.settings.rules.${key}`)"
        />
        <USwitch v-model="state.community.rotation" :label="t('admin.quests.settings.rotation')" />
      </section>

      <section class="flex flex-col gap-3 rounded-lg bg-elevated px-6 py-5">
        <h2 class="text-lg font-medium text-highlighted">{{ t('admin.quests.season.title') }}</h2>
        <p class="text-sm text-muted">
          {{ t('admin.quests.season.body', { n: current?.number ?? 1 }) }}
        </p>
        <div class="flex flex-wrap items-end gap-3">
          <UFormField
            :label="t('admin.quests.season.confirm')"
            name="seasonConfirm"
            class="min-w-56"
          >
            <UInput v-model="confirmation" placeholder="new season" class="w-full" />
          </UFormField>
          <UButton
            color="error"
            variant="outline"
            :disabled="confirmation !== 'new season'"
            :loading="seasonPending"
            :label="t('admin.quests.season.start')"
            @click="newSeason"
          />
        </div>
      </section>
    </div>

    <aside class="flex flex-col gap-4 rounded-lg bg-elevated px-6 py-5 xl:sticky xl:top-4">
      <div class="flex items-center justify-between gap-3">
        <h2 class="text-lg font-medium text-highlighted">
          {{ t('admin.quests.settings.preview') }}
        </h2>
        <UButton :loading="pending" :label="t('admin.quests.settings.save')" @click="save" />
      </div>
      <template v-if="preview">
        <p class="text-sm text-muted">
          {{
            t('admin.quests.settings.previewHelp', {
              median: formatLnbits(preview.median, locale),
              q3: formatLnbits(preview.q3, locale),
              mean: formatLnbits(preview.mean, locale),
              n: preview.activePlayers,
            })
          }}
        </p>
        <UAlert
          v-if="preview.fallback"
          color="neutral"
          variant="subtle"
          icon="i-lucide-info"
          :description="t('admin.quests.settings.fallback')"
        />
        <dl class="flex gap-8">
          <div>
            <dt class="text-sm text-muted">{{ t('admin.quests.index.index') }}</dt>
            <dd class="font-display text-xl font-bold text-highlighted tabular-nums">
              {{ formatLnbits(preview.index, locale) }}
            </dd>
          </div>
          <div>
            <dt class="text-sm text-muted">Kglobal</dt>
            <dd class="font-display text-xl font-bold text-highlighted tabular-nums">
              ×{{ decimal(preview.kGlobal, 3) }}
            </dd>
          </div>
        </dl>
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-default text-left text-highlighted">
              <th class="py-2 font-semibold">{{ t('admin.quests.settings.base') }}</th>
              <th class="py-2 text-right font-semibold">
                {{ t('admin.quests.settings.balance', { n: 0 }) }}
              </th>
              <th class="py-2 text-right font-semibold">
                {{
                  t('admin.quests.settings.balance', { n: formatLnbits(preview.index / 2, locale) })
                }}
              </th>
              <th class="py-2 text-right font-semibold">
                {{ t('admin.quests.settings.atIndex') }}
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-default">
            <tr v-for="example in preview.examples" :key="example.base">
              <td class="py-2 tabular-nums">{{ formatLnbits(example.base, locale) }}</td>
              <td
                v-for="(value, i) in example.values"
                :key="i"
                class="py-2 text-right tabular-nums"
              >
                {{ formatLnbits(value, locale) }}
              </td>
            </tr>
          </tbody>
        </table>
      </template>
    </aside>
  </div>
</template>
