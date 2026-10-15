<script setup lang="ts">
import type { ModSearchResult } from '#shared/schemas/mods';

// Searches Modrinth and CurseForge as the user types. Only available results can be picked:
// the others say why not.
const emit = defineEmits<{ pick: [result: ModSearchResult] }>();

const { t, locale } = useI18n();

const query = ref('');
const results = ref<ModSearchResult[]>([]);
const state = ref<'idle' | 'loading' | 'done' | 'error'>('idle');
const errorKey = ref('failed');

let timer: ReturnType<typeof setTimeout> | undefined;
let latest = 0;
watch(query, (value) => {
  clearTimeout(timer);
  const q = value.trim();
  if (q.length < 2) {
    results.value = [];
    state.value = 'idle';
    return;
  }
  timer = setTimeout(() => void run(q), 300);
});
onBeforeUnmount(() => {
  clearTimeout(timer);
});

async function run(q: string) {
  const id = ++latest;
  state.value = 'loading';
  try {
    const { items } = await searchMods(q);
    if (id !== latest) return;
    results.value = items;
    state.value = 'done';
  } catch (error) {
    if (id !== latest) return;
    const problem = error instanceof ModError ? error.problem : 'failed';
    errorKey.value =
      problem === 'rateLimited' || problem === 'sourceUnavailable' ? problem : 'failed';
    state.value = 'error';
  }
}

const downloads = (count: number) =>
  new Intl.NumberFormat(locale.value, { notation: 'compact' }).format(count);
</script>

<template>
  <div class="flex flex-col gap-2">
    <UFormField :label="t('mods.search.label')" name="query">
      <UInput
        v-model="query"
        type="search"
        icon="i-lucide-search"
        :loading="state === 'loading'"
        :placeholder="t('mods.search.placeholder')"
        autofocus
        class="w-full"
      />
    </UFormField>

    <UAlert
      v-if="state === 'error'"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :description="t(`mods.errors.${errorKey}`)"
    />
    <p v-else-if="state === 'done' && results.length === 0" class="text-muted">
      {{ t('mods.search.empty') }}
    </p>

    <ul v-if="results.length" class="flex flex-col gap-0.5 rounded-md bg-default p-1">
      <li v-for="result in results" :key="`${result.source}:${result.sourceId}`">
        <button
          type="button"
          class="flex w-full items-center gap-3 rounded-md p-2 text-left enabled:hover:bg-accented disabled:cursor-default"
          :disabled="result.status !== 'available'"
          @click="emit('pick', result)"
        >
          <ModsIcon
            :name="result.name"
            :src="result.iconUrl"
            size="sm"
            :class="result.status === 'available' ? '' : 'opacity-50'"
          />
          <span
            :class="[
              'flex min-w-0 grow flex-col',
              result.status === 'available' ? '' : 'opacity-60',
            ]"
          >
            <span class="truncate font-semibold text-highlighted">{{ result.name }}</span>
            <span class="truncate text-sm text-muted">
              {{
                t('mods.search.meta', {
                  author: result.author || t('mods.search.unknownAuthor'),
                  downloads: downloads(result.downloads),
                })
              }}
            </span>
          </span>
          <UBadge
            color="neutral"
            variant="soft"
            size="sm"
            :label="t(`mods.sources.${result.source}`)"
          />
          <span v-if="result.status !== 'available'" class="shrink-0 text-sm text-muted">
            {{ t(`mods.search.status.${result.status}`) }}
          </span>
        </button>
      </li>
    </ul>
    <p class="text-sm text-muted">{{ t('mods.search.sources') }}</p>
  </div>
</template>
