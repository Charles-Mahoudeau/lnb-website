<script setup lang="ts">
import type { PosterAccent } from '#shared/utils/posters';

// A poster at its print size, 794 × 1123 CSS pixels (A4 at 96 dpi). Its colours are fixed, the
// same in light and dark mode: they are print tokens, not the site's (docs/design.md, Posters).
// Scale it from the outside with a transform.
const props = defineProps<{ poster: PosterRender }>();

const colors = computed(() => {
  const c = props.poster.content.colors;
  const of = (accent: PosterAccent) => POSTER_ACCENT_COLORS[accent];
  return {
    '--poster-kicker': of(c.kicker).ink,
    '--poster-date': of(c.date).ink,
    '--poster-label': of(c.label).ink,
    '--poster-strap': of(c.strap).ink,
    '--poster-tape': of(c.tape).tape,
    '--poster-sticker': of(c.sticker).sticker,
  };
});

// Printed text follows the poster's language, which may not be the page's: its messages are
// loaded before the poster renders, on the server too.
const { $i18n } = useNuxtApp();
await $i18n.loadLocaleMessages(props.poster.locale);
watch(
  () => props.poster.locale,
  (locale) => $i18n.loadLocaleMessages(locale),
);

const templates = {
  banner: resolveComponent('PostersTemplatesBanner'),
  artTitle: resolveComponent('PostersTemplatesArtTitle'),
  ticket: resolveComponent('PostersTemplatesBanner'),
  labels: resolveComponent('PostersTemplatesBanner'),
  collage: resolveComponent('PostersTemplatesBanner'),
  badge: resolveComponent('PostersTemplatesBanner'),
};
</script>

<template>
  <div class="poster" :lang="props.poster.locale" :style="colors">
    <component :is="templates[props.poster.template]" :poster="props.poster" />
  </div>
</template>

<style>
.poster {
  --poster-bg: #eff1fb;
  --poster-ink: #0b0e27;
  --poster-muted: #565c8c;
  --poster-line: #bcc2e2;
  --poster-display: 'Unbounded', 'Figtree', sans-serif;
  position: relative;
  box-sizing: border-box;
  width: 794px;
  height: 1123px;
  overflow: hidden;
  background: var(--poster-bg);
  color: var(--poster-ink);
  font-family: 'Figtree', ui-sans-serif, system-ui, sans-serif;
  text-align: left;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

.poster *,
.poster *::before,
.poster *::after {
  box-sizing: border-box;
}
</style>
