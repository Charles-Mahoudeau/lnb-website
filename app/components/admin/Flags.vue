<script setup lang="ts">
import { flagMessageKey } from '#shared/flags';
import type { FlagKey } from '#shared/flags';
import type { AdminFlag } from '#shared/schemas/flags';

// Feature flags: one card per feature, with its parts under it. A switch saves at once.
const { t } = useI18n();
const toast = useToast();
const { data, error, refresh } = await useAdminFlags();
const { ensureFlags } = useFlags();

const groups = computed(() => {
  const items = data.value?.items ?? [];
  return items
    .filter((flag) => !flag.parent)
    .map((flag) => ({ flag, parts: items.filter((part) => part.parent === flag.key) }));
});

const pending = ref<FlagKey | null>(null);
async function onToggle(flag: AdminFlag, enabled: boolean) {
  pending.value = flag.key;
  try {
    const result = await setAdminFlag(flag.key, enabled);
    data.value = result;
    // The site's own header and pages follow at once.
    await ensureFlags(true);
    toast.add({
      title: t(enabled ? 'admin.flags.enabled' : 'admin.flags.disabled', {
        name: t(`admin.flags.items.${flagMessageKey(flag.key)}.label`),
      }),
      color: 'success',
      icon: 'i-lucide-circle-check',
    });
  } catch {
    toast.add({
      title: t('admin.flags.failed'),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
    await refresh();
  } finally {
    pending.value = null;
  }
}

const switchUi = {
  root: 'flex-row-reverse justify-between gap-6',
  label: 'font-semibold text-highlighted',
};
</script>

<template>
  <UAlert
    v-if="error || !data"
    color="error"
    variant="subtle"
    icon="i-lucide-circle-alert"
    :description="t('admin.flags.loadFailed')"
  />

  <div v-else class="flex max-w-3xl flex-col gap-6">
    <p class="text-muted">{{ t('admin.flags.lede') }}</p>

    <section
      v-for="{ flag, parts } in groups"
      :key="flag.key"
      class="flex flex-col gap-4 rounded-lg bg-elevated p-5"
    >
      <USwitch
        :model-value="flag.enabled"
        :loading="pending === flag.key"
        :disabled="pending !== null"
        :label="t(`admin.flags.items.${flagMessageKey(flag.key)}.label`)"
        :description="t(`admin.flags.items.${flagMessageKey(flag.key)}.description`)"
        :ui="switchUi"
        @update:model-value="onToggle(flag, $event)"
      />
      <template v-if="parts.length">
        <USeparator />
        <p v-if="!flag.enabled" class="text-sm text-muted">{{ t('admin.flags.partsOff') }}</p>
        <div class="flex flex-col gap-4 pl-4">
          <USwitch
            v-for="part in parts"
            :key="part.key"
            :model-value="part.enabled"
            :loading="pending === part.key"
            :disabled="pending !== null"
            :label="t(`admin.flags.items.${flagMessageKey(part.key)}.label`)"
            :description="t(`admin.flags.items.${flagMessageKey(part.key)}.description`)"
            :ui="{ ...switchUi, root: `${switchUi.root} ${flag.enabled ? '' : 'opacity-60'}` }"
            @update:model-value="onToggle(part, $event)"
          />
        </div>
      </template>
    </section>
  </div>
</template>
