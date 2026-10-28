<script setup lang="ts">
import {
  AdminApiKeysDetail,
  AdminApiKeysRevoke,
  AdminApiKeysRotate,
  AdminApiKeysSecret,
} from '#components';

import { isApiKeyUsable, permissionMessageKey } from '#shared/api-keys';
import type { ApiKeyStatus } from '#shared/api-keys';
import type { ApiKeyCreated, ApiKeyItem } from '#shared/schemas/api-keys';

// The API keys as a table. A row opens the key in a side drawer.
const { t, locale } = useI18n();
const { data, error } = await useAdminApiKeys();

const overlay = useOverlay();
const detail = overlay.create(AdminApiKeysDetail);
const rotate = overlay.create(AdminApiKeysRotate);
const revoke = overlay.create(AdminApiKeysRevoke);
const secret = overlay.create(AdminApiKeysSecret);

const search = ref('');

const keys = computed(() => {
  const q = search.value.trim().toLowerCase();
  return (data.value?.keys ?? []).filter(
    (key) => !q || key.name.toLowerCase().includes(q) || key.prefix.toLowerCase().includes(q),
  );
});
const usable = computed(
  () => (data.value?.keys ?? []).filter((key) => isApiKeyUsable(key.status)).length,
);

// Status is state, not an action: success, warning and error only, never the accent colors.
const STATUS_COLOR = {
  active: 'success',
  soon: 'warning',
  rotating: 'neutral',
  expired: 'neutral',
  revoked: 'error',
} as const satisfies Record<ApiKeyStatus, string>;

const SHOWN = 2;

function relative(iso: string) {
  return formatWardenRelative(iso, locale.value);
}

async function onOpen(key: ApiKeyItem) {
  const action: unknown = await detail.open({ id: key.id }).result;
  if (action === 'rotate') {
    const rotated: unknown = await rotate.open({ id: key.id, name: key.name }).result;
    await refreshNuxtData('api-keys-admin');
    if (rotated && typeof rotated === 'object') {
      const { created, overlapDays } = rotated as { created: ApiKeyCreated; overlapDays: number };
      await secret.open({ name: created.key.name, secret: created.secret, overlapDays }).result;
    }
  } else if (action === 'revoke') {
    await revoke.open({ id: key.id, name: key.name }).result;
    await refreshNuxtData('api-keys-admin');
  }
}
</script>

<template>
  <UAlert
    v-if="error || !data"
    color="error"
    variant="subtle"
    icon="i-lucide-circle-alert"
    :description="t('admin.apiKeys.errors.failed')"
  />
  <div v-else class="flex flex-col gap-4">
    <p class="max-w-prose text-muted">{{ t('admin.apiKeys.note') }}</p>

    <UAlert
      v-if="!data.enabled"
      color="warning"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      :title="t('admin.apiKeys.offTitle')"
      :description="t('admin.apiKeys.offDescription')"
    />

    <section class="flex flex-col gap-4 rounded-lg bg-elevated p-5">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <UInput
          v-model="search"
          icon="i-lucide-search"
          size="md"
          class="w-full max-w-xs"
          :placeholder="t('admin.apiKeys.search')"
          :aria-label="t('admin.apiKeys.search')"
        />
        <span class="text-sm text-muted tabular-nums">
          {{ t('admin.apiKeys.summary', { usable, total: data.keys.length }) }}
        </span>
      </div>

      <p v-if="!data.keys.length" class="text-muted">{{ t('admin.apiKeys.empty') }}</p>
      <p v-else-if="!keys.length" class="text-muted">{{ t('admin.apiKeys.noMatch') }}</p>
      <div v-else class="overflow-x-auto">
        <table class="w-full min-w-3xl border-collapse text-left">
          <thead class="text-sm text-muted">
            <tr>
              <th class="px-3 py-2 font-medium">{{ t('admin.apiKeys.columns.key') }}</th>
              <th class="px-3 py-2 font-medium">{{ t('admin.apiKeys.columns.permissions') }}</th>
              <th class="px-3 py-2 font-medium">{{ t('admin.apiKeys.columns.lastUsed') }}</th>
              <th class="px-3 py-2 font-medium">{{ t('admin.apiKeys.columns.expires') }}</th>
              <th class="px-3 py-2 font-medium">{{ t('admin.apiKeys.columns.status') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="key in keys"
              :key="key.id"
              class="cursor-pointer border-t border-default hover:bg-accented/40"
              @click="onOpen(key)"
            >
              <td class="max-w-xs px-3 py-3">
                <button
                  type="button"
                  class="block max-w-full truncate text-left font-semibold text-highlighted hover:underline"
                  @click.stop="onOpen(key)"
                >
                  {{ key.name }}
                </button>
                <span class="block font-mono text-sm text-muted">{{ key.prefix }}…</span>
              </td>
              <td class="px-3 py-3">
                <div class="flex flex-wrap gap-1.5">
                  <UBadge
                    v-for="permission in key.permissions.slice(0, SHOWN)"
                    :key="permission"
                    color="neutral"
                    variant="soft"
                    size="md"
                    :label="
                      t(`admin.apiKeys.permissions.${permissionMessageKey(permission)}.label`)
                    "
                  />
                  <UBadge
                    v-if="key.permissions.length > SHOWN"
                    color="neutral"
                    variant="soft"
                    size="md"
                    class="tabular-nums"
                    :label="t('admin.apiKeys.more', { n: key.permissions.length - SHOWN })"
                  />
                </div>
              </td>
              <td class="px-3 py-3 text-sm whitespace-nowrap tabular-nums">
                <template v-if="key.lastUsedAt">{{ relative(key.lastUsedAt) }}</template>
                <span v-else class="text-muted">{{ t('admin.apiKeys.never') }}</span>
              </td>
              <td class="px-3 py-3 text-sm whitespace-nowrap tabular-nums">
                {{ relative(key.expiresAt) }}
              </td>
              <td class="px-3 py-3">
                <UBadge
                  :color="STATUS_COLOR[key.status]"
                  variant="soft"
                  size="md"
                  :label="t(`admin.apiKeys.statuses.${key.status}`)"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>
