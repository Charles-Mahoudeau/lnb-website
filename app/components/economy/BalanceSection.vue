<script setup lang="ts">
import type { EconomyPeriod } from '#shared/schemas/economy';
import { ECONOMY_PERIODS } from '#shared/schemas/economy';

// "Balance over time" for one account, on the bank page and the admin account page. `url` is the
// route to read it from, since players and admins have their own.
const props = defineProps<{ url: string; wide?: boolean }>();
const { t, locale } = useI18n();

const period = ref<EconomyPeriod>('30d');
const url = toRef(props, 'url');
const { data, error } = await useEconomyBalanceHistory(url, period);

const periodItems = computed(() =>
  ECONOMY_PERIODS.map((value) => ({ label: t(`economy.balance.periods.${value}`), value })),
);
const change = computed(() => {
  const days = data.value?.days ?? [];
  const first = days[0];
  const last = days.at(-1);
  if (!first || !last) return 0;
  // From the balance before the first day, so the first day's movements count.
  return last.balance - (first.balance - first.in + first.out);
});
</script>

<template>
  <section
    class="flex flex-col gap-3 rounded-lg bg-elevated px-6 py-5"
    aria-labelledby="economy-balance"
  >
    <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div class="flex min-w-48 flex-1 flex-col">
        <h2 id="economy-balance" class="text-lg font-medium text-highlighted">
          {{ t('economy.balance.title') }}
        </h2>
        <span v-if="data" class="text-sm text-muted tabular-nums">
          {{
            t(`economy.balance.change.${period}`, {
              change: formatSignedLnbits(change, locale),
            })
          }}
        </span>
      </div>
      <span class="flex items-center gap-1.5 text-sm text-muted">
        <span class="size-2.5 rounded-xs bg-current text-highlighted" aria-hidden="true" />
        {{ t('economy.balance.legendBalance') }}
      </span>
      <span class="flex items-center gap-1.5 text-sm text-muted">
        <span class="size-2.5 rounded-xs bg-current text-dimmed" aria-hidden="true" />
        {{ t('economy.balance.legendVolume') }}
      </span>
      <UTabs
        v-model="period"
        :items="periodItems"
        variant="pill"
        size="sm"
        :content="false"
        :aria-label="t('economy.balance.period')"
      />
    </div>
    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :description="t('economy.loadFailed')"
    />
    <EconomyBalanceChart v-else-if="data?.days.length" :days="data.days" :wide="wide" />
  </section>
</template>
