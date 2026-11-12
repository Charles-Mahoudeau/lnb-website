<script setup lang="ts">
import { AdminAnticheatPlayerDialog } from '#components';

import type { AnticheatTimelineEvent } from '#shared/schemas/anticheat';

// The anticheat section of the Warden player page ("One page" mock): the score in a raised band,
// then the timeline beside the files loaded now, then every file used beside the actions taken.
// It loads on the client, so the page keeps its single blocking request.
const props = defineProps<{ userId: string }>();

const { t, d } = useI18n();
const toast = useToast();
const overlay = useOverlay();
const { data, error, status, refresh } = useAnticheatPlayer(props.userId);

const more = ref<AnticheatTimelineEvent[]>([]);
const moreCursor = ref<string | null | undefined>(undefined);
const loadingMore = ref(false);
watch(data, () => {
  more.value = [];
  moreCursor.value = undefined;
});
const events = computed(() => [...(data.value?.events.items ?? []), ...more.value]);
const nextCursor = computed(() =>
  moreCursor.value === undefined ? (data.value?.events.nextCursor ?? null) : moreCursor.value,
);

async function loadMore() {
  if (!nextCursor.value) return;
  loadingMore.value = true;
  try {
    const page = await anticheatActions.moreEvents(props.userId, nextCursor.value);
    more.value.push(...page.items);
    moreCursor.value = page.nextCursor;
  } catch {
    fail('failed');
  } finally {
    loadingMore.value = false;
  }
}

function fail(problem: string) {
  toast.add({
    title: t(`admin.anticheat.errors.${problem === 'failed' ? 'failed' : problem}`),
    color: 'error',
    icon: 'i-lucide-circle-alert',
  });
}

const minus = (value: number) =>
  value < 0 ? `−${String(Math.abs(value))}` : value > 0 ? `+${String(value)}` : '0';
