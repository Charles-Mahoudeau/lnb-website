<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui';

// The bar that rises over the Users table once accounts are selected. A floating layer, so it
// gets the shadow. The table and its filters never move.
defineProps<{ count: number }>();
const emit = defineEmits<{
  act: [action: 'signOut' | 'ban' | 'unban' | 'delete' | 'roles'];
  clear: [];
}>();

const { t } = useI18n();

const moreItems = computed<DropdownMenuItem[][]>(() => [
  [
    {
      label: t('admin.users.bulk.roles'),
      icon: 'i-lucide-shield',
      onSelect: () => {
        emit('act', 'roles');
      },
    },
  ],
  [
    {
      label: t('admin.users.bulk.delete'),
      icon: 'i-lucide-trash-2',
      color: 'error',
      onSelect: () => {
        emit('act', 'delete');
      },
    },
  ],
]);
</script>

<template>
  <div class="pointer-events-none fixed inset-x-4 bottom-4 z-20 flex justify-center">
    <div
      role="toolbar"
      :aria-label="t('admin.users.bulk.toolbar')"
      class="pointer-events-auto flex flex-wrap items-center justify-center gap-2 rounded-lg border border-default bg-accented py-2 pr-2 pl-4 shadow-lg"
    >
      <span class="mr-1 font-semibold whitespace-nowrap tabular-nums">
        {{ t('admin.users.bulk.selected', count) }}
      </span>
      <UButton
        color="neutral"
        variant="outline"
        size="md"
        icon="i-lucide-log-out"
        :aria-label="t('admin.users.bulk.signOut')"
        @click="emit('act', 'signOut')"
      >
        <span class="hidden sm:inline">{{ t('admin.users.bulk.signOut') }}</span>
      </UButton>
      <UButton
        color="error"
        variant="outline"
        size="md"
        icon="i-lucide-ban"
        :aria-label="t('admin.users.bulk.ban')"
        @click="emit('act', 'ban')"
      >
        <span class="hidden sm:inline">{{ t('admin.users.bulk.ban') }}</span>
      </UButton>
      <UButton
        color="neutral"
        variant="outline"
        size="md"
        icon="i-lucide-undo-2"
        :aria-label="t('admin.users.bulk.unban')"
        @click="emit('act', 'unban')"
      >
        <span class="hidden sm:inline">{{ t('admin.users.bulk.unban') }}</span>
      </UButton>
      <UDropdownMenu :items="moreItems" :content="{ side: 'top', align: 'end' }">
        <UButton
          color="neutral"
          variant="outline"
          size="md"
          icon="i-lucide-ellipsis"
          :aria-label="t('admin.users.bulk.more')"
        >
          <span class="hidden sm:inline">{{ t('admin.users.bulk.more') }}</span>
        </UButton>
      </UDropdownMenu>
      <UButton
        color="neutral"
        variant="ghost"
        size="md"
        icon="i-lucide-x"
        :aria-label="t('admin.users.bulk.clear')"
        @click="emit('clear')"
      />
    </div>
  </div>
</template>
