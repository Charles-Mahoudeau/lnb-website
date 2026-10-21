<script setup lang="ts">
import type { ModAdminRow, ModRefreshCheck, ModRefreshField } from '#shared/schemas/mods';

// Refetches the details of the mods in one tab from Modrinth and CurseForge. It checks every
// mod first, then shows the differences so the admin applies the ones they accept. Closes with
// true when something was applied.
const props = defineProps<{ rows: ModAdminRow[] }>();
const emit = defineEmits<{ close: [applied: boolean] }>();

const { t } = useI18n();
const toast = useToast();

type Phase = 'confirm' | 'checking' | 'review' | 'applying';
type Outcome = { state: 'checked'; check: ModRefreshCheck } | { state: 'failed'; problem: string };

const refreshable = computed(() => props.rows.filter((row) => row.source !== 'manual'));
const manualCount = computed(() => props.rows.length - refreshable.value.length);

const phase = ref<Phase>('confirm');
const outcomes = reactive(new Map<number, Outcome>());
const current = ref<number | null>(null);
const done = computed(() => outcomes.size);
// The accepted changes, as `${id}:${field}`.
const accepted = reactive(new Set<string>());
let cancelled = false;
onBeforeUnmount(() => {
  cancelled = true;
});

async function onCheck() {
  phase.value = 'checking';
  for (const row of refreshable.value) {
    if (cancelled) return;
    current.value = row.id;
    try {
      const check = await modAdminActions.checkRefresh(row.id);
      outcomes.set(row.id, { state: 'checked', check });
      for (const change of check.changes) accepted.add(`${String(row.id)}:${change.field}`);
    } catch (error) {
      outcomes.set(row.id, {
        state: 'failed',
        problem: error instanceof ModError ? error.problem : 'failed',
      });
    }
  }
  current.value = null;
  phase.value = 'review';
}

// What the review shows: mods with changes, and mods that need attention.
const flagged = computed(() => {
  const found: { row: ModAdminRow; outcome: Outcome }[] = [];
  for (const row of refreshable.value) {
    const outcome = outcomes.get(row.id);
    if (!outcome) continue;
    const attention =
      outcome.state === 'failed' ||
      outcome.check.changes.length > 0 ||
      outcome.check.status === 'gone' ||
      !outcome.check.compatible;
    if (attention) found.push({ row, outcome });
  }
  return found;
});

const key = (id: number, field: ModRefreshField) => `${String(id)}:${field}`;
function toggle(id: number, field: ModRefreshField, on: boolean | 'indeterminate') {
  if (on === true) accepted.add(key(id, field));
  else accepted.delete(key(id, field));
}

