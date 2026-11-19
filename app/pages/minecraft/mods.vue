<script setup lang="ts">
import type { ModpackManifest } from '#shared/schemas/modpack';

// What the LNB launcher installs, read in the browser from the public manifest (docs/mods-page.md).
// It is the same document the launcher reads, so the page is never behind it. Nothing is
// rendered on the server: the first paint is the loading state.
definePageMeta({ auth: false, flag: 'modsPage' });

const { t, locale } = useI18n();
const { isEnabled } = useFlags();
useSeoMeta({ title: () => t('modsPage.title'), description: () => t('modsPage.lede') });

const {
  data: manifest,
  error,
  refresh,
} = useFetch<ModpackManifest>('/modpack/manifest.json', { key: 'mods-page', server: false });

type Mod = ModpackManifest['mods'][number];

const query = ref('');
const onlyOptional = ref(false);

const LOADERS: Record<string, string> = {
  neoforge: 'NeoForge',
  fabric: 'Fabric',
  forge: 'Forge',
  quilt: 'Quilt',
};

const GROUPS = [
  { side: 'both', icon: 'i-lucide-layers' },
  { side: 'client', icon: 'i-lucide-monitor' },
  { side: 'server', icon: 'i-lucide-server' },
] as const;

const mods = computed(() => manifest.value?.mods ?? []);
const matching = computed(() => {
  const needle = query.value.trim().toLowerCase();
  return mods.value.filter(
    (mod) =>
      (!onlyOptional.value || mod.optional) && (!needle || mod.name.toLowerCase().includes(needle)),
  );
});
const groups = computed(() =>
  GROUPS.map((group) => ({
    ...group,
    total: mods.value.filter((mod) => mod.side === group.side).length,
    items: matching.value.filter((mod) => mod.side === group.side),
  })).filter((group) => group.items.length > 0),
);

const summary = computed(() => {
  const m = manifest.value;
  if (!m) return '';
  return t('modsPage.summary', {
    count: m.mods.length,
    size: formatBytes(
      m.mods.reduce((sum, mod) => sum + mod.size, 0),
      locale.value,
    ),
    version: m.gameVersion,
    loader: LOADERS[m.loader] ?? m.loader,
    revision: m.revision,
    date: new Intl.DateTimeFormat(locale.value, { dateStyle: 'long' }).format(
      new Date(m.updatedAt),
    ),
  });
});

const sourceLabel = (mod: Mod) =>
  mod.source === 'modrinth' ? 'Modrinth' : mod.source === 'curseforge' ? 'CurseForge' : null;
</script>

<template>
  <UContainer class="py-8 sm:py-12">
    <header class="mb-8 flex max-w-prose flex-col gap-3">
      <h1>{{ t('modsPage.title') }}</h1>
      <p class="text-muted">{{ t('modsPage.lede') }}</p>
    </header>

    <div
      v-if="error"
      class="flex flex-col items-center gap-3 rounded-lg bg-elevated p-10 text-center"
    >
      <IconTile icon="i-lucide-triangle-alert" />
      <h2 class="text-xl">{{ t('modsPage.error.title') }}</h2>
      <p class="max-w-prose text-muted">{{ t('modsPage.error.text') }}</p>
      <UButton
        color="neutral"
        variant="soft"
        :label="t('modsPage.error.retry')"
        @click="refresh()"
      />
    </div>

    <div
      v-else-if="!manifest"
      class="flex flex-col gap-4 rounded-lg bg-elevated p-6"
      role="status"
      :aria-label="t('modsPage.loading')"
    >
      <div v-for="n in 6" :key="n" class="flex items-center gap-3">
        <USkeleton class="size-10" />
        <USkeleton class="h-4 w-1/3" />
      </div>
      <p class="text-center text-muted">{{ t('modsPage.loading') }}</p>
    </div>

    <template v-else>
      <p class="mb-5 max-w-prose text-lg text-default tabular-nums">
        {{ summary }}
        <ULink
          v-if="isEnabled('downloads')"
          to="/minecraft/download"
          class="font-semibold text-primary underline"
        >
          {{ t('modsPage.downloadLink') }}
        </ULink>
      </p>

      <div class="mb-6 flex flex-wrap items-center gap-3">
        <UInput
          v-model="query"
          type="search"
          icon="i-lucide-search"
          class="w-full max-w-xs"
          :placeholder="t('modsPage.search', { count: mods.length })"
          :aria-label="t('modsPage.searchLabel')"
        />
        <UButton
          :color="onlyOptional ? 'secondary' : 'neutral'"
          :variant="onlyOptional ? 'soft' : 'outline'"
          :aria-pressed="onlyOptional"
          :label="t('modsPage.optionalOnly')"
          @click="onlyOptional = !onlyOptional"
        />
      </div>

      <p v-if="groups.length === 0" class="rounded-lg bg-elevated p-10 text-center text-muted">
        {{ t('modsPage.empty') }}
      </p>

      <div class="flex flex-col gap-4">
        <section
          v-for="group in groups"
          :key="group.side"
          class="grid gap-6 rounded-lg bg-elevated p-6 md:grid-cols-4"
        >
          <div class="flex flex-col gap-2">
            <IconTile :icon="group.icon" />
            <h2 class="text-xl">{{ t(`modsPage.groups.${group.side}.title`) }}</h2>
            <p class="text-muted">{{ t(`modsPage.groups.${group.side}.text`) }}</p>
            <p class="text-sm text-muted tabular-nums">
              {{ t('modsPage.count', { count: group.total }) }}
            </p>
          </div>
          <ul class="divide-y divide-default md:col-span-3">
            <li
              v-for="mod in group.items"
              :key="mod.id"
              class="flex items-center gap-3 py-3 first:pt-0"
            >
              <ModsIcon :name="mod.name" :src="mod.icon" size="sm" />
              <div class="min-w-0 flex-1">
                <p class="truncate font-semibold text-highlighted">{{ mod.name }}</p>
                <p class="truncate text-sm text-muted tabular-nums">
                  {{ mod.version }} · {{ formatBytes(mod.size, locale) }}
                </p>
              </div>
              <UBadge
                v-if="mod.optional"
                color="secondary"
                variant="soft"
                :label="t('modsPage.optional')"
              />
              <UBadge
                v-if="mod.source === 'upload'"
                color="neutral"
                variant="outline"
                :label="t('modsPage.hosted')"
              />
              <ULink
                v-if="mod.projectUrl && sourceLabel(mod)"
                :to="mod.projectUrl"
                target="_blank"
                external
                class="text-sm font-semibold text-primary hover:underline"
              >
                {{ sourceLabel(mod) }}
              </ULink>
            </li>
          </ul>
        </section>
      </div>
    </template>
  </UContainer>
</template>
