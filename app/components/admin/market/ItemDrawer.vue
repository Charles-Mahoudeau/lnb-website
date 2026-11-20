<script setup lang="ts">
// One Market item, in a side drawer opened by `?item=<id>` so it can be linked: the price now, the
// curve drawn with the server's pricing, the parameters, a simulator, the recipes and the sell and
// buy switches. Save sends only what changed; a refusal from the server (a recipe loop, no recipes,
// invalid values) shows here in words and nothing is saved. See docs/market.md.
import { AdminEconomyReasonModal } from '#components';

import type { MarketValidationView } from '#shared/schemas/market';
import type { MarketCurve } from '#shared/utils/market';

const { t, locale, n } = useI18n();
const route = useRoute();
const router = useRouter();
const toast = useToast();
const overlay = useOverlay();
const reasonModal = overlay.create(AdminEconomyReasonModal);

const itemId = computed(() => (typeof route.query.item === 'string' ? route.query.item : ''));
const open = computed({
  get: () => !!itemId.value,
  set: (value: boolean) => {
    if (!value) void router.push({ query: { ...route.query, item: undefined } });
  },
});

const { data: overview, refresh } = await useMarketOverview();
const { refresh: refreshStats } = await useMarketStats();
const item = computed(() => overview.value?.items.find((row) => row.id === itemId.value));
const sigma = computed(() => (overview.value?.settings.sigmaPercent ?? 15) / 100);

// The draft: text as typed, parsed when used.
const draft = reactive({
  p0: '',
  pMin: '',
  pMax: '',
  s0: '',
  k: '',
  alpha: '',
  keepPrice: true,
  sellable: false,
  buyable: false,
});
const sim = reactive<{ direction: 'sell' | 'buy'; quantity: string; window: string }>({
  direction: 'sell',
  quantity: '1',
  window: '0',
});

const text = (value: number) => String(Number(value.toPrecision(10)));
function load(row: NonNullable<typeof item.value>) {
  Object.assign(draft, {
    p0: text(row.p0),
    pMin: text(row.pMin),
    pMax: text(row.pMax),
    s0: text(row.s0),
    k: text(row.k),
    alpha: text(row.alpha * 100),
    keepPrice: true,
    sellable: row.sellable,
    buyable: row.buyable,
  });
}

const parse = (value: string) => {
  const number = Number.parseFloat(value.replace(',', '.'));
  return Number.isFinite(number) && number > 0 ? number : undefined;
};

/** The curve the draft describes: the item's own where a field isn't a number yet. */
const curve = computed<MarketCurve | undefined>(() => {
  const row = item.value;
  if (!row) return undefined;
  const s0 = parse(draft.s0) ?? row.s0;
  const next = {
    p0: parse(draft.p0) ?? row.p0,
    pMin: parse(draft.pMin) ?? row.pMin,
    pMax: parse(draft.pMax) ?? row.pMax,
    s0,
    // The stock bounds keep their share of the target when it changes.
    sMin: Math.round(((s0 * row.sMin) / row.s0) * 1e6) / 1e6,
    sMax: Math.round(((s0 * row.sMax) / row.s0) * 1e6) / 1e6,
    k: parse(draft.k) ?? row.k,
    alpha: Math.min(1, (parse(draft.alpha) ?? row.alpha * 100) / 100),
  };
  return next.pMin <= next.p0 && next.p0 <= next.pMax ? next : row;
});

/** What the form says wrong, in words. */
const fieldsError = computed(() => {
  const fields = [draft.p0, draft.pMin, draft.pMax, draft.s0, draft.k];
  if (fields.some((value) => parse(value) === undefined) || parse(draft.alpha) === undefined) {
    return t('admin.market.drawer.numbers');
  }
  const c = curve.value;
  if (c && !(parse(draft.pMin)! <= parse(draft.p0)! && parse(draft.p0)! <= parse(draft.pMax)!)) {
    return t('admin.market.drawer.order');
  }
  return null;
});

const patch = computed(() => {
  const row = item.value;
  const c = curve.value;
  if (!row || !c || fieldsError.value) return {};
  const changes: Record<string, number | boolean> = {};
  for (const key of ['p0', 'pMin', 'pMax', 's0', 'k', 'alpha'] as const) {
    if (c[key] !== row[key]) changes[key] = c[key];
  }
  if (c.s0 !== row.s0) Object.assign(changes, { sMin: c.sMin, sMax: c.sMax });
  if (draft.sellable !== row.sellable) changes.sellable = draft.sellable;
  if (draft.buyable !== row.buyable) changes.buyable = draft.buyable;
  return changes;
});
const dirty = computed(() => Object.keys(patch.value).length > 0);

