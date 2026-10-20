<script setup lang="ts">
import type { ShortLinkListItem } from '#shared/schemas/short-links';

// The short links as a table. A row opens the link's statistics.
const { t, d } = useI18n();
const toast = useToast();
const { data, error, refresh } = await useAdminShortLinks();

const search = ref('');

const links = computed(() => {
  const q = search.value.trim().toLowerCase();
  return (data.value?.links ?? []).filter(
    (link) =>
      !q ||
      link.shortId.includes(q) ||
      link.name.toLowerCase().includes(q) ||
      link.destinationUrl.toLowerCase().includes(q),
  );
});

function accessLabel(link: ShortLinkListItem) {
  if (link.access === 'any') return t('admin.shortLinks.access.any');
  if (link.access === 'signed') return t('admin.shortLinks.access.signed');
  return schoolNames(link.tenantIds).join(', ');
}

async function copy(link: ShortLinkListItem) {
  await navigator.clipboard.writeText(shortUrl(data.value!.baseUrl, link.shortId));
  toast.add({
    title: t('admin.shortLinks.copied'),
    color: 'success',
    icon: 'i-lucide-circle-check',
  });
}

async function onToggle(link: ShortLinkListItem, enabled: boolean) {
  try {
    await shortLinkActions.update(link.id, { enabled });
  } catch (caught) {
    const problem = caught instanceof ShortLinkError ? caught.problem : 'failed';
    toast.add({
      title: t(`admin.shortLinks.errors.${problem}`),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  }
  await refresh();
}
</script>

<template>
  <UAlert
    v-if="error || !data"
    color="error"
    variant="subtle"
    icon="i-lucide-circle-alert"
    :description="t('admin.shortLinks.errors.failed')"
  />
  <div v-else class="flex flex-col gap-4">
    <p class="max-w-prose text-muted">{{ t('admin.shortLinks.note') }}</p>

    <section class="flex flex-col gap-4 rounded-lg bg-elevated p-5">
      <UInput
        v-model="search"
        icon="i-lucide-search"
        size="md"
        class="w-full max-w-xs"
        :placeholder="t('admin.shortLinks.search')"
        :aria-label="t('admin.shortLinks.search')"
      />

      <p v-if="!data.links.length" class="text-muted">{{ t('admin.shortLinks.empty') }}</p>
      <p v-else-if="!links.length" class="text-muted">{{ t('admin.shortLinks.noMatch') }}</p>
      <div v-else class="overflow-x-auto">
        <table class="w-full min-w-3xl border-collapse text-left">
          <thead class="text-sm text-muted">
            <tr>
              <th class="px-3 py-2 font-medium">{{ t('admin.shortLinks.columns.link') }}</th>
              <th class="px-3 py-2 font-medium">{{ t('admin.shortLinks.columns.access') }}</th>
              <th class="px-3 py-2 text-right font-medium">
                {{ t('admin.shortLinks.columns.clicks') }}
              </th>
              <th class="px-3 py-2 text-right font-medium">
                {{ t('admin.shortLinks.columns.people') }}
              </th>
              <th class="px-3 py-2 font-medium">{{ t('admin.shortLinks.columns.created') }}</th>
              <th class="px-3 py-2 font-medium">{{ t('admin.shortLinks.columns.status') }}</th>
              <th class="px-3 py-2">
                <span class="sr-only">{{ t('admin.shortLinks.copy') }}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="link in links" :key="link.id" class="border-t border-default">
              <td class="max-w-sm px-3 py-3">
                <NuxtLink
                  :to="`/admin/short-links/${link.id}`"
                  class="block truncate font-semibold text-highlighted hover:underline"
                >
                  /r/{{ link.shortId }}
                </NuxtLink>
                <span class="block truncate text-sm text-muted">{{ link.name }}</span>
              </td>
              <td class="px-3 py-3">
                <span class="flex items-center gap-1.5 text-sm text-muted">
                  <UIcon
                    :name="link.access === 'any' ? 'i-lucide-globe' : 'i-lucide-lock'"
                    class="size-4 shrink-0"
                  />
                  {{ accessLabel(link) }}
                </span>
              </td>
              <td class="px-3 py-3 text-right tabular-nums">{{ link.clicks }}</td>
              <td class="px-3 py-3 text-right tabular-nums">
                <template v-if="link.recordClicks">{{ link.people }}</template>
                <span v-else class="text-sm text-muted">{{
                  t('admin.shortLinks.notRecorded')
                }}</span>
              </td>
              <td class="px-3 py-3 text-sm text-muted tabular-nums">
                {{ d(link.createdAt, { dateStyle: 'medium', timeZone: 'Europe/Paris' }) }}
              </td>
              <td class="px-3 py-3">
                <USwitch
                  :model-value="link.enabled"
                  :aria-label="t('admin.shortLinks.form.enabled')"
                  @update:model-value="(enabled: boolean) => onToggle(link, enabled)"
                />
              </td>
              <td class="px-3 py-3 text-right">
                <UButton
                  icon="i-lucide-copy"
                  size="md"
                  color="neutral"
                  variant="ghost"
                  :aria-label="t('admin.shortLinks.copy')"
                  @click="copy(link)"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>
