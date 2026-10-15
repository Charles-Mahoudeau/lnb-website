<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui';

import type {
  WardenManualLinkView,
  WardenMinecraftLookup,
  WardenProblem,
  WardenUserOption,
} from '#shared/schemas/warden';

// The manual linking tab: a link code for a Minecraft account, made by hand, optionally for
// one player only, and the codes made in the last 7 days.
const { t, locale } = useI18n();
const toast = useToast();
const manual = useWardenManualLinks();
const { data: recent, refresh: refreshRecent } = await manual.recent;

const LINKING_PROBLEMS = [
  'unknownMinecraftUsername',
  'mojangUnavailable',
  'crackedNotAllowed',
  'alreadyLinked',
  'banned',
  'schoolNotAllowed',
  'linkRequestClosed',
] as const;
function problemText(error: unknown) {
  const problem: WardenProblem | 'failed' = error instanceof WardenError ? error.problem : 'failed';
  const known = (LINKING_PROBLEMS as readonly string[]).includes(problem);
  return t(`wardenAdmin.linking.errors.${known ? problem : 'failed'}`);
}

// The account: looked up as the admin types, a moment after they stop.
const cracked = ref(false);
const username = ref('');
const found = ref<WardenMinecraftLookup | null>(null);
const lookupError = ref<string | null>(null);
const looking = ref(false);
let lookupTimer: ReturnType<typeof setTimeout> | undefined;
let lookupId = 0;

watch([username, cracked], () => {
  clearTimeout(lookupTimer);
  found.value = null;
  lookupError.value = null;
  const name = username.value.trim();
  if (!/^\w{3,16}$/.test(name)) return;
  lookupTimer = setTimeout(() => void lookUp(name), 400);
});

async function lookUp(name: string) {
  const id = ++lookupId;
  looking.value = true;
  try {
    const result = await manual.lookup(name, cracked.value);
    if (id === lookupId) found.value = result;
  } catch (error) {
    if (id === lookupId) lookupError.value = problemText(error);
  } finally {
    if (id === lookupId) looking.value = false;
  }
}

// The player the code is for, if any.
const player = ref<WardenUserOption | null>(null);
const playerSearch = ref('');
const playerOptions = ref<WardenUserOption[]>([]);
let searchTimer: ReturnType<typeof setTimeout> | undefined;
watch(playerSearch, (q) => {
  clearTimeout(searchTimer);
  if (q.trim().length < 2) {
    playerOptions.value = [];
    return;
  }
  searchTimer = setTimeout(() => {
    void manual
      .searchUsers(q.trim())
      .catch(() => [])
      .then((options) => (playerOptions.value = options));
  }, 250);
});
const playerItems = computed(() =>
  playerOptions.value.map((option) => ({
    label: option.name,
    description: option.email,
    value: option.userId,
  })),
);
function pickPlayer(userId: string | undefined) {
  player.value = playerOptions.value.find((option) => option.userId === userId) ?? null;
}

// The code made last, shown on the right until it's cancelled or another one is made.
const code = ref<WardenManualLinkView | null>(null);
const generating = ref(false);
const canGenerate = computed(() => !!found.value && !found.value.linkedTo && !generating.value);

async function onGenerate() {
  if (!found.value || found.value.linkedTo) return;
  generating.value = true;
  try {
    code.value = await manual.create({
      username: found.value.username,
      cracked: found.value.cracked,
      userId: player.value?.userId,
    });
    toast.add({
      title: t('wardenAdmin.linking.generated'),
      color: 'success',
      icon: 'i-lucide-circle-check',
    });
    await refreshRecent();
  } catch (error) {
    toast.add({ title: problemText(error), color: 'error', icon: 'i-lucide-circle-alert' });
  } finally {
    generating.value = false;
  }
}