/** The stock after saving: with "keep the current price" the stock moves along the new curve. */
const stockAfter = computed(() => {
  const row = item.value;
  const c = curve.value;
  if (!row || !c) return 0;
  const curveChanged = Object.keys(patch.value).some(
    (key) => !['sellable', 'buyable'].includes(key),
  );
  if (!curveChanged || !draft.keepPrice) return row.stock;
  return Math.min(c.sMax, Math.max(c.sMin, marketStockForPrice(c, row.price)));
});
const priceNow = computed(() => (curve.value ? marketPRef(curve.value, stockAfter.value) : 0));

// The recipes using or making the item, and the loop check of the draft (a dry run on the server).
const recipes = ref<{ total: number; items: MarketAdminRecipesItem[] }>({ total: 0, items: [] });
type MarketAdminRecipesItem = {
  type: string;
  output: { id: string; count: number };
  inputs: { id: string; count: number }[];
};
const validation = ref<MarketValidationView | null>(null);
const refusal = ref<string | null>(null);

watch(
  item,
  async (row, before) => {
    if (!row || row.id === before?.id) return;
    load(row);
    refusal.value = null;
    validation.value = null;
    sim.direction = 'sell';
    sim.quantity = String(Math.max(1, Math.round(row.s0 * (row.s0 > 500 ? 0.08 : 0.5))));
    sim.window = '0';
    recipes.value = { total: 0, items: [] };
    try {
      recipes.value = await marketAdminActions.recipes(row.id);
    } catch {
      // The drawer still works without its recipes.
    }
  },
  { immediate: true },
);

let timer: ReturnType<typeof setTimeout> | undefined;
watch(patch, (changes) => {
  clearTimeout(timer);
  refusal.value = null;
  validation.value = null;
  if (!Object.keys(changes).length || !itemId.value) return;
  const id = itemId.value;
  timer = setTimeout(() => {
    marketAdminActions
      .validate(id, changes)
      .then((result) => {
        if (id === itemId.value) validation.value = result;
      })
      // The check is a hint: saving answers for real.
      .catch(() => undefined);
  }, 400);
});
onBeforeUnmount(() => {
  clearTimeout(timer);
});

const { loopText, refusalText } = useMarketMessages();

const note = computed(() => {
  if (refusal.value) return { text: refusal.value, color: 'error' as const };
  const result = validation.value;
  if (!dirty.value || !result || result.ok) return null;
  return {
    text:
      result.reason === 'noRecipes' ? t('admin.market.refusal.noRecipes') : loopText(result.loops),
    color: 'warning' as const,
  };
});

const sameRecipe = (a: MarketAdminRecipesItem, b: MarketAdminRecipesItem) =>
  a.type === b.type &&
  a.output.id === b.output.id &&
  JSON.stringify(a.inputs) === JSON.stringify(b.inputs);
const inLoop = (recipe: MarketAdminRecipesItem) =>
  validation.value?.loops.some((loop) => loop.path.some((step) => sameRecipe(step, recipe))) ??
  false;
const recipeText = (recipe: MarketAdminRecipesItem) =>
  t('admin.market.recipes.line', {
    inputs: recipe.inputs
      .map((input) => `${String(input.count)} × ${marketItemName(input.id)}`)
      .join(' + '),
    output: `${String(recipe.output.count)} × ${marketItemName(recipe.output.id)}`,
  });

// The simulator: the draft's curve, the settings' sigma and the tier's thresholds.
const order = computed(() => {
  const c = curve.value;
  const row = item.value;
  const brackets = row && overview.value && tierBrackets(overview.value.settings.tiers, row.tier);
  const quantity = Math.max(1, Math.round(Number.parseFloat(sim.quantity) || 1));
  if (!c || !row || !brackets) return null;
  return {
    quantity,
    result: simulateOrder({
      curve: c,
      sigma: sigma.value,
      brackets,
      stock: stockAfter.value,
      window: Math.max(0, Number.parseFloat(sim.window.replace(',', '.')) || 0),
      quantity,
      direction: sim.direction,
    }),
    allowed: sim.direction === 'sell' ? draft.sellable : draft.buyable,
  };
});
const maxOrder = computed(() => overview.value?.settings.maxOrderItems ?? 2304);

const saving = ref(false);
async function save() {
  const row = item.value;
  if (!row || !dirty.value || fieldsError.value) return;
  saving.value = true;
  refusal.value = null;
  try {
    const saved = await marketAdminActions.updateItem(row.id, {
      ...patch.value,
      keepPrice: draft.keepPrice,
    });
    await Promise.all([refresh(), refreshStats()]);
    load(saved);
    toast.add({
      title: t('admin.market.drawer.saved', { name: row.name }),
      color: 'success',
      icon: 'i-lucide-circle-check',
    });
  } catch (error) {
    if (error instanceof MarketError) {
      refusal.value = refusalText(error);
    } else throw error;
  } finally {
    saving.value = false;
  }
}

