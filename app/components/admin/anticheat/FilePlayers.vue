<script setup lang="ts">
import { AdminAnticheatBulkDialog } from '#components';

import type { AnticheatBulkBody, AnticheatFilePlayerRow } from '#shared/schemas/anticheat';

// The players who used a file: rows with a checkbox, and a bar for Ban, Hold next join and
// Penalty once some are ticked. Each action asks first, through a dialog that says how many.
const props = defineProps<{
  sha512: string;
  first: { items: AnticheatFilePlayerRow[]; nextCursor: string | null };
}>();
const emit = defineEmits<{ changed: [] }>();

const { t, d } = useI18n();
const toast = useToast();
const overlay = useOverlay();

const rows = ref<AnticheatFilePlayerRow[]>([...props.first.items]);
const nextCursor = ref(props.first.nextCursor);
const loading = ref(false);
const ticked = ref(new Set<string>());

watch(
  () => props.first,
  (page) => {
    rows.value = [...page.items];
    nextCursor.value = page.nextCursor;
    ticked.value = new Set();
  },
);

const allTicked = computed(() => rows.value.length > 0 && ticked.value.size === rows.value.length);
const someTicked = computed(() => ticked.value.size > 0 && !allTicked.value);

function toggle(userId: string, on: boolean) {
  const next = new Set(ticked.value);
  if (on) next.add(userId);
  else next.delete(userId);
  ticked.value = next;
}
function toggleAll(on: boolean | 'indeterminate') {
  ticked.value = on === true ? new Set(rows.value.map((row) => row.player.userId)) : new Set();
}

async function more() {
  if (!nextCursor.value) return;
  loading.value = true;
  try {
    const page = await anticheatActions.morePlayers(props.sha512, nextCursor.value, false);
    rows.value.push(...page.items);
    nextCursor.value = page.nextCursor;
  } catch {
    toast.add({
      title: t('admin.anticheat.errors.failed'),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  } finally {
    loading.value = false;
  }
}

async function act(action: AnticheatBulkBody['action']) {
  const picked = rows.value.filter((row) => ticked.value.has(row.player.userId));
  const modal = overlay.create(AdminAnticheatBulkDialog, {
    props: {
      action,
      people: picked.map((row) => ({ userId: row.player.userId, name: row.player.name })),
    },
  });
  const body = (await modal.open().result) as Omit<AnticheatBulkBody, 'userIds'> | null;
  if (!body) return;
  try {
    const result = await anticheatActions.bulk(props.sha512, {
      ...body,
      userIds: picked.map((row) => row.player.userId),
    });
    toast.add({
      title: t(`admin.anticheat.bulk.done.${action}`, result.applied),
      description: result.skipped.length
        ? t('admin.anticheat.bulk.skipped', result.skipped.length)
        : undefined,
      color: 'success',
      icon: 'i-lucide-circle-check',
    });
    ticked.value = new Set();
    emit('changed');
  } catch (error) {
    const problem = error instanceof AnticheatError ? error.problem : 'failed';
    toast.add({
      title: t(`admin.anticheat.errors.${problem}`),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  }
}

const day = (iso: string) => d(iso, { dateStyle: 'medium', timeZone: 'Europe/Paris' });
</script>

<template>
  <p v-if="!rows.length" class="text-muted">{{ t('admin.anticheat.players.empty') }}</p>
  <div v-else class="flex flex-col gap-3">
    <div class="flex min-h-8 flex-wrap items-center gap-2">
      <UCheckbox
        :model-value="allTicked ? true : someTicked ? 'indeterminate' : false"
        :aria-label="t('admin.anticheat.players.selectAll')"
        @update:model-value="toggleAll"
      />
      <template v-if="ticked.size">
        <span class="text-sm text-muted tabular-nums">
          {{ t('admin.anticheat.players.selected', ticked.size) }}
        </span>
        <UButton
          size="md"
          color="error"
          variant="outline"
          icon="i-lucide-gavel"
          :label="t('admin.anticheat.players.ban')"
          @click="act('ban')"
        />
        <UButton
          size="md"
          color="neutral"
          variant="soft"
          icon="i-lucide-hand"
          :label="t('admin.anticheat.players.hold')"
          @click="act('hold')"
        />
        <UButton
          size="md"
          color="neutral"
          variant="soft"
          icon="i-lucide-trending-down"
          :label="t('admin.anticheat.players.penalty')"
          @click="act('penalty')"
        />
        <UButton
          size="md"
          color="neutral"
          variant="ghost"
          icon="i-lucide-x"
          :aria-label="t('admin.anticheat.players.clear')"
          @click="ticked = new Set()"
        />
      </template>
    </div>

    <ul class="flex flex-col divide-y divide-default">
      <li
        v-for="row in rows"
        :key="row.player.userId"
        class="flex items-center gap-3 py-2"
        :class="{ 'bg-secondary/10': ticked.has(row.player.userId) }"
      >
        <UCheckbox
          :model-value="ticked.has(row.player.userId)"
          :aria-label="t('admin.anticheat.players.selectRow', { name: row.player.name })"
          @update:model-value="
            (on: boolean | 'indeterminate') => toggle(row.player.userId, on === true)
          "
        />
        <UserAvatar :user-id="row.player.userId" :name="row.player.name" size="sm" />
        <div class="min-w-0 grow">
          <NuxtLink
            :to="`/admin/warden/players/${row.player.userId}`"
            class="block truncate font-semibold text-highlighted hover:underline"
          >
            {{ row.player.name }}
          </NuxtLink>
          <span class="block truncate text-sm text-muted tabular-nums">
            {{ row.player.username ?? '' }}
            {{
              t('admin.anticheat.players.seen', {
                first: day(row.firstSeenAt),
                last: day(row.lastSeenAt),
              })
            }}
          </span>
        </div>
        <UBadge
          v-if="row.afterBan"
          color="error"
          variant="subtle"
          :label="t('admin.anticheat.players.afterBan')"
        />
        <span class="text-sm text-muted tabular-nums">
          {{ t('admin.anticheat.players.sessions', row.sessionCount) }}
        </span>
      </li>
    </ul>
    <UButton
      v-if="nextCursor"
      color="neutral"
      variant="soft"
      size="md"
      class="self-start"
      :loading="loading"
      :label="t('admin.anticheat.more')"
      @click="more"
    />
  </div>
</template>
