<script setup lang="ts">
import type { EconomyAccountView } from '#shared/schemas/economy';

// The chosen account: its balance, and whether it pays in the game.
const props = defineProps<{
  account: EconomyAccountView;
  isDefault: boolean;
  rank: number | null;
}>();
const emit = defineEmits<{ default: [on: boolean] }>();
const { t, locale } = useI18n();

const canSpend = computed(() => props.account.role !== 'viewer');
</script>

<template>
  <div class="flex flex-col gap-5 rounded-lg bg-elevated p-6 sm:p-7">
    <div class="flex flex-wrap items-center gap-3">
      <div class="flex min-w-0 flex-1 flex-col">
        <span class="text-lg font-semibold text-highlighted">
          {{ account.kind === 'personal' ? t('economy.accounts.personal') : account.name }}
        </span>
        <span class="text-sm text-muted">
          {{
            account.kind === 'personal'
              ? t('economy.accounts.personalHint')
              : t(
                  'economy.accounts.sharedPanelHint',
                  {
                    handle: account.handle,
                    n: account.memberCount,
                    role: t(`economy.roles.${account.role}`).toLowerCase(),
                  },
                  account.memberCount,
                )
          }}
        </span>
      </div>
      <UBadge
        v-if="account.type"
        color="neutral"
        variant="soft"
        :label="t(`economy.types.${account.type}`)"
      />
      <UBadge
        v-if="account.frozen"
        color="warning"
        variant="subtle"
        icon="i-lucide-snowflake"
        :label="t('economy.accounts.frozen')"
      />
      <NuxtLink
        v-else-if="rank"
        to="/minecraft/baltop"
        class="text-sm text-muted hover:text-highlighted"
      >
        {{ t('economy.accounts.rank', { rank }) }}
      </NuxtLink>
    </div>

    <p class="flex items-baseline gap-2.5">
      <span class="font-display text-5xl font-bold text-highlighted tabular-nums">
        {{ formatLnbits(account.balance, locale) }}
      </span>
      <span class="font-semibold text-muted">{{ t('economy.currency') }}</span>
    </p>

    <p v-if="account.frozen" class="text-sm text-muted">{{ t('economy.accounts.frozenHint') }}</p>

    <div v-if="canSpend" class="border-t border-default pt-4">
      <USwitch
        :model-value="isDefault"
        :disabled="(isDefault && account.kind === 'personal') || account.frozen"
        :label="t('economy.accounts.paysByDefault')"
        :description="t('economy.accounts.paysByDefaultHint')"
        @update:model-value="(on) => emit('default', on)"
      />
    </div>
  </div>
</template>
