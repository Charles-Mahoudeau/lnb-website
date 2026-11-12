<script setup lang="ts">
import { AdminEconomyAdjustModal, AdminEconomyReasonModal } from '#components';

import type { EconomyAccountType, EconomyTransactionView } from '#shared/schemas/economy';
import { ECONOMY_ACCOUNT_TYPES, economyAdjustBody } from '#shared/schemas/economy';

// One bank account for economy admins: its numbers, its type, mint and burn, freezing, and its
// history with a reversal on each line.
const props = defineProps<{ id: string }>();
const { t, locale } = useI18n();
const toast = useToast();
const overlay = useOverlay();

const { data, error, refresh } = await useEconomyAdminAccount(props.id);
const adjustModal = overlay.create(AdminEconomyAdjustModal);
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

function fail(caught: unknown) {
  const problem = caught instanceof EconomyError ? caught.problem : 'failed';
  toast.add({
    title: t(`economy.errors.${problem}`),
    color: 'error',
    icon: 'i-lucide-circle-alert',
  });
}

async function run(action: () => Promise<unknown>, success: string) {
  try {
    await action();
    toast.add({ title: success, color: 'success', icon: 'i-lucide-circle-check' });
    await Promise.all([refresh(), loadHistory(true)]);
  } catch (caught) {
    fail(caught);
  }
}

const title = computed(() => {
  const account = data.value;
  if (!account) return '';
  if (account.kind === 'shared') return account.name ?? '';
  return account.owner?.name ?? t('admin.economy.deletedAccount');
});

async function onAdjust(direction: 'mint' | 'burn') {
  if (!data.value) return;
  const result: unknown = await adjustModal.open({
    label: title.value,
    balance: data.value.balance,
    direction,
  }).result;
  const parsed = economyAdjustBody.safeParse(result);
  if (!parsed.success) return;
  const body = parsed.data;
  await run(
    () => economyAdminActions.adjust(props.id, body),
    t(`admin.economy.adjust.done.${body.direction}`, {
      amount: formatLnbits(body.amount, locale.value),
    }),
  );
}

const typeItems = computed(() =>
  ECONOMY_ACCOUNT_TYPES.map((value) => ({ label: t(`economy.types.${value}`), value })),
);
// Admins set any type, with no licence: for casinos that were there before the licences.
async function onType(type: EconomyAccountType) {
  if (type === data.value?.type) return;
  await run(
    () => economyAdminActions.setType(props.id, type),
    t('admin.economy.account.typeSaved'),
  );
}

