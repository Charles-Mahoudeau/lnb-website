<script setup lang="ts">
import { AdminApiKeysForm, AdminApiKeysSecret } from '#components';

import type { ApiKeyCreated } from '#shared/schemas/api-keys';

// Settings (docs/plans/admin-redesign.md): a list of sections on the left, a select on a phone,
// and the section on the right. Which sections a role may open is in utils/admin-nav.ts, and the
// middleware below enforces it on every navigation. The server checks the same roles on every
// route behind the forms.
definePageMeta({
  wardenAdmins: true,
  eventsManagers: true,
  economyAdmins: true,
  middleware: (to) => {
    const { user } = useAuth();
    if (
      !settingsSections(user.value?.role).some(
        (entry) => entry.id === (to.params as { section?: string }).section,
      )
    ) {
      return abortNavigation(createError({ statusCode: 404, statusMessage: 'Page not found' }));
    }
  },
});

const { t } = useI18n();
const route = useRoute();
const { user } = useAuth();

// Resolved by name, the lazy ones load when their section opens. Rooms and Types are not lazy,
// because the page calls their `onAdd`.
const PANES = {
  activity: resolveComponent('LazyAdminActivity'),
  flags: resolveComponent('LazyAdminFlags'),
  'rate-limit': resolveComponent('LazyAdminRateLimit'),
  'api-keys': resolveComponent('LazyAdminApiKeys'),
  map: resolveComponent('LazyAdminMap'),
  team: resolveComponent('LazyAdminTeamJoin'),
  partners: resolveComponent('LazyAdminPartnersContact'),
  gamesplanet: resolveComponent('LazyAdminGamesplanetRef'),
  rooms: resolveComponent('EventsAdminRooms'),
  types: resolveComponent('EventsAdminTypes'),
  notifications: resolveComponent('LazyAdminPushSettings'),
  warden: resolveComponent('LazyWardenAdminSettings'),
  anticheat: resolveComponent('LazyAdminAnticheatSettings'),
  modpack: resolveComponent('LazyModsAdminSettings'),
  playtime: resolveComponent('LazyAdminPlaytimeMode'),
  economy: resolveComponent('LazyAdminEconomySettings'),
  quests: resolveComponent('LazyAdminQuestsSettings'),
} as Record<string, ReturnType<typeof resolveComponent>>;

const sections = computed(() => settingsSections(user.value?.role));
const id = computed(() => String(route.params.section));
const current = computed(() => sections.value.find((entry) => entry.id === id.value));
const title = computed(() => (current.value ? t(current.value.labelKey) : t('admin.nav.settings')));

// "Find a setting" filters the section names.
const find = useState('admin-settings-find', () => '');
const visible = computed(() => {
  const needle = find.value.trim().toLowerCase();
  return sections.value.filter(
    (entry) => !needle || t(entry.labelKey).toLowerCase().includes(needle),
  );
});
const groups = computed(() =>
  SETTINGS_AREAS.map((area) => ({
    ...area,
    sections: visible.value.filter((entry) => entry.area === area.id),
  })).filter((area) => area.sections.length > 0),
);
const selectItems = computed(() =>
  visible.value.map((entry) => ({ label: t(entry.labelKey), value: entry.id })),
);

function go(value: string) {
  if (value !== id.value) void navigateTo(`/admin/settings/${value}`);
}

// The sections that add things from the navbar, as their own pages did.
const pane = useTemplateRef<{ onAdd?: () => void }>('pane');
const overlay = useOverlay();
const keyForm = overlay.create(AdminApiKeysForm);
const keySecret = overlay.create(AdminApiKeysSecret);

async function onAddKey() {
  const result: unknown = await keyForm.open().result;
  if (!result || typeof result !== 'object') return;
  const created = result as ApiKeyCreated;
  await refreshNuxtData('api-keys-admin');
  await keySecret.open({ name: created.key.name, secret: created.secret }).result;
}
</script>

<template>
  <AdminPage :title="title" :parents="[{ label: t('admin.nav.settings'), to: '/admin/settings' }]">
    <template #actions>
      <UButton
        v-if="id === 'api-keys'"
        icon="i-lucide-plus"
        size="md"
        :label="t('admin.apiKeys.add')"
        @click="onAddKey"
      />
      <UButton
        v-else-if="id === 'rooms'"
        icon="i-lucide-plus"
        :label="t('admin.events.rooms.add')"
        @click="pane?.onAdd?.()"
      />
      <UButton
        v-else-if="id === 'types'"
        icon="i-lucide-plus"
        :label="t('admin.events.types.add')"
        @click="pane?.onAdd?.()"
      />
    </template>

    <div class="flex flex-col gap-6 lg:flex-row lg:gap-10">
      <nav class="flex flex-col gap-4 lg:w-64 lg:shrink-0" :aria-label="t('admin.nav.settings')">
        <UInput
          v-model="find"
          icon="i-lucide-search"
          :placeholder="t('admin.settings.find')"
          :aria-label="t('admin.settings.find')"
          class="w-full"
        />
        <USelect
          :model-value="id"
          :items="selectItems"
          :aria-label="t('admin.settings.section')"
          class="w-full lg:hidden"
          @update:model-value="go"
        />
        <p v-if="!visible.length" class="text-sm text-muted">{{ t('admin.settings.noMatch') }}</p>
        <div v-for="area in groups" :key="area.id" class="hidden flex-col gap-1 lg:flex">
          <h2 class="px-2 pb-1 text-sm font-medium text-muted">{{ t(area.labelKey) }}</h2>
          <NuxtLink
            v-for="entry in area.sections"
            :key="entry.id"
            :to="`/admin/settings/${entry.id}`"
            class="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-elevated"
            :class="entry.id === id ? 'bg-elevated text-highlighted' : 'text-muted'"
            :aria-current="entry.id === id ? 'page' : undefined"
          >
            <IconTile :icon="entry.icon" />
            <span class="font-medium">{{ t(entry.labelKey) }}</span>
          </NuxtLink>
        </div>
      </nav>

      <div class="flex max-w-5xl min-w-0 flex-1 flex-col gap-6">
        <p v-if="id === 'rooms'" class="text-muted">{{ t('admin.events.rooms.lede') }}</p>
        <p v-else-if="id === 'types'" class="text-muted">{{ t('admin.events.types.lede') }}</p>
        <component :is="PANES[id]" :key="id" ref="pane" />
      </div>
    </div>
  </AdminPage>
</template>
