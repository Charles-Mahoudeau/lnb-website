<script setup lang="ts">
import type { EconomyAdminAccountDetail, EconomyTransactionView } from '#shared/schemas/economy';

// The shared account's overview: the money over 30 days, the balance over time and the last few
// transactions, with the rest on the Transactions tab.
const props = defineProps<{ id: string; account: EconomyAdminAccountDetail }>();
const { t, locale } = useI18n();

const recent = ref<EconomyTransactionView[]>([]);
const loaded = ref(false);
onMounted(async () => {
  try {
    recent.value = (await economyAdminActions.history(props.id)).items.slice(0, 5);
  } catch {
    recent.value = [];
  } finally {
    loaded.value = true;
  }
});

function counterparty(item: EconomyTransactionView): string {
  return (
    counterpartyName(item.counterparty) ??
    t(`economy.history.counterparty.${item.counterparty.type}`)
  );
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="grid gap-4 sm:grid-cols-3">
      <div class="flex flex-col gap-1 rounded-lg bg-elevated px-6 py-5">
        <span class="text-sm font-semibold text-muted">{{
          t('admin.economy.account.balance')
        }}</span>
        <span class="font-display text-3xl font-bold text-highlighted tabular-nums">{{
          formatLnbits(account.balance, locale)
        }}</span>
      </div>
      <div class="flex flex-col gap-1 rounded-lg bg-elevated px-6 py-5">
        <span class="text-sm font-semibold text-muted">{{ t('admin.economy.account.in30') }}</span>
        <span class="font-display text-3xl font-bold text-highlighted tabular-nums">{{
          formatLnbits(account.in30, locale)
        }}</span>
      </div>
      <div class="flex flex-col gap-1 rounded-lg bg-elevated px-6 py-5">
        <span class="text-sm font-semibold text-muted">{{ t('admin.economy.account.out30') }}</span>
        <span class="font-display text-3xl font-bold text-highlighted tabular-nums">{{
          formatLnbits(account.out30, locale)
        }}</span>
      </div>
    </div>

    <EconomyBalanceSection :url="`/api/economy/admin/accounts/${id}/balance-history`" wide />

    <section class="flex flex-col gap-3">
      <div class="flex items-center justify-between gap-3">
        <h2 class="text-xl font-medium text-highlighted">
          {{ t('admin.economy.account.recent') }}
        </h2>
        <UButton
          color="neutral"
          variant="ghost"
          :to="`/admin/economy/accounts/${id}/transactions`"
          :label="t('admin.economy.account.allTransactions')"
        />
      </div>
      <p
        v-if="loaded && !recent.length"
        class="rounded-lg bg-elevated px-6 py-8 text-center text-muted"
      >
        {{ t('economy.history.empty.title') }}
      </p>
      <ul v-else class="flex flex-col divide-y divide-default rounded-lg bg-elevated">
        <li
          v-for="item in recent"
          :key="item.id"
          class="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3"
        >
          <span class="flex min-w-48 flex-1 flex-col">
            <span class="text-highlighted">{{ counterparty(item) }}</span>
            <span class="text-sm text-muted">{{ formatWardenRelative(item.at, locale) }}</span>
          </span>
          <UBadge
            color="neutral"
            variant="soft"
            size="sm"
            :label="t(`economy.kinds.${item.kind}`)"
          />
          <span class="w-32 text-right font-bold tabular-nums">{{
            formatSignedLnbits(item.amount, locale)
          }}</span>
        </li>
      </ul>
    </section>
  </div>
</template>
