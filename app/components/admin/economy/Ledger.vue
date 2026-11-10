<script setup lang="ts">
import { AdminEconomyReasonModal } from '#components';

import type {
  EconomyLedgerQuery,
  EconomyLedgerRow,
  EconomyLedgerSide,
  EconomyTransactionKind,
} from '#shared/schemas/economy';
import { ECONOMY_TRANSACTION_KINDS } from '#shared/schemas/economy';

// Every transaction, newest first, with filters and a reversal on each line.
const { t, locale } = useI18n();
const toast = useToast();
const overlay = useOverlay();
const reasonModal = overlay.create(AdminEconomyReasonModal);

const search = ref('');
const kind = ref<'all' | EconomyTransactionKind>('all');
const query = ref<EconomyLedgerQuery>({});
let timer: ReturnType<typeof setTimeout> | undefined;
watch([search, kind], () => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    query.value = {
      q: search.value.trim() || undefined,
      kind: kind.value === 'all' ? undefined : kind.value,
    };
  }, 250);
});

const { data, error, refresh } = await useEconomyLedger(query);
const more = ref<EconomyLedgerRow[]>([]);
const moreCursor = ref<string | null | undefined>(undefined);
watch(data, () => {
  more.value = [];
  moreCursor.value = undefined;
});
const rows = computed(() => [...(data.value?.items ?? []), ...more.value]);
const nextCursor = computed(() =>
  moreCursor.value === undefined ? (data.value?.nextCursor ?? null) : moreCursor.value,
);
const loading = ref(false);

function fail(caught: unknown) {
  const problem = caught instanceof EconomyError ? caught.problem : 'failed';
  toast.add({
    title: t(`economy.errors.${problem}`),
    color: 'error',
    icon: 'i-lucide-circle-alert',
  });
}

async function loadMore() {
  if (!nextCursor.value) return;
  loading.value = true;
  try {
    const page = await economyAdminActions.moreLedger({ ...query.value, cursor: nextCursor.value });
    more.value.push(...page.items);
    moreCursor.value = page.nextCursor;
  } catch (caught) {
    fail(caught);
  } finally {
    loading.value = false;
  }
}

const kindItems = computed(() => [
  { label: t('admin.economy.ledger.allKinds'), value: 'all' },
  ...ECONOMY_TRANSACTION_KINDS.map((value) => ({ label: t(`economy.kinds.${value}`), value })),
]);

function sideLabel(side: EconomyLedgerSide): string {
  if (side.type === 'lnb') return t('economy.history.counterparty.lnb');
  if (side.handle) return `#${side.handle}`;
  return side.owner ?? t('admin.economy.deletedAccount');
}
function sides(list: EconomyLedgerSide[]): string {
  return list.map(sideLabel).join(', ');
}

async function onReverse(row: EconomyLedgerRow) {
  const reason: unknown = await reasonModal.open({
    title: t('admin.economy.reverse.title'),
    description: t('admin.economy.reverse.lede', {
      amount: formatLnbits(row.amount, locale.value),
    }),
    confirmLabel: t('admin.economy.reverse.confirm'),
    reasonLabel: t('admin.economy.reverse.reason'),
  }).result;
  if (typeof reason !== 'string' || !reason) return;
  try {
    await economyAdminActions.reverse(row.id, reason);
    toast.add({
      title: t('admin.economy.reverse.done'),
      color: 'success',
      icon: 'i-lucide-circle-check',
    });
    await refresh();
  } catch (caught) {
    fail(caught);
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap gap-3">
      <UInput
        v-model="search"
        icon="i-lucide-search"
        class="min-w-64 flex-1"
        :placeholder="t('admin.economy.ledger.search')"
        :aria-label="t('admin.economy.ledger.search')"
      />
      <USelect
        v-model="kind"
        :items="kindItems"
        class="w-48"
        :aria-label="t('admin.economy.ledger.kind')"
      />
    </div>
    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :description="t('admin.economy.loadFailed')"
    />
    <p
      v-else-if="data && !rows.length"
      class="rounded-lg bg-elevated px-6 py-8 text-center text-muted"
    >
      {{ t('admin.economy.ledger.empty') }}
    </p>
    <div v-else class="overflow-x-auto rounded-lg bg-elevated">
      <table class="w-full min-w-3xl text-left">
        <thead class="text-sm text-muted">
          <tr>
            <th class="px-4 py-2.5 font-semibold">{{ t('admin.economy.ledger.when') }}</th>
            <th class="px-4 py-2.5 font-semibold">{{ t('admin.economy.ledger.kind') }}</th>
            <th class="px-4 py-2.5 font-semibold">{{ t('admin.economy.ledger.from') }}</th>
            <th class="px-4 py-2.5 font-semibold">{{ t('admin.economy.ledger.to') }}</th>
            <th class="px-4 py-2.5 text-right font-semibold">
              {{ t('admin.economy.ledger.amount') }}
            </th>
            <th class="px-4 py-2.5">
              <span class="sr-only">{{ t('admin.economy.ledger.actions') }}</span>
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-default border-t border-default">
          <tr v-for="row in rows" :key="row.id">
            <td class="px-4 py-2.5 whitespace-nowrap text-muted tabular-nums">
              {{ formatWardenRelative(row.at, locale) }}
            </td>
            <td class="px-4 py-2.5">
              <UBadge
                color="neutral"
                variant="soft"
                size="sm"
                :label="t(`economy.kinds.${row.kind}`)"
              />
            </td>
            <td class="px-4 py-2.5">{{ sides(row.from) }}</td>
            <td class="px-4 py-2.5">
              {{ sides(row.to) }}
              <span v-if="row.memo || row.actor" class="block text-sm text-muted">
                {{
                  [row.memo, row.actor ? t('admin.economy.ledger.by', { name: row.actor }) : null]
                    .filter(Boolean)
                    .join(', ')
                }}
              </span>
            </td>
            <td class="px-4 py-2.5 text-right font-bold tabular-nums">
              {{ formatLnbits(row.amount, locale) }}
            </td>
            <td class="px-4 py-2.5 text-right">
              <span
                v-if="row.reversedBy"
                class="inline-flex h-8 items-center gap-1.5 px-2.5 text-sm font-medium text-muted"
              >
                <UIcon name="i-lucide-undo-2" class="size-4" />
                {{ t('economy.history.reversed') }}
              </span>
              <UButton
                v-else-if="row.kind !== 'reversal'"
                size="md"
                color="neutral"
                variant="ghost"
                :label="t('admin.economy.reverse.confirm')"
                @click="onReverse(row)"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <UButton
      v-if="nextCursor"
      color="neutral"
      variant="soft"
      class="self-start"
      :loading="loading"
      :label="t('admin.economy.more')"
      @click="loadMore"
    />
  </div>
</template>
