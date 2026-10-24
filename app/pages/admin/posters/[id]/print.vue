<script setup lang="ts">
// A poster alone at A4 with no margins, for the browser's print dialog: "Save as PDF" gives a
// vector PDF. Opens the dialog once the fonts and images are in.
definePageMeta({ layout: false, eventsManagers: true });

const route = useRoute();
const { t } = useI18n();
const { data: poster, error } = await usePoster(String(route.params.id));
const render = computed(() => (poster.value ? posterRenderOf(poster.value) : null));
const frame = useTemplateRef<HTMLElement>('frame');

useHead({ title: () => poster.value?.name ?? t('admin.posters.title') });

onMounted(async () => {
  if (!frame.value) return;
  await posterReady(frame.value);
  window.print();
});
</script>

<template>
  <div class="poster-print">
    <div v-if="render" ref="frame">
      <PostersPoster :poster="render" />
    </div>
    <p v-else-if="error">{{ t('admin.posters.loadFailed') }}</p>
  </div>
</template>

<style>
@page {
  size: A4;
  margin: 0;
}

.poster-print {
  display: flex;
  justify-content: center;
  padding: 32px 0;
}

@media print {
  html,
  body {
    margin: 0;
    background: none;
  }

  .poster-print {
    display: block;
    padding: 0;
  }
}
</style>
