<script setup lang="ts">
import { AdminEconomyReasonModal } from '#components';

import type { EconomyTransactionView } from '#shared/schemas/economy';

// An account's history, newest first, with a reversal on each line. Used by the Person page's
// LNBits tab and by the shared account page. `version` changes when the page did something that
// moves money, so the list loads again; `changed` tells the page a reversal was made.
const props = defineProps<{ id: string; closed: boolean; version?: number }>();
const emit = defineEmits<{ changed: [] }>();
const { t, locale } = useI18n();
const toast = useToast();
const overlay = useOverlay();
const reasonModal = overlay.create(AdminEconomyReasonModal);

const history = ref<EconomyTransactionView[]>([]);
const cursor = ref<string | null>(null);
const loading = ref(false);
async function loadHistory(reset = false) {
  loading.value = true;
  try {
    const page = await economyAdminActions.history(
      props.id,
      reset ? undefined : (cursor.value ?? undefined),
    );
    history.value = reset ? page.items : [...history.value, ...page.items];
    cursor.value = page.nextCursor;
  } catch (caught) {
    fail(caught);
  } finally {
    loading.value = false;
  }
}
onMounted(() => loadHistory(true));
watch(
  () => props.version,
  () => loadHistory(true),
);

function fail(caught: unknown) {
  const problem = caught instanceof EconomyError ? caught.problem : 'failed';
  toast.add({
    title: t(`economy.errors.${problem}`),
    color: 'error',
    icon: 'i-lucide-circle-alert',
  });
}

async function onReverse(item: EconomyTransactionView) {
  const reason: unknown = await reasonModal.open({
    title: t('admin.economy.reverse.title'),
    description: t('admin.economy.reverse.lede', {
      amount: formatSignedLnbits(item.amount, locale.value),
    }),
    confirmLabel: t('admin.economy.reverse.confirm'),
    reasonLabel: t('admin.economy.reverse.reason'),
  }).result;
  if (typeof reason !== 'string' || !reason) return;
  try {
    await economyAdminActions.reverse(item.id, reason);
    toast.add({
      title: t('admin.economy.reverse.done'),
      color: 'success',
      icon: 'i-lucide-circle-check',
    });
    emit('changed');
    await loadHistory(true);
  } catch (caught) {
    fail(caught);
  }
}

function counterparty(item: EconomyTransactionView): string {
  return (
    counterpartyName(item.counterparty) ??
    t(`economy.history.counterparty.${item.counterparty.type}`)
  );
}
</script>

<template>
  <section class="flex flex-col gap-3">
    <h2 class="text-xl font-medium text-highlighted">{{ t('admin.economy.account.history') }}</h2>
    <p
      v-if="!loading && !history.length"
      class="rounded-lg bg-elevated px-6 py-8 text-center text-muted"
    >
      {{ t('economy.history.empty.title') }}
    </p>
    <div v-else class="overflow-x-auto rounded-lg bg-elevated">
      <table class="w-full min-w-2xl text-left">
        <thead class="text-sm text-muted">
          <tr>
            <th class="px-4 py-2.5 font-semibold">{{ t('admin.economy.ledger.when') }}</th>
            <th class="px-4 py-2.5 font-semibold">{{ t('admin.economy.ledger.kind') }}</th>
            <th class="px-4 py-2.5 font-semibold">
              {{ t('admin.economy.ledger.counterparty') }}
            </th>
            <th class="px-4 py-2.5 text-right font-semibold">
              {{ t('admin.economy.ledger.amount') }}
            </th>
            <th class="px-4 py-2.5 text-right font-semibold">
              {{ t('admin.economy.ledger.after') }}
            </th>
            <th class="px-4 py-2.5">
              <span class="sr-only">{{ t('admin.economy.ledger.actions') }}</span>
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-default border-t border-default">
          <tr v-for="item in history" :key="item.id">
            <td class="px-4 py-2.5 whitespace-nowrap text-muted tabular-nums">
              {{ formatWardenRelative(item.at, locale) }}
            </td>
            <td class="px-4 py-2.5">
              <UBadge
                color="neutral"
                variant="soft"
                size="sm"
                :label="t(`economy.kinds.${item.kind}`)"
              />
            </td>
            <td class="px-4 py-2.5">
              {{ counterparty(item) }}
              <span v-if="item.memo" class="block text-sm text-muted">{{ item.memo }}</span>
            </td>
            <td class="px-4 py-2.5 text-right font-bold tabular-nums">
              {{ formatSignedLnbits(item.amount, locale) }}
            </td>
            <td class="px-4 py-2.5 text-right text-muted tabular-nums">
              {{ formatLnbits(item.balanceAfter, locale) }}
            </td>
            <td class="px-4 py-2.5 text-right">
              <span
                v-if="item.reversed"
                class="inline-flex h-8 items-center gap-1.5 px-2.5 text-sm font-medium text-muted"
              >
                <UIcon name="i-lucide-undo-2" class="size-4" />
                {{ t('economy.history.reversed') }}
              </span>
              <UButton
                v-else-if="item.kind !== 'reversal' && !closed"
                size="md"
                color="neutral"
                variant="ghost"
                :label="t('admin.economy.reverse.confirm')"
                @click="onReverse(item)"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <UButton
      v-if="cursor"
      color="neutral"
      variant="soft"
      class="self-start"
      :loading="loading"
      :label="t('admin.economy.more')"
      @click="loadHistory()"
    />
  </section>
</template>
