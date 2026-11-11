<script setup lang="ts">
import { EconomyCreateModal } from '#components';

import type { EconomyAccountView } from '#shared/schemas/economy';

// The player's bank (docs/economy.md): their accounts on the left, the chosen one on the right.
definePageMeta({ flag: 'economy' });

const { t } = useI18n();
const toast = useToast();
const route = useRoute();
const overlay = useOverlay();
const { isEnabled } = useFlags();

useSeoMeta({ title: () => t('economy.bank.title'), robots: 'noindex' });

const { data: me, error, refresh } = await useEconomyMe();

const selectedId = computed(() => {
  const wanted = typeof route.query.account === 'string' ? route.query.account : null;
  const accounts = me.value?.accounts ?? [];
  return (accounts.find((account) => account.id === wanted) ?? accounts[0])?.id ?? '';
});
const selected = computed(() => me.value?.accounts.find((a) => a.id === selectedId.value));

function select(account: EconomyAccountView) {
  void navigateTo({ query: { ...route.query, account: account.id } }, { replace: true });
}

function fail(caught: unknown) {
  const problem = caught instanceof EconomyError ? caught.problem : 'failed';
  toast.add({
    title: t(`economy.errors.${problem}`),
    color: 'error',
    icon: 'i-lucide-circle-alert',
  });
}

/** Runs a change, then reloads the bank. Returns whether it worked. */
async function run(action: () => Promise<unknown>, success?: string): Promise<boolean> {
  try {
    await action();
    if (success) toast.add({ title: success, color: 'success', icon: 'i-lucide-circle-check' });
    await refresh();
    return true;
  } catch (caught) {
    fail(caught);
    return false;
  }
}

const createModal = overlay.create(EconomyCreateModal);
async function onCreate() {
  const created: unknown = await createModal.open().result;
  if (created && typeof created === 'object' && 'id' in created) {
    await refresh();
    select(created as EconomyAccountView);
  }
}

async function onDefault(account: EconomyAccountView, on: boolean) {
  await run(
    () =>
      economyActions.updateMe({
        defaultAccountId: on && account.kind === 'shared' ? account.id : null,
      }),
    t('economy.bank.defaultSaved'),
  );
}

const sharedAllowed = computed(() => isEnabled('economy.sharedAccounts'));
const canCreate = computed(
  () => sharedAllowed.value && (me.value?.ownedShared ?? 0) < (me.value?.maxOwnedShared ?? 0),
);
</script>

<template>
  <UContainer class="flex flex-col gap-8 py-14">
    <div class="flex flex-col gap-2">
      <h1 class="text-4xl font-bold text-highlighted">{{ t('economy.bank.title') }}</h1>
      <p class="max-w-2xl text-lg text-muted">{{ t('economy.bank.lede') }}</p>
    </div>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :description="t('economy.loadFailed')"
    />

    <!-- No linked Minecraft account yet: a short, centered empty state. -->
    <div
      v-else-if="me && !me.eligible"
      class="flex flex-col items-center gap-3 rounded-lg bg-elevated px-5 py-10 text-center"
    >
      <IconTile icon="i-lucide-landmark" />
      <h2 class="text-xl font-medium text-highlighted">
        {{ t('economy.bank.notEligible.title') }}
      </h2>
      <p class="max-w-md text-muted">{{ t('economy.bank.notEligible.lede') }}</p>
      <UButton to="/minecraft/warden" :label="t('economy.bank.notEligible.action')" />
    </div>

    <div v-else-if="me && selected" class="flex flex-wrap items-start gap-8">
      <aside class="flex w-full flex-col gap-4 lg:w-80">
        <EconomyAccountList
          :accounts="me.accounts"
          :selected-id="selectedId"
          :default-id="me.defaultAccountId"
          @select="select"
        />
        <UButton
          v-if="sharedAllowed"
          color="neutral"
          variant="outline"
          icon="i-lucide-plus"
          block
          :disabled="!canCreate"
          :label="t('economy.bank.create')"
          @click="onCreate"
        />
        <p v-if="sharedAllowed && !canCreate" class="text-sm text-muted">
          {{ t('economy.bank.createLimit', { max: me.maxOwnedShared }, me.maxOwnedShared) }}
        </p>
        <EconomyInvitations
          v-if="me.invitations.length"
          :invitations="me.invitations"
          @accept="(id) => run(() => economyActions.accept(id), t('economy.invitations.accepted'))"
          @decline="(id) => run(() => economyActions.decline(id))"
        />
      </aside>

      <section class="flex min-w-0 flex-1 basis-xl flex-col gap-6">
        <EconomyAccountPanel
          :account="selected"
          :is-default="me.defaultAccountId === selected.id"
          :rank="selected.kind === 'personal' ? me.rank : null"
          @default="(on) => onDefault(selected!, on)"
        />
        <EconomyBalanceSection
          :key="`balance-${selected.id}`"
          :url="`/api/economy/accounts/${selected.id}/balance-history`"
        />
        <EconomyAccountTabs
          :key="selected.id"
          :account="selected"
          :hide-from-baltop="me.hideFromBaltop"
          @changed="refresh"
          @closed="select(me.accounts[0]!)"
          @failed="fail"
        />
      </section>
    </div>
  </UContainer>
</template>
