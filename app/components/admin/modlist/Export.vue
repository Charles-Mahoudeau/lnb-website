<script setup lang="ts">
import { ModpackError, modpackActions } from '~/composables/useModpackAdmin';

import { MODPACK_EXPORT_MODES } from '#shared/schemas/modpack';
import type { ModpackExportItem, ModpackExportMode } from '#shared/schemas/modpack';

// Copies the vote's official list to the Modlist. The admin picks a mode, sees what would change,
// ticks what to apply, and applies it. Closes with true once something was applied.
const emit = defineEmits<{ close: [applied: boolean] }>();

const { t } = useI18n();
const toast = useToast();

const mode = ref<ModpackExportMode>('add');
const ticked = ref(new Set<string>());
const pending = ref(false);

const { data: preview, status } = useAsyncData(
  'modpack-export',
  () => modpackActions.exportPreview(mode.value),
  { watch: [mode] },
);

// Everything is ticked except the custom entries Replace would drop: those are kept by default.
watch(preview, (value) => {
  ticked.value = new Set(value?.items.filter((item) => !item.custom).map((item) => item.key));
});

const sections = computed(() => {
  const items = preview.value?.items ?? [];
  const pick = (test: (item: ModpackExportItem) => boolean) => items.filter(test);
  return [
    { id: 'add', items: pick((item) => item.kind === 'add') },
    { id: 'remove', items: pick((item) => item.kind === 'remove' && !item.custom) },
    { id: 'update', items: pick((item) => item.kind === 'update') },
    { id: 'custom', items: pick((item) => item.kind === 'remove' && item.custom) },
  ].filter((section) => section.items.length > 0);
});

const count = computed(() => ticked.value.size);

function toggle(key: string, on: boolean) {
  const next = new Set(ticked.value);
  if (on) next.add(key);
  else next.delete(key);
  ticked.value = next;
}

function hint(section: string, item: ModpackExportItem): string {
  if (section === 'add') return t('admin.modlist.export.addHint');
  if (section === 'custom') return t('admin.modlist.export.customHint');
  if (section === 'update') {
    const value = item.optional ? 'optionalOn' : 'optionalOff';
    return t('admin.modlist.export.updateHint', { value: t(`admin.modlist.export.${value}`) });
  }
  return t('admin.modlist.export.removeHint');
}

async function apply() {
  pending.value = true;
  try {
    const result = await modpackActions.exportApply(mode.value, [...ticked.value]);
    const notes = [
      result.flagged ? t('admin.modlist.export.flagged', { count: result.flagged }) : '',
      result.failed ? t('admin.modlist.export.failed', { count: result.failed }) : '',
    ].filter(Boolean);
    toast.add({
      title: t('admin.modlist.export.done', {
        added: result.added,
        removed: result.removed,
        updated: result.updated,
      }),
      description: notes.join(' ') || undefined,
      color: result.failed || result.flagged ? 'warning' : 'success',
      icon: 'i-lucide-circle-check',
    });
    emit('close', true);
  } catch (error) {
    const problem = error instanceof ModpackError ? error.problem : 'failed';
    toast.add({
      title: t(`admin.modlist.errors.${problem}`),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <UModal
    :title="t('admin.modlist.export.title')"
    @update:open="(open) => !open && emit('close', false)"
  >
    <template #body>
      <div class="flex flex-col gap-5">
        <div class="grid gap-2 sm:grid-cols-3" role="group">
          <button
            v-for="value in MODPACK_EXPORT_MODES"
            :key="value"
            type="button"
            :aria-pressed="mode === value"
            class="flex flex-col gap-1 rounded-lg border border-default p-3 text-left transition hover:bg-elevated aria-pressed:border-primary aria-pressed:bg-elevated"
            @click="mode = value"
          >
            <span class="font-medium text-highlighted">
              {{ t(`admin.modlist.export.modes.${value}.label`) }}
            </span>
            <span class="text-sm text-muted">
              {{ t(`admin.modlist.export.modes.${value}.hint`) }}
            </span>
          </button>
        </div>

        <p v-if="status === 'pending' && !preview" class="text-sm text-muted">…</p>
        <template v-else>
          <section v-for="section in sections" :key="section.id" class="flex flex-col gap-2">
            <h3 class="text-sm font-medium text-highlighted">
              {{ t(`admin.modlist.export.sections.${section.id}`) }}
              <UBadge color="neutral" variant="subtle" :label="String(section.items.length)" />
            </h3>
            <label
              v-for="item in section.items"
              :key="item.key"
              class="flex cursor-pointer items-start gap-3 rounded-lg p-2 hover:bg-elevated"
            >
              <UCheckbox
                :model-value="ticked.has(item.key)"
                class="mt-0.5"
                @update:model-value="(on) => toggle(item.key, on === true)"
              />
              <span class="flex min-w-0 flex-col">
                <span class="truncate font-medium text-highlighted">{{ item.name }}</span>
                <span class="text-sm text-muted">{{ hint(section.id, item) }}</span>
              </span>
            </label>
          </section>
          <p v-if="!sections.length" class="text-sm text-muted">
            {{ t('admin.modlist.export.none') }}
          </p>
          <p v-if="preview?.skipped.length" class="text-sm text-muted">
            {{ t('admin.modlist.export.skipped', { names: preview.skipped.join(', ') }) }}
          </p>
        </template>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full flex-wrap items-center justify-end gap-3">
        <span v-if="preview" class="mr-auto text-sm text-muted tabular-nums">
          {{
            t('admin.modlist.export.revision', { from: preview.revision, to: preview.revision + 1 })
          }}
        </span>
        <UButton
          color="neutral"
          variant="soft"
          :label="t('admin.modlist.export.cancel')"
          :disabled="pending"
          @click="emit('close', false)"
        />
        <UButton
          :label="t('admin.modlist.export.apply', { count })"
          :disabled="count === 0"
          :loading="pending"
          @click="apply"
        />
      </div>
    </template>
  </UModal>
</template>
