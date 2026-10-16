<script setup lang="ts">
import { WardenAppealModal, WardenConfirmModal } from '#components';

import type { WardenAccountView, WardenSessionView } from '#shared/schemas/warden';

definePageMeta({ flag: 'warden' });

const { t, locale } = useI18n();
const toast = useToast();
const overlay = useOverlay();
const { user } = useAuth();

useSeoMeta({ title: () => t('warden.title'), robots: 'noindex' });

const app = getLinkApp('warden');
const eligible = computed(() =>
  Boolean(app && user.value && canLinkFromSchool(app, user.value.tenantId)),
);
const schools = computed(() =>
  new Intl.ListFormat(locale.value, { type: 'conjunction' }).format(
    (app?.schools ?? []).map((tid) => schoolForTenant(tid) ?? tid),
  ),
);

const warden = useWarden({ immediate: eligible.value });
const { data: me, error, refresh } = await warden.me;

// The host players join to link an account: the address without the player's own label.
const host = computed(() => me.value?.serverUrl.split('.').slice(1).join('.') ?? '');
const confirmModal = overlay.create(WardenConfirmModal);
const appealModal = overlay.create(WardenAppealModal);

/** Asks before a change that's hard to undo. True when confirmed. */
async function ask(question: {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
}): Promise<boolean> {
  return (await confirmModal.open(question).result) === true;
}

function showError(problem: string) {
  const known = ['notFound', 'notLinked', 'schoolNotAllowed', 'appealExists'];
  toast.add({
    title: t(`warden.errors.${known.includes(problem) ? problem : 'failed'}`),
    color: 'error',
    icon: 'i-lucide-circle-alert',
  });
}

async function run(action: () => Promise<unknown>, success: string) {
  try {
    await action();
    toast.add({ title: success, color: 'success', icon: 'i-lucide-circle-check' });
    await refresh();
  } catch (failure) {
    showError(failure instanceof WardenError ? failure.problem : 'failed');
  }
}

async function onRegenerate() {
  const confirmed = await ask({
    title: t('warden.address.regenerateTitle'),
    description: t('warden.address.regenerateBody'),
    confirmLabel: t('warden.address.regenerate'),
    cancelLabel: t('warden.address.keep'),
  });
  if (confirmed) await run(warden.regenerateToken, t('warden.address.regenerated'));
}

async function onUnlink(account: WardenAccountView) {
  const confirmed = await ask({
    title: t('warden.accounts.unlinkTitle', { username: account.username }),
    description: t('warden.accounts.unlinkBody'),
    confirmLabel: t('warden.accounts.unlink'),
    cancelLabel: t('warden.accounts.unlinkCancel'),
    destructive: true,
  });
  if (confirmed) await run(() => warden.unlink(account.uuid), t('warden.accounts.unlinked'));
}

const identityPending = ref(false);
async function onIdentity(showRealName: boolean) {
  // Showing the name needs no confirmation. Hiding it asks first.
  if (!showRealName) {
    const confirmed = await ask({
      title: t('warden.identity.hideTitle'),
      description: t('warden.identity.hideBody'),
      confirmLabel: t('warden.identity.hide'),
      cancelLabel: t('warden.identity.keep'),
    });
    if (!confirmed) return;
  }
  identityPending.value = true;
  await run(
    () => warden.setShowRealName(showRealName),
    showRealName ? t('warden.identity.shown') : t('warden.identity.hidden'),
  );
  identityPending.value = false;
}

async function onAppeal(banId: string) {
  if ((await appealModal.open({ banId }).result) === true) await refresh();
}

// Older sessions, added below the first page from GET /api/warden/me.
const olderSessions = ref<WardenSessionView[]>([]);
const olderCursor = ref<string | null | undefined>(undefined);
const loadingMore = ref(false);
watch(me, () => {
  olderSessions.value = [];
  olderCursor.value = undefined;
});
const sessions = computed(() => [...(me.value?.sessions.items ?? []), ...olderSessions.value]);
const nextCursor = computed(() =>
  olderCursor.value === undefined ? (me.value?.sessions.nextCursor ?? null) : olderCursor.value,
);

async function onMoreSessions() {
  if (!nextCursor.value) return;
  loadingMore.value = true;
  try {
    const page = await warden.moreSessions(nextCursor.value);
    olderSessions.value.push(...page.items);
    olderCursor.value = page.nextCursor;
  } catch (failure) {
    showError(failure instanceof WardenError ? failure.problem : 'failed');
  } finally {
    loadingMore.value = false;
  }
}

