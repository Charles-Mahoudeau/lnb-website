<script setup lang="ts">
import type { FlagKey } from '#shared/flags';

// The live map of the Minecraft server, shown in a frame so people keep the site's header
// (docs/map.md). The address is set by admins. Public, like the mod list.
definePageMeta({ auth: false, flag: 'map' });

const { t } = useI18n();
useSeoMeta({ title: () => t('map.title'), description: () => t('map.lede') });

const { data, refresh } = await useMap();
const { isEnabled } = useFlags();
const { user } = useAuth();
const { locale } = useI18n();

// While the map is closed to visitors the server sends no address, so the wait page shows. An
// admin gets the address with `locked` true and sees the map under a note.
const waiting = computed(() => !!data.value?.locked && !data.value.url);
const preview = computed(() => !!data.value?.locked && !!data.value.url);

// The wait page counts down by the minute and opens by itself when the time comes.
const now = ref(Date.now());
const countdown = computed(() =>
  data.value?.opensAt ? mapCountdown(data.value.opensAt, now.value) : null,
);
const minutesLeft = computed(() => (countdown.value?.unit === 'minutes' ? countdown.value.n : 1));
const progress = computed(() =>
  data.value?.opensAt ? mapProgress(data.value.lockedAt, data.value.opensAt, now.value) : null,
);
const opensOn = computed(() =>
  data.value?.opensAt
    ? new Intl.DateTimeFormat(locale.value, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
        timeZone: 'Europe/Paris',
      }).format(new Date(data.value.opensAt))
    : '',
);
const opensOnLong = computed(() =>
  data.value?.opensAt
    ? new Intl.DateTimeFormat(locale.value, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
        timeZone: 'Europe/Paris',
      }).format(new Date(data.value.opensAt))
    : '',
);
const meanwhile = computed(() =>
  [
    {
      key: 'account',
      icon: 'i-lucide-user-round',
      to: '/minecraft/account',
      flag: 'warden' as FlagKey,
    },
    { key: 'bank', icon: 'i-lucide-landmark', to: '/minecraft/bank', flag: 'economy' as FlagKey },
    {
      key: 'quests',
      icon: 'i-lucide-target',
      to: '/minecraft/quests',
      flag: 'economy.quests' as FlagKey,
    },
  ].filter((item) => isEnabled(item.flag)),
);
let tick: ReturnType<typeof setInterval> | undefined;
watch(now, async () => {
  if (waiting.value && countdown.value?.unit === 'now') await refresh();
});

const stage = useTemplateRef<HTMLElement>('stage');
const fullscreen = ref(false);
const canFullscreen = ref(false);
// The server asks the map first: a browser can't read the status of a framed page, and a
// map that answers 503 would show its error page inside the frame. Only a 200 shows the map.
const state = ref<'checking' | 'ok' | 'down'>('checking');
const loaded = ref(false);
// Bumping the key reloads the frame.
const attempt = ref(0);
let timer: ReturnType<typeof setTimeout> | undefined;

async function check() {
  state.value = 'checking';
  loaded.value = false;
  clearTimeout(timer);
  try {
    state.value = (await fetchMapStatus()).ok ? 'ok' : 'down';
  } catch {
    state.value = 'down';
  }
  // A map that says 200 but never finishes loading is down too.
  if (state.value === 'ok')
    timer = setTimeout(() => !loaded.value && (state.value = 'down'), 15000);
}
function onLoad() {
  loaded.value = true;
  clearTimeout(timer);
}
function retry() {
  attempt.value += 1;
  void check();
}

async function toggleFullscreen() {
  if (document.fullscreenElement) await document.exitFullscreen();
  else await stage.value?.requestFullscreen();
}
function onFullscreenChange() {
  fullscreen.value = !!document.fullscreenElement;
}

onMounted(() => {
  canFullscreen.value = document.fullscreenEnabled;
  document.addEventListener('fullscreenchange', onFullscreenChange);
  now.value = Date.now();
  tick = setInterval(() => (now.value = Date.now()), 30_000);
  if (!waiting.value) void check();
});
// The map becomes visible when the wait ends: ask it then.
watch(waiting, (value, before) => {
  if (before && !value) void check();
});
onBeforeUnmount(() => {
  document.removeEventListener('fullscreenchange', onFullscreenChange);
  clearTimeout(timer);
  clearInterval(tick);
});
</script>