async function onApply() {
  phase.value = 'applying';
  const byMod = new Map<number, ModRefreshField[]>();
  for (const entry of accepted) {
    const [id, field] = entry.split(':') as [string, ModRefreshField];
    byMod.set(Number(id), [...(byMod.get(Number(id)) ?? []), field]);
  }
  let updated = 0;
  let failed = 0;
  for (const [id, fields] of byMod) {
    try {
      await modAdminActions.applyRefresh(id, fields);
      updated += 1;
    } catch {
      failed += 1;
    }
  }
  if (updated > 0) {
    toast.add({
      title: t('admin.mods.refresh.applied', { count: updated }, updated),
      color: 'success',
      icon: 'i-lucide-circle-check',
    });
  }
  if (failed > 0) {
    toast.add({
      title: t('admin.mods.refresh.applyFailed', { count: failed }, failed),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  }
  emit('close', updated > 0);
}

function stateOf(id: number) {
  const outcome = outcomes.get(id);
  if (outcome) return outcome.state === 'failed' ? 'failed' : outcome.check.status;
  return current.value === id ? 'checking' : 'waiting';
}
</script>

<template>
  <UModal
    :title="
      phase === 'confirm'
        ? t('admin.mods.refresh.title')
        : phase === 'checking'
          ? t('admin.mods.refresh.checkingTitle')
          : t('admin.mods.refresh.reviewTitle')
    "
    :dismissible="phase !== 'applying'"
    :close="false"
  >
    <template #description>
      <span v-if="phase === 'confirm'">
        {{ t('admin.mods.refresh.lede', { count: refreshable.length }, refreshable.length) }}
      </span>
      <span v-else-if="phase === 'checking'" class="tabular-nums">
        {{ t('admin.mods.refresh.progress', { done, total: refreshable.length }) }}
      </span>
      <span v-else>{{ t('admin.mods.refresh.reviewLede') }}</span>
    </template>

    <template #body>
      <div v-if="phase === 'confirm'" class="flex flex-col gap-4">
        <ul class="flex flex-col divide-y divide-default">
          <li class="flex items-center gap-3 py-2">
            <UIcon name="i-lucide-check" class="size-5 text-muted" />
            <span class="grow">{{ t('admin.mods.refresh.coversText') }}</span>
          </li>
          <li class="flex items-center gap-3 py-2">
            <UIcon name="i-lucide-check" class="size-5 text-muted" />
            <span class="grow">{{ t('admin.mods.refresh.coversIcon') }}</span>
          </li>
          <li class="flex items-center gap-3 py-2">
            <UIcon name="i-lucide-triangle-alert" class="size-5 text-muted" />
            <span class="grow text-muted">{{ t('admin.mods.refresh.coversCompat') }}</span>
          </li>
        </ul>
        <UAlert
          v-if="manualCount > 0"
          color="neutral"
          variant="soft"
          icon="i-lucide-info"
          :description="t('admin.mods.refresh.manualNote', { count: manualCount }, manualCount)"
        />
        <p v-if="refreshable.length === 0" class="text-muted">
          {{ t('admin.mods.refresh.nothing') }}
        </p>
      </div>

      <div v-else-if="phase === 'checking'" class="flex flex-col gap-4">
        <UProgress
          :model-value="done"
          :max="refreshable.length"
          color="primary"
          size="sm"
          :aria-label="t('admin.mods.refresh.checkingTitle')"
        />
        <ul class="flex max-h-72 flex-col divide-y divide-default overflow-y-auto">
          <li v-for="row in refreshable" :key="row.id" class="flex items-center gap-3 py-2">
            <ModsIcon :name="row.name" :src="row.iconUrl" size="sm" />
            <span :class="['grow', stateOf(row.id) === 'waiting' && 'text-muted']">
              {{ row.name }}
            </span>
            <UIcon
              v-if="stateOf(row.id) === 'checking'"
              name="i-lucide-refresh-cw"
              class="size-5 motion-safe:animate-spin"
            />
            <span v-else-if="stateOf(row.id) === 'waiting'" class="text-sm text-muted">
              {{ t('admin.mods.refresh.waiting') }}
            </span>
            <UBadge
              v-else-if="stateOf(row.id) === 'changed'"
              color="warning"
              variant="outline"
              :label="t('admin.mods.refresh.changed')"
            />
            <UBadge
              v-else-if="stateOf(row.id) === 'failed' || stateOf(row.id) === 'gone'"
              color="error"
              variant="outline"
              :label="t('admin.mods.refresh.problem')"
            />
            <UBadge
              v-else
              color="neutral"
              variant="subtle"
              :label="t('admin.mods.refresh.unchanged')"
            />
          </li>
        </ul>
      </div>

      <div v-else class="flex flex-col gap-4">
        <p v-if="flagged.length === 0" class="text-muted">
          {{ t('admin.mods.refresh.upToDate', { count: refreshable.length }, refreshable.length) }}
        </p>
        <ul v-else class="flex max-h-96 flex-col divide-y divide-default overflow-y-auto">
          <li v-for="{ row, outcome } in flagged" :key="row.id" class="flex gap-3 py-3">
            <ModsIcon :name="row.name" :src="row.iconUrl" size="sm" />
            <div class="flex min-w-0 grow flex-col gap-2">
              <span class="font-semibold text-highlighted">{{ row.name }}</span>

              <p v-if="outcome.state === 'failed'" class="text-sm text-muted">
                {{ t('admin.mods.refresh.failedBody') }}
                {{ t(`mods.errors.${outcome.problem}`) }}
              </p>
              <template v-else>
                <p v-if="outcome.check.status === 'gone'" class="text-sm text-muted">
                  {{
                    t('admin.mods.refresh.goneBody', { source: t(`mods.sources.${row.source}`) })
                  }}
                </p>
                <p v-else-if="!outcome.check.compatible" class="text-sm text-muted">
                  {{ t('admin.mods.refresh.incompatibleBody') }}
                </p>
                <div
                  v-for="change in outcome.check.changes"
                  :key="change.field"
                  class="flex items-start gap-3"
                >
                  <UCheckbox
                    :model-value="accepted.has(key(row.id, change.field))"
                    :aria-label="t(`admin.mods.refresh.fields.${change.field}`)"
                    @update:model-value="toggle(row.id, change.field, $event)"
                  />
                  <div class="flex min-w-0 grow flex-col gap-1">
                    <span class="text-sm text-muted">
                      {{ t(`admin.mods.refresh.fields.${change.field}`) }}
                    </span>
                    <div v-if="change.field === 'icon'" class="flex items-center gap-3">
                      <ModsIcon :name="row.name" :src="change.from" size="sm" />
                      <UIcon name="i-lucide-arrow-right" class="size-4 text-muted" />
                      <ModsIcon :name="row.name" :src="change.to" size="sm" />
                    </div>
                    <template v-else>
                      <span class="line-clamp-2 text-sm text-muted line-through">
                        {{ change.from }}
                      </span>
                      <span class="line-clamp-2 text-sm break-words text-highlighted">
                        {{ change.to }}
                      </span>
                    </template>
                  </div>
                </div>
              </template>
            </div>
          </li>
        </ul>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full flex-wrap justify-end gap-3">
        <UButton
          color="neutral"
          variant="soft"
          :label="
            phase === 'review' && flagged.length === 0
              ? t('admin.mods.refresh.close')
              : t('mods.cancel')
          "
          :disabled="phase === 'applying'"
          @click="emit('close', false)"
        />
        <UButton
          v-if="phase === 'confirm'"
          icon="i-lucide-refresh-cw"
          :label="t('admin.mods.refresh.start')"
          :disabled="refreshable.length === 0"
          @click="onCheck"
        />
        <UButton
          v-else-if="(phase === 'review' || phase === 'applying') && accepted.size > 0"
          :label="t('admin.mods.refresh.apply', { count: accepted.size }, accepted.size)"
          :loading="phase === 'applying'"
          @click="onApply"
        />
      </div>
    </template>
  </UModal>
</template>
