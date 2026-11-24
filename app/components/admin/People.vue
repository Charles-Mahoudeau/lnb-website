<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui';

import { AdminBulkModal, AdminGhostModal } from '#components';

import { ADMIN_PEOPLE_FILTERS } from '#shared/schemas/admin';
import type {
  AdminBulkBody,
  AdminPeopleFilter,
  AdminPeopleQuery,
  AdminPersonRow,
} from '#shared/schemas/admin';

// Everyone, for the four admin roles. The columns, the search and the quick filters follow the
// role, and the server cuts the data the same way (docs/plans/admin-redesign.md). A row opens the
// Person page. Bulk actions are for site admins.
const { t, locale } = useI18n();
const route = useRoute();
const toast = useToast();
const overlay = useOverlay();
const { user: me } = useAuth();
const actions = useAdminUserActions();

const role = computed(() => me.value?.role);
const siteAdmin = computed(() => isAdmin(role.value));
const warden = computed(() => isWardenAdmin(role.value));
const events = computed(() => isEventsManager(role.value));
const economy = computed(() => isEconomyAdmin(role.value));
// Who sees what, as on the server (server/services/people/access.ts). Warden admins and events
// managers see emails. Warden and economy admins search by Minecraft name.
const seesEmail = computed(() => warden.value || events.value);
const seesMinecraft = computed(() => warden.value);

type RoleFilter = NonNullable<AdminPeopleQuery['role']>;

// The Overview and the old Anticheat players address link here with ?filters=banned.
const initialFilters = String(route.query.filters ?? '')
  .split(',')
  .filter((value): value is AdminPeopleFilter =>
    (ADMIN_PEOPLE_FILTERS as readonly string[]).includes(value),
  );
const search = ref('');
const school = ref<string>('all');
const roleFilter = ref<RoleFilter>('any');
const chips = ref<AdminPeopleFilter[]>(initialFilters);
// Cursors of the pages before this one, to go back to the first page.
const cursors = ref<string[]>([]);

// The accounts ticked, kept across pages. `allMatching` stands for every account matching the
// filters, on every page, and the filters changing clears both: nobody is acted on unseen.
const selected = ref(new Map<string, AdminPersonRow>());
const allMatching = ref(false);
let lastTicked: string | undefined;

function filters(): AdminPeopleQuery {
  return {
    q: search.value || undefined,
    tenantId: school.value === 'all' ? undefined : school.value,
    role: roleFilter.value,
    filters: chips.value.join(',') || undefined,
  };
}

const query = ref<AdminPeopleQuery>(filters());
function clearSelection() {
  selected.value = new Map();
  allMatching.value = false;
  lastTicked = undefined;
}
let timer: ReturnType<typeof setTimeout> | undefined;
watch(search, () => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    cursors.value = [];
    clearSelection();
    query.value = filters();
  }, 250);
});
watch([school, roleFilter, chips], () => {
  cursors.value = [];
  clearSelection();
  query.value = filters();
});

const { data, error, status: loadState, refresh } = await useAdminPeople(query);

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
  { label: t('admin.roles.eventsManager'), value: 'events-manager' },
  { label: t('admin.roles.economyAdmin'), value: 'economy-admin' },
  { label: t('admin.roles.feedAnnouncer'), value: 'feed-announcer' },
]);

// The quick filters the role may use. The server refuses the others.
const chipItems = computed(() =>
  ADMIN_PEOPLE_FILTERS.filter((name) => {
    if (name === 'ghost') return true;
    if (name === 'inactive') return siteAdmin.value;
    return warden.value;
  }).map((name) => ({ name, label: t(`admin.people.filters.${name}`) })),
);
function toggleChip(name: AdminPeopleFilter) {
  chips.value = chips.value.includes(name)
    ? chips.value.filter((item) => item !== name)
    : [...chips.value, name];
}

const searchLabel = computed(() =>
  t(
    warden.value
      ? 'admin.people.searchWarden'
      : economy.value
        ? 'admin.people.searchEconomy'
        : 'admin.people.searchEvents',
  ),
);

const items = computed(() => data.value?.items ?? []);
const total = computed(() => data.value?.total ?? 0);
// The account owning a Minecraft name or UUID typed exactly: offered as a shortcut.
const match = computed(() => {
  const id = data.value?.match?.userId;
  return id ? items.value.find((row) => row.userId === id) : undefined;
});