<template>
  <div class="flex flex-col gap-4 p-4">
    <div class="flex flex-wrap items-center gap-3">
      <h1 class="text-2xl font-bold text-highlighted">{{ t('map.title') }}</h1>
      <span class="flex-1" />
      <template v-if="!waiting">
        <UButton
          v-if="canFullscreen"
          color="neutral"
          variant="soft"
          size="md"
          :icon="fullscreen ? 'i-lucide-minimize' : 'i-lucide-maximize'"
          :label="fullscreen ? t('map.exitFullScreen') : t('map.fullScreen')"
          @click="toggleFullscreen"
        />
        <UButton
          v-if="data?.url"
          color="neutral"
          variant="outline"
          size="md"
          icon="i-lucide-external-link"
          :label="t('map.openNewTab')"
          :to="data.url"
          target="_blank"
          rel="noopener"
        />
      </template>
    </div>

    <div
      v-if="preview"
      class="flex flex-wrap items-center gap-3 rounded-lg bg-secondary/15 px-4 py-3"
    >
      <UIcon name="i-lucide-eye" class="size-5 shrink-0 text-secondary" />
      <p class="min-w-56 flex-1">
        {{ data?.opensAt ? t('map.preview.date', { date: opensOnLong }) : t('map.preview.closed') }}
      </p>
      <UButton
        v-if="isAdmin(user?.role)"
        to="/admin/settings/map"
        color="neutral"
        variant="soft"
        size="md"
        :label="t('map.preview.change')"
      />
    </div>

    <div
      v-if="waiting"
      class="grid h-map items-center gap-8 overflow-auto rounded-lg bg-elevated p-6 sm:p-8 lg:grid-cols-2"
    >
      <div class="flex flex-col gap-4">
        <IconTile icon="i-lucide-map" />
        <h2 class="text-2xl font-medium text-highlighted">
          <template v-if="!countdown">{{ t('map.locked.closedTitle') }}</template>
          <template v-else-if="countdown.unit === 'days'">
            {{ t('map.locked.inDays', { n: countdown.n }, countdown.n) }}
          </template>
          <template v-else-if="countdown.unit === 'tomorrow'">
            {{ t('map.locked.tomorrow') }}
          </template>
          <template v-else-if="countdown.unit === 'hours'">
            {{ t('map.locked.inHours', { n: countdown.n }, countdown.n) }}
          </template>
          <template v-else>
            {{ t('map.locked.inMinutes', { n: minutesLeft }, minutesLeft) }}
          </template>
        </h2>
        <p class="max-w-prose text-muted">
          {{ countdown ? t('map.locked.text') : t('map.locked.closedText') }}
        </p>
        <div v-if="progress" class="flex flex-col gap-2">
          <UProgress
            :model-value="progress.percent"
            color="neutral"
            size="md"
            :aria-label="t('map.locked.progressLabel')"
          />
          <div class="flex justify-between gap-3 text-sm text-muted tabular-nums">
            <span>{{ t('map.locked.day', { day: progress.day, total: progress.total }) }}</span>
            <span>{{ opensOn }}</span>
          </div>
        </div>
        <p v-else-if="data?.opensAt" class="text-sm text-muted tabular-nums">{{ opensOn }}</p>
      </div>

      <div v-if="meanwhile.length" class="flex flex-col gap-1">
        <h3 class="font-sans text-base font-bold text-highlighted">
          {{ t('map.locked.meanwhile') }}
        </h3>
        <ul class="flex flex-col divide-y divide-default">
          <li v-for="item in meanwhile" :key="item.key">
            <NuxtLink :to="item.to" class="flex items-center gap-3 py-3">
              <IconTile :icon="item.icon" />
              <span class="flex flex-col">
                <span class="font-semibold text-highlighted">
                  {{ t(`map.locked.links.${item.key}.title`) }}
                </span>
                <span class="text-sm text-muted">{{ t(`map.locked.links.${item.key}.text`) }}</span>
              </span>
            </NuxtLink>
          </li>
        </ul>
      </div>
    </div>

    <div v-else ref="stage" class="relative h-map overflow-hidden rounded-lg bg-elevated">
      <iframe
        v-if="data?.url && state !== 'down'"
        :key="attempt"
        :src="data.url"
        :title="t('map.frameTitle')"
        class="size-full border-0"
        allow="fullscreen"
        referrerpolicy="no-referrer"
        @load="onLoad"
      />
      <div
        v-if="state === 'checking' || (state === 'ok' && !loaded)"
        class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-elevated"
        role="status"
      >
        <UIcon
          name="i-lucide-loader-circle"
          class="size-7 text-secondary motion-safe:animate-spin"
        />
        <p class="text-muted">{{ t('map.loading') }}</p>
      </div>
      <div
        v-else-if="state === 'down'"
        class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-elevated p-6 text-center"
      >
        <IconTile icon="i-lucide-map" />
        <h2 class="text-xl font-medium text-highlighted">{{ t('map.unavailable.title') }}</h2>
        <p class="max-w-prose text-muted">{{ t('map.unavailable.text') }}</p>
        <UButton
          color="neutral"
          variant="soft"
          :label="t('map.unavailable.retry')"
          @click="retry"
        />
      </div>
    </div>
  </div>
</template>
