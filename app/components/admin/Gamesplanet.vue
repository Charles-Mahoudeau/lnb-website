<script setup lang="ts">
import { GAMESPLANET_MAX_PINS } from '#shared/schemas/gamesplanet';
import type { GamesplanetAdminGame } from '#shared/schemas/gamesplanet';

// The Gamesplanet promotion: the affiliate ref, the games admins pinned, the best sellers the
// public band picks from, and a button to read the feeds now. Full admins only.
const { t, locale } = useI18n();
const toast = useToast();
const { isEnabled } = useFlags();

const { data, error, refresh } = await useAdminGamesplanet();

function fail(caught: unknown) {
  const problem = caught instanceof GamesplanetError ? caught.problem : 'failed';
  toast.add({
    title: t(`admin.gamesplanet.errors.${problem}`),
    color: 'error',
    icon: 'i-lucide-circle-alert',
  });
}

/** Runs a change, then reloads the page's data whatever happens, so it shows what is stored. */
async function run(change: () => Promise<unknown>, done?: string) {
  try {
    await change();
    if (done) toast.add({ title: t(done), color: 'success', icon: 'i-lucide-circle-check' });
  } catch (caught) {
    fail(caught);
  }
  await refresh();
}

const refCode = ref(data.value?.refCode ?? '');
const refValid = computed(() => /^[A-Za-z0-9_-]{2,40}$/.test(refCode.value.trim()));
const savingRef = ref(false);
async function saveRef() {
  savingRef.value = true;
  await run(
    () => gamesplanetActions.setSettings({ refCode: refCode.value.trim() }),
    'admin.gamesplanet.ref.saved',
  );
  refCode.value = data.value?.refCode ?? '';
  savingRef.value = false;
}

const syncing = ref<'deals' | 'catalog' | null>(null);
async function sync(feed: 'deals' | 'catalog') {
  syncing.value = feed;
  await run(() => gamesplanetActions.sync(feed), `admin.gamesplanet.sync.done`);
  syncing.value = null;
}

const pinned = computed(() => new Set(data.value?.pins.map((pin) => pin.uid)));
const full = computed(() => (data.value?.pins.length ?? 0) >= GAMESPLANET_MAX_PINS);

// Search the catalog by name, to pin a game that isn't a best seller.
const query = ref('');
const results = ref<GamesplanetAdminGame[]>([]);
const searched = ref(false);
async function search() {
  if (query.value.trim().length < 2) return;
  try {
    results.value = (await gamesplanetActions.search(query.value.trim())).games;
    searched.value = true;
  } catch (caught) {
    fail(caught);
  }
}

