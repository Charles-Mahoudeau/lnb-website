<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui';

import {
  AdminEconomyAdjustModal,
  AdminPersonGhostEditModal,
  AdminPersonRegisterModal,
  WardenAdminBanEndModal,
  WardenAdminBanModal,
  WardenAdminNoteModal,
  WardenAdminUnbanModal,
} from '#components';

import type { AdminPersonSummary } from '#shared/schemas/admin';
import { economyAdjustBody } from '#shared/schemas/economy';
import type { WardenBanBody, WardenNoteBody } from '#shared/schemas/warden';

// The top of the Person page: who they are, the actions their state and your role allow, and the
// callouts that need an answer (docs/plans/admin-redesign.md). Destructive actions are outline
// buttons, never solid. On a phone the actions fold into the ⋯ menu.
const props = defineProps<{ summary: AdminPersonSummary; tab: string }>();

const { t, locale } = useI18n();
const toast = useToast();
const overlay = useOverlay();
const { user: me } = useAuth();
const userId = computed(() => props.summary.userId);
const { ask, run, refresh } = usePersonRun(props.summary.userId);
const wardenActions = useWardenPlayerActions(props.summary.userId);
const adminActions = useAdminUserActions();

const role = computed(() => me.value?.role);
const siteAdmin = computed(() => isAdmin(role.value));
const ghost = computed(() => props.summary.ghost);
const ban = computed(() => props.summary.moderation?.activeBan ?? null);
const appealPending = computed(() => props.summary.moderation?.appeal?.status === 'pending');
const flaggedFile = computed(() => props.summary.anticheat?.flaggedFile ?? null);
const roleNames = computed(() => {
  const flags = props.summary.roles;
  if (!flags) return [];
  return [
    flags.admin && t('admin.roles.admin'),
    flags.wardenAdmin && t('admin.roles.wardenAdmin'),
    flags.eventsManager && t('admin.roles.eventsManager'),
    flags.economyAdmin && t('admin.roles.economyAdmin'),
  ].filter(Boolean) as string[];
});
const overLimit = computed(() => (props.summary.playtime?.overSeconds ?? 0) > 0);

const modals = {
  ban: overlay.create(WardenAdminBanModal),
  unban: overlay.create(WardenAdminUnbanModal),
  banEnd: overlay.create(WardenAdminBanEndModal),
  note: overlay.create(WardenAdminNoteModal),
  adjust: overlay.create(AdminEconomyAdjustModal),
  register: overlay.create(AdminPersonRegisterModal),
  ghostEdit: overlay.create(AdminPersonGhostEditModal),
};

async function onNote(kind: WardenNoteBody['kind']) {
  const note: unknown = await modals.note.open({ kind }).result;
  if (!note || typeof note !== 'object') return;
  const body = note as WardenNoteBody;
  await run(
    () => wardenActions.addNote(body),
    t(body.kind === 'warning' ? 'wardenAdmin.noteModal.warned' : 'wardenAdmin.noteModal.done'),
  );
}

async function onBan() {
  const result: unknown = await modals.ban.open({ name: props.summary.name }).result;
  if (!result || typeof result !== 'object') return;
  await run(() => wardenActions.ban(result as WardenBanBody), t('wardenAdmin.banModal.done'));
}

async function onUnban() {
  if (!ban.value) return;
  const banId = ban.value.id;
  const reason: unknown = await modals.unban.open({ name: props.summary.name }).result;
  if (typeof reason !== 'string') return;
  await run(
    () => wardenActions.revoke(banId, reason || undefined),
    t('wardenAdmin.unbanModal.done'),
  );
}

async function onBanEnd() {
  if (!ban.value) return;
  const banId = ban.value.id;
  const end: unknown = await modals.banEnd.open({
    name: props.summary.name,
    current: ban.value.expiresAt,
  }).result;
  if (end === undefined) return;
  await run(
    () => wardenActions.updateBan(banId, end as string | null),
    t('wardenAdmin.banEndModal.done'),
  );
}

