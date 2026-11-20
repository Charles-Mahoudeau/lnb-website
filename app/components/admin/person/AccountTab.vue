<script setup lang="ts">
import { AdminBanModal, AdminRolesModal } from '#components';

import type { AdminPersonSummary, AdminRolesBody } from '#shared/schemas/admin';

// The Site account tab of the Person page, for site admins: roles, sessions, the site ban and
// deleting the account. These are the actions of the old Users row menu.
const props = defineProps<{ summary: AdminPersonSummary }>();

const { t, locale } = useI18n();
const toast = useToast();
const overlay = useOverlay();
const { user: me } = useAuth();
const actions = useAdminUserActions();
const { ask, refresh } = usePersonRun(props.summary.userId);

const modals = { ban: overlay.create(AdminBanModal), roles: overlay.create(AdminRolesModal) };

const ghost = computed(() => props.summary.ghost);
const self = computed(() => props.summary.userId === me.value?.id);
// Admins can't ban or delete themselves or another admin: the role goes first.
const protectedAccount = computed(() => props.summary.roles?.admin === true || self.value);

async function run(action: () => Promise<unknown>, success: string) {
  try {
    await action();
    toast.add({ title: success, color: 'success', icon: 'i-lucide-circle-check' });
  } catch (failure) {
    const problem = failure instanceof AdminError ? failure.problem : 'failed';
    const known = ['notFound', 'self', 'targetIsAdmin', 'notBanned', 'isGhost'];
    toast.add({
      title: t(`admin.errors.${known.includes(problem) ? problem : 'failed'}`),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  }
  await refresh();
}

async function onRoles() {
  if (!props.summary.roles) return;
  const roles: unknown = await modals.roles.open({
    name: props.summary.name,
    roles: props.summary.roles,
    self: self.value,
  }).result;
  if (!roles || typeof roles !== 'object') return;
  await run(
    () => actions.setRoles(props.summary.userId, roles as AdminRolesBody),
    t('admin.users.rolesSaved'),
  );
}

async function onSignOut() {
  if (
    await ask(
      t('admin.users.signOutTitle', { name: props.summary.name }),
      t('admin.users.signOutBody'),
    )
  ) {
    await run(() => actions.signOut(props.summary.userId), t('admin.users.signedOut'));
  }
}

async function onBan() {
  const ban: unknown = await modals.ban.open({ name: props.summary.name }).result;
  if (!ban || typeof ban !== 'object') return;
  await run(
    () => actions.ban(props.summary.userId, ban as Parameters<typeof actions.ban>[1]),
    t('admin.users.banned'),
  );
}

async function onUnban() {
  if (
    await ask(t('admin.users.unbanTitle', { name: props.summary.name }), t('admin.users.unbanBody'))
  ) {
    await run(() => actions.unban(props.summary.userId), t('admin.users.unbanned'));
  }
}

async function onDelete() {
  if (
    await ask(
      t('admin.users.deleteTitle', { name: props.summary.name }),
      t('admin.users.deleteBody'),
      true,
    )
  ) {
    try {
      await actions.remove(props.summary.userId);
      toast.add({ title: t('admin.users.deleted'), color: 'success' });
      await navigateTo('/admin/people');
    } catch (failure) {
      const problem = failure instanceof AdminError ? failure.problem : 'failed';
      toast.add({
        title: t(
          `admin.errors.${['self', 'targetIsAdmin'].includes(problem) ? problem : 'failed'}`,
        ),
        color: 'error',
        icon: 'i-lucide-circle-alert',
      });
    }
  }
}

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
</script>

<template>
  <div class="flex flex-col gap-8">
    <dl class="grid max-w-xl grid-cols-2 gap-x-4 gap-y-3 rounded-lg bg-elevated p-5 text-sm">
      <dt class="text-muted">{{ t('admin.users.roles') }}</dt>
      <dd class="flex flex-wrap justify-end gap-1">
        <template v-if="ghost">
          <span class="text-muted">{{ t('admin.person.account.ghostNoRoles') }}</span>
        </template>
        <template v-else-if="roleNames.length">
          <UBadge
            v-for="name in roleNames"
            :key="name"
            color="neutral"
            variant="soft"
            size="sm"
            :label="name"
          />
        </template>
        <span v-else class="text-muted">{{ t('admin.users.noRole') }}</span>
      </dd>
      <dt class="text-muted">{{ t('admin.users.lastSignIn') }}</dt>
      <dd class="text-right text-highlighted">
        {{
          summary.lastSignInAt
            ? formatWardenRelative(summary.lastSignInAt, locale)
            : ghost
              ? t('admin.ghost.neverSignedIn')
              : t('admin.users.never')
        }}
      </dd>
      <dt class="text-muted">{{ t('admin.person.account.created') }}</dt>
      <dd class="text-right text-highlighted">{{ formatWardenDate(summary.createdAt, locale) }}</dd>
      <dt class="text-muted">{{ t('admin.person.account.siteBan') }}</dt>
      <dd class="text-right text-highlighted">
        <template v-if="summary.siteBan">
          {{
            summary.siteBan.expiresAt
              ? t('admin.users.bannedUntil', {
                  date: formatWardenDate(summary.siteBan.expiresAt, locale),
                })
              : t('admin.users.status.banned')
          }}
        </template>
        <span v-else class="text-muted">{{ t('admin.person.account.noBan') }}</span>
      </dd>
    </dl>

    <div class="flex flex-wrap gap-3">
      <UButton
        v-if="!ghost"
        color="neutral"
        variant="outline"
        icon="i-lucide-shield"
        :label="t('admin.users.changeRoles')"
        @click="onRoles"
      />
      <UButton
        v-if="!ghost"
        color="neutral"
        variant="outline"
        icon="i-lucide-log-out"
        :label="t('admin.users.signOut')"
        @click="onSignOut"
      />
      <template v-if="!protectedAccount">
        <UButton
          v-if="summary.siteBan"
          color="neutral"
          variant="outline"
          icon="i-lucide-undo-2"
          :label="t('admin.users.unban')"
          @click="onUnban"
        />
        <UButton
          v-else-if="!ghost"
          color="error"
          variant="outline"
          icon="i-lucide-ban"
          :label="t('admin.users.ban')"
          @click="onBan"
        />
        <UButton
          color="error"
          variant="outline"
          icon="i-lucide-trash-2"
          :label="t('admin.users.delete')"
          @click="onDelete"
        />
      </template>
    </div>
  </div>
</template>
