<script setup lang="ts">
import type { WardenAuditView } from '#shared/schemas/warden';

// The activity tab: the whole audit log, filtered by action and source.
const { t } = useI18n();

const action = ref('all');
const source = ref('all');
const filters = computed(() => ({
  action: action.value === 'all' ? undefined : action.value,
  source: source.value === 'all' ? undefined : source.value,
}));

const { audit, more } = useWardenAudit(filters);
const { data } = await audit;

const older = ref<WardenAuditView[]>([]);
const olderCursor = ref<string | null | undefined>(undefined);
const loadingMore = ref(false);
watch(data, () => {
  older.value = [];
  olderCursor.value = undefined;
});
const entries = computed(() => [...(data.value?.items ?? []), ...older.value]);
const nextCursor = computed(() =>
  olderCursor.value === undefined ? (data.value?.nextCursor ?? null) : olderCursor.value,
);

async function onMore() {
  if (!nextCursor.value) return;
  loadingMore.value = true;
  try {
    const page = await more(nextCursor.value);
    older.value.push(...page.items);
    olderCursor.value = page.nextCursor;
  } finally {
    loadingMore.value = false;
  }
}

const ACTIONS = {
  ban: 'ban',
  unban: 'unban',
  link: 'link',
  'link.request': 'linkRequest',
  'link.cancel': 'linkCancel',
  unlink: 'unlink',
  'token.rotate': 'tokenRotate',
  'device.link': 'deviceLink',
  'device.deny': 'deviceDeny',
  'device.revoke': 'deviceRevoke',
  'warning.create': 'warningCreate',
  'note.create': 'noteCreate',
  'appeal.create': 'appealCreate',
  'appeal.decide': 'appealDecide',
  'limit.set': 'limitSet',
  'role.set': 'roleSet',
  'settings.update': 'settingsUpdate',
} as const;

const actionItems = computed(() => [
  { label: t('wardenAdmin.activity.allActions'), value: 'all' },
  ...Object.entries(ACTIONS).map(([value, key]) => ({
    label: t(`wardenAdmin.activity.filters.${key}`),
    value,
  })),
]);

const sourceItems = computed(() => [
  { label: t('wardenAdmin.activity.allSources'), value: 'all' },
  { label: t('wardenAdmin.sources.web'), value: 'web' },
  { label: t('wardenAdmin.sources.minecraft'), value: 'minecraft' },
  { label: t('wardenAdmin.sources.system'), value: 'system' },
]);
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap gap-3">
      <USelect
        v-model="action"
        :items="actionItems"
        :aria-label="t('wardenAdmin.activity.what')"
        class="w-56"
      />
      <USelect
        v-model="source"
        :items="sourceItems"
        :aria-label="t('wardenAdmin.activity.from')"
        class="w-56"
      />
    </div>
    <div class="overflow-hidden rounded-lg bg-elevated">
      <WardenAdminAuditTable :entries="entries" />
      <div v-if="nextCursor" class="flex justify-end border-t border-default px-4 py-2">
        <UButton
          color="neutral"
          variant="ghost"
          size="md"
          :label="t('wardenAdmin.activity.more')"
          :loading="loadingMore"
          @click="onMore"
        />
      </div>
    </div>
  </div>
</template>
