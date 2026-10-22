<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui';

import {
  WardenAdminBanModal,
  WardenAdminLimitModal,
  WardenAdminNoteModal,
  WardenAdminUnbanModal,
  WardenConfirmModal,
} from '#components';

import type {
  WardenAccountView,
  WardenDeviceView,
  WardenPlayerDetail,
} from '#shared/schemas/warden';

definePageMeta({ wardenAdmins: true });

const { t, locale } = useI18n();
const route = useRoute();
const toast = useToast();
const overlay = useOverlay();
const labels = useWardenLabels();
const { user } = useAuth();

const userId = String(route.params.userId);
const admin = useWardenAdminPlayer(userId);
const { data, error, refresh } = await admin.player;

const activeBan = computed(() => data.value?.bans.find((ban) => ban.active));
const isSiteAdmin = computed(() => isAdmin(user.value?.role));

const modals = {
  confirm: overlay.create(WardenConfirmModal),
  ban: overlay.create(WardenAdminBanModal),
  unban: overlay.create(WardenAdminUnbanModal),
  note: overlay.create(WardenAdminNoteModal),
  limit: overlay.create(WardenAdminLimitModal),
};

async function ask(title: string, description: string, destructive = false): Promise<boolean> {
  const result: unknown = await modals.confirm.open({
    title,
    description,
    confirmLabel: t('wardenAdmin.player.confirm'),
    cancelLabel: t('wardenAdmin.player.cancel'),
    destructive,
  }).result;
  return result === true;
}