async function onFreeze() {
  if (!data.value) return;
  if (data.value.frozenAt) {
    await run(
      () => economyAdminActions.freeze(props.id, { frozen: false }),
      t('admin.economy.freeze.lifted'),
    );
    return;
  }
  const reason: unknown = await reasonModal.open({
    title: t('admin.economy.freeze.title', { name: title.value }),
    description: t('admin.economy.freeze.lede'),
    confirmLabel: t('admin.economy.freeze.confirm'),
    reasonLabel: t('admin.economy.freeze.reason'),
    maxLength: 500,
    destructive: true,
  }).result;
  if (typeof reason === 'string' && reason) {
    await run(
      () => economyAdminActions.freeze(props.id, { frozen: true, reason }),
      t('admin.economy.freeze.done'),
    );
  }
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
  if (typeof reason === 'string' && reason) {
    await run(() => economyAdminActions.reverse(item.id, reason), t('admin.economy.reverse.done'));
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
  <UAlert
    v-if="error"
    color="error"
    variant="subtle"
    icon="i-lucide-circle-alert"
    :description="t('admin.economy.loadFailed')"
  />
  <div v-else-if="data" class="flex flex-col gap-6">
    <div class="flex flex-wrap items-end gap-4">
      <div class="flex min-w-64 flex-1 flex-col gap-1.5">
        <h1 class="text-3xl font-bold text-highlighted">{{ title }}</h1>
        <div class="flex flex-wrap items-center gap-2 text-muted">
          <span>
            {{
              data.kind === 'shared'
                ? t('admin.economy.account.sharedSub', {
                    handle: data.handle,
                    date: formatWardenDate(data.createdAt, locale),
                  })
                : t('admin.economy.account.personalSub', {
                    username: data.owner?.username ?? '—',
                    date: formatWardenDate(data.createdAt, locale),
                  })
            }}
          </span>
          <UBadge
            v-if="data.type"
            color="neutral"
            variant="soft"
            :label="t(`economy.types.${data.type}`)"
          />
          <UBadge
            v-if="data.closed"
            color="neutral"
            variant="soft"
            :label="t('admin.economy.closed')"
          />
          <UBadge
            v-else-if="data.frozen"
            color="warning"
            variant="subtle"
            icon="i-lucide-snowflake"
            :label="
              data.ownerBanned && !data.frozenAt
                ? t('admin.economy.account.banned')
                : t('economy.accounts.frozen')
            "
          />
          <UBadge
            v-else
            color="success"
            variant="subtle"
            :label="t('admin.economy.account.active')"
          />
        </div>
        <p v-if="data.frozenReason" class="text-sm text-muted">
          {{ t('admin.economy.account.frozenReason', { reason: data.frozenReason }) }}
        </p>
      </div>
      <div v-if="!data.closed" class="flex flex-wrap gap-2">
        <USelect
          v-if="data.type"
          :model-value="data.type"
          :items="typeItems"
          value-key="value"
          :aria-label="t('admin.economy.account.type')"
          class="w-36"
          @update:model-value="onType"
        />
        <UButton
          color="neutral"
          variant="soft"
          icon="i-lucide-sparkles"
          :label="t('admin.economy.adjust.mint')"
          @click="onAdjust('mint')"
        />
        <UButton
          color="neutral"
          variant="soft"
          icon="i-lucide-flame"
          :label="t('admin.economy.adjust.burn')"
          @click="onAdjust('burn')"
        />
        <UButton
          v-if="data.frozenAt"
          color="neutral"
          variant="soft"
          icon="i-lucide-sun"
          :label="t('admin.economy.freeze.lift')"
          @click="onFreeze"
        />
        <UButton
          v-else
          color="error"
          variant="outline"
          icon="i-lucide-snowflake"
          :label="t('admin.economy.freeze.confirm')"
          @click="onFreeze"
        />
      </div>
    </div>

    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <div class="flex flex-col gap-1 rounded-lg bg-elevated px-6 py-5">
        <span class="text-sm font-semibold text-muted">{{
          t('admin.economy.account.balance')
        }}</span>
        <span class="font-display text-3xl font-bold text-highlighted tabular-nums">{{
          formatLnbits(data.balance, locale)
        }}</span>
      </div>
      <div class="flex flex-col gap-1 rounded-lg bg-elevated px-6 py-5">
        <span class="text-sm font-semibold text-muted">{{ t('admin.economy.account.in30') }}</span>
        <span class="font-display text-3xl font-bold text-highlighted tabular-nums">{{
          formatLnbits(data.in30, locale)
        }}</span>
      </div>
      <div class="flex flex-col gap-1 rounded-lg bg-elevated px-6 py-5">
        <span class="text-sm font-semibold text-muted">{{ t('admin.economy.account.out30') }}</span>
        <span class="font-display text-3xl font-bold text-highlighted tabular-nums">{{
          formatLnbits(data.out30, locale)
        }}</span>
      </div>
      <div class="flex flex-col gap-1 rounded-lg bg-elevated px-6 py-5">
        <span class="text-sm font-semibold text-muted">{{
          t('admin.economy.account.members')
        }}</span>
        <span v-if="data.kind === 'personal'" class="text-highlighted">
          {{ data.owner ? data.owner.name : t('admin.economy.deletedAccount') }}
        </span>
        <span v-else class="flex flex-col text-sm">
          <span v-for="member in data.members" :key="member.userId">
            <strong class="text-highlighted">{{ member.name ?? member.username }}</strong>
            <span class="text-muted"> {{ t(`economy.roles.${member.role}`).toLowerCase() }}</span>
          </span>
        </span>
      </div>
    </div>

    <EconomyBalanceSection :url="`/api/economy/admin/accounts/${id}/balance-history`" wide />

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
                  v-else-if="item.kind !== 'reversal' && !data.closed"
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
  </div>
</template>
