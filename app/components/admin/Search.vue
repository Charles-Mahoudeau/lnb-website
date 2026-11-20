<script setup lang="ts">
import type { CommandPaletteGroup, CommandPaletteItem } from '@nuxt/ui';

import type { AdminPeoplePage } from '#shared/schemas/admin';

// Ctrl K (docs/design.md, "Search"): People, Pages, Settings and Actions, each limited to what
// the role can open. People come from /api/admin/people, which applies the role's limits itself.
const open = defineModel<boolean>('open', { default: false });
const { t } = useI18n();
const { user } = useAuth();
const { isEnabled } = useFlags();

const term = ref('');
const people = ref<AdminPeoplePage['items']>([]);
const loading = ref(false);

// Typing waits for a pause, and only the latest answer counts.
let timer: ReturnType<typeof setTimeout> | undefined;
let latest = 0;
watch(term, (value) => {
  clearTimeout(timer);
  const q = value.trim();
  if (q.length < 2) {
    latest++;
    people.value = [];
    loading.value = false;
    return;
  }
  loading.value = true;
  const mine = ++latest;
  timer = setTimeout(() => {
    $fetch<AdminPeoplePage>('/api/admin/people', { query: { q } })
      .then((page) => {
        if (mine === latest) people.value = page.items.slice(0, 8);
      })
      .catch(() => {
        if (mine === latest) people.value = [];
      })
      .finally(() => {
        if (mine === latest) loading.value = false;
      });
  }, 250);
});
onBeforeUnmount(() => {
  clearTimeout(timer);
});

const groups = computed<CommandPaletteGroup[]>(() => {
  const role = user.value?.role;
  const label = (keys: string[]) => keys.map((key) => t(key)).join(' › ');
  const list: CommandPaletteGroup[] = [
    {
      id: 'people',
      label: t('admin.search.groups.people'),
      slot: 'person',
      ignoreFilter: true,
      items: people.value.map((person) => ({
        label: person.name,
        description: person.school ?? undefined,
        to: `/admin/people/${encodeURIComponent(person.userId)}/summary`,
        person,
      })),
    },
    {
      id: 'pages',
      label: t('admin.search.groups.pages'),
      items: adminSearchPages(role, isEnabled).map((page) => ({
        label: label(page.labelKeys),
        icon: page.icon,
        to: page.to,
      })),
    },
    {
      id: 'settings',
      label: t('admin.search.groups.settings'),
      items: settingsSections(role).map((section) => ({
        label: t(section.labelKey),
        icon: section.icon,
        to: `/admin/settings/${section.id}`,
      })),
    },
    {
      id: 'actions',
      label: t('admin.search.groups.actions'),
      items: adminActions(role).map((action) => ({
        label: t(action.labelKey),
        icon: action.icon,
        to: action.to,
      })),
    },
  ];
  return list.filter((group) => group.id === 'people' || group.items?.length);
});

// The palette closes on a choice, and forgets what was typed.
watch(open, (value) => {
  if (!value) term.value = '';
});

type PersonItem = CommandPaletteItem & { person: AdminPeoplePage['items'][number] };
</script>

<template>
  <UDashboardSearch
    v-model:open="open"
    v-model:search-term="term"
    :groups="groups"
    :loading="loading"
    :color-mode="false"
    :placeholder="t('admin.search.placeholder')"
    :title="t('admin.search.title')"
    :description="t('admin.search.description')"
  >
    <template #person-leading="{ item }">
      <UserAvatar
        :user-id="(item as PersonItem).person.userId"
        :name="(item as PersonItem).person.name"
        :image="(item as PersonItem).person.image"
        size="sm"
        :ghost="(item as PersonItem).person.ghost"
      />
    </template>
    <template #empty>
      <p class="px-4 py-6 text-center text-sm text-muted">{{ t('admin.search.empty') }}</p>
    </template>
  </UDashboardSearch>
</template>
