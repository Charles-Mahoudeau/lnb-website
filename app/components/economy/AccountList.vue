<script setup lang="ts">
import type { EconomyAccountView } from '#shared/schemas/economy';

// The player's accounts, as a list to pick from. The chosen one is state, so it takes the second
// accent (docs/design.md).
defineProps<{ accounts: EconomyAccountView[]; selectedId: string; defaultId: string | null }>();
const emit = defineEmits<{ select: [account: EconomyAccountView] }>();
const { t, locale } = useI18n();

function sub(account: EconomyAccountView, isDefault: boolean): string {
  if (account.kind === 'personal') {
    return isDefault ? t('economy.accounts.paysByDefault') : t('economy.accounts.personalHint');
  }
  return t('economy.accounts.sharedHint', {
    handle: account.handle,
    role: t(`economy.roles.${account.role}`).toLowerCase(),
  });
}
</script>

<template>
  <nav
    class="flex flex-col gap-0.5 rounded-lg bg-elevated p-2"
    :aria-label="t('economy.accounts.title')"
  >
    <button
      v-for="account in accounts"
      :key="account.id"
      type="button"
      class="flex items-center gap-3 rounded-md px-3 py-2.5 text-left hover:bg-accented/50"
      :class="account.id === selectedId ? 'bg-secondary/15 hover:bg-secondary/15' : ''"
      :aria-current="account.id === selectedId ? 'page' : undefined"
      @click="emit('select', account)"
    >
      <span class="flex min-w-0 flex-1 flex-col">
        <span
          class="truncate font-semibold"
          :class="account.id === selectedId ? 'text-secondary' : 'text-highlighted'"
        >
          {{ account.kind === 'personal' ? t('economy.accounts.personal') : account.name }}
        </span>
        <span class="truncate text-sm text-muted">{{
          sub(account, account.id === defaultId)
        }}</span>
      </span>
      <UIcon
        v-if="account.frozen"
        name="i-lucide-snowflake"
        class="size-4 shrink-0 text-muted"
        :aria-label="t('economy.accounts.frozen')"
      />
      <span class="font-semibold text-highlighted tabular-nums">
        {{ formatLnbits(account.balance, locale) }}
      </span>
    </button>
  </nav>
</template>
