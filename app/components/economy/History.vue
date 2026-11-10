<script setup lang="ts">
import type { EconomyTransactionView } from '#shared/schemas/economy';

// An account's history, grouped by day, newest first, with older pages on demand.
const props = defineProps<{ accountId: string }>();
const emit = defineEmits<{ failed: [caught: unknown] }>();
const { t, locale } = useI18n();

const id = toRef(props, 'accountId');
const { data, error } = await useEconomyHistory(id);

const older = ref<EconomyTransactionView[]>([]);
const olderCursor = ref<string | null | undefined>(undefined);
const loading = ref(false);
watch(data, () => {
  older.value = [];
  olderCursor.value = undefined;
});
const items = computed(() => [...(data.value?.items ?? []), ...older.value]);
const nextCursor = computed(() =>
  olderCursor.value === undefined ? (data.value?.nextCursor ?? null) : olderCursor.value,
);

async function more() {
  if (!nextCursor.value) return;
  loading.value = true;
  try {
    const page = await economyActions.moreHistory(props.accountId, nextCursor.value);
    older.value.push(...page.items);
    olderCursor.value = page.nextCursor;
  } catch (caught) {
    emit('failed', caught);
  } finally {
    loading.value = false;
  }
}

const today = economyDayKey(new Date().toISOString());
const yesterday = economyDayKey(new Date(Date.now() - 86_400_000).toISOString());

const days = computed(() => {
  const groups: { day: string; items: EconomyTransactionView[] }[] = [];
  for (const item of items.value) {
    const day = economyDayKey(item.at);
    const last = groups.at(-1);
    if (last?.day === day) last.items.push(item);
    else groups.push({ day, items: [item] });
  }
  return groups;
});

function dayLabel(day: string): string {
  if (day === today) return t('economy.history.today');
  if (day === yesterday) return t('economy.history.yesterday');
  return formatEconomyDay(day, locale.value);
}

function who(item: EconomyTransactionView): string {
  return (
    counterpartyName(item.counterparty) ??
    t(`economy.history.counterparty.${item.counterparty.type}`)
  );
}

function title(item: EconomyTransactionView): string {
  switch (item.kind) {
    case 'payment':
    case 'casino':
      return item.amount > 0
        ? t('economy.history.received', { who: who(item) })
        : t('economy.history.paid', { who: who(item) });
    case 'mint':
      return item.reason === 'startingBalance'
        ? t('economy.history.startingBalance')
        : t('economy.history.adjustment');
    case 'burn':
      return t('economy.history.adjustment');
    case 'reversal':
      return t('economy.history.reversal');
  }
}
</script>

<template>
  <UAlert
    v-if="error"
    color="error"
    variant="subtle"
    icon="i-lucide-circle-alert"
    :description="t('economy.loadFailed')"
  />
  <div
    v-else-if="data && !items.length"
    class="flex flex-col items-center gap-2 rounded-lg bg-elevated px-5 py-10 text-center"
  >
    <h3 class="font-sans text-base font-semibold text-highlighted">
      {{ t('economy.history.empty.title') }}
    </h3>
    <p class="max-w-md text-muted">{{ t('economy.history.empty.body') }}</p>
  </div>
  <div v-else class="flex flex-col gap-5">
    <section v-for="group in days" :key="group.day" class="flex flex-col gap-2">
      <h3 class="font-sans text-sm font-semibold text-muted">{{ dayLabel(group.day) }}</h3>
      <ul class="flex flex-col divide-y divide-default rounded-lg bg-elevated">
        <li
          v-for="item in group.items"
          :key="item.id"
          class="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3"
        >
          <span class="flex min-w-48 flex-1 flex-col">
            <span class="font-semibold text-highlighted">{{ title(item) }}</span>
            <span v-if="item.memo" class="text-sm text-muted">
              {{
                item.kind === 'payment' ? t('economy.history.memo', { memo: item.memo }) : item.memo
              }}
            </span>
          </span>
          <UBadge
            v-if="item.kind === 'casino'"
            color="neutral"
            variant="soft"
            size="sm"
            :label="t('economy.kinds.casino')"
          />
          <UBadge
            v-if="item.reversed"
            color="neutral"
            variant="soft"
            size="sm"
            :label="t('economy.history.reversed')"
          />
          <span class="text-sm text-muted tabular-nums">{{
            formatEconomyTime(item.at, locale)
          }}</span>
          <span
            class="w-24 text-right font-bold tabular-nums"
            :class="item.amount < 0 ? 'text-muted' : 'text-highlighted'"
          >
            {{ formatSignedLnbits(item.amount, locale) }}
          </span>
        </li>
      </ul>
    </section>
    <UButton
      v-if="nextCursor"
      color="neutral"
      variant="soft"
      class="self-start"
      :loading="loading"
      :label="t('economy.history.more')"
      @click="more"
    />
  </div>
</template>
