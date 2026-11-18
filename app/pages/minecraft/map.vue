<script setup lang="ts">
// The live map of the Minecraft server, shown in a frame so people keep the site's header
// (docs/map.md). The address is set by admins. Public, like the mod list.
definePageMeta({ auth: false, flag: 'map' });

const { t } = useI18n();
useSeoMeta({ title: () => t('map.title'), description: () => t('map.lede') });

const { data } = await useMap();

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
  void check();
});
onBeforeUnmount(() => {
  document.removeEventListener('fullscreenchange', onFullscreenChange);
  clearTimeout(timer);
});
</script>

<template>
  <div class="flex flex-col gap-4 p-4">
    <div class="flex flex-wrap items-center gap-3">
      <h1 class="text-2xl font-bold text-highlighted">{{ t('map.title') }}</h1>
      <span class="flex-1" />
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
        v-if="data"
        color="neutral"
        variant="outline"
        size="md"
        icon="i-lucide-external-link"
        :label="t('map.openNewTab')"
        :to="data.url"
        target="_blank"
        rel="noopener"
      />
    </div>

    <div ref="stage" class="relative h-map overflow-hidden rounded-lg bg-elevated">
      <iframe
        v-if="data && state !== 'down'"
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
