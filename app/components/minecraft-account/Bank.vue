<script setup lang="ts">
// The bank card of /minecraft/account: the personal balance, the baltop place and the shared
// accounts. Reads the bank's own endpoint, so there's no new data (docs/economy.md).
const { t, locale } = useI18n();

const { data: me, error } = await useEconomyMe();

const personal = computed(() => me.value?.accounts.find((account) => account.kind === 'personal'));
const shared = computed(
  () => me.value?.accounts.filter((account) => account.kind === 'shared') ?? [],
);
</script>

<template>
  <section
    v-if="me?.eligible && !error"
    class="flex flex-col gap-5 rounded-lg bg-elevated p-6"
    aria-labelledby="minecraft-account-bank"
  >
    <div class="flex flex-wrap items-baseline justify-between gap-3">
      <h2 id="minecraft-account-bank" class="text-xl font-medium text-highlighted">
        {{ t('economy.bank.title') }}
      </h2>
      <UBadge
        v-if="me.rank !== null"
        color="neutral"
        variant="subtle"
        :label="t('minecraftAccount.bank.rank', { rank: me.rank })"
      />
    </div>

    <div class="flex items-baseline gap-2">
      <span class="font-display text-4xl font-bold text-highlighted tabular-nums">
        {{ formatLnbits(personal?.balance ?? 0, locale) }}
      </span>
      <span class="text-muted">{{ t('minecraftAccount.bank.unit') }}</span>
    </div>

    <div v-if="shared.length" class="flex flex-col gap-2">
      <span class="text-sm font-semibold tracking-wide text-muted uppercase">
        {{ t('minecraftAccount.bank.shared') }}
      </span>
      <ul class="flex flex-col divide-y divide-default">
        <li
          v-for="account in shared"
          :key="account.id"
          class="flex items-center justify-between gap-3 py-2"
        >
          <span class="flex min-w-0 flex-col">
            <span class="truncate font-semibold text-highlighted">
              {{ account.name ?? `#${account.handle}` }}
            </span>
            <span class="text-sm text-muted">{{ t(`economy.roles.${account.role}`) }}</span>
          </span>
          <span class="tabular-nums">{{ formatLnbits(account.balance, locale) }}</span>
        </li>
      </ul>
    </div>

    <UButton
      to="/minecraft/bank"
      color="neutral"
      variant="soft"
      size="md"
      class="self-start"
      :label="t('minecraftAccount.bank.open')"
    />
  </section>
</template>
