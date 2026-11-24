<script setup lang="ts">
import { WardenAdminLimitModal } from '#components';

import type {
  WardenAccountView,
  WardenDeviceView,
  WardenPlayerDetail,
  WardenTransferView,
} from '#shared/schemas/warden';

// The Minecraft tab of the Person page: accounts, devices, account takeovers, sessions, and the
// facts with the Feed announcer switch.
const props = defineProps<{ userId: string }>();
const { t, locale } = useI18n();
const overlay = useOverlay();
const admin = useWardenAdminPlayer(props.userId);
const { data, error } = await admin.player;
const { run, ask } = usePersonRun(props.userId);
const limitModal = overlay.create(WardenAdminLimitModal);

async function onLimit(player: WardenPlayerDetail['player']) {
  const result: unknown = await limitModal.open({
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

async function onDismissTransfer(transfer: WardenTransferView) {
  await run(() => admin.dismissTransfer(transfer.id), t('wardenAdmin.player.transfers.done'));
}

function dateTime(iso: string) {
  return formatWardenDateTime(iso, locale.value);
}
</script>

<template>
  <UAlert
    v-if="error || !data"
    color="error"
    variant="subtle"
    icon="i-lucide-circle-alert"
    :description="t('wardenAdmin.player.loadFailed')"
  />
  <div v-else class="flex flex-col gap-10">
    <section v-if="data.transfers.length" class="flex flex-col gap-4">
      <h2 class="text-2xl font-medium text-highlighted">
        {{ t('wardenAdmin.player.transfers.title') }}
      </h2>
      <UAlert
        v-if="data.transfers.some((transfer) => !transfer.dismissed)"
        color="warning"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        :description="t('wardenAdmin.player.transfers.hint')"
      />
      <ul class="flex flex-col divide-y divide-default rounded-lg bg-elevated">
        <li
          v-for="transfer in data.transfers"
          :key="transfer.id"
          class="flex flex-wrap items-center gap-4 px-5 py-4"
        >
          <div class="flex min-w-0 flex-1 basis-60 flex-col gap-1.5">
            <span class="flex flex-wrap items-center gap-2 font-semibold text-highlighted">
              <i18n-t :keypath="`wardenAdmin.player.transfers.${transfer.direction}`" tag="span">
                <template #username>{{ transfer.username }}</template>
                <template #name>
                  <NuxtLink
                    :to="`/admin/people/${transfer.other.userId}/minecraft`"
                    class="text-primary hover:underline"
                  >
                    {{ transfer.other.name ?? transfer.other.userId }}
                  </NuxtLink>
                </template>
              </i18n-t>
              <UBadge
                v-if="!transfer.dismissed"
                color="warning"
                variant="subtle"
                size="sm"
                :label="t('wardenAdmin.player.transfers.pending')"
              />
            </span>
            <span class="text-sm text-muted tabular-nums">
              {{ dateTime(transfer.createdAt) }}
              <template v-if="transfer.dismissed">
                ,
                {{
                  transfer.dismissed.by
                    ? t('wardenAdmin.player.transfers.dismissed', {
                        date: dateTime(transfer.dismissed.at),
                        actor: transfer.dismissed.by.name,
                      })
                    : t('wardenAdmin.player.transfers.dismissedNobody', {
                        date: dateTime(transfer.dismissed.at),
                      })
                }}
              </template>
            </span>
          </div>
          <UButton
            v-if="!transfer.dismissed"
            color="neutral"
            variant="soft"
            size="md"
            :label="t('wardenAdmin.player.transfers.dismiss')"
            @click="onDismissTransfer(transfer)"
          />
        </li>
      </ul>
    </section>

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
        {{ t('wardenAdmin.player.sessions') }}
      </h2>
      <WardenSessions :sessions="data.sessions.items" :has-more="false" :loading-more="false" />
    </section>

    <section class="flex flex-col gap-4">
      <div class="flex flex-wrap items-baseline justify-between gap-3">
        <h2 class="text-2xl font-medium text-highlighted">{{ t('wardenAdmin.player.facts') }}</h2>
        <UButton
          color="neutral"
          variant="outline"
          :label="t('wardenAdmin.player.limit')"
          @click="onLimit(data.player)"
        />
      </div>
      <dl class="grid max-w-md grid-cols-2 gap-x-4 gap-y-3 rounded-lg bg-elevated p-5 text-sm">
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
          {{ formatWardenDuration(data.player.playtimeSeconds, locale) }}
        </dd>
        <dt class="text-muted">{{ t('wardenAdmin.player.nameInGame') }}</dt>
        <dd class="text-right text-highlighted">
          {{
            data.player.showRealName
              ? t('wardenAdmin.player.shown')
              : t('wardenAdmin.player.hidden')
          }}
        </dd>
      </dl>
      <AdminFeedAnnouncerRow :user-id="userId" :name="data.player.name" />
    </section>
  </div>
</template>
