<script setup lang="ts">
// The Market's settings (docs/market.md): the spread, the order limits, the mint budget, the history
// and, per tier, the player's thresholds and rates. Thresholds are LNBits of nominal value, kept as
// cents. Changes apply at once, are written to the activity log and reach the Minecraft server.
import type { MarketSettingsPatch } from '#shared/schemas/market';

const { t } = useI18n();
const toast = useToast();
const { refusalText } = useMarketMessages();
const { data, error, refresh } = await useMarketOverview();

interface TierDraft {
  tier: number;
  q1: number | undefined;
  q2: number | undefined;
  midPercent: string;
  tailPercent: string;
}
const form = reactive({
  sigmaPercent: '',
  tolerancePercent: '',
  maxOrderItems: '',
  mintCapPercent: '',
  historyDays: '',
  tiers: [] as TierDraft[],
});
const invalid = ref<Record<string, boolean>>({});

function load() {
  const settings = data.value?.settings;
  if (!settings) return;
  Object.assign(form, {
    sigmaPercent: String(settings.sigmaPercent),
    tolerancePercent: String(settings.tolerancePercent),
    maxOrderItems: String(settings.maxOrderItems),
    mintCapPercent: String(settings.mintCapPercent),
    historyDays: String(settings.historyDays),
    tiers: settings.tiers.map((tier) => ({
      tier: tier.tier,
      q1: tier.q1,
      q2: tier.q2,
      midPercent: String(tier.midPercent),
      tailPercent: String(tier.tailPercent),
    })),
  });
}
load();

const num = (value: string) => (value.trim() === '' ? Number.NaN : Number(value.replace(',', '.')));

const fields = [
  { key: 'sigmaPercent', unit: '%', min: 0, max: 50 },
  { key: 'tolerancePercent', unit: '%', min: 0, max: 50 },
  { key: 'maxOrderItems', unit: '', min: 1, max: 32767, whole: true },
  { key: 'mintCapPercent', unit: '%', min: 0, max: 100 },
  { key: 'historyDays', unit: 'd', min: 1, max: 3650, whole: true },
] as const;

const badField = (field: (typeof fields)[number]) => {
  const value = num(form[field.key]);
  return (
    !(value >= field.min && value <= field.max) || ('whole' in field && !Number.isInteger(value))
  );
};
const badRate = (value: string) => {
  const number = num(value);
  return !(Number.isInteger(number) && number >= 1 && number <= 100);
};
const badTier = (tier: TierDraft) =>
  tier.q1 === undefined ||
  tier.q2 === undefined ||
  tier.q1 >= tier.q2 ||
  badRate(tier.midPercent) ||
  badRate(tier.tailPercent);

const valid = computed(
  () =>
    !fields.some(badField) &&
    !form.tiers.some(badTier) &&
    !Object.values(invalid.value).some(Boolean),
);

const body = computed<MarketSettingsPatch>(() => ({
  sigmaPercent: num(form.sigmaPercent),
  tolerancePercent: num(form.tolerancePercent),
  maxOrderItems: num(form.maxOrderItems),
  mintCapPercent: num(form.mintCapPercent),
  historyDays: num(form.historyDays),
  tiers: form.tiers.map((tier) => ({
    tier: tier.tier as 1 | 2 | 3,
    q1: tier.q1 ?? 0,
    q2: tier.q2 ?? 0,
    midPercent: num(tier.midPercent),
    tailPercent: num(tier.tailPercent),
  })),
}));
const dirty = computed(() => {
  const s = data.value?.settings;
  if (!s || !valid.value) return false;
  const b = body.value;
  return (
    b.sigmaPercent !== s.sigmaPercent ||
    b.tolerancePercent !== s.tolerancePercent ||
    b.maxOrderItems !== s.maxOrderItems ||
    b.mintCapPercent !== s.mintCapPercent ||
    b.historyDays !== s.historyDays ||
    JSON.stringify(b.tiers) !==
      JSON.stringify(
        s.tiers.map(({ tier, q1, q2, midPercent, tailPercent }) => ({
          tier,
          q1,
          q2,
          midPercent,
          tailPercent,
        })),
      )
  );
});