function when(iso: string | null): string {
  if (!iso) return t('admin.gamesplanet.never');
  return new Intl.DateTimeFormat(locale.value, {
    timeZone: 'Europe/Paris',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
}
</script>

<template>
  <UAlert
    v-if="error || !data"
    color="error"
    variant="subtle"
    icon="i-lucide-circle-alert"
    :description="t('admin.gamesplanet.errors.failed')"
  />
  <div v-else class="flex max-w-4xl flex-col gap-8">
    <p class="text-muted">{{ t('admin.gamesplanet.note') }}</p>
    <UAlert
      v-if="!isEnabled('gamesplanet')"
      color="warning"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      :description="t('admin.gamesplanet.flagOff')"
    />

    <section class="flex flex-col gap-3 rounded-lg bg-elevated p-5">
      <h2 class="text-xl font-bold text-highlighted">{{ t('admin.gamesplanet.ref.title') }}</h2>
      <p class="text-sm text-muted">{{ t('admin.gamesplanet.ref.help') }}</p>
      <form class="flex flex-wrap items-start gap-3" @submit.prevent="saveRef">
        <UFormField
          :label="t('admin.gamesplanet.ref.label')"
          name="refCode"
          class="min-w-64 flex-1"
          :error="refValid ? undefined : t('admin.gamesplanet.ref.invalid')"
        >
          <UInput v-model="refCode" :maxlength="40" class="w-full" />
        </UFormField>
        <UButton
          type="submit"
          color="neutral"
          variant="soft"
          class="mt-6"
          :disabled="!refValid || refCode.trim() === data.refCode"
          :loading="savingRef"
          :label="t('admin.gamesplanet.ref.save')"
        />
      </form>
    </section>

    <section class="flex flex-col gap-3 rounded-lg bg-elevated p-5">
      <h2 class="text-xl font-bold text-highlighted">{{ t('admin.gamesplanet.pins.title') }}</h2>
      <p class="text-sm text-muted">
        {{ t('admin.gamesplanet.pins.help', { max: GAMESPLANET_MAX_PINS }) }}
      </p>
      <p v-if="!data.pins.length" class="text-muted">{{ t('admin.gamesplanet.pins.empty') }}</p>
      <ul v-else class="flex flex-col divide-y divide-default">
        <li v-for="(pin, index) in data.pins" :key="pin.uid" class="flex items-center gap-3 py-3">
          <div class="flex min-w-0 flex-1 flex-col">
            <span class="truncate font-semibold text-highlighted">{{ pin.name }}</span>
            <span class="text-sm text-muted">
              {{ formatEuros(pin.priceCents, locale) }}
              <template v-if="pin.discountPercent !== null">, −{{ pin.discountPercent }}%</template>
            </span>
          </div>
          <UButton
            icon="i-lucide-arrow-up"
            color="neutral"
            variant="ghost"
            :disabled="index === 0"
            :aria-label="t('admin.gamesplanet.pins.moveUp', { name: pin.name })"
            @click="run(() => gamesplanetActions.move(pin.uid, 'up'))"
          />
          <UButton
            icon="i-lucide-arrow-down"
            color="neutral"
            variant="ghost"
            :disabled="index === data.pins.length - 1"
            :aria-label="t('admin.gamesplanet.pins.moveDown', { name: pin.name })"
            @click="run(() => gamesplanetActions.move(pin.uid, 'down'))"
          />
          <UButton
            color="neutral"
            variant="outline"
            :label="t('admin.gamesplanet.pins.unpin')"
            @click="run(() => gamesplanetActions.unpin(pin.uid), 'admin.gamesplanet.pins.unpinned')"
          />
        </li>
      </ul>

      <form class="flex flex-wrap items-start gap-3 pt-2" @submit.prevent="search">
        <UFormField :label="t('admin.gamesplanet.pins.search')" name="q" class="min-w-64 flex-1">
          <UInput v-model="query" :maxlength="80" class="w-full" />
        </UFormField>
        <UButton
          type="submit"
          color="neutral"
          variant="soft"
          class="mt-6"
          :disabled="query.trim().length < 2"
          :label="t('admin.gamesplanet.pins.searchButton')"
        />
      </form>
      <p v-if="searched && !results.length" class="text-sm text-muted">
        {{ t('admin.gamesplanet.pins.noResult') }}
      </p>
      <ul v-if="results.length" class="flex flex-col divide-y divide-default">
        <li v-for="game in results" :key="game.uid" class="flex items-center gap-3 py-3">
          <div class="flex min-w-0 flex-1 flex-col">
            <span class="truncate font-semibold text-highlighted">{{ game.name }}</span>
            <span class="text-sm text-muted">
              {{ formatEuros(game.priceCents, locale) }}
              <template v-if="!game.availableInFrance">
                , {{ t('admin.gamesplanet.notInFrance') }}
              </template>
            </span>
          </div>
          <UButton
            color="neutral"
            variant="soft"
            :disabled="full || pinned.has(game.uid) || !game.availableInFrance"
            :label="
              pinned.has(game.uid)
                ? t('admin.gamesplanet.pins.pinned')
                : t('admin.gamesplanet.pins.pin')
            "
            @click="
              run(() => gamesplanetActions.pin(game.uid), 'admin.gamesplanet.pins.pinnedDone')
            "
          />
        </li>
      </ul>
    </section>

    <section class="flex flex-col gap-3 rounded-lg bg-elevated p-5">
      <h2 class="text-xl font-bold text-highlighted">{{ t('admin.gamesplanet.charts.title') }}</h2>
      <p class="text-sm text-muted">{{ t('admin.gamesplanet.charts.help') }}</p>
      <ol class="flex flex-col divide-y divide-default">
        <li v-for="game in data.charts" :key="game.uid" class="flex items-center gap-3 py-2">
          <span class="w-6 shrink-0 text-right text-sm text-muted tabular-nums">
            {{ game.chartRank }}
          </span>
          <span class="min-w-0 flex-1 truncate text-highlighted">{{ game.name }}</span>
          <span v-if="!game.availableInFrance" class="text-sm text-muted">
            {{ t('admin.gamesplanet.notInFrance') }}
          </span>
          <span v-if="game.pinned" class="text-sm text-muted">
            {{ t('admin.gamesplanet.pins.pinned') }}
          </span>
          <span class="text-sm text-muted tabular-nums">
            {{ formatEuros(game.priceCents, locale) }}
          </span>
        </li>
      </ol>
    </section>

    <section class="flex flex-col gap-3 rounded-lg bg-elevated p-5">
      <h2 class="text-xl font-bold text-highlighted">{{ t('admin.gamesplanet.clicks.title') }}</h2>
      <p class="text-sm text-muted">
        {{ t('admin.gamesplanet.clicks.help', { days: data.clicks.days }) }}
      </p>
      <p class="font-display text-2xl text-highlighted tabular-nums">{{ data.clicks.total }}</p>
      <dl class="flex flex-col gap-1 text-sm">
        <div
          v-for="row in data.clicks.byPlacement"
          :key="row.placement"
          class="flex justify-between gap-6"
        >
          <dt class="text-muted">
            {{ t(`admin.gamesplanet.clicks.placements.${row.placement}`) }}
          </dt>
          <dd class="text-default tabular-nums">{{ row.count }}</dd>
        </div>
      </dl>
      <template v-if="data.clicks.topGames.length">
        <h3 class="pt-2 font-semibold text-highlighted">{{ t('admin.gamesplanet.clicks.top') }}</h3>
        <ol class="flex flex-col gap-1 text-sm">
          <li
            v-for="game in data.clicks.topGames"
            :key="game.uid"
            class="flex justify-between gap-6"
          >
            <span class="min-w-0 truncate text-default">{{ game.name ?? game.uid }}</span>
            <span class="text-muted tabular-nums">{{ game.count }}</span>
          </li>
        </ol>
      </template>
    </section>

    <section class="flex flex-col gap-3 rounded-lg bg-elevated p-5">
      <h2 class="text-xl font-bold text-highlighted">{{ t('admin.gamesplanet.feeds.title') }}</h2>
      <dl class="flex flex-col gap-1 text-sm">
        <div class="flex flex-wrap justify-between gap-x-6">
          <dt class="text-muted">{{ t('admin.gamesplanet.feeds.games') }}</dt>
          <dd class="text-default tabular-nums">{{ data.stats.games }}</dd>
        </div>
        <div class="flex flex-wrap justify-between gap-x-6">
          <dt class="text-muted">{{ t('admin.gamesplanet.feeds.charts') }}</dt>
          <dd class="text-default tabular-nums">{{ data.stats.charts }}</dd>
        </div>
        <div class="flex flex-wrap justify-between gap-x-6">
          <dt class="text-muted">{{ t('admin.gamesplanet.feeds.covers') }}</dt>
          <dd class="text-default tabular-nums">{{ data.stats.covers }}</dd>
        </div>
        <div class="flex flex-wrap justify-between gap-x-6">
          <dt class="text-muted">{{ t('admin.gamesplanet.feeds.dealsAt') }}</dt>
          <dd class="text-default">{{ when(data.stats.dealsSyncedAt) }}</dd>
        </div>
        <div class="flex flex-wrap justify-between gap-x-6">
          <dt class="text-muted">{{ t('admin.gamesplanet.feeds.catalogAt') }}</dt>
          <dd class="text-default">{{ when(data.stats.catalogSyncedAt) }}</dd>
        </div>
      </dl>
      <div class="flex flex-wrap gap-3 pt-2">
        <UButton
          color="neutral"
          variant="soft"
          :loading="syncing === 'deals'"
          :disabled="syncing !== null"
          :label="t('admin.gamesplanet.feeds.syncDeals')"
          @click="sync('deals')"
        />
        <UButton
          color="neutral"
          variant="outline"
          :loading="syncing === 'catalog'"
          :disabled="syncing !== null"
          :label="t('admin.gamesplanet.feeds.syncCatalog')"
          @click="sync('catalog')"
        />
      </div>
    </section>
  </div>
</template>
