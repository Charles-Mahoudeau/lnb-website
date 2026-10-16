<script setup lang="ts">
import type { DropdownMenuItem, TableColumn } from '@nuxt/ui';

import { AdminBanModal, AdminRolesModal, WardenConfirmModal } from '#components';

import type { AdminUserRow, AdminUsersQuery } from '#shared/schemas/admin';

// Every account: search, filter and page through them, and act on one from its row menu.
const { t, locale } = useI18n();
const route = useRoute();
const toast = useToast();
const overlay = useOverlay();
const { user: me } = useAuth();
const actions = useAdminUserActions();

type Status = 'all' | 'banned' | 'inactive';
type Role = 'any' | 'admin' | 'warden-admin';

// The Overview links here with ?status=inactive or ?status=banned.
const initialStatus = String(route.query.status ?? '');
const search = ref('');
const school = ref<string>('all');
const role = ref<Role>('any');
const status = ref<Status>(
  initialStatus === 'banned' || initialStatus === 'inactive' ? initialStatus : 'all',
);
// Cursors of the pages before this one, to go back to the first page.
const cursors = ref<string[]>([]);

function filters(): AdminUsersQuery {
  return {
    q: search.value || undefined,
    tenantId: school.value === 'all' ? undefined : school.value,
    role: role.value,
    status: status.value,
  };
}

const query = ref<AdminUsersQuery>(filters());
let timer: ReturnType<typeof setTimeout> | undefined;
watch(search, () => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    cursors.value = [];
    query.value = filters();
  }, 250);
});
watch([school, role, status], () => {
  cursors.value = [];
  query.value = filters();
});

const { data, error, status: loadState, refresh } = await useAdminUsers(query);

function next() {
  const cursor = data.value?.nextCursor;
  if (!cursor) return;
  cursors.value.push(cursor);
  query.value = { ...query.value, cursor };
}
function first() {
  cursors.value = [];
  query.value = filters();
}

const schoolItems = computed(() => [
  { label: t('admin.users.allSchools'), value: 'all' },
  ...Object.entries(SCHOOLS).map(([value, label]) => ({ label, value })),
]);
const roleItems = computed(() => [
  { label: t('admin.users.anyRole'), value: 'any' },
  { label: t('admin.roles.admin'), value: 'admin' },
  { label: t('admin.roles.wardenAdmin'), value: 'warden-admin' },
]);
const statusItems = computed(() => [
  { label: t('admin.users.status.all'), value: 'all' },
  { label: t('admin.users.status.banned'), value: 'banned' },
  { label: t('admin.users.status.inactive'), value: 'inactive' },
]);

const columns = computed<TableColumn<AdminUserRow>[]>(() => [
  { accessorKey: 'name', header: t('admin.users.user') },
  { accessorKey: 'school', header: t('admin.users.school') },
  { id: 'roles', header: t('admin.users.roles') },
  { accessorKey: 'lastSignInAt', header: t('admin.users.lastSignIn') },
  { id: 'state', header: t('admin.users.state') },
  { id: 'actions', meta: { class: { td: 'w-12 text-right' } } },
]);

const modals = {
  confirm: overlay.create(WardenConfirmModal),
  ban: overlay.create(AdminBanModal),
  roles: overlay.create(AdminRolesModal),
};

async function ask(title: string, description: string, confirmLabel: string, destructive = false) {
  const result: unknown = await modals.confirm.open({
    title,
    description,
    confirmLabel,
    cancelLabel: t('admin.cancel'),
    destructive,
  }).result;
  return result === true;
}