async function onAdjust() {
  const account = props.summary.economy;
  if (!account) return;
  const result: unknown = await modals.adjust.open({
    label: props.summary.name,
    balance: account.balance,
    direction: 'mint',
  }).result;
  const parsed = economyAdjustBody.safeParse(result);
  if (!parsed.success) return;
  try {
    await economyAdminActions.adjust(account.accountId, parsed.data);
    toast.add({
      title: t(`admin.economy.adjust.done.${parsed.data.direction}`, {
        amount: formatLnbits(parsed.data.amount, locale.value),
      }),
      color: 'success',
      icon: 'i-lucide-circle-check',
    });
  } catch (failure) {
    const problem = failure instanceof EconomyError ? failure.problem : 'failed';
    toast.add({
      title: t(`economy.errors.${problem}`),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  }
  await refresh();
}

async function onRegister() {
  const added: unknown = await modals.register.open({
    userId: props.summary.userId,
    name: props.summary.name,
  }).result;
  if (added === true) await refresh();
}

async function onGhostEdit() {
  const edited: unknown = await modals.ghostEdit.open({
    userId: props.summary.userId,
    ghost: {
      name: props.summary.name,
      email: props.summary.email ?? '',
      tenantId: props.summary.tenantId ?? '',
    },
  }).result;
  if (!edited) return;
  toast.add({
    title: t('admin.person.ghostEdit.done'),
    color: 'success',
    icon: 'i-lucide-circle-check',
  });
  await refresh();
}

async function onGhostDelete() {
  if (
    !(await ask(
      t('admin.person.ghostDelete.title', { name: props.summary.name }),
      t('admin.person.ghostDelete.body'),
      true,
    ))
  ) {
    return;
  }
  try {
    await adminActions.remove(props.summary.userId);
    toast.add({
      title: t('admin.users.deleted'),
      color: 'success',
      icon: 'i-lucide-circle-check',
    });
    await navigateTo('/admin/people');
  } catch (failure) {
    const problem = failure instanceof AdminError ? failure.problem : 'failed';
    toast.add({
      title: t(`admin.errors.${problem === 'notFound' ? problem : 'failed'}`),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  }
}

async function copyId() {
  try {
    await navigator.clipboard.writeText(props.summary.userId);
    toast.add({ title: t('admin.person.idCopied'), color: 'success', icon: 'i-lucide-copy-check' });
  } catch {
    toast.add({ title: t('admin.person.idCopyFailed'), color: 'error' });
  }
}

interface Action {
  key: string;
  label: string;
  icon: string;
  destructive?: boolean;
  onSelect: () => void;
}

// Which actions exist for this person and this role. Order: the likely one first.
const actions = computed<Action[]>(() => {
  const list: Action[] = [];
  const act = (action: Action) => list.push(action);
  if (isWardenAdmin(role.value) && !ghost.value && props.summary.moderation) {
    act({
      key: 'note',
      label: t('admin.person.actions.note'),
      icon: 'i-lucide-notebook-pen',
      onSelect: () => void onNote('note'),
    });
    act({
      key: 'warn',
      label: t('admin.person.actions.warn'),
      icon: 'i-lucide-triangle-alert',
      onSelect: () => void onNote('warning'),
    });
    if (ban.value) {
      act({
        key: 'banEnd',
        label: t('admin.person.actions.banEnd'),
        icon: 'i-lucide-calendar-clock',
        onSelect: () => void onBanEnd(),
      });
      act({
        key: 'unban',
        label: t('admin.person.actions.unban'),
        icon: 'i-lucide-undo-2',
        destructive: true,
        onSelect: () => void onUnban(),
      });
    } else {
      act({
        key: 'ban',
        label: t('admin.person.actions.ban'),
        icon: 'i-lucide-ban',
        destructive: true,
        onSelect: () => void onBan(),
      });
    }
  }
  if (ghost.value && siteAdmin.value) {
    act({
      key: 'ghostEdit',
      label: t('admin.person.actions.ghostEdit'),
      icon: 'i-lucide-pencil',
      onSelect: () => void onGhostEdit(),
    });
  }
  if (isEventsManager(role.value)) {
    act({
      key: 'register',
      label: t('admin.person.actions.register'),
      icon: 'i-lucide-calendar-plus',
      onSelect: () => void onRegister(),
    });
  }
  if (ghost.value && siteAdmin.value) {
    act({
      key: 'ghostDelete',
      label: t('admin.person.actions.ghostDelete'),
      icon: 'i-lucide-trash-2',
      destructive: true,
      onSelect: () => void onGhostDelete(),
    });
  }
  if (isEconomyAdmin(role.value) && props.summary.economy) {
    act({
      key: 'adjust',
      label: t('admin.person.actions.adjust'),
      icon: 'i-lucide-coins',
      onSelect: () => void onAdjust(),
    });
  }
  return list;
});

const extras = computed<DropdownMenuItem[]>(() => [
  { label: t('admin.person.copyId'), icon: 'i-lucide-copy', onSelect: () => void copyId() },
  ...(isWardenAdmin(role.value)
    ? [
        {
          label: t('admin.person.activity'),
          icon: 'i-lucide-history',
          to: `/admin/settings/activity?user=${encodeURIComponent(userId.value)}`,
        },
      ]
    : []),
]);

const asItem = (action: Action): DropdownMenuItem => ({
  label: action.label,
  icon: action.icon,
  color: action.destructive ? 'error' : undefined,
  onSelect: action.onSelect,
});
// The ⋯ menu on a phone holds everything. From the small breakpoint up only the extras.
const phoneItems = computed<DropdownMenuItem[][]>(() => [actions.value.map(asItem), extras.value]);
const deskItems = computed<DropdownMenuItem[][]>(() => [extras.value]);
</script>

<template>
  <div class="flex flex-col gap-5">
    <div class="flex flex-wrap items-start justify-between gap-5">
      <div class="flex min-w-0 items-center gap-4">
        <UserAvatar
          :user-id="summary.userId"
          :name="summary.name"
          :image="summary.image"
          :ghost="ghost"
          size="xl"
        />
        <div class="flex min-w-0 flex-col gap-1.5">
          <div class="flex flex-wrap items-center gap-3">
            <h2 class="text-3xl font-bold break-words text-highlighted">{{ summary.name }}</h2>
            <UBadge v-if="ghost" color="neutral" variant="soft" :label="t('admin.ghost.badge')" />
            <UBadge v-if="summary.school" color="neutral" variant="soft" :label="summary.school" />
            <UBadge
              v-for="name in roleNames"
              :key="name"
              color="neutral"
              variant="soft"
              :label="name"
            />
            <UBadge
              v-if="ban"
              color="error"
              variant="subtle"
              :label="
                ban.expiresAt
                  ? t('admin.users.bannedUntil', { date: formatWardenDate(ban.expiresAt, locale) })
                  : t('wardenAdmin.players.banned')
              "
            />
            <UBadge
              v-if="summary.siteBan"
              color="error"
              variant="subtle"
              :label="t('admin.users.status.banned')"
            />
          </div>
          <span v-if="summary.email" class="text-muted">{{ summary.email }}</span>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-3">
        <div class="hidden flex-wrap gap-3 sm:flex">
          <UButton
            v-for="action in actions"
            :key="action.key"
            :color="action.destructive ? 'error' : 'neutral'"
            :variant="action.destructive ? 'outline' : 'soft'"
            :icon="action.icon"
            :label="action.label"
            @click="action.onSelect"
          />
        </div>
        <UDropdownMenu :items="phoneItems" :content="{ align: 'end' }">
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-ellipsis"
            class="sm:hidden"
            :aria-label="t('admin.person.more')"
          />
        </UDropdownMenu>
        <UDropdownMenu :items="deskItems" :content="{ align: 'end' }">
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-ellipsis"
            class="hidden sm:inline-flex"
            :aria-label="t('admin.person.more')"
          />
        </UDropdownMenu>
      </div>
    </div>

    <UAlert
      v-if="appealPending"
      color="warning"
      variant="subtle"
      icon="i-lucide-message-square-warning"
      :title="t('admin.person.callouts.appeal')"
      :actions="[
        {
          label: t('admin.person.callouts.appealAction'),
          to: '/admin/moderation/appeals',
          color: 'primary',
          variant: 'solid',
        },
      ]"
    />
    <UAlert
      v-if="flaggedFile"
      color="warning"
      variant="subtle"
      icon="i-lucide-shield-alert"
      :title="t('admin.person.callouts.file', { file: flaggedFile.filename })"
      :actions="[
        {
          label: t('admin.person.callouts.fileAction'),
          to: `/admin/people/${summary.userId}/anticheat`,
          color: 'primary',
          variant: 'solid',
        },
      ]"
    />
    <UAlert
      v-if="overLimit"
      color="warning"
      variant="subtle"
      icon="i-lucide-clock-alert"
      :title="
        t('admin.person.callouts.limit', {
          time: formatWardenDuration(summary.playtime?.overSeconds ?? 0, locale),
        })
      "
      :actions="[
        {
          label: t('admin.person.callouts.limitAction'),
          to: `/admin/people/${summary.userId}/playtime`,
          color: 'neutral',
          variant: 'outline',
        },
      ]"
    />
  </div>
</template>