const selectedCount = computed(() => (allMatching.value ? total.value : selected.value.size));
const pageTicked = computed(
  () => items.value.length > 0 && items.value.every((row) => selected.value.has(row.userId)),
);
const pageSome = computed(
  () => !pageTicked.value && items.value.some((row) => selected.value.has(row.userId)),
);
// Offered once the whole page is ticked and more accounts match than the page holds.
const canSelectAll = computed(() => pageTicked.value && total.value > items.value.length);

function isTicked(row: AdminPersonRow) {
  return allMatching.value || selected.value.has(row.userId);
}

function tickPage(value: boolean) {
  allMatching.value = false;
  for (const row of items.value) {
    if (value) selected.value.set(row.userId, row);
    else selected.value.delete(row.userId);
  }
}

// Shift-click ticks every row between this one and the last one ticked.
function tickRow(row: AdminPersonRow, value: boolean, range: boolean) {
  if (allMatching.value) {
    // Leaving "all matching" keeps the page, so unticking one row means "this page without it".
    allMatching.value = false;
    for (const item of items.value) selected.value.set(item.userId, item);
  }
  const rows = items.value;
  const from = lastTicked ? rows.findIndex((item) => item.userId === lastTicked) : -1;
  const to = rows.findIndex((item) => item.userId === row.userId);
  const span = range && from >= 0 ? rows.slice(Math.min(from, to), Math.max(from, to) + 1) : [row];
  for (const item of span) {
    if (value) selected.value.set(item.userId, item);
    else selected.value.delete(item.userId);
  }
  lastTicked = row.userId;
}

const shiftHeld = ref(false);

const columns = computed<TableColumn<AdminPersonRow>[]>(() => [
  ...(siteAdmin.value
    ? [{ id: 'select', meta: { class: { th: 'w-11 pr-0', td: 'w-11 pr-0' } } }]
    : []),
  { accessorKey: 'name', header: t('admin.users.user') },
  { accessorKey: 'school', header: t('admin.users.school') },
  ...(seesMinecraft.value ? [{ id: 'roles', header: t('admin.users.roles') }] : []),
  ...(seesMinecraft.value ? [{ id: 'minecraft', header: t('admin.people.minecraft') }] : []),
  ...(economy.value ? [{ id: 'balance', header: t('admin.people.balance') }] : []),
  ...(events.value ? [{ id: 'registrations', header: t('admin.people.registrations') }] : []),
  ...(siteAdmin.value ? [{ id: 'lastSignInAt', header: t('admin.users.lastSignIn') }] : []),
  ...(warden.value ? [{ id: 'state', header: t('admin.users.state') }] : []),
]);

const modals = {
  bulk: overlay.create(AdminBulkModal),
  ghost: overlay.create(AdminGhostModal),
};

async function onCreateGhost() {
  const ghost: unknown = await modals.ghost.open({ via: siteAdmin.value ? 'admin' : 'events' })
    .result;
  if (!ghost || typeof ghost !== 'object') return;
  toast.add({
    title: t('admin.ghost.created', { name: (ghost as { name: string }).name }),
    color: 'success',
    icon: 'i-lucide-circle-check',
  });
  await refresh();
}

