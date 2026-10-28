<script setup lang="ts">
import { API_KEY_GROUPS, isApiKeyUsable, permissionMessageKey } from '#shared/api-keys';
import type { ApiKeyStatus } from '#shared/api-keys';

// One API key in a side drawer: its numbers, permissions and routes. Closes with what the admin
// chose to do next: rotate or revoke it, or nothing.
const props = defineProps<{ id: string }>();
const emit = defineEmits<{ close: [action: 'rotate' | 'revoke' | null] }>();

const { t, d, locale } = useI18n();
const { data, error } = useAdminApiKey(props.id);

const STATUS_COLOR = {
  active: 'success',
  soon: 'warning',
  rotating: 'neutral',
  expired: 'neutral',
  revoked: 'error',
} as const satisfies Record<ApiKeyStatus, string>;

const DAY_MS = 86_400_000;

const key = computed(() => data.value);
const usable = computed(() => !!key.value && isApiKeyUsable(key.value.status));
const daysLeft = computed(() =>
  key.value
    ? Math.max(0, Math.ceil((new Date(key.value.expiresAt).getTime() - Date.now()) / DAY_MS))
    : 0,
);
const groups = computed(() =>
  API_KEY_GROUPS.map((group) => ({
    id: group.id,
    permissions: group.permissions.filter((permission) =>
      key.value?.permissions.includes(permission),
    ),
  })).filter((group) => group.permissions.length),
);
const expiresLabel = computed(() => {
  const status = key.value?.status;
  if (status === 'rotating') return t('admin.apiKeys.detail.rotatingEnds');
  if (status === 'expired') return t('admin.apiKeys.detail.expired');
  if (status === 'revoked') return t('admin.apiKeys.detail.revokedOn');
  return t('admin.apiKeys.detail.expires');
});

function date(iso: string) {
  return d(iso, { dateStyle: 'medium', timeZone: 'Europe/Paris' });
}
function relative(iso: string) {
  return formatWardenRelative(iso, locale.value);
}
</script>

<template>
  <USlideover
    :title="key?.name ?? t('admin.apiKeys.title')"
    :close="{ onClick: () => emit('close', null) }"
    @update:open="(open: boolean) => !open && emit('close', null)"
  >
    <template #body>
      <UAlert
        v-if="error"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :description="t('admin.apiKeys.detail.loadFailed')"
      />
      <div v-else-if="key" class="flex flex-col gap-6">
        <div class="flex flex-wrap items-center gap-3">
          <UBadge
            :color="STATUS_COLOR[key.status]"
            variant="soft"
            size="md"
            :label="t(`admin.apiKeys.statuses.${key.status}`)"
          />
          <span class="font-mono text-sm text-muted">{{ key.prefix }}…</span>
        </div>

        <p v-if="key.description" class="text-muted">{{ key.description }}</p>

        <UAlert
          v-if="key.status === 'soon'"
          color="warning"
          variant="subtle"
          icon="i-lucide-clock"
          :description="t('admin.apiKeys.detail.soonNote', { days: daysLeft })"
        />
        <UAlert
          v-else-if="key.status === 'rotating'"
          color="neutral"
          variant="soft"
          icon="i-lucide-refresh-cw"
          :description="t('admin.apiKeys.detail.rotatingNote', { date: date(key.expiresAt) })"
        />

        <dl class="grid grid-cols-3 gap-2">
          <div class="rounded-lg bg-default p-3">
            <dd class="font-display text-lg text-highlighted tabular-nums">{{ key.calls7d }}</dd>
            <dt class="text-sm text-muted">{{ t('admin.apiKeys.detail.calls') }}</dt>
          </div>
          <div class="rounded-lg bg-default p-3">
            <dd class="text-base font-semibold text-highlighted">
              {{ key.lastUsedAt ? relative(key.lastUsedAt) : t('admin.apiKeys.never') }}
            </dd>
            <dt class="text-sm text-muted">{{ t('admin.apiKeys.detail.lastUsed') }}</dt>
          </div>
          <div class="rounded-lg bg-default p-3">
            <dd class="text-base font-semibold text-highlighted">{{ relative(key.expiresAt) }}</dd>
            <dt class="text-sm text-muted">{{ expiresLabel }}</dt>
          </div>
        </dl>

        <section class="flex flex-col gap-3">
          <h3 class="font-sans text-base font-semibold text-highlighted">
            {{ t('admin.apiKeys.detail.permissions') }}
            <span class="font-normal text-muted tabular-nums">· {{ key.permissions.length }}</span>
          </h3>
          <div v-for="group in groups" :key="group.id" class="rounded-lg bg-default px-4 py-2">
            <p class="pt-2 text-sm font-semibold text-highlighted">
              {{ t(`admin.apiKeys.groups.${group.id}.label`) }}
            </p>
            <ul class="flex flex-col divide-y divide-default">
              <li
                v-for="permission in group.permissions"
                :key="permission"
                class="flex items-start justify-between gap-3 py-3"
              >
                <div class="min-w-0">
                  <span class="block font-medium">
                    {{ t(`admin.apiKeys.permissions.${permissionMessageKey(permission)}.label`) }}
                  </span>
                  <span class="block text-sm text-muted">
                    {{
                      t(`admin.apiKeys.permissions.${permissionMessageKey(permission)}.description`)
                    }}
                  </span>
                </div>
                <code class="shrink-0 font-mono text-xs text-muted">{{ permission }}</code>
              </li>
            </ul>
          </div>
        </section>

        <section class="flex flex-col gap-3">
          <h3 class="font-sans text-base font-semibold text-highlighted">
            {{ t('admin.apiKeys.detail.routes') }}
          </h3>
          <p v-if="!key.routes.length" class="text-sm text-muted">
            {{ t('admin.apiKeys.detail.noCalls') }}
          </p>
          <ul v-else class="flex flex-col divide-y divide-default rounded-lg bg-default px-4">
            <li
              v-for="route in key.routes"
              :key="route.route"
              class="flex items-baseline justify-between gap-3 py-2.5"
            >
              <code class="min-w-0 truncate font-mono text-sm">{{ route.route }}</code>
              <span class="text-sm text-muted tabular-nums">{{ route.calls }}</span>
            </li>
          </ul>
        </section>

        <p class="text-sm text-muted">
          {{
            key.createdBy
              ? t('admin.apiKeys.detail.created', {
                  date: date(key.createdAt),
                  name: key.createdBy,
                })
              : t('admin.apiKeys.detail.createdNoName', { date: date(key.createdAt) })
          }}
        </p>
      </div>
    </template>

    <template v-if="key && usable" #footer>
      <div class="flex w-full flex-wrap justify-end gap-3">
        <UButton
          color="neutral"
          variant="soft"
          icon="i-lucide-refresh-cw"
          :label="t('admin.apiKeys.rotate.action')"
          :disabled="key.status === 'rotating'"
          @click="emit('close', 'rotate')"
        />
        <UButton
          color="error"
          variant="outline"
          icon="i-lucide-ban"
          :label="t('admin.apiKeys.revoke.action')"
          @click="emit('close', 'revoke')"
        />
      </div>
    </template>
  </USlideover>
</template>