async function onCancel() {
  if (!code.value) return;
  try {
    await manual.cancel(code.value.id);
    toast.add({
      title: t('wardenAdmin.linking.cancelled'),
      color: 'success',
      icon: 'i-lucide-circle-check',
    });
    code.value = null;
  } catch (error) {
    toast.add({ title: problemText(error), color: 'error', icon: 'i-lucide-circle-alert' });
  }
  await refreshRecent();
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.add({
      title: t('wardenAdmin.linking.copied'),
      color: 'success',
      icon: 'i-lucide-copy-check',
    });
  } catch {
    toast.add({
      title: t('wardenAdmin.linking.errors.failed'),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  }
}

// A countdown to the code's expiry, ticking every second while one is shown.
const now = ref(Date.now());
const ticker = setInterval(() => (now.value = Date.now()), 1000);
onBeforeUnmount(() => {
  clearInterval(ticker);
});
const secondsLeft = computed(() =>
  code.value ? Math.max(0, Math.floor((Date.parse(code.value.expiresAt) - now.value) / 1000)) : 0,
);
const countdown = computed(
  () =>
    `${String(Math.floor(secondsLeft.value / 60))}:${String(secondsLeft.value % 60).padStart(2, '0')}`,
);
const spacedCode = computed(() =>
  code.value ? `${code.value.userCode.slice(0, 3)} ${code.value.userCode.slice(3)}` : '',
);

function typeLabel(isCracked: boolean) {
  return t(isCracked ? 'warden.accounts.cracked' : 'warden.accounts.premium');
}

const columns = computed<TableColumn<WardenManualLinkView>[]>(() => [
  { accessorKey: 'createdAt', header: t('wardenAdmin.linking.created') },
  { id: 'minecraft', header: t('wardenAdmin.linking.minecraft') },
  { id: 'for', header: t('wardenAdmin.linking.for') },
  { id: 'by', header: t('wardenAdmin.linking.by') },
  { accessorKey: 'status', header: t('wardenAdmin.linking.status') },
]);

function statusColor(status: WardenManualLinkView['status']) {
  if (status === 'pending') return 'warning';
  if (status === 'linked') return 'success';
  return 'neutral';
}
</script>

<template>
  <div class="flex flex-col gap-8">
    <p class="max-w-2xl text-muted">{{ t('wardenAdmin.linking.lede') }}</p>

    <div class="grid items-start gap-6 lg:grid-cols-2">
      <form class="flex flex-col gap-5 rounded-lg bg-elevated p-5" @submit.prevent="onGenerate">
        <h2 class="text-xl font-medium text-highlighted">{{ t('wardenAdmin.linking.account') }}</h2>

        <fieldset class="flex flex-col gap-2">
          <legend class="mb-2 text-sm font-medium">{{ t('wardenAdmin.linking.type') }}</legend>
          <div class="flex flex-wrap gap-2">
            <UButton
              v-for="value in [false, true]"
              :key="String(value)"
              type="button"
              size="md"
              color="neutral"
              :variant="cracked === value ? 'soft' : 'outline'"
              :aria-pressed="cracked === value"
              :label="t(value ? 'wardenAdmin.linking.cracked' : 'wardenAdmin.linking.premium')"
              @click="cracked = value"
            />
          </div>
        </fieldset>

        <UFormField
          :label="t('wardenAdmin.linking.username')"
          :help="lookupError ? undefined : t('wardenAdmin.linking.usernameHelp')"
          :error="lookupError ?? undefined"
        >
          <UInput
            v-model="username"
            autocomplete="off"
            spellcheck="false"
            :maxlength="16"
            :loading="looking"
            class="w-full"
          />
        </UFormField>

        <div v-if="found" class="flex items-center gap-4 rounded-md bg-default px-4 py-3">
          <WardenMinecraftHead :uuid="found.uuid" />
          <div class="flex min-w-0 flex-col gap-0.5">
            <span class="font-semibold break-all text-highlighted">{{ found.username }}</span>
            <span class="text-sm break-all text-muted tabular-nums">{{ found.uuid }}</span>
            <span class="text-sm text-muted">
              {{
                t(
                  found.cracked
                    ? 'wardenAdmin.linking.foundOffline'
                    : 'wardenAdmin.linking.foundMojang',
                )
              }}
            </span>
          </div>
        </div>
        <div
          v-else-if="looking"
          class="flex items-center gap-3 rounded-md bg-default px-4 py-3 text-sm text-muted"
        >
          <UIcon name="i-lucide-loader-circle" class="size-4 motion-safe:animate-spin" />
          {{ t('wardenAdmin.linking.looking') }}
        </div>

        <UAlert
          v-if="found?.linkedTo"
          color="neutral"
          variant="soft"
          icon="i-lucide-circle-alert"
          :title="t('wardenAdmin.linking.linkedTo', { username: found.username })"
        >
          <template #description>
            <i18n-t keypath="wardenAdmin.linking.linkedToBody" tag="span" scope="global">
              <template #name>
                <NuxtLink
                  :to="`/warden/admin/players/${found.linkedTo.userId}`"
                  class="text-primary hover:underline"
                >
                  {{ found.linkedTo.name }}
                </NuxtLink>
              </template>
            </i18n-t>
          </template>
        </UAlert>

        <USeparator />

        <UFormField
          :label="t('wardenAdmin.linking.player')"
          :help="t('wardenAdmin.linking.playerHelp')"
        >
          <div v-if="player" class="flex items-center gap-3 rounded-md bg-default px-3 py-2">
            <UAvatar :alt="player.name" size="sm" />
            <div class="flex min-w-0 flex-1 flex-col">
              <span class="truncate text-highlighted">{{ player.name }}</span>
              <span class="truncate text-sm text-muted">{{ player.email }}</span>
            </div>
            <UButton
              type="button"
              color="neutral"
              variant="ghost"
              size="md"
              :label="t('wardenAdmin.linking.remove')"
              @click="player = null"
            />
          </div>
          <USelectMenu
            v-else
            v-model:search-term="playerSearch"
            :items="playerItems"
            value-key="value"
            ignore-filter
            :placeholder="t('wardenAdmin.linking.playerPlaceholder')"
            :search-input="{ placeholder: t('wardenAdmin.linking.playerPlaceholder') }"
            class="w-full"
            @update:model-value="pickPlayer"
          />
        </UFormField>

        <div>
          <UButton
            type="submit"
            :label="t('wardenAdmin.linking.generate')"
            :loading="generating"
            :disabled="!canGenerate"
          />
        </div>
      </form>

      <section
        v-if="!code"
        class="flex flex-col items-center gap-3 rounded-lg bg-elevated px-5 py-12 text-center text-muted"
      >
        <UIcon name="i-lucide-lock-keyhole" class="size-8" />
        <p>{{ t('wardenAdmin.linking.empty') }}</p>
      </section>

      <section v-else class="flex flex-col gap-5 rounded-lg bg-elevated p-5" aria-live="polite">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h2 class="text-xl font-medium text-highlighted">{{ t('wardenAdmin.linking.code') }}</h2>
          <UBadge
            :color="secondsLeft > 0 ? 'warning' : 'neutral'"
            variant="subtle"
            class="tabular-nums"
            :label="
              secondsLeft > 0
                ? t('wardenAdmin.linking.expiresIn', { time: countdown })
                : t('wardenAdmin.linking.expired')
            "
          />
        </div>
        <p class="font-display text-5xl font-medium tracking-wide text-highlighted tabular-nums">
          {{ spacedCode }}
        </p>
        <div class="flex items-center gap-4 rounded-md bg-default px-4 py-3">
          <WardenMinecraftHead :uuid="code.account.uuid" />
          <div class="flex min-w-0 flex-col gap-0.5">
            <span class="font-semibold break-all text-highlighted">{{
              code.account.username
            }}</span>
            <span class="text-sm text-muted">
              {{
                code.for
                  ? t('wardenAdmin.linking.forPlayer', {
                      type: typeLabel(code.account.cracked),
                      name: code.for.name,
                    })
                  : t('wardenAdmin.linking.forAnyone', { type: typeLabel(code.account.cracked) })
              }}
            </span>
          </div>
        </div>
        <p class="text-sm text-muted">{{ t('wardenAdmin.linking.give') }}</p>
        <UInput
          :model-value="code.verificationUriComplete"
          readonly
          :aria-label="t('wardenAdmin.linking.linkLabel')"
          class="w-full"
        />
        <div class="flex flex-wrap gap-3">
          <UButton
            color="neutral"
            variant="soft"
            icon="i-lucide-copy"
            :label="t('wardenAdmin.linking.copyCode')"
            @click="copy(code.userCode)"
          />
          <UButton
            color="neutral"
            variant="soft"
            icon="i-lucide-link"
            :label="t('wardenAdmin.linking.copyLink')"
            @click="copy(code.verificationUriComplete)"
          />
          <UButton
            color="neutral"
            variant="ghost"
            :label="t('wardenAdmin.linking.cancel')"
            :disabled="secondsLeft === 0"
            class="ms-auto"
            @click="onCancel"
          />
        </div>
      </section>
    </div>

    <section class="flex flex-col gap-4">
      <div class="flex flex-wrap items-baseline justify-between gap-3">
        <h2 class="text-2xl font-medium text-highlighted">{{ t('wardenAdmin.linking.recent') }}</h2>
        <span class="text-muted">{{ t('wardenAdmin.linking.recentRange') }}</span>
      </div>
      <div class="overflow-hidden rounded-lg bg-elevated">
        <UTable
          :data="recent ?? []"
          :columns="columns"
          :empty="t('wardenAdmin.linking.noRecent')"
          class="tabular-nums"
        >
          <template #createdAt-cell="{ row }">
            <span class="whitespace-nowrap">{{
              formatWardenDateTime(row.original.createdAt, locale)
            }}</span>
          </template>
          <template #minecraft-cell="{ row }">
            <div class="flex items-center gap-3">
              <WardenMinecraftHead :uuid="row.original.account.uuid" size="sm" />
              {{ row.original.account.username }}
            </div>
          </template>
          <template #for-cell="{ row }">
            {{ row.original.for?.name ?? t('wardenAdmin.linking.anyone') }}
          </template>
          <template #by-cell="{ row }">{{ row.original.by?.name ?? '' }}</template>
          <template #status-cell="{ row }">
            <UBadge
              :color="statusColor(row.original.status)"
              variant="subtle"
              :label="
                row.original.linkedBy
                  ? t('wardenAdmin.linking.statuses.linkedBy', { name: row.original.linkedBy.name })
                  : t(`wardenAdmin.linking.statuses.${row.original.status}`)
              "
            />
          </template>
        </UTable>
      </div>
    </section>
  </div>
</template>