const saving = ref(false);
const refusal = ref<string | null>(null);
async function save() {
  saving.value = true;
  refusal.value = null;
  try {
    await marketAdminActions.updateSettings(body.value);
    await refresh();
    load();
    toast.add({
      title: t('admin.market.settings.saved'),
      color: 'success',
      icon: 'i-lucide-circle-check',
    });
  } catch (failure) {
    if (failure instanceof MarketError) refusal.value = refusalText(failure);
    else throw failure;
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <UAlert
    v-if="error"
    color="error"
    variant="subtle"
    icon="i-lucide-circle-alert"
    :description="t('admin.market.loadFailed')"
  />
  <form v-else-if="data" class="flex flex-col gap-6" @submit.prevent="save">
    <section class="flex flex-col gap-4 rounded-lg bg-elevated px-6 py-5">
      <div>
        <h2 class="text-lg font-medium text-highlighted">{{ t('admin.market.settings.title') }}</h2>
        <p class="text-sm text-muted">{{ t('admin.market.settings.lede') }}</p>
      </div>
      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <UFormField
          v-for="field in fields"
          :key="field.key"
          :label="t(`admin.market.settings.${field.key}`)"
          :help="t(`admin.market.settings.${field.key}Help`)"
        >
          <UInput
            v-model="form[field.key]"
            inputmode="decimal"
            autocomplete="off"
            class="w-full"
            :color="badField(field) ? 'error' : undefined"
          />
        </UFormField>
      </div>
    </section>

    <section class="flex flex-col gap-4 rounded-lg bg-elevated px-6 py-5">
      <div>
        <h2 class="text-lg font-medium text-highlighted">{{ t('admin.market.settings.tiers') }}</h2>
        <p class="text-sm text-muted">{{ t('admin.market.settings.tiersLede') }}</p>
      </div>
      <div v-for="(tier, index) in form.tiers" :key="tier.tier" class="grid gap-4 sm:grid-cols-5">
        <h3 class="pt-8 font-semibold text-highlighted">
          {{ t('admin.market.tier', { tier: tier.tier }) }}
        </h3>
        <UFormField :label="t('admin.market.settings.q1')">
          <EconomyAmountInput v-model="tier.q1" v-model:invalid="invalid[`q1-${String(index)}`]" />
        </UFormField>
        <UFormField :label="t('admin.market.settings.q2')">
          <EconomyAmountInput v-model="tier.q2" v-model:invalid="invalid[`q2-${String(index)}`]" />
        </UFormField>
        <UFormField :label="t('admin.market.settings.mid')">
          <UInput
            v-model="tier.midPercent"
            inputmode="numeric"
            class="w-full"
            :color="badRate(tier.midPercent) ? 'error' : undefined"
          />
        </UFormField>
        <UFormField :label="t('admin.market.settings.tail')">
          <UInput
            v-model="tier.tailPercent"
            inputmode="numeric"
            class="w-full"
            :color="badRate(tier.tailPercent) ? 'error' : undefined"
          />
        </UFormField>
        <p
          v-if="tier.q1 !== undefined && tier.q2 !== undefined && tier.q1 >= tier.q2"
          class="text-sm text-error sm:col-span-5"
          role="alert"
        >
          {{ t('admin.market.settings.thresholds') }}
        </p>
      </div>
    </section>

    <UAlert
      v-if="refusal"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :description="refusal"
      role="alert"
    />
    <p class="border-l-2 border-secondary pl-3 text-sm text-muted">
      {{ t('admin.market.settings.flagsNote') }}
    </p>
    <div class="flex justify-end">
      <UButton
        type="submit"
        :loading="saving"
        :disabled="!dirty"
        :label="t('admin.market.settings.save')"
      />
    </div>
  </form>
</template>
