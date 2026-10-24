<script setup lang="ts">
import type { PosterBody } from '#shared/schemas/posters';

// A new poster, from an event when opened with ?event=<id> (the event page's "Make a poster").
definePageMeta({ eventsManagers: true });

const { t } = useI18n();
const route = useRoute();
const toast = useToast();
const { exporting, downloadPng } = usePosterExport();

const eventId = typeof route.query.event === 'string' ? route.query.event : null;
const editor = useTemplateRef<PosterEditorHandle>('editor');
const pending = ref(false);

async function onSubmit(body: PosterBody) {
  pending.value = true;
  try {
    const { id } = await posterActions.create(body);
    toast.add({
      title: t('admin.posters.created'),
      color: 'success',
      icon: 'i-lucide-circle-check',
    });
    await navigateTo(`/admin/posters/${id}`);
  } catch (error) {
    const problem = error instanceof PosterError ? error.problem : 'failed';
    toast.add({
      title: t(`admin.posters.errors.${problem}`),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  } finally {
    pending.value = false;
  }
}

function onPng() {
  const current = editor.value;
  if (current) void downloadPng(() => current.png(), current.name);
}
</script>

<template>
  <AdminPage
    :title="t('admin.posters.new')"
    :parents="[{ label: t('admin.posters.title'), to: '/admin/posters' }]"
  >
    <template #actions>
      <UButton
        color="neutral"
        variant="outline"
        icon="i-lucide-image-down"
        :loading="exporting"
        :label="t('admin.posters.downloadPng')"
        @click="onPng"
      />
      <UTooltip :text="t('admin.posters.printSaveFirst')">
        <UButton
          color="neutral"
          variant="outline"
          icon="i-lucide-printer"
          disabled
          :label="t('admin.posters.print')"
        />
      </UTooltip>
      <UButton :loading="pending" :label="t('admin.posters.create')" @click="editor?.submit()" />
    </template>
    <PostersEditor ref="editor" :event-id="eventId" @submit="onSubmit" />
  </AdminPage>
</template>
