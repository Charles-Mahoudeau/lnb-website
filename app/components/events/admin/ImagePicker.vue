<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui';

import type { EventStoredImage, ProviderGames, ProviderImages } from '#shared/schemas/events';

// Picks an event image in two steps: the art (from SteamGridDB, an upload or a link), then the
// focal point every crop is centered on. The server downloads and keeps the art as soon as it's
// picked. With `image`, it opens on the focal point. Closes with the image, or null.
const props = defineProps<{ title: string; image?: PickedEventImage }>();
const emit = defineEmits<{ close: [image: PickedEventImage | null] }>();

const { t } = useI18n();
const toast = useToast();

const step = ref<'pick' | 'focus'>(props.image ? 'focus' : 'pick');
const picked = ref<PickedEventImage | null>(props.image ? { ...props.image } : null);
const pending = ref(false);

const { data: providers } = await useFetch<{ steamgriddb: boolean }>(
  '/api/admin/events/images/providers',
  { key: 'event-image-providers' },
);
type Source = 'steamgriddb' | 'upload' | 'link';
const source = ref<Source>(providers.value?.steamgriddb ? 'steamgriddb' : 'upload');
const sources = computed<TabsItem[]>(() => [
  ...(providers.value?.steamgriddb
    ? [{ label: 'SteamGridDB', value: 'steamgriddb', icon: 'i-lucide-search' }]
    : []),
  { label: t('admin.events.picker.upload'), value: 'upload', icon: 'i-lucide-upload' },
  { label: t('admin.events.picker.link'), value: 'link', icon: 'i-lucide-link' },
]);

function fail(error: unknown) {
  const problem = error instanceof EventError ? error.problem : 'failed';
  toast.add({
    title: t(`admin.events.errors.${problem}`, t('admin.events.errors.failed')),
    color: 'error',
    icon: 'i-lucide-circle-alert',
  });
}

async function call<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    throw toEventError(error);
  }
}

/** Keeps the image on the server, then moves on to the focal point. */
async function keep(request: () => Promise<EventStoredImage>) {
  pending.value = true;
  try {
    const stored = await call(request);
    picked.value = { key: stored.key, url: stored.url, focusX: 0.5, focusY: 0.5 };
    step.value = 'focus';
  } catch (error) {
    fail(error);
  } finally {
    pending.value = false;
  }
}

// SteamGridDB: search a game, then pick among its banners or covers.
const query = ref('');
const games = ref<ProviderGames['items']>([]);
const game = ref<string>();
const kind = ref<'banners' | 'covers'>('banners');
const kinds = computed<TabsItem[]>(() => [
  { label: t('admin.events.picker.banners'), value: 'banners' },
  { label: t('admin.events.picker.covers'), value: 'covers' },
]);
const images = ref<ProviderImages['items']>([]);
const selected = ref<string>();
const searching = ref(false);

let timer: ReturnType<typeof setTimeout> | undefined;
watch(query, (q) => {
  clearTimeout(timer);
  if (q.trim().length < 2) return;
  timer = setTimeout(() => {
    searching.value = true;
    call(() =>
      $fetch<ProviderGames>('/api/admin/events/images/steamgriddb/search', {
        query: { q: q.trim() },
      }),
    )
      .then((found) => {
        games.value = found.items;
        game.value = found.items[0]?.id;
      })
      .catch(fail)
      .finally(() => (searching.value = false));
  }, 300);
});

watch([game, kind], ([id, current]) => {
  images.value = [];
  selected.value = undefined;
  if (!id) return;
  searching.value = true;
  call(() =>
    $fetch<ProviderImages>(`/api/admin/events/images/steamgriddb/${id}`, {
      query: { kind: current },
    }),
  )
    .then((found) => (images.value = found.items))
    .catch(fail)
    .finally(() => (searching.value = false));
});

// Upload, or a link.
const file = ref<File | null>(null);
const link = ref('');

function next() {
  if (source.value === 'steamgriddb' && selected.value) {
    const url = selected.value;
    return keep(() =>
      $fetch<EventStoredImage>('/api/admin/events/images/import', {
        method: 'POST',
        body: { source: 'steamgriddb', url },
      }),
    );
  }
  if (source.value === 'upload' && file.value) {
    const form = new FormData();
    form.append('file', file.value);
    return keep(() =>
      $fetch<EventStoredImage>('/api/admin/events/images', { method: 'POST', body: form }),
    );
  }
  if (source.value === 'link' && link.value) {
    return keep(() =>
      $fetch<EventStoredImage>('/api/admin/events/images/import', {
        method: 'POST',
        body: { source: 'url', url: link.value.trim() },
      }),
    );
  }
}

const canGoOn = computed(
  () =>
    (source.value === 'steamgriddb' && !!selected.value) ||
    (source.value === 'upload' && !!file.value) ||
    (source.value === 'link' && link.value.trim().startsWith('https://')),
);

// The focal point, set by clicking or tapping the image.
function onFocus(event: MouseEvent) {
  // A keyboard press has no position: the point stays where it is.
  if (!picked.value || event.detail === 0) return;
  const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
  const clamp = (value: number) => Math.round(Math.min(Math.max(value, 0), 1) * 1000) / 1000;
  picked.value.focusX = clamp((event.clientX - box.left) / box.width);
  picked.value.focusY = clamp((event.clientY - box.top) / box.height);
}

const position = computed(() =>
  picked.value
    ? `${String(picked.value.focusX * 100)}% ${String(picked.value.focusY * 100)}%`
    : 'center',
);

