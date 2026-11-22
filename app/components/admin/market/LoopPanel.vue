<script setup lang="ts">
// A refused crafting loop, drawn as a chain: what is bought, the recipes, what is sold, and what the
// loop earns at the worst prices. The admin closes a door from here or accepts the loop on purpose,
// with a reason. The panel only emits; the parent owns the draft and the save. See docs/market.md.
import type { MarketAcceptLoopBody, MarketValidationView } from '#shared/schemas/market';
import { marketItemName } from '#shared/utils/market';

type Loop = MarketValidationView['loops'][number];

const props = defineProps<{
  loops: Loop[];
  /** The proposal the loops come from, sent back to find the loop again when accepting. */
  proposal: Pick<MarketAcceptLoopBody, 'items' | 'sigmaPercent'>;
}>();
const emit = defineEmits<{
  close: [payload: { id: string; side: 'buy' | 'sell' }];
  accepted: [];
}>();

const { t, locale, n } = useI18n();
const toast = useToast();
const { refusalText } = useMarketMessages();

const price = (value: number) => formatItemPrice(value, locale.value);

/** The items bought raw: inputs no recipe of the path makes. */
function bought(loop: Loop) {
  const made = new Set(loop.path.map((step) => step.output.id));
  const ids = new Set<string>();
  for (const step of loop.path) {
    for (const input of step.inputs) if (!made.has(input.id)) ids.add(input.id);
  }
  return [...ids];
}
const initials = (id: string) => marketItemName(id).slice(0, 2);
const costShare = (loop: Loop) => Math.max(2, Math.min(100, (loop.cost / loop.value) * 100));
const profit = (loop: Loop) => loop.value - loop.cost;
const times = (loop: Loop) =>
  n(loop.cost > 0 ? loop.value / loop.cost : 0, { maximumFractionDigits: 0 });

const reasons = reactive<Record<string, string>>({});
const accepting = ref<string | null>(null);
const error = ref<string | null>(null);

