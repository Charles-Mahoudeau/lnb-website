<script setup lang="ts">
import type { AdminPersonSummary } from '#shared/schemas/admin';

// The Summary tab of the Person page: "at a glance", one card per side of the person the role may
// see, each opening its tab. The server leaves out what the role can't read, so a missing block
// is a missing card.
const props = defineProps<{ summary: AdminPersonSummary }>();
const { t, locale } = useI18n();
const { user: me } = useAuth();

const base = computed(() => `/admin/people/${props.summary.userId}`);
const tabs = computed(
  () => new Set(personTabs(me.value?.role, props.summary.ghost).map((tab) => tab.id)),
);
const flags = computed(() => {
  const roles = props.summary.roles;
  if (!roles) return [];
  return [
    roles.admin && t('admin.roles.admin'),
    roles.wardenAdmin && t('admin.roles.wardenAdmin'),
    roles.eventsManager && t('admin.roles.eventsManager'),
    roles.economyAdmin && t('admin.roles.economyAdmin'),
  ].filter(Boolean) as string[];
});
</script>

<template>
  <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
    <section class="flex flex-col gap-3 rounded-lg bg-elevated p-5">
      <h3 class="text-lg font-medium text-highlighted">{{ t('admin.person.summary.account') }}</h3>
      <dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <dt class="text-muted">{{ t('admin.users.school') }}</dt>
        <dd class="text-right text-highlighted">
          {{ summary.school ?? t('admin.users.unknownSchool') }}
        </dd>
        <template v-if="summary.email">
          <dt class="text-muted">{{ t('admin.ghost.email') }}</dt>
          <dd class="text-right break-all text-highlighted">{{ summary.email }}</dd>
        </template>
        <dt class="text-muted">{{ t('admin.person.account.created') }}</dt>
        <dd class="text-right text-highlighted">
          {{ formatWardenDate(summary.createdAt, locale) }}
        </dd>
        <template v-if="summary.lastSignInAt !== undefined">
          <dt class="text-muted">{{ t('admin.users.lastSignIn') }}</dt>
          <dd class="text-right text-highlighted">
            {{
              summary.lastSignInAt
                ? formatWardenRelative(summary.lastSignInAt, locale)
                : summary.ghost
                  ? t('admin.ghost.neverSignedIn')
                  : t('admin.users.never')
            }}
          </dd>
        </template>
        <template v-if="summary.roles">
          <dt class="text-muted">{{ t('admin.users.roles') }}</dt>
          <dd class="text-right text-highlighted">
            {{ flags.length ? flags.join(', ') : t('admin.users.noRole') }}
          </dd>
        </template>
      </dl>
      <NuxtLink v-if="tabs.has('account')" :to="`${base}/account`" class="text-sm text-primary">
        {{ t('admin.person.tabs.account') }}
      </NuxtLink>
    </section>

    <section v-if="summary.minecraft" class="flex flex-col gap-3 rounded-lg bg-elevated p-5">
      <h3 class="text-lg font-medium text-highlighted">{{ t('admin.person.tabs.minecraft') }}</h3>
      <p v-if="!summary.minecraft.accounts.length" class="text-sm text-muted">
        {{ t('admin.person.summary.noAccounts') }}
      </p>
      <ul v-else class="flex flex-col gap-1 text-sm">
        <li
          v-for="account in summary.minecraft.accounts"
          :key="account.uuid"
          class="flex items-center justify-between gap-3"
        >
          <span class="text-highlighted">{{ account.username }}</span>
          <span class="text-muted">
            {{
              account.online
                ? t('admin.people.online')
                : account.lastSeenAt
                  ? formatWardenRelative(account.lastSeenAt, locale)
                  : t('admin.users.never')
            }}
          </span>
        </li>
      </ul>
      <dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <dt class="text-muted">{{ t('wardenAdmin.player.accounts') }}</dt>
        <dd class="text-right text-highlighted tabular-nums">
          {{ summary.minecraft.limit.used }} / {{ summary.minecraft.limit.max }}
        </dd>
        <dt class="text-muted">{{ t('wardenAdmin.player.totalPlaytime') }}</dt>
        <dd class="text-right text-highlighted tabular-nums">
          {{ formatWardenDuration(summary.minecraft.playtimeSeconds, locale) }}
        </dd>
        <dt class="text-muted">{{ t('wardenAdmin.player.devices') }}</dt>
        <dd class="text-right text-highlighted tabular-nums">{{ summary.minecraft.devices }}</dd>
      </dl>
      <UBadge
        v-if="summary.minecraft.pendingTransfers"
        color="warning"
        variant="subtle"
        class="self-start"
        :label="t('admin.person.summary.transfers', summary.minecraft.pendingTransfers)"
      />
      <NuxtLink v-if="tabs.has('minecraft')" :to="`${base}/minecraft`" class="text-sm text-primary">
        {{ t('admin.person.summary.open') }}
      </NuxtLink>
    </section>

    <section v-if="summary.moderation" class="flex flex-col gap-3 rounded-lg bg-elevated p-5">
      <h3 class="text-lg font-medium text-highlighted">{{ t('admin.person.tabs.moderation') }}</h3>
      <p v-if="summary.moderation.activeBan" class="text-sm">
        <span class="font-semibold text-error">{{ t('wardenAdmin.players.banned') }}</span>
        {{ summary.moderation.activeBan.reason }}
      </p>
      <p v-else class="text-sm text-muted">{{ t('admin.person.summary.notBanned') }}</p>
      <dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <dt class="text-muted">{{ t('admin.person.summary.bans') }}</dt>
        <dd class="text-right text-highlighted tabular-nums">{{ summary.moderation.bans }}</dd>
        <dt class="text-muted">{{ t('admin.person.summary.warnings') }}</dt>
        <dd class="text-right text-highlighted tabular-nums">{{ summary.moderation.warnings }}</dd>
        <dt class="text-muted">{{ t('admin.person.summary.notes') }}</dt>
        <dd class="text-right text-highlighted tabular-nums">{{ summary.moderation.notes }}</dd>
      </dl>
      <NuxtLink
        v-if="tabs.has('moderation')"
        :to="`${base}/moderation`"
        class="text-sm text-primary"
      >
        {{ t('admin.person.summary.open') }}
      </NuxtLink>
    </section>

    <section v-if="summary.playtime" class="flex flex-col gap-3 rounded-lg bg-elevated p-5">
      <h3 class="text-lg font-medium text-highlighted">{{ t('admin.person.tabs.playtime') }}</h3>
      <p class="text-sm" :class="summary.playtime.overSeconds > 0 ? 'text-warning' : 'text-muted'">
        {{
          summary.playtime.overSeconds > 0
            ? t('admin.person.summary.overLimit', {
                time: formatWardenDuration(summary.playtime.overSeconds, locale),
              })
            : t('admin.person.summary.underLimit')
        }}
      </p>
      <NuxtLink v-if="tabs.has('playtime')" :to="`${base}/playtime`" class="text-sm text-primary">
        {{ t('admin.person.summary.open') }}
      </NuxtLink>
    </section>

    <section
      v-if="summary.anticheat !== undefined"
      class="flex flex-col gap-3 rounded-lg bg-elevated p-5"
    >
      <h3 class="text-lg font-medium text-highlighted">{{ t('admin.person.tabs.anticheat') }}</h3>
      <template v-if="summary.anticheat">
        <p class="text-sm text-highlighted tabular-nums">
          {{ t('admin.person.summary.score', { score: summary.anticheat.score }) }}
          <span class="text-muted">{{
            t(`admin.person.summary.band.${summary.anticheat.band}`)
          }}</span>
        </p>
        <p v-if="summary.anticheat.manualHold" class="text-sm text-warning">
          {{ t('admin.person.summary.hold') }}
        </p>
        <p class="text-sm" :class="summary.anticheat.flaggedFiles ? 'text-warning' : 'text-muted'">
          {{ t('admin.person.summary.flaggedFiles', summary.anticheat.flaggedFiles) }}
        </p>
      </template>
      <p v-else class="text-sm text-muted">{{ t('admin.person.summary.unseen') }}</p>
      <NuxtLink v-if="tabs.has('anticheat')" :to="`${base}/anticheat`" class="text-sm text-primary">
        {{ t('admin.person.summary.open') }}
      </NuxtLink>
    </section>

    <section
      v-if="summary.economy !== undefined"
      class="flex flex-col gap-3 rounded-lg bg-elevated p-5"
    >
      <h3 class="text-lg font-medium text-highlighted">{{ t('admin.person.tabs.lnbits') }}</h3>
      <template v-if="summary.economy">
        <p class="text-sm text-highlighted tabular-nums">
          {{ t('admin.people.lnbits', { n: summary.economy.balance.toLocaleString(locale) }) }}
        </p>
        <p v-if="summary.economy.frozen" class="text-sm text-warning">
          {{ t('economy.accounts.frozen') }}
        </p>
      </template>
      <p v-else class="text-sm text-muted">{{ t('admin.person.lnbits.none') }}</p>
      <NuxtLink v-if="tabs.has('lnbits')" :to="`${base}/lnbits`" class="text-sm text-primary">
        {{ t('admin.person.summary.open') }}
      </NuxtLink>
    </section>

    <section v-if="summary.events" class="flex flex-col gap-3 rounded-lg bg-elevated p-5">
      <h3 class="text-lg font-medium text-highlighted">{{ t('admin.person.tabs.events') }}</h3>
      <p
        class="text-sm"
        :class="summary.events.registrations.length ? 'text-highlighted' : 'text-muted'"
      >
        {{ t('admin.person.summary.registrations', summary.events.registrations.length) }}
      </p>
      <NuxtLink v-if="tabs.has('events')" :to="`${base}/events`" class="text-sm text-primary">
        {{ t('admin.person.summary.open') }}
      </NuxtLink>
    </section>
  </div>
</template>