async function run(action: () => Promise<unknown>, success: string) {
  try {
    await action();
    toast.add({ title: success, color: 'success', icon: 'i-lucide-circle-check' });
  } catch (failure) {
    const problem = failure instanceof WardenError ? failure.problem : 'failed';
    const known = ['notFound', 'notBanned', 'notLinked'];
    toast.add({
      title: t(`wardenAdmin.errors.${known.includes(problem) ? problem : 'failed'}`),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  }
  await refresh();
}

async function onBan(player: WardenPlayerDetail['player']) {
  const result: unknown = await modals.ban.open({ name: player.name }).result;
  if (!result || typeof result !== 'object') return;
  await run(
    () => admin.ban(result as Parameters<typeof admin.ban>[0]),
    t('wardenAdmin.banModal.done'),
  );
}

async function onUnban(player: WardenPlayerDetail['player'], banId: string) {
  const reason: unknown = await modals.unban.open({ name: player.name }).result;
  if (typeof reason !== 'string') return;
  await run(() => admin.revoke(banId, reason || undefined), t('wardenAdmin.unbanModal.done'));
}

async function onNote() {
  const note: unknown = await modals.note.open({}).result;
  if (!note || typeof note !== 'object') return;
  const body = note as Parameters<typeof admin.addNote>[0];
  await run(
    () => admin.addNote(body),
    t(body.kind === 'warning' ? 'wardenAdmin.noteModal.warned' : 'wardenAdmin.noteModal.done'),
  );
}

async function onLimit(player: WardenPlayerDetail['player']) {
  const result: unknown = await modals.limit.open({
    name: player.name,
    current: player.maxAccounts,
    defaultMax: player.defaultMaxAccounts,
  }).result;
  if (!result || typeof result !== 'object') return;
  const { maxAccounts } = result as { maxAccounts: number | null };
  await run(() => admin.setMaxAccounts(maxAccounts), t('wardenAdmin.limitModal.done'));
}

async function onRevokeDevice(player: WardenPlayerDetail['player'], device: WardenDeviceView) {
  if (
    await ask(
      t('wardenAdmin.player.revokeDeviceTitle', { device: device.name, name: player.name }),
      t('wardenAdmin.player.revokeDeviceBody'),
      true,
    )
  ) {
    await run(() => admin.revokeDevice(device.id), t('wardenAdmin.player.deviceRevoked'));
  }
}

async function onRole(player: WardenPlayerDetail['player']) {
  const on = !player.wardenAdmin;
  if (
    await ask(
      t(on ? 'wardenAdmin.player.roleOnTitle' : 'wardenAdmin.player.roleOffTitle', {
        name: player.name,
      }),
      t(on ? 'wardenAdmin.player.roleOnBody' : 'wardenAdmin.player.roleOffBody'),
    )
  ) {
    await run(() => admin.setWardenAdmin(on), t('wardenAdmin.player.roleChanged'));
  }
}

async function onUnlink(player: WardenPlayerDetail['player'], account: WardenAccountView) {
  if (
    await ask(
      t('wardenAdmin.player.unlinkTitle', { username: account.username, name: player.name }),
      t('wardenAdmin.player.unlinkBody'),
      true,
    )
  ) {
    await run(() => admin.unlink(account.uuid), t('wardenAdmin.player.unlinked'));
  }
}

const moreItems = computed<DropdownMenuItem[]>(() => {
  const player = data.value?.player;
  if (!player) return [];
  return [
    {
      label: t('wardenAdmin.player.limit'),
      icon: 'i-lucide-hash',
      onSelect: () => void onLimit(player),
    },
    ...(isSiteAdmin.value && !player.admin
      ? [
          {
            label: t(
              player.wardenAdmin
                ? 'wardenAdmin.player.removeAdmin'
                : 'wardenAdmin.player.makeAdmin',
            ),
            icon: 'i-lucide-shield',
            onSelect: () => void onRole(player),
          },
        ]
      : []),
  ];
});

/** Bans and notes in one timeline, newest first. */
const timeline = computed(() => {
  if (!data.value) return [];
  return [
    ...data.value.bans.map((ban) => ({ kind: 'ban' as const, at: ban.createdAt, ban })),
    ...data.value.notes.map((note) => ({ kind: 'note' as const, at: note.createdAt, note })),
  ].sort((a, b) => b.at.localeCompare(a.at));
});

function dateTime(iso: string) {
  return formatWardenDateTime(iso, locale.value);
}
</script>

<template>
  <AdminPage
    :title="data?.player.name ?? t('admin.nav.players')"
    :parents="[
      { label: t('admin.nav.warden') },
      { label: t('admin.nav.players'), to: '/admin/warden/players' },
    ]"
  >
    <UAlert
      v-if="error || !data"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :description="t('wardenAdmin.player.loadFailed')"
    />

    <template v-else>
      <div class="flex flex-wrap items-start justify-between gap-5">
        <div class="flex min-w-0 flex-col gap-1.5">
          <div class="flex flex-wrap items-center gap-3">
            <h2 class="text-3xl font-bold text-highlighted">{{ data.player.name }}</h2>
            <UBadge
              v-if="activeBan"
              color="error"
              variant="subtle"
              :label="t('wardenAdmin.players.banned')"
            />
            <UBadge
              v-if="data.player.wardenAdmin"
              color="neutral"
              variant="soft"
              :label="t('wardenAdmin.players.wardenAdmin')"
            />
          </div>
          <span class="text-muted">
            {{ [data.player.email, data.player.school].filter(Boolean).join(', ') }}
          </span>
        </div>
        <div class="flex flex-wrap gap-3">
          <UButton
            v-if="activeBan"
            color="neutral"
            variant="soft"
            :label="t('wardenAdmin.player.unban')"
            @click="onUnban(data.player, activeBan.id)"
          />
          <UButton
            v-else
            color="error"
            variant="outline"
            :label="t('wardenAdmin.player.ban')"
            @click="onBan(data.player)"
          />
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-notebook-pen"
            :label="t('wardenAdmin.player.addNote')"
            @click="onNote"
          />
          <UDropdownMenu :items="moreItems" :content="{ align: 'end' }">
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-lucide-ellipsis"
              :aria-label="t('wardenAdmin.player.more')"
            />
          </UDropdownMenu>
        </div>
      </div>

      <div class="grid items-start gap-10 lg:grid-cols-3">
        <div class="flex min-w-0 flex-col gap-10 lg:col-span-2">
          <section class="flex flex-col gap-4">
            <div class="flex flex-wrap items-baseline justify-between gap-3">
              <h2 class="text-2xl font-medium text-highlighted">
                {{ t('wardenAdmin.player.accounts') }}
              </h2>
              <span class="text-muted tabular-nums">
                {{
                  t(
                    'warden.accounts.count',
                    { used: data.player.limit.used, max: data.player.limit.max },
                    data.player.limit.max,
                  )
                }}
              </span>
            </div>
            <div
              v-if="data.accounts.length"
              class="flex flex-col divide-y divide-default rounded-lg bg-elevated"
            >
              <WardenAccountRow
                v-for="account in data.accounts"
                :key="account.uuid"
                :account="account"
                @unlink="onUnlink(data.player, account)"
              />
            </div>
            <p v-else class="text-muted">{{ t('wardenAdmin.player.noAccounts') }}</p>
          </section>

          <section class="flex flex-col gap-4">
            <h2 class="text-2xl font-medium text-highlighted">
              {{ t('wardenAdmin.player.devices') }}
            </h2>
            <ul
              v-if="data.devices.length"
              class="flex flex-col divide-y divide-default rounded-lg bg-elevated"
            >
              <li
                v-for="device in data.devices"
                :key="device.id"
                class="flex flex-wrap items-center gap-4 px-5 py-4"
              >
                <div class="flex min-w-0 flex-1 basis-60 flex-col gap-1.5">
                  <span class="font-semibold break-all text-highlighted">{{ device.name }}</span>
                  <div class="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
                    <span>
                      {{ t('warden.devices.linkedOn') }}
                      <span class="text-default">
                        {{ formatWardenDate(device.createdAt, locale) }}
                      </span>
                    </span>
                    <span>
                      {{ t('warden.devices.lastUsed') }}
                      <span class="text-default">
                        {{ formatWardenRelative(device.lastUsedAt, locale) }}
                      </span>
                    </span>
                  </div>
                </div>
                <UButton
                  color="neutral"
                  variant="ghost"
                  size="md"
                  :label="t('warden.devices.revoke')"
                  @click="onRevokeDevice(data.player, device)"
                />
              </li>
            </ul>
            <p v-else class="text-muted">{{ t('wardenAdmin.player.noDevices') }}</p>
          </section>

          <section class="flex flex-col gap-4">
            <h2 class="text-2xl font-medium text-highlighted">
              {{ t('wardenAdmin.player.moderation') }}
            </h2>
            <p v-if="!timeline.length" class="text-muted">
              {{ t('wardenAdmin.player.noModeration') }}
            </p>
            <ul v-else class="flex flex-col divide-y divide-default rounded-lg bg-elevated">
              <li
                v-for="item in timeline"
                :key="item.kind + (item.kind === 'ban' ? item.ban.id : item.note.id)"
                class="flex gap-4 px-5 py-4"
              >
                <span
                  class="grid size-8 shrink-0 place-items-center rounded-full bg-accented text-muted"
                >
                  <UIcon
                    :name="
                      item.kind === 'ban'
                        ? 'i-lucide-ban'
                        : item.note.kind === 'warning'
                          ? 'i-lucide-triangle-alert'
                          : 'i-lucide-notebook-pen'
                    "
                    class="size-4"
                  />
                </span>
                <div v-if="item.kind === 'ban'" class="flex min-w-0 flex-col gap-1.5">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="font-semibold text-highlighted">
                      {{
                        item.ban.expiresAt
                          ? t('wardenAdmin.timeline.banFor', {
                              length: formatWardenBanLength(
                                item.ban.createdAt,
                                item.ban.expiresAt,
                                locale,
                              ),
                            })
                          : t('wardenAdmin.timeline.banPermanent')
                      }}
                    </span>
                    <UBadge
                      :color="item.ban.active ? 'error' : 'neutral'"
                      variant="subtle"
                      :label="
                        item.ban.active
                          ? t('wardenAdmin.timeline.active')
                          : item.ban.revoked
                            ? t('wardenAdmin.timeline.lifted')
                            : t('wardenAdmin.timeline.ended')
                      "
                    />
                    <UBadge
                      v-if="item.ban.appeal"
                      :color="item.ban.appeal.status === 'pending' ? 'warning' : 'neutral'"
                      variant="subtle"
                      :label="
                        t(
                          item.ban.appeal.status === 'pending'
                            ? 'wardenAdmin.timeline.appealPending'
                            : item.ban.appeal.status === 'accepted'
                              ? 'wardenAdmin.timeline.appealAccepted'
                              : 'wardenAdmin.timeline.appealRejected',
                        )
                      "
                    />
                  </div>
                  <p class="break-words">{{ item.ban.reason }}</p>
                  <p class="text-sm text-muted">
                    {{
                      t('wardenAdmin.timeline.issued', {
                        actor: labels.actor(item.ban.issuedBy),
                        source: labels.source(item.ban.source),
                        date: dateTime(item.ban.createdAt),
                      })
                    }}
                    <template v-if="item.ban.expiresAt && !item.ban.revoked">
                      {{ t('wardenAdmin.timeline.ends', { date: dateTime(item.ban.expiresAt) }) }}
                    </template>
                  </p>
                  <p v-if="item.ban.revoked" class="text-sm text-muted">
                    {{
                      t(
                        item.ban.revoked.reason
                          ? 'wardenAdmin.timeline.revokedWithReason'
                          : 'wardenAdmin.timeline.revoked',
                        {
                          actor: labels.actor(item.ban.revoked.by),
                          date: dateTime(item.ban.revoked.at),
                          reason: item.ban.revoked.reason ?? '',
                        },
                      )
                    }}
                  </p>
                  <template v-if="item.ban.appeal">
                    <p class="border-l-2 border-default pl-3 text-sm whitespace-pre-line">
                      {{ t('wardenAdmin.timeline.appeal', { body: item.ban.appeal.body }) }}
                    </p>
                    <p
                      v-if="item.ban.appeal.response && item.ban.appeal.decidedBy"
                      class="text-sm text-muted"
                    >
                      {{
                        t('wardenAdmin.timeline.appealResponse', {
                          actor: labels.actor(item.ban.appeal.decidedBy),
                          response: item.ban.appeal.response,
                        })
                      }}
                    </p>
                  </template>
                </div>
                <div v-else class="flex min-w-0 flex-col gap-1.5">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="font-semibold text-highlighted">
                      {{
                        t(
                          item.note.kind === 'warning'
                            ? 'wardenAdmin.timeline.warning'
                            : 'wardenAdmin.timeline.note',
                        )
                      }}
                    </span>
                    <UBadge
                      color="neutral"
                      variant="soft"
                      :label="
                        t(
                          item.note.kind === 'warning'
                            ? 'wardenAdmin.timeline.seenByPlayer'
                            : 'wardenAdmin.timeline.adminsOnly',
                        )
                      "
                    />
                  </div>
                  <p class="break-words whitespace-pre-line">{{ item.note.body }}</p>
                  <p class="text-sm text-muted">
                    {{
                      t('wardenAdmin.timeline.issued', {
                        actor: labels.actor(item.note.author),
                        source: labels.source(item.note.source),
                        date: dateTime(item.note.createdAt),
                      })
                    }}
                  </p>
                </div>
              </li>
            </ul>
          </section>

          <section class="flex flex-col gap-4">
            <h2 class="text-2xl font-medium text-highlighted">
              {{ t('wardenAdmin.player.sessions') }}
            </h2>
            <WardenSessions
              :sessions="data.sessions.items"
              :has-more="false"
              :loading-more="false"
            />
          </section>

          <section class="flex flex-col gap-4">
            <h2 class="text-2xl font-medium text-highlighted">
              {{ t('wardenAdmin.player.activity') }}
            </h2>
            <div class="overflow-hidden rounded-lg bg-elevated">
              <WardenAdminAuditTable :entries="data.audit" :show-player="false" />
            </div>
          </section>
        </div>

        <aside class="flex flex-col gap-4 rounded-lg bg-elevated p-5">
          <h3 class="text-lg font-medium text-highlighted">{{ t('wardenAdmin.player.facts') }}</h3>
          <dl class="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <dt class="text-muted">{{ t('wardenAdmin.player.factLimit') }}</dt>
            <dd class="text-right text-highlighted tabular-nums">
              {{
                data.player.maxAccounts === null
                  ? t('wardenAdmin.player.limitDefault', { count: data.player.defaultMaxAccounts })
                  : t('wardenAdmin.player.limitOwn', { count: data.player.maxAccounts })
              }}
            </dd>
            <dt class="text-muted">{{ t('wardenAdmin.player.totalPlaytime') }}</dt>
            <dd class="text-right text-highlighted tabular-nums">
              {{
                formatWardenDuration(
                  data.accounts.reduce((sum, account) => sum + account.playtimeSeconds, 0),
                  locale,
                )
              }}
            </dd>
            <dt class="text-muted">{{ t('wardenAdmin.player.nameInGame') }}</dt>
            <dd class="text-right text-highlighted">
              {{
                data.player.showRealName
                  ? t('wardenAdmin.player.shown')
                  : t('wardenAdmin.player.hidden')
              }}
            </dd>
            <dt class="text-muted">{{ t('wardenAdmin.player.wardenAdmin') }}</dt>
            <dd class="text-right text-highlighted">
              {{
                data.player.wardenAdmin ? t('wardenAdmin.player.yes') : t('wardenAdmin.player.no')
              }}
            </dd>
          </dl>
          <p v-if="!isSiteAdmin" class="text-sm text-muted">
            {{ t('wardenAdmin.player.siteAdminOnly') }}
          </p>
        </aside>
      </div>
    </template>
  </AdminPage>
</template>
