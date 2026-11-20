<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui';

import { AdminEconomyAdjustModal, AdminEconomyReasonModal } from '#components';

import type { EconomyAdminAccountDetail } from '#shared/schemas/economy';
import { economyAdjustBody } from '#shared/schemas/economy';

// The top of a shared account's page: its name, balance and state, and the actions. Destructive
// ones are outline buttons. On a phone the actions fold into the ⋯ menu. `changed` tells the page
// that money moved or the account's state did, so it loads again.
const props = defineProps<{ account: EconomyAdminAccountDetail }>();
const emit = defineEmits<{ changed: [] }>();

const { t, locale } = useI18n();
const toast = useToast();
const overlay = useOverlay();
const adjustModal = overlay.create(AdminEconomyAdjustModal);
const reasonModal = overlay.create(AdminEconomyReasonModal);

const title = computed(() => props.account.name ?? '');

async function run(action: () => Promise<unknown>, success: string) {
  try {
    await action();
    toast.add({ title: success, color: 'success', icon: 'i-lucide-circle-check' });
    emit('changed');
  } catch (caught) {
    const problem = caught instanceof EconomyError ? caught.problem : 'failed';
    toast.add({
      title: t(`economy.errors.${problem}`),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  }
}

async function onAdjust(direction: 'mint' | 'burn') {
  const result: unknown = await adjustModal.open({
    label: title.value,
    balance: props.account.balance,
    direction,
  }).result;
  const parsed = economyAdjustBody.safeParse(result);
  if (!parsed.success) return;
  const body = parsed.data;
  await run(
    () => economyAdminActions.adjust(props.account.id, body),
    t(`admin.economy.adjust.done.${body.direction}`, {
      amount: formatLnbits(body.amount, locale.value),
    }),
  );
}

async function onFreeze() {
  if (props.account.frozenAt) {
    await run(
      () => economyAdminActions.freeze(props.account.id, { frozen: false }),
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
      () => economyAdminActions.freeze(props.account.id, { frozen: true, reason }),
      t('admin.economy.freeze.done'),
    );
  }
}

interface Action {
  key: string;
  label: string;
  icon: string;
  destructive?: boolean;
  onSelect: () => void;
}

const actions = computed<Action[]>(() => {
  if (props.account.closed) return [];
  return [
    {
      key: 'mint',
      label: t('admin.economy.adjust.mint'),
      icon: 'i-lucide-sparkles',
      onSelect: () => void onAdjust('mint'),
    },
    {
      key: 'burn',
      label: t('admin.economy.adjust.burn'),
      icon: 'i-lucide-flame',
      onSelect: () => void onAdjust('burn'),
    },
    props.account.frozenAt
      ? {
          key: 'freeze',
          label: t('admin.economy.freeze.lift'),
          icon: 'i-lucide-sun',
          onSelect: () => void onFreeze(),
        }
      : {
          key: 'freeze',
          label: t('admin.economy.freeze.confirm'),
          icon: 'i-lucide-snowflake',
          destructive: true,
          onSelect: () => void onFreeze(),
        },
  ];
});

const menu = computed<DropdownMenuItem[]>(() =>
  actions.value.map((action) => ({
    label: action.label,
    icon: action.icon,
    color: action.destructive ? 'error' : undefined,
    onSelect: action.onSelect,
  })),
);
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap items-start justify-between gap-5">
      <div class="flex min-w-0 flex-col gap-1.5">
        <div class="flex flex-wrap items-center gap-3">
          <h2 class="text-3xl font-bold break-words text-highlighted">{{ title }}</h2>
          <UBadge
            v-if="account.type"
            color="neutral"
            variant="soft"
            :label="t(`economy.types.${account.type}`)"
          />
          <UBadge
            v-if="account.closed"
            color="neutral"
            variant="soft"
            :label="t('admin.economy.closed')"
          />
          <UBadge
            v-else-if="account.frozen"
            color="warning"
            variant="subtle"
            icon="i-lucide-snowflake"
            :label="t('economy.accounts.frozen')"
          />
        </div>
        <span class="text-muted">
          {{
            t('admin.economy.account.sharedSub', {
              handle: account.handle,
              date: formatWardenDate(account.createdAt, locale),
            })
          }}
        </span>
        <span class="font-display text-2xl font-bold text-highlighted tabular-nums">
          {{ formatLnbits(account.balance, locale) }}
        </span>
      </div>
      <div v-if="actions.length" class="flex flex-wrap items-center gap-3">
        <div class="hidden flex-wrap gap-3 sm:flex">
          <UButton
            v-for="action in actions"
            :key="action.key"
            :color="action.destructive ? 'error' : 'neutral'"
            :variant="action.destructive ? 'outline' : 'soft'"
            :icon="action.icon"
            :label="action.label"
            @click="action.onSelect"
          />
        </div>
        <UDropdownMenu :items="menu" :content="{ align: 'end' }">
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-ellipsis"
            class="sm:hidden"
            :aria-label="t('admin.person.more')"
          />
        </UDropdownMenu>
      </div>
    </div>
    <p v-if="account.frozenReason" class="text-sm text-muted">
      {{ t('admin.economy.account.frozenReason', { reason: account.frozenReason }) }}
    </p>
  </div>
</template>