const date = (iso: string) =>
  d(iso, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Paris' });
const day = (iso: string) => d(iso, { dateStyle: 'medium', timeZone: 'Europe/Paris' });

const notSeen = computed(
  () => (error.value as { statusCode?: number } | undefined)?.statusCode === 404,
);

async function run(
  mode: 'score' | 'clear',
  action: (result: { score: number; reason: string }) => Promise<unknown>,
  done: string,
) {
  if (!data.value) return;
  const dialog = overlay.create(AdminAnticheatPlayerDialog, {
    props: { mode, score: data.value.score },
  });
  const result: unknown = await dialog.open().result;
  if (!result || typeof result !== 'object') return;
  try {
    await action(result as { score: number; reason: string });
    toast.add({ title: done, color: 'success', icon: 'i-lucide-circle-check' });
  } catch (failure) {
    fail(failure instanceof AnticheatError ? failure.problem : 'failed');
  }
  await refresh();
  await refreshNuxtData('anticheat-summary');
}

const onClearHold = () =>
  run(
    'clear',
    ({ reason }) => anticheatActions.setHold(props.userId, { hold: false, reason }),
    t('admin.anticheat.panel.dialog.clearDone'),
  );
const onAdjust = () =>
  run(
    'score',
    (result) => anticheatActions.setScore(props.userId, result),
    t('admin.anticheat.panel.dialog.scoreDone'),
  );

function reasonOf(event: AnticheatTimelineEvent) {
  return typeof event.data.reason === 'string' ? event.data.reason : null;
}
</script>

<template>
  <section id="anticheat" class="flex scroll-mt-20 flex-col gap-4">
    <h2 class="text-2xl font-medium text-highlighted">{{ t('admin.anticheat.panel.title') }}</h2>

    <p v-if="notSeen" class="text-muted">{{ t('admin.anticheat.panel.notSeen') }}</p>
    <UAlert
      v-else-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :description="t('admin.anticheat.errors.failed')"
    />
    <p v-else-if="!data && status === 'pending'" class="text-muted">
      {{ t('admin.anticheat.loading') }}
    </p>

    <template v-else-if="data">
      <div class="flex flex-wrap items-center gap-x-8 gap-y-4 rounded-lg bg-elevated p-5">
        <div class="flex flex-col">
          <span class="text-sm text-muted">{{ t('admin.anticheat.panel.score') }}</span>
          <span class="font-display text-5xl text-highlighted tabular-nums">{{ data.score }}</span>
          <span class="text-sm text-muted">{{ t('admin.anticheat.panel.scoreOf') }}</span>
        </div>
        <div class="flex min-w-0 flex-1 basis-72 flex-col gap-2">
          <UProgress
            :model-value="data.score"
            :max="100"
            color="neutral"
            size="md"
            :aria-label="t('admin.anticheat.panel.score')"
          />
          <div class="flex flex-wrap items-center gap-2">
            <AdminAnticheatPlayerBadge :band="data.band" />
            <UBadge
              v-if="data.manualHold"
              color="warning"
              variant="outline"
              :label="t('admin.anticheat.playersPage.manualHold')"
            />
          </div>
          <p>{{ t(`admin.anticheat.panel.bands.${data.band}`) }}</p>
          <p class="text-sm text-muted tabular-nums">
            {{ t('admin.anticheat.panel.adjustment', { points: minus(data.adjustment) }) }}
          </p>
          <p v-if="data.manualHold" class="text-sm text-muted">
            {{
              t('admin.anticheat.panel.holdSince', {
                date: data.holdAt ? day(data.holdAt) : '',
                reason: data.holdReason ?? '',
              })
            }}
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <UButton
            v-if="data.manualHold"
            :label="t('admin.anticheat.panel.clearHold')"
            @click="onClearHold"
          />
          <UButton
            color="neutral"
            variant="soft"
            :label="t('admin.anticheat.panel.adjust')"
            @click="onAdjust"
          />
        </div>
      </div>

      <div class="grid items-start gap-4 xl:grid-cols-2">
        <section class="flex flex-col gap-3 rounded-lg bg-elevated p-5">
          <h3 class="text-lg font-medium text-highlighted">
            {{ t('admin.anticheat.panel.timeline') }}
          </h3>
          <p v-if="!events.length" class="text-muted">
            {{ t('admin.anticheat.panel.timelineEmpty') }}
          </p>
          <ul v-else class="flex flex-col divide-y divide-default">
            <li
              v-for="event in events"
              :key="event.id"
              class="flex flex-col gap-0.5 py-2.5"
              data-testid="timeline-event"
            >
              <div class="flex items-baseline justify-between gap-3">
                <span class="font-semibold text-highlighted">
                  {{ t(`admin.anticheat.panel.events.${event.kind}`) }}
                </span>
                <span
                  class="font-display tabular-nums"
                  :class="event.applied ? 'text-highlighted' : 'text-muted'"
                  >{{ minus(event.delta) }}</span
                >
              </div>
              <span v-if="!event.applied" class="text-sm text-muted">
                {{ t('admin.anticheat.panel.notApplied') }}
              </span>
              <span v-if="reasonOf(event)" class="text-sm text-muted">{{ reasonOf(event) }}</span>
              <span class="text-sm text-muted tabular-nums">
                {{ date(event.at) }},
                {{ t('admin.anticheat.panel.scoreAfter', { score: event.scoreAfter }) }}
              </span>
            </li>
          </ul>
          <UButton
            v-if="nextCursor"
            color="neutral"
            variant="soft"
            size="md"
            class="self-start"
            :loading="loadingMore"
            :label="t('admin.anticheat.more')"
            @click="loadMore"
          />
        </section>

        <section class="flex flex-col gap-3 rounded-lg bg-elevated p-5">
          <h3 class="text-lg font-medium text-highlighted">
            {{ t('admin.anticheat.panel.loaded') }}
          </h3>
          <p v-if="data.reportAt" class="text-sm text-muted">
            {{ t('admin.anticheat.panel.reportAt', { date: date(data.reportAt) }) }}
          </p>
          <p v-if="!data.files.length" class="text-muted">
            {{ t('admin.anticheat.panel.loadedEmpty') }}
          </p>
          <ul v-else class="flex flex-col divide-y divide-default">
            <li
              v-for="file in data.files"
              :key="file.sha512"
              class="flex items-center gap-3 py-2.5"
            >
              <span class="flex min-w-0 flex-1 flex-col">
                <span class="truncate font-semibold text-highlighted">{{ file.filename }}</span>
                <span class="text-sm text-muted">
                  {{ t(`admin.anticheat.kinds.${file.kind}`) }}
                  <template v-if="file.action">
                    , {{ t(`admin.anticheat.actions.${file.action}`) }}
                  </template>
                </span>
              </span>
              <AdminAnticheatStatusBadge :status="file.status" />
              <span class="w-8 text-right font-display tabular-nums">
                {{ file.effectiveScore ?? '–' }}
              </span>
            </li>
          </ul>
        </section>

        <section class="flex flex-col gap-3 rounded-lg bg-elevated p-5">
          <h3 class="text-lg font-medium text-highlighted">
            {{ t('admin.anticheat.panel.everUsed') }}
          </h3>
          <p v-if="!data.usage.length" class="text-muted">
            {{ t('admin.anticheat.panel.usedEmpty') }}
          </p>
          <ul v-else class="flex flex-col divide-y divide-default">
            <li
              v-for="file in data.usage"
              :key="file.sha512"
              class="flex items-center gap-3 py-2.5"
            >
              <span class="flex min-w-0 flex-1 flex-col">
                <span class="truncate font-semibold text-highlighted">{{ file.filename }}</span>
                <span class="text-sm text-muted tabular-nums">
                  {{ t('admin.anticheat.panel.otherUsers', file.otherUsers) }},
                  {{
                    t('admin.anticheat.players.seen', {
                      first: day(file.firstSeenAt),
                      last: day(file.lastSeenAt),
                    })
                  }}
                </span>
              </span>
              <AdminAnticheatStatusBadge :status="file.status" />
              <span class="w-8 text-right font-display tabular-nums">{{ file.score ?? '–' }}</span>
            </li>
          </ul>
        </section>

        <section class="flex flex-col gap-3 rounded-lg bg-elevated p-5">
          <h3 class="text-lg font-medium text-highlighted">
            {{ t('admin.anticheat.panel.taken') }}
          </h3>
          <p v-if="!data.actions.length" class="text-muted">
            {{ t('admin.anticheat.panel.takenEmpty') }}
          </p>
          <ul v-else class="flex flex-col divide-y divide-default">
            <li
              v-for="action in data.actions"
              :key="action.id"
              class="flex flex-col gap-0.5 py-2.5"
            >
              <span class="font-semibold text-highlighted">
                {{ t(`admin.anticheat.actions.${action.action}`) }}
              </span>
              <span class="text-sm text-muted">{{ action.reason }}</span>
              <span class="text-sm text-muted tabular-nums">{{ date(action.at) }}</span>
            </li>
          </ul>
        </section>
      </div>
    </template>
  </section>
</template>
