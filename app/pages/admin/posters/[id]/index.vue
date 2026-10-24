<script setup lang="ts">
import { posterIdParams } from '#shared/schemas/posters';
import type { PosterBody } from '#shared/schemas/posters';

// A saved poster in the editor.
definePageMeta({
  eventsManagers: true,
  validate: (route) => posterIdParams.safeParse(route.params).success,
});

const { t } = useI18n();
const route = useRoute();
const toast = useToast();
const { exporting, downloadPng } = usePosterExport();

const id = String(route.params.id);
const { data: poster, error, refresh } = await usePoster(id);
if (error.value || !poster.value) {
  throw createError({ status: error.value?.status ?? 404, statusText: 'Poster not found' });
}

const editor = useTemplateRef<PosterEditorHandle>('editor');
const pending = ref(false);

async function onSubmit(body: PosterBody) {
  pending.value = true;
  try {
    await posterActions.save(id, body);
    toast.add({ title: t('admin.posters.saved'), color: 'success', icon: 'i-lucide-circle-check' });
    await refresh();
  } catch (failure) {
    const problem = failure instanceof PosterError ? failure.problem : 'failed';
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
    v-if="poster"
    :title="poster.name"
    :parents="[{ label: t('admin.posters.title'), to: '/admin/posters' }]"
  >
    <template #actions>
      <UBadge
        v-if="poster.event?.cancelled"
        color="error"
        variant="subtle"
        :label="t('admin.posters.card.cancelled')"
      />
      <UBadge
        v-else-if="poster.event?.draft"
        color="warning"
        variant="subtle"
        :label="t('admin.posters.card.draft')"
      />
      <UButton
        color="neutral"
        variant="outline"
        icon="i-lucide-image-down"
        :loading="exporting"
        :label="t('admin.posters.downloadPng')"
        @click="onPng"
      />
      <UTooltip :text="t('admin.posters.printSaveFirst')" :disabled="!editor?.dirty">
        <UButton
          color="neutral"
          variant="outline"
          icon="i-lucide-printer"
          :disabled="editor?.dirty"
          :to="`/admin/posters/${id}/print`"
          target="_blank"
          :label="t('admin.posters.print')"
        />
      </UTooltip>
      <UButton :loading="pending" :label="t('admin.posters.save')" @click="editor?.submit()" />
    </template>
    <PostersEditor :key="poster.updatedAt" ref="editor" :poster="poster" @submit="onSubmit" />
  </AdminPage>
</template>