async function onBulk(action: AdminBulkBody['action']) {
  const selection: AdminBulkBody['selection'] = allMatching.value
    ? {
        filters: {
          q: query.value.q,
          tenantId: query.value.tenantId,
          role: query.value.role,
          filters: chips.value,
        },
      }
    : { userIds: [...selected.value.keys()] };
  const extra: unknown = await modals.bulk.open({
    action,
    selection,
    people: allMatching.value
      ? []
      : [...selected.value.values()].map((row) => ({ userId: row.userId, name: row.name })),
  }).result;
  if (!extra || typeof extra !== 'object') return;
  try {
    const result = await actions.bulk({
      action,
      selection,
      ...(extra as Pick<AdminBulkBody, 'ban' | 'roles'>),
    });
    toast.add({
      title: t(`admin.users.bulk.done.${action}`, result.applied),
      description: result.skipped
        ? t('admin.users.bulk.done.skipped', { n: result.skipped })
        : undefined,
      color: 'success',
      icon: 'i-lucide-circle-check',
    });
  } catch {
    toast.add({
      title: t('admin.users.bulk.failed'),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  }
  clearSelection();
  await refresh();
}

function open(userId: string) {
  void navigateTo(`/admin/people/${encodeURIComponent(userId)}/summary`);
}
function onSelect(event: Event, row: { original: AdminPersonRow }) {
  // A click on a checkbox, a link or a button is theirs.
  if ((event.target as HTMLElement).closest('a, button, [role="checkbox"]')) return;
  open(row.original.userId);
}

const roleNames = (flags: NonNullable<AdminPersonRow['roles']>) =>
  [
    flags.admin && t('admin.roles.admin'),
    flags.wardenAdmin && t('admin.roles.wardenAdmin'),
    flags.eventsManager && t('admin.roles.eventsManager'),
    flags.economyAdmin && t('admin.roles.economyAdmin'),
    flags.feedAnnouncer && t('admin.roles.feedAnnouncer'),
  ].filter(Boolean) as string[];
</script>

<template>
  <div class="flex flex-col gap-4" :class="{ 'pb-20': selectedCount > 0 }">
    <div class="flex flex-wrap gap-3">
      <UInput
        v-model="search"
        type="search"
        icon="i-lucide-search"
        :placeholder="searchLabel"
        :aria-label="searchLabel"
        class="min-w-0 flex-1 basis-64"
      />
      <USelect
        v-model="school"
        :items="schoolItems"
        :aria-label="t('admin.users.school')"
        class="w-44"
      />
      <USelect
        v-if="siteAdmin"
        v-model="roleFilter"
        :items="roleItems"
        :aria-label="t('admin.users.roles')"
        class="w-44"
      />
      <UButton
        icon="i-lucide-user-plus"
        color="neutral"
        variant="soft"
        :label="t('admin.ghost.createButton')"
        @click="onCreateGhost"
      />
    </div>

    <div class="flex flex-wrap gap-2" role="group" :aria-label="t('admin.people.quickFilters')">
      <UButton
        v-for="chip in chipItems"
        :key="chip.name"
        :label="chip.label"
        :color="chips.includes(chip.name) ? 'secondary' : 'neutral'"
        :variant="chips.includes(chip.name) ? 'soft' : 'outline'"
        :aria-pressed="chips.includes(chip.name)"
        size="md"
        @click="toggleChip(chip.name)"
      />
    </div>

    <UAlert
      v-if="match"
      color="secondary"
      variant="subtle"
      icon="i-lucide-gamepad-2"
      :title="t('admin.people.matchTitle', { name: match.name })"
      :actions="[
        {
          label: t('admin.people.matchOpen'),
          color: 'neutral',
          variant: 'outline',
          onClick: () => open(match!.userId),
        },
      ]"
    />

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :description="t('admin.people.loadFailed')"
    />

    <div v-else class="overflow-hidden rounded-lg bg-elevated">
      <div
        v-if="siteAdmin && (allMatching || canSelectAll)"
        class="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-secondary/15 px-4 py-2 text-sm"
      >
        <span class="tabular-nums">
          {{
            allMatching
              ? t('admin.users.bulk.allSelected', { total })
              : t('admin.users.bulk.pageSelected', { n: items.length })
          }}
        </span>
        <UButton
          color="secondary"
          variant="link"
          size="md"
          :label="
            allMatching
              ? t('admin.users.bulk.pageOnly')
              : t('admin.users.bulk.selectAll', { total })
          "
          @click="allMatching = !allMatching"
        />
      </div>
      <UTable
        :data="items"
        :columns="columns"
        :meta="{ class: { tr: (row) => (isTicked(row.original) ? 'bg-secondary/10' : '') } }"
        :loading="loadState === 'pending'"
        :empty="t('admin.people.empty')"
        class="tabular-nums"
        @select="onSelect"
      >
        <template #select-header>
          <UCheckbox
            :model-value="allMatching || pageTicked ? true : pageSome ? 'indeterminate' : false"
            :aria-label="t('admin.users.bulk.selectPage')"
            @update:model-value="tickPage($event === true)"
          />
        </template>
        <template #select-cell="{ row }">
          <UCheckbox
            :model-value="isTicked(row.original)"
            :aria-label="t('admin.users.bulk.selectRow', { name: row.original.name })"
            @click.capture="shiftHeld = $event.shiftKey"
            @update:model-value="tickRow(row.original, $event === true, shiftHeld)"
          />
        </template>
        <template #name-cell="{ row }">
          <div class="flex items-center gap-3">
            <UserAvatar
              :user-id="row.original.userId"
              :name="row.original.name"
              :image="row.original.image"
              :ghost="row.original.ghost"
              size="sm"
            />
            <div class="flex min-w-0 flex-col">
              <span class="flex flex-wrap items-center gap-2">
                <NuxtLink
                  :to="`/admin/people/${row.original.userId}/summary`"
                  class="font-semibold text-highlighted hover:underline"
                >
                  {{ row.original.name }}
                </NuxtLink>
                <UBadge
                  v-if="row.original.ghost"
                  color="neutral"
                  variant="soft"
                  size="sm"
                  :label="t('admin.ghost.badge')"
                />
              </span>
              <span v-if="seesEmail && row.original.email" class="text-sm text-muted">
                {{ row.original.email }}
              </span>
            </div>
          </div>
        </template>
        <template #school-cell="{ row }">
          {{ row.original.school ?? t('admin.users.unknownSchool') }}
        </template>
        <template #roles-cell="{ row }">
          <div
            v-if="row.original.roles && roleNames(row.original.roles).length"
            class="flex flex-wrap gap-1"
          >
            <UBadge
              v-for="name in roleNames(row.original.roles)"
              :key="name"
              color="neutral"
              variant="soft"
              size="sm"
              :label="name"
            />
          </div>
          <span v-else class="text-muted">{{ t('admin.users.noRole') }}</span>
        </template>
        <template #minecraft-cell="{ row }">
          <template v-if="row.original.minecraft?.accounts.length">
            <span class="text-highlighted">{{ row.original.minecraft.accounts[0]?.username }}</span>
            <span v-if="row.original.minecraft.accounts.length > 1" class="text-muted">
              {{
                t('admin.people.moreAccounts', { n: row.original.minecraft.accounts.length - 1 })
              }}
            </span>
            <span v-if="row.original.minecraft.accounts.some((a) => a.online)" class="sr-only">
              {{ t('admin.people.online') }}
            </span>
            <UIcon
              v-if="row.original.minecraft.accounts.some((a) => a.online)"
              name="i-lucide-circle"
              class="ml-1.5 inline size-2.5 text-success"
              aria-hidden="true"
            />
          </template>
          <span v-else class="text-muted">{{ t('admin.people.noMinecraft') }}</span>
        </template>
        <template #balance-cell="{ row }">
          <span v-if="row.original.balance != null">
            {{ t('admin.people.lnbits', { n: formatLnbits(row.original.balance, locale) }) }}
          </span>
          <span v-else class="text-muted">{{ t('admin.people.noAccount') }}</span>
        </template>
        <template #registrations-cell="{ row }">
          <span v-if="row.original.registrations?.total">
            {{
              t('admin.people.registered', {
                upcoming: row.original.registrations.upcoming,
                total: row.original.registrations.total,
              })
            }}
          </span>
          <span v-else class="text-muted">{{ t('admin.people.noRegistration') }}</span>
        </template>
        <template #lastSignInAt-cell="{ row }">
          {{
            row.original.lastSignInAt
              ? formatWardenRelative(row.original.lastSignInAt, locale)
              : row.original.ghost
                ? t('admin.ghost.neverSignedIn')
                : t('admin.users.never')
          }}
        </template>
        <template #state-cell="{ row }">
          <div class="flex flex-wrap gap-1">
            <UBadge
              v-if="row.original.ban"
              color="error"
              variant="subtle"
              size="sm"
              :label="
                row.original.ban.expiresAt
                  ? t('admin.users.bannedUntil', {
                      date: formatWardenDate(row.original.ban.expiresAt, locale),
                    })
                  : t('wardenAdmin.players.banned')
              "
            />
            <UBadge
              v-if="row.original.minecraft?.transferWarning"
              color="warning"
              variant="subtle"
              size="sm"
              :label="t(`wardenAdmin.players.transfer.${row.original.minecraft.transferWarning}`)"
            />
            <UBadge
              v-if="row.original.siteBan"
              color="error"
              variant="subtle"
              size="sm"
              :label="t('admin.users.status.banned')"
            />
            <UBadge
              v-if="row.original.anticheat?.flagged"
              color="warning"
              variant="subtle"
              size="sm"
              :label="t('admin.people.flagged')"
            />
            <UBadge
              v-if="row.original.overLimit"
              color="warning"
              variant="subtle"
              size="sm"
              :label="t('admin.people.overLimit')"
            />
            <UBadge
              v-if="row.original.inactive"
              color="warning"
              variant="subtle"
              size="sm"
              :label="t('admin.users.status.inactive')"
            />
          </div>
        </template>
      </UTable>
      <div
        v-if="cursors.length || data?.nextCursor"
        class="flex items-center justify-between gap-2 border-t border-default px-4 py-2"
      >
        <span class="text-sm text-muted tabular-nums">
          {{ t('admin.people.total', { total }, total) }}
        </span>
        <div class="flex gap-2">
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

    <AdminUsersBulkBar
      v-if="siteAdmin && selectedCount > 0"
      :count="selectedCount"
      @act="onBulk"
      @clear="clearSelection"
    />
  </div>
</template>