async function accept(loop: Loop) {
  const reason = reasons[loop.signature]?.trim();
  if (!reason) return;
  accepting.value = loop.signature;
  error.value = null;
  try {
    await marketAdminActions.acceptLoop({ ...props.proposal, signature: loop.signature, reason });
    toast.add({
      title: t('admin.market.loops.accepted', { name: marketItemName(loop.item) }),
      color: 'success',
      icon: 'i-lucide-circle-check',
    });
    emit('accepted');
  } catch (failure) {
    if (failure instanceof MarketError) error.value = refusalText(failure);
    else throw failure;
  } finally {
    accepting.value = null;
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <section
      v-for="loop in loops"
      :key="loop.signature"
      class="overflow-hidden rounded-lg border border-default"
    >
      <header class="flex flex-wrap items-center justify-between gap-2 bg-elevated px-4 py-2">
        <h3 class="text-sm font-medium text-highlighted">{{ t('admin.market.loops.title') }}</h3>
        <span class="text-xs text-muted">{{ t('admin.market.loops.worstPrices') }}</span>
      </header>
      <div class="flex flex-col gap-4 p-4">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div class="flex flex-col gap-2 sm:flex-1">
            <div
              v-for="id in bought(loop)"
              :key="id"
              class="flex items-center gap-2 rounded-lg border border-error px-3 py-2"
            >
              <span
                class="grid size-8 place-items-center rounded-lg bg-elevated text-xs font-semibold text-muted"
                >{{ initials(id) }}</span
              >
              <div class="min-w-0">
                <p class="truncate font-medium text-highlighted">{{ marketItemName(id) }}</p>
                <p class="text-xs text-error">{{ t('admin.market.loops.buyOn') }}</p>
              </div>
            </div>
          </div>
          <ol class="flex flex-col items-center gap-1 text-xs text-muted">
            <li
              v-for="(step, index) in [...loop.path].reverse()"
              :key="index"
              class="flex items-center gap-2"
            >
              <UIcon name="i-lucide-arrow-right" class="size-4" />
              <span class="rounded-full border border-default bg-default px-2 py-0.5 text-default">
                {{ step.type }} · {{ step.inputs.map((input) => input.count).join(' + ') }} →
                {{ step.output.count }}
              </span>
              <UIcon name="i-lucide-arrow-right" class="size-4" />
            </li>
          </ol>
          <div class="flex items-center gap-2 rounded-lg border border-error px-3 py-2 sm:flex-1">
            <span
              class="grid size-8 place-items-center rounded-lg bg-elevated text-xs font-semibold text-muted"
              >{{ initials(loop.item) }}</span
            >
            <div class="min-w-0">
              <p class="truncate font-medium text-highlighted">{{ marketItemName(loop.item) }}</p>
              <p class="text-xs text-error">{{ t('admin.market.loops.sellOn') }}</p>
            </div>
          </div>
        </div>

        <div class="flex flex-col gap-2 text-sm">
          <div class="flex items-center gap-3">
            <span class="w-40 shrink-0 text-xs text-muted">{{
              t('admin.market.loops.cost', { name: marketItemName(loop.item) })
            }}</span>
            <div class="h-2 flex-1 rounded-full bg-elevated">
              <div
                class="h-2 rounded-full bg-secondary"
                :style="{ width: `${costShare(loop)}%` }"
              />
            </div>
            <span class="w-24 text-right font-medium text-highlighted tabular-nums">{{
              price(loop.cost)
            }}</span>
          </div>
          <div class="flex items-center gap-3">
            <span class="w-40 shrink-0 text-xs text-muted">{{
              t('admin.market.loops.value')
            }}</span>
            <div class="h-2 flex-1 rounded-full bg-elevated">
              <div class="h-2 w-full rounded-full bg-error" />
            </div>
            <span class="w-24 text-right font-medium text-highlighted tabular-nums">{{
              price(loop.value)
            }}</span>
          </div>
        </div>
        <p
          class="flex justify-between gap-3 rounded-lg bg-error/10 px-3 py-2 text-sm font-medium text-error"
        >
          <span>{{ t('admin.market.loops.profit', { name: marketItemName(loop.item) }) }}</span>
          <span class="tabular-nums"
            >+{{ price(profit(loop)) }} ·
            {{ t('admin.market.loops.times', { n: times(loop) }) }}</span
          >
        </p>

        <div class="flex flex-col gap-2">
          <p class="text-xs text-muted">{{ t('admin.market.loops.closeDoor') }}</p>
          <div class="flex flex-wrap gap-2">
            <UButton
              v-for="id in bought(loop)"
              :key="`buy-${id}`"
              color="neutral"
              variant="outline"
              size="sm"
              :label="t('admin.market.loops.turnOffBuy', { name: marketItemName(id) })"
              @click="emit('close', { id, side: 'buy' })"
            />
            <UButton
              color="neutral"
              variant="outline"
              size="sm"
              :label="t('admin.market.loops.turnOffSell', { name: marketItemName(loop.item) })"
              @click="emit('close', { id: loop.item, side: 'sell' })"
            />
          </div>
        </div>

        <form
          class="flex flex-col gap-2 rounded-lg border border-default p-3"
          @submit.prevent="accept(loop)"
        >
          <div>
            <p class="text-sm font-medium text-highlighted">
              {{ t('admin.market.loops.acceptTitle') }}
            </p>
            <p class="text-xs text-muted">{{ t('admin.market.loops.acceptHelp') }}</p>
          </div>
          <UFormField :label="t('admin.market.loops.reason')">
            <UInput v-model="reasons[loop.signature]" class="w-full" autocomplete="off" />
          </UFormField>
          <UButton
            type="submit"
            class="self-start"
            :loading="accepting === loop.signature"
            :disabled="!reasons[loop.signature]?.trim()"
            :label="t('admin.market.loops.accept')"
          />
        </form>
      </div>
    </section>
    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :description="error"
      role="alert"
    />
  </div>
</template>