const crops = computed(() => [
  { label: t('admin.events.picker.cropBanner'), aspect: 'aspect-banner', span: 'sm:col-span-2' },
  { label: t('admin.events.picker.cropThumb'), aspect: 'aspect-video', span: '' },
  { label: t('admin.events.picker.cropEmbed'), aspect: 'aspect-embed', span: '' },
]);
</script>

<template>
  <UModal
    :title="step === 'pick' ? title : t('admin.events.picker.focusTitle')"
    :description="
      step === 'focus'
        ? t('admin.events.picker.focusLede')
        : providers?.steamgriddb
          ? t('admin.events.picker.pickLede')
          : t('admin.events.picker.pickLedeNoSearch')
    "
    :close="false"
    :ui="{ content: 'sm:max-w-3xl' }"
  >
    <template #body>
      <div v-if="step === 'pick'" class="flex flex-col gap-5">
        <UTabs v-model="source" :items="sources" :content="false" class="w-auto self-start" />

        <template v-if="source === 'steamgriddb'">
          <UInput
            v-model="query"
            icon="i-lucide-search"
            :loading="searching"
            :placeholder="t('admin.events.picker.searchPlaceholder')"
            autofocus
            class="w-full"
          />
          <div v-if="games.length" class="flex flex-wrap gap-2">
            <UButton
              v-for="option in games"
              :key="option.id"
              size="md"
              :color="game === option.id ? 'secondary' : 'neutral'"
              :variant="game === option.id ? 'soft' : 'outline'"
              :label="option.year ? `${option.name} (${option.year})` : option.name"
              @click="game = option.id"
            />
          </div>
          <template v-if="game">
            <div class="flex flex-wrap items-center gap-3">
              <UTabs v-model="kind" :items="kinds" :content="false" size="sm" class="w-auto" />
              <span class="text-sm text-muted">
                {{ t(`admin.events.picker.${kind}Help`) }}
              </span>
            </div>
            <div v-if="images.length" class="grid gap-3 sm:grid-cols-2">
              <button
                v-for="art in images"
                :key="art.url"
                type="button"
                class="relative overflow-hidden rounded-md bg-banner-fallback outline-offset-2 focus-visible:outline-2 focus-visible:outline-primary"
                :class="[
                  kind === 'banners' ? 'aspect-banner' : 'aspect-video',
                  selected === art.url && 'ring-3 ring-secondary',
                ]"
                :aria-pressed="selected === art.url"
                :aria-label="
                  t('admin.events.picker.pickImage', { width: art.width, height: art.height })
                "
                @click="selected = art.url"
              >
                <img
                  :src="art.thumb"
                  alt=""
                  loading="lazy"
                  class="absolute inset-0 size-full object-cover"
                />
                <span
                  class="absolute bottom-2 left-2 rounded-full bg-banner/80 px-2 text-xs text-on-banner tabular-nums"
                >
                  {{ art.width }} × {{ art.height }}
                </span>
              </button>
            </div>
            <p v-else-if="!searching" class="text-muted">{{ t('admin.events.picker.noArt') }}</p>
          </template>
        </template>

        <UFormField
          v-else-if="source === 'upload'"
          :label="t('admin.events.picker.file')"
          :help="t('admin.events.picker.fileHelp')"
        >
          <UFileUpload
            v-model="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            :label="t('admin.events.picker.drop')"
            :description="t('admin.events.picker.dropHelp')"
            class="min-h-40 w-full"
          />
        </UFormField>

        <UFormField
          v-else
          :label="t('admin.events.picker.linkLabel')"
          :help="t('admin.events.picker.linkHelp')"
        >
          <UInput
            v-model="link"
            type="url"
            icon="i-lucide-link"
            placeholder="https://"
            class="w-full"
          />
        </UFormField>
      </div>

      <div v-else-if="picked" class="flex flex-col gap-4">
        <button
          type="button"
          class="relative cursor-crosshair overflow-hidden rounded-md bg-banner-fallback"
          :aria-label="t('admin.events.picker.focusTitle')"
          @click="onFocus"
        >
          <img :src="picked.url" alt="" class="block w-full" />
          <span
            class="pointer-events-none absolute size-7 -translate-1/2 rounded-full ring-2 ring-on-banner"
            :style="{ left: `${picked.focusX * 100}%`, top: `${picked.focusY * 100}%` }"
          />
        </button>
        <div class="grid items-end gap-3 sm:grid-cols-4">
          <div
            v-for="crop in crops"
            :key="crop.label"
            class="flex flex-col gap-1.5"
            :class="crop.span"
          >
            <div
              class="relative overflow-hidden rounded-sm bg-banner-fallback"
              :class="crop.aspect"
            >
              <img
                :src="picked.url"
                alt=""
                class="absolute inset-0 size-full object-cover"
                :style="{ objectPosition: position }"
              />
            </div>
            <span class="text-sm text-muted">{{ crop.label }}</span>
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full flex-wrap justify-end gap-3">
        <template v-if="step === 'pick'">
          <UButton
            color="neutral"
            variant="soft"
            :label="t('admin.cancel')"
            @click="emit('close', null)"
          />
          <UButton
            :disabled="!canGoOn"
            :loading="pending"
            :label="t('admin.events.picker.next')"
            @click="next"
          />
        </template>
        <template v-else>
          <UButton
            color="neutral"
            variant="soft"
            :label="t('admin.events.picker.back')"
            @click="step = 'pick'"
          />
          <UButton :label="t('admin.events.picker.use')" @click="emit('close', picked)" />
        </template>
      </div>
    </template>
  </UModal>
</template>
