<script setup lang="ts">
// The richest players and shared accounts (docs/economy.md). Proposal B of the economy mocks:
// a band for the top three, then players and shared accounts side by side.
definePageMeta({ flag: 'economy.baltop' });

const { t, locale } = useI18n();
const toast = useToast();

useSeoMeta({ title: () => t('economy.baltop.title'), robots: 'noindex' });

const { data, error, refresh } = await useBaltop();
const { data: me, refresh: refreshMe } = await useEconomyMe();

const podium = computed(() => data.value?.players.slice(0, 3) ?? []);
const rest = computed(() => data.value?.players.slice(3) ?? []);

const pending = ref(false);
async function onVisibility(hidden: boolean) {
  pending.value = true;
  try {
    await economyActions.updateMe({ hideFromBaltop: hidden });
    toast.add({
      title: hidden ? t('economy.settings.baltopHidden') : t('economy.settings.baltopShown'),
      color: 'success',
      icon: 'i-lucide-circle-check',
    });
    await Promise.all([refresh(), refreshMe()]);
  } catch {
    toast.add({ title: t('economy.errors.failed'), color: 'error', icon: 'i-lucide-circle-alert' });
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <UContainer class="flex flex-col gap-8 py-14">
    <div class="flex flex-wrap items-end gap-4">
      <div class="flex min-w-64 flex-1 flex-col gap-2">
        <h1 class="text-4xl font-bold text-highlighted">{{ t('economy.baltop.title') }}</h1>
        <p class="max-w-2xl text-lg text-muted">
          <template v-if="data?.me">
            <i18n-t keypath="economy.baltop.ledeRank" scope="global">
              <template #rank>
                <strong class="text-highlighted tabular-nums">#{{ data.me.rank }}</strong>
              </template>
              <template #balance>
                <span class="tabular-nums">{{ formatLnbits(data.me.balance, locale) }}</span>
              </template>
            </i18n-t>
          </template>
          <template v-else>{{ t('economy.baltop.lede') }}</template>
        </p>
      </div>
      <UButton
        v-if="me?.eligible"
        color="neutral"
        variant="ghost"
        :icon="me.hideFromBaltop ? 'i-lucide-eye' : 'i-lucide-eye-off'"
        :loading="pending"
        :label="me.hideFromBaltop ? t('economy.baltop.show') : t('economy.baltop.hide')"
        @click="onVisibility(!me.hideFromBaltop)"
      />
    </div>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :description="t('economy.loadFailed')"
    />

    <div
      v-else-if="data && !data.players.length && !data.shared.length"
      class="flex flex-col items-center gap-3 rounded-lg bg-elevated px-5 py-10 text-center"
    >
      <IconTile icon="i-lucide-trophy" />
      <h2 class="text-xl font-medium text-highlighted">{{ t('economy.baltop.empty.title') }}</h2>
      <p class="max-w-md text-muted">{{ t('economy.baltop.empty.body') }}</p>
    </div>

    <template v-else-if="data">
      <section
        v-if="podium.length"
        class="grid gap-6 rounded-lg bg-elevated p-6 sm:grid-cols-3 sm:p-7"
        :aria-label="t('economy.baltop.podium')"
      >
        <div
          v-for="player in podium"
          :key="player.rank + (player.username ?? '')"
          class="flex items-center gap-4"
        >
          <WardenMinecraftHead v-if="player.uuid" :uuid="player.uuid" size="lg" />
          <div class="flex min-w-0 flex-col">
            <span class="text-sm font-semibold text-muted">{{
              t(`economy.baltop.place.${player.rank}`)
            }}</span>
            <span class="truncate font-display text-lg font-medium text-highlighted">
              {{ player.name ?? player.username }}
            </span>
            <span class="truncate text-sm text-muted">
              {{ player.name ? player.username : t('economy.baltop.nameHidden') }}
            </span>
            <span class="font-display text-xl font-bold text-highlighted tabular-nums">
              {{ formatLnbits(player.balance, locale) }}
            </span>
          </div>
        </div>
      </section>

      <div class="flex flex-wrap items-start gap-8">
        <section
          class="flex min-w-0 grow-3 basis-md flex-col gap-3"
          aria-labelledby="baltop-players"
        >
          <h2 id="baltop-players" class="text-xl font-medium text-highlighted">
            {{ t('economy.baltop.players') }}
          </h2>
          <ol
            v-if="rest.length"
            class="flex flex-col divide-y divide-default rounded-lg bg-elevated"
          >
            <li
              v-for="player in rest"
              :key="player.rank + (player.username ?? '')"
              class="flex items-center gap-3.5 px-5 py-2.5"
              :class="player.me ? 'bg-secondary/10' : ''"
            >
              <span class="w-7 font-semibold text-muted tabular-nums">{{ player.rank }}</span>
              <WardenMinecraftHead v-if="player.uuid" :uuid="player.uuid" size="sm" />
              <span class="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">
                <span class="font-semibold text-highlighted">{{
                  player.name ?? player.username
                }}</span>
                <span class="text-sm text-muted">
                  {{ player.name ? player.username : t('economy.baltop.nameHidden') }}
                </span>
              </span>
              <span class="font-bold text-highlighted tabular-nums">{{
                formatLnbits(player.balance, locale)
              }}</span>
            </li>
          </ol>
          <p v-else class="text-muted">{{ t('economy.baltop.onlyPodium') }}</p>
        </section>

        <section
          class="flex min-w-0 grow-2 basis-xs flex-col gap-3"
          aria-labelledby="baltop-shared"
        >
          <h2 id="baltop-shared" class="text-xl font-medium text-highlighted">
            {{ t('economy.baltop.shared') }}
          </h2>
          <ol
            v-if="data.shared.length"
            class="flex flex-col divide-y divide-default rounded-lg bg-elevated"
          >
            <li
              v-for="account in data.shared"
              :key="account.handle"
              class="flex items-center gap-3.5 px-5 py-2.5"
            >
              <span class="w-5 font-semibold text-muted tabular-nums">{{ account.rank }}</span>
              <span class="flex min-w-0 flex-1 flex-col">
                <span class="truncate font-semibold text-highlighted">{{ account.name }}</span>
                <span class="truncate text-sm text-muted">
                  {{
                    t(
                      'economy.baltop.sharedHint',
                      { handle: account.handle, n: account.memberCount },
                      account.memberCount,
                    )
                  }}
                </span>
              </span>
              <span class="font-bold text-highlighted tabular-nums">{{
                formatLnbits(account.balance, locale)
              }}</span>
            </li>
          </ol>
          <p v-else class="text-muted">{{ t('economy.baltop.noShared') }}</p>
        </section>
      </div>
      <p class="text-sm text-muted">{{ t('economy.baltop.footnote') }}</p>
    </template>
  </UContainer>
</template>