const firstUsername = computed(() => me.value?.accounts[0]?.username ?? 'Steve');
</script>

<template>
  <UContainer class="flex max-w-3xl flex-col gap-10 py-14">
    <div class="flex flex-col gap-2">
      <h1 class="text-4xl font-bold text-highlighted">{{ t('warden.title') }}</h1>
      <p class="max-w-xl text-lg text-muted">{{ t('warden.lede') }}</p>
    </div>

    <!-- Students of other schools: a short, centered empty state. -->
    <div
      v-if="!eligible"
      class="flex flex-col items-center gap-3 rounded-lg bg-elevated px-5 py-10 text-center"
    >
      <UIcon name="i-lucide-school" class="size-8 text-muted" />
      <h2 class="text-xl font-medium text-highlighted">{{ t('warden.schoolNotAllowed.title') }}</h2>
      <p class="max-w-md text-muted">{{ t('warden.schoolNotAllowed.lede', { schools }) }}</p>
    </div>

    <UAlert
      v-else-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :description="t('warden.loadFailed')"
    />

    <template v-else-if="me">
      <WardenBanNotice
        v-if="me.activeBan"
        :ban="me.activeBan"
        @appeal="onAppeal(me.activeBan.id)"
      />

      <WardenServerAddress
        :server-url="me.serverUrl"
        :token-rotated-at="me.tokenRotatedAt"
        @regenerate="onRegenerate"
      />

      <section class="flex flex-col gap-4" aria-labelledby="warden-accounts">
        <div class="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="warden-accounts" class="text-2xl font-medium text-highlighted">
            {{ t('warden.accounts.title') }}
          </h2>
          <span class="text-muted tabular-nums">
            {{
              t('warden.accounts.count', { used: me.limit.used, max: me.limit.max }, me.limit.max)
            }}
          </span>
        </div>

        <div
          v-if="me.accounts.length === 0"
          class="flex flex-col items-center gap-3 rounded-lg bg-elevated px-5 py-10 text-center"
        >
          <span class="grid size-12 place-items-center rounded-full bg-accented text-muted">
            <UIcon name="i-lucide-link" class="size-6" />
          </span>
          <h3 class="text-xl font-medium text-highlighted">
            {{ t('warden.accounts.empty.title') }}
          </h3>
          <p class="max-w-md text-muted">{{ t('warden.accounts.empty.body', { host }) }}</p>
          <p class="text-sm text-muted">
            {{ t('warden.accounts.empty.limit', { max: me.limit.max }, me.limit.max) }}
          </p>
        </div>

        <template v-else>
          <div class="flex flex-col divide-y divide-default rounded-lg bg-elevated">
            <WardenAccountRow
              v-for="account in me.accounts"
              :key="account.uuid"
              :account="account"
              @unlink="onUnlink(account)"
            />
          </div>
          <p class="flex gap-3 text-muted">
            <UIcon name="i-lucide-link" class="mt-1 size-5 shrink-0" />
            <span>
              {{
                me.limit.used < me.limit.max
                  ? t('warden.accounts.howTo', { host })
                  : t('warden.accounts.full')
              }}
            </span>
          </p>
        </template>
      </section>

      <WardenIdentity
        :show-real-name="me.showRealName"
        :short-name="me.shortName"
        :username="firstUsername"
        :pending="identityPending"
        @update="onIdentity"
      />

      <section
        v-if="me.accounts.length || sessions.length"
        class="flex flex-col gap-4"
        aria-labelledby="warden-sessions"
      >
        <div class="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="warden-sessions" class="text-2xl font-medium text-highlighted">
            {{ t('warden.sessions.title') }}
          </h2>
          <span class="text-muted tabular-nums">
            {{
              t('warden.sessions.total', {
                time: formatWardenDuration(me.totals.playtimeSeconds, locale),
              })
            }}
          </span>
        </div>
        <WardenSessions
          :sessions="sessions"
          :has-more="nextCursor !== null"
          :loading-more="loadingMore"
          @more="onMoreSessions"
        />
      </section>

      <section
        v-if="me.history.length"
        class="flex flex-col gap-4"
        aria-labelledby="warden-history"
      >
        <h2 id="warden-history" class="text-2xl font-medium text-highlighted">
          {{ t('warden.history.title') }}
        </h2>
        <WardenHistory :items="me.history" />
      </section>
    </template>
  </UContainer>
</template>
