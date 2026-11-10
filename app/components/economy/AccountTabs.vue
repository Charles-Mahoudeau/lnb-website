<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui';

import type { EconomyAccountView } from '#shared/schemas/economy';

// History, members and settings of the chosen account. Personal accounts have no members.
const props = defineProps<{ account: EconomyAccountView; hideFromBaltop: boolean }>();
const emit = defineEmits<{ changed: []; closed: []; failed: [caught: unknown] }>();
const { t } = useI18n();

const tab = ref('history');
const items = computed<TabsItem[]>(() => [
  { label: t('economy.tabs.history'), value: 'history' },
  ...(props.account.kind === 'shared'
    ? [{ label: t('economy.tabs.members'), value: 'members' }]
    : []),
  { label: t('economy.tabs.settings'), value: 'settings' },
]);
</script>

<template>
  <div class="flex flex-col gap-4">
    <UTabs v-model="tab" :items="items" variant="pill" :content="false" class="self-start" />
    <EconomyHistory
      v-if="tab === 'history'"
      :account-id="account.id"
      @failed="emit('failed', $event)"
    />
    <EconomyMembers
      v-else-if="tab === 'members'"
      :account="account"
      @changed="emit('changed')"
      @failed="emit('failed', $event)"
    />
    <EconomyAccountSettings
      v-else
      :account="account"
      :hide-from-baltop="hideFromBaltop"
      @changed="emit('changed')"
      @closed="emit('closed')"
      @failed="emit('failed', $event)"
    />
  </div>
</template>
