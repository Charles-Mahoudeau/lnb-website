<script setup lang="ts">
// An admin page that belongs to a sidebar entry with tabs: the navbar (`Entry › Tab`), the row of
// tabs, then the page. `tab` is the current tab's id, in utils/admin-nav.ts.
const props = defineProps<{ entry: string; tab: string; title?: string }>();

const { t } = useI18n();
const { isEnabled } = useFlags();

const entry = computed(() => adminEntry(props.entry));
const tabs = computed(() =>
  adminTabs(props.entry, isEnabled).map((tab) => ({
    id: tab.id,
    label: t(tab.labelKey),
    to: tab.to,
    exact: tab.exact,
  })),
);
const title = computed(
  () =>
    props.title ?? tabs.value.find((tab) => tab.id === props.tab)?.label ?? t(entry.value.labelKey),
);
</script>

<template>
  <AdminPage :title="title" :parents="[{ label: t(entry.labelKey), to: entry.to }]">
    <template #actions>
      <slot name="actions" />
    </template>
    <div class="flex flex-col gap-6">
      <AdminTabs :items="tabs" />
      <slot />
    </div>
  </AdminPage>
</template>