async function resetStock() {
  const row = item.value;
  if (!row) return;
  const reason: unknown = await reasonModal.open({
    title: t('admin.market.reset.title', { name: row.name }),
    description: t('admin.market.reset.lede'),
    confirmLabel: t('admin.market.reset.confirm'),
    reasonLabel: t('admin.market.reset.reason'),
  }).result;
  if (typeof reason !== 'string' || !reason) return;
  try {
    await marketAdminActions.resetStock(row.id, reason);
    await Promise.all([refresh(), refreshStats()]);
    toast.add({
      title: t('admin.market.reset.done', { name: row.name }),
      color: 'success',
      icon: 'i-lucide-circle-check',
    });
  } catch {
    toast.add({
      title: t('admin.market.refusal.failed'),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  }
}

const directions = computed(() => [
  { value: 'sell' as const, label: t('admin.market.sim.sell') },
  { value: 'buy' as const, label: t('admin.market.sim.buy') },
]);
const money = (cents: number) => formatLnbits(cents, locale.value);
const percent = (value: number) => n(value, { style: 'percent', maximumFractionDigits: 0 });
</script>

<template>
  <USlideover
    v-model:open="open"
    :title="item?.name ?? t('admin.market.drawer.missing')"
    :description="item ? `${item.id} · ${t('admin.market.tier', { tier: item.tier })}` : undefined"
    :ui="{ content: 'w-full max-w-2xl' }"
  >
    <template #body>
      <p v-if="!item" class="text-muted">{{ t('admin.market.drawer.missingBody') }}</p>
      <div v-else-if="curve" class="flex flex-col gap-6">
        <div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <div class="text-sm text-muted">{{ t('admin.market.drawer.now') }}</div>
            <div class="font-display text-2xl font-bold text-highlighted tabular-nums">
              {{ formatItemPrice(priceNow, locale) }}
            </div>
          </div>
          <div>
            <div class="text-sm text-muted">{{ t('admin.market.drawer.sells') }}</div>
            <div class="font-semibold tabular-nums">
              {{
                draft.sellable
                  ? formatItemPrice(priceNow * (1 - sigma), locale)
                  : t('admin.market.drawer.notSold')
              }}
            </div>
          </div>
          <div>
            <div class="text-sm text-muted">{{ t('admin.market.drawer.buys') }}</div>
            <div class="font-semibold tabular-nums">
              {{
                draft.buyable
                  ? formatItemPrice(priceNow * (1 + sigma), locale)
                  : t('admin.market.drawer.notBought')
              }}
            </div>
          </div>
          <div>
            <div class="text-sm text-muted">{{ t('admin.market.drawer.stock') }}</div>
            <div class="font-semibold tabular-nums">
              {{
                t('admin.market.drawer.stockOf', {
                  stock: formatCount(stockAfter, locale),
                  target: formatCount(curve.s0, locale),
                })
              }}
            </div>
          </div>
        </div>

        <AdminMarketPriceChart
          :curve="curve"
          :sigma="sigma"
          :stock="stockAfter"
          :name="item.name"
        />

        <section class="flex flex-col gap-4">
          <h3 class="font-semibold text-highlighted">{{ t('admin.market.drawer.parameters') }}</h3>
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField
              v-for="field in ['p0', 'pMin', 'pMax', 's0', 'k', 'alpha'] as const"
              :key="field"
              :label="t(`admin.market.params.${field}`)"
              :help="t(`admin.market.params.${field}Help`)"
            >
              <UInput
                v-model="draft[field]"
                inputmode="decimal"
                autocomplete="off"
                class="w-full"
                :color="parse(draft[field]) === undefined ? 'error' : undefined"
              />
            </UFormField>
          </div>
          <p v-if="fieldsError" class="text-sm text-error" role="alert">{{ fieldsError }}</p>
          <USwitch
            v-model="draft.keepPrice"
            :label="t('admin.market.drawer.keep')"
            :description="t('admin.market.drawer.keepHelp')"
          />
        </section>

        <section class="flex flex-col gap-4 rounded-lg bg-muted px-5 py-4">
          <h3 class="font-semibold text-highlighted">{{ t('admin.market.sim.title') }}</h3>
          <div class="grid gap-4 sm:grid-cols-3">
            <UFormField :label="t('admin.market.sim.side')">
              <USelect v-model="sim.direction" :items="directions" class="w-full" />
            </UFormField>
            <UFormField :label="t('admin.market.sim.items')">
              <UInput v-model="sim.quantity" inputmode="numeric" class="w-full" />
            </UFormField>
            <UFormField v-if="sim.direction === 'sell'" :label="t('admin.market.sim.window')">
              <UInput v-model="sim.window" inputmode="decimal" class="w-full" />
            </UFormField>
          </div>
          <template v-if="order">
            <p v-if="!order.allowed" class="text-muted">
              {{
                t(
                  sim.direction === 'sell'
                    ? 'admin.market.sim.cantSell'
                    : 'admin.market.sim.cantBuy',
                )
              }}
            </p>
            <template v-else>
              <dl class="grid gap-4 sm:grid-cols-3">
                <div>
                  <dt class="text-sm text-muted">
                    {{
                      t(
                        sim.direction === 'sell'
                          ? 'admin.market.sim.paid'
                          : 'admin.market.sim.pays',
                      )
                    }}
                  </dt>
                  <dd class="font-semibold text-highlighted tabular-nums">
                    {{ money(order.result.total) }}
                  </dd>
                </div>
                <div>
                  <dt class="text-sm text-muted">{{ t('admin.market.sim.perItem') }}</dt>
                  <dd class="font-semibold tabular-nums">
                    {{ formatItemPrice(order.result.total / 100 / order.quantity, locale) }}
                  </dd>
                </div>
                <div>
                  <dt class="text-sm text-muted">{{ t('admin.market.sim.after') }}</dt>
                  <dd class="font-semibold tabular-nums">
                    {{ formatItemPrice(order.result.priceAfter, locale) }}
                    <span class="font-normal text-muted">{{
                      formatPercentVsBase(percentVsBase(order.result.priceAfter, priceNow))
                    }}</span>
                  </dd>
                </div>
              </dl>
              <ul
                v-if="order.result.brackets.length"
                class="flex flex-col gap-1 text-sm text-muted"
              >
                <li v-for="part in order.result.brackets" :key="part.rate">
                  {{
                    t('admin.market.sim.bracket', {
                      items: formatCount(part.quantity, locale),
                      rate: percent(part.rate),
                      paid: money(part.total),
                    })
                  }}
                </li>
              </ul>
              <p v-if="order.quantity > maxOrder" class="text-sm text-muted">
                {{
                  t('admin.market.sim.split', {
                    max: formatCount(maxOrder, locale),
                    orders: Math.ceil(order.quantity / maxOrder),
                  })
                }}
              </p>
            </template>
          </template>
        </section>

        <section class="flex flex-col gap-3">
          <h3 class="font-semibold text-highlighted">{{ t('admin.market.recipes.title') }}</h3>
          <p v-if="!recipes.items.length" class="text-sm text-muted">
            {{ t('admin.market.recipes.none') }}
          </p>
          <ul v-else class="divide-y divide-default">
            <li
              v-for="(recipe, index) in recipes.items.slice(0, 12)"
              :key="index"
              class="flex items-center justify-between gap-3 py-2"
            >
              <span class="text-sm">
                {{ recipeText(recipe) }}
                <span class="block text-xs text-muted">{{ recipe.type }}</span>
              </span>
              <UBadge
                v-if="validation"
                :color="inLoop(recipe) ? 'error' : 'neutral'"
                variant="subtle"
                :label="
                  t(inLoop(recipe) ? 'admin.market.recipes.loop' : 'admin.market.recipes.noLoop')
                "
              />
            </li>
          </ul>
          <p v-if="recipes.items.length > 12" class="text-sm text-muted">
            {{ t('admin.market.recipes.more', { n: recipes.items.length - 12 }) }}
          </p>
          <USwitch v-model="draft.sellable" :label="t('admin.market.drawer.sellable')" />
          <USwitch v-model="draft.buyable" :label="t('admin.market.drawer.buyable')" />
          <UAlert
            v-if="note"
            :color="note.color"
            variant="subtle"
            icon="i-lucide-circle-alert"
            :description="note.text"
            role="alert"
          />
        </section>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full flex-wrap items-center justify-between gap-3">
        <UButton
          color="neutral"
          variant="ghost"
          :disabled="!item"
          :label="t('admin.market.reset.action')"
          @click="resetStock"
        />
        <div class="flex gap-2">
          <UButton
            color="neutral"
            variant="soft"
            :label="t('admin.cancel')"
            @click="open = false"
          />
          <UButton
            :loading="saving"
            :disabled="!dirty || !!fieldsError"
            :label="t('admin.market.drawer.save')"
            @click="save"
          />
        </div>
      </div>
    </template>
  </USlideover>
</template>
