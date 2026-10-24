<script setup lang="ts">
// A title that keeps the line breaks it was given and shrinks, from `max` down to `min` pixels,
// until its longest line fits the width and all its lines fit `maxHeight`. Font, line height
// and letter spacing come from the template's class.
const props = defineProps<{ text: string; max: number; min: number; maxHeight: number }>();

const el = useTemplateRef<HTMLElement>('el');
const size = ref(props.max);
const text = computed(() =>
  props.text
    .split('\n')
    .map((line) => line.trim())
    .join('\n'),
);

async function fit() {
  const node = el.value;
  if (!node) return;
  // Measured in the final font. Test DOMs have no font loading.
  if ('fonts' in document) await document.fonts.ready;
  const fits = (px: number) => {
    node.style.fontSize = `${String(px)}px`;
    return node.scrollWidth <= node.clientWidth + 1 && node.scrollHeight <= props.maxHeight + 1;
  };
  let low = props.min;
  let high = props.max;
  if (fits(high)) low = high;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (fits(middle)) low = middle;
    else high = middle;
  }
  node.style.fontSize = `${String(low)}px`;
  size.value = low;
}

onMounted(fit);
watch(
  () => [text.value, props.max, props.min, props.maxHeight],
  () => nextTick(fit),
);
defineExpose({ size });
</script>

<template>
  <h1 ref="el" class="poster-fit-title" :style="{ fontSize: `${size}px` }">{{ text }}</h1>
</template>

<style scoped>
.poster-fit-title {
  display: block;
  width: 100%;
  margin: 0;
  white-space: pre;
}
</style>