async function run(action: () => Promise<unknown>, success: string) {
  try {
    await action();
    toast.add({ title: success, color: 'success', icon: 'i-lucide-circle-check' });
  } catch (failure) {
    const problem = failure instanceof AdminError ? failure.problem : 'failed';
    const known = ['notFound', 'self', 'targetIsAdmin', 'notBanned'];
    toast.add({
      title: t(`admin.errors.${known.includes(problem) ? problem : 'failed'}`),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  }
  await refresh();
}

async function onRoles(row: AdminUserRow) {
  const roles: unknown = await modals.roles.open({
    name: row.name,
    roles: { admin: row.admin, wardenAdmin: row.wardenAdmin },
    self: row.userId === me.value?.id,
  }).result;
  if (!roles || typeof roles !== 'object') return;
  await run(
    () => actions.setRoles(row.userId, roles as { admin: boolean; wardenAdmin: boolean }),
    t('admin.users.rolesSaved'),
  );
}

async function onBan(row: AdminUserRow) {
  const ban: unknown = await modals.ban.open({ name: row.name }).result;
  if (!ban || typeof ban !== 'object') return;
  await run(
    () => actions.ban(row.userId, ban as Parameters<typeof actions.ban>[1]),
    t('admin.users.banned'),
  );
}

async function onUnban(row: AdminUserRow) {
  if (
    await ask(
      t('admin.users.unbanTitle', { name: row.name }),
      t('admin.users.unbanBody'),
      t('admin.users.unban'),
    )
  ) {
    await run(() => actions.unban(row.userId), t('admin.users.unbanned'));
  }
}

async function onSignOut(row: AdminUserRow) {
  if (
    await ask(
      t('admin.users.signOutTitle', { name: row.name }),
      t('admin.users.signOutBody'),
      t('admin.users.signOut'),
    )
  ) {
    await run(() => actions.signOut(row.userId), t('admin.users.signedOut'));
  }
}

async function onDelete(row: AdminUserRow) {
  if (
    await ask(
      t('admin.users.deleteTitle', { name: row.name }),
      t('admin.users.deleteBody'),
      t('admin.users.delete'),
      true,
    )
  ) {
    await run(() => actions.remove(row.userId), t('admin.users.deleted'));
  }
}

function rowItems(row: AdminUserRow): DropdownMenuItem[][] {
  // Admins can't ban or delete themselves or another admin: the role goes first.
  const protectedRow = row.admin || row.userId === me.value?.id;
  return [
    [
      {
        label: t('admin.users.changeRoles'),
        icon: 'i-lucide-shield',
        onSelect: () => void onRoles(row),
      },
      {
        label: t('admin.users.signOut'),
        icon: 'i-lucide-log-out',
        onSelect: () => void onSignOut(row),
      },
    ],
    protectedRow
      ? []
      : [
          row.ban
            ? {
                label: t('admin.users.unban'),
                icon: 'i-lucide-undo-2',
                onSelect: () => void onUnban(row),
              }
            : {
                label: t('admin.users.ban'),
                icon: 'i-lucide-ban',
                color: 'error' as const,
                onSelect: () => void onBan(row),
              },
          {
            label: t('admin.users.delete'),
            icon: 'i-lucide-trash-2',
            color: 'error' as const,
            onSelect: () => void onDelete(row),
          },
        ],
  ];
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap gap-3">
      <UInput
        v-model="search"
        type="search"
        icon="i-lucide-search"
        :placeholder="t('admin.users.search')"
        :aria-label="t('admin.users.search')"
        class="min-w-0 flex-1 basis-64"
      />
      <USelect
        v-model="school"
        :items="schoolItems"
        :aria-label="t('admin.users.school')"
        class="w-44"
      />
      <USelect
        v-model="role"
        :items="roleItems"
        :aria-label="t('admin.users.roles')"
        class="w-44"
      />
      <USelect
        v-model="status"
        :items="statusItems"
        :aria-label="t('admin.users.state')"
        class="w-48"
      />
    </div>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :description="t('admin.users.loadFailed')"
    />

    <div v-else class="overflow-hidden rounded-lg bg-elevated">
      <UTable
        :data="data?.items ?? []"
        :columns="columns"
        :loading="loadState === 'pending'"
        :empty="t('admin.users.empty')"
        class="tabular-nums"
      >
        <template #name-cell="{ row }">
          <div class="flex items-center gap-3">
            <UAvatar :alt="row.original.name" size="sm" :ui="avatarTint(row.original.userId)" />
            <div class="flex min-w-0 flex-col">
              <span class="font-semibold text-highlighted">{{ row.original.name }}</span>
              <span class="text-sm text-muted">{{ row.original.email }}</span>
            </div>
          </div>
        </template>
        <template #school-cell="{ row }">
          {{ row.original.school ?? t('admin.users.unknownSchool') }}
        </template>
        <template #roles-cell="{ row }">
          <div v-if="row.original.admin || row.original.wardenAdmin" class="flex flex-wrap gap-1">
            <UBadge
              v-if="row.original.admin"
              color="neutral"
              variant="soft"
              size="sm"
              :label="t('admin.roles.admin')"
            />
            <UBadge
              v-if="row.original.wardenAdmin"
              color="neutral"
              variant="soft"
              size="sm"
              :label="t('admin.roles.wardenAdmin')"
            />
          </div>
          <span v-else class="text-muted">{{ t('admin.users.noRole') }}</span>
        </template>
        <template #lastSignInAt-cell="{ row }">
          {{
            row.original.lastSignInAt
              ? formatWardenRelative(row.original.lastSignInAt, locale)
              : t('admin.users.never')
          }}
        </template>
        <template #state-cell="{ row }">
          <UBadge
            v-if="row.original.ban"
            color="error"
            variant="subtle"
            :label="
              row.original.ban.expiresAt
                ? t('admin.users.bannedUntil', {
                    date: formatWardenDate(row.original.ban.expiresAt, locale),
                  })
                : t('admin.users.status.banned')
            "
          />
          <UBadge
            v-else-if="row.original.inactive"
            color="warning"
            variant="subtle"
            :label="t('admin.users.status.inactive')"
          />
        </template>
        <template #actions-cell="{ row }">
          <UDropdownMenu :items="rowItems(row.original)" :content="{ align: 'end' }">
            <UButton
              color="neutral"
              variant="ghost"
              size="md"
              icon="i-lucide-ellipsis"
              :aria-label="t('admin.users.actions', { name: row.original.name })"
            />
          </UDropdownMenu>
        </template>
      </UTable>
      <div
        v-if="cursors.length || data?.nextCursor"
        class="flex justify-end gap-2 border-t border-default px-4 py-2"
      >
        <UButton
          v-if="cursors.length"
          color="neutral"
          variant="ghost"
          size="md"
          :label="t('admin.users.first')"
          @click="first"
        />
        <UButton
          v-if="data?.nextCursor"
          color="neutral"
          variant="ghost"
          size="md"
          :label="t('admin.users.next')"
          @click="next"
        />
      </div>
    </div>
  </div>
</template>
