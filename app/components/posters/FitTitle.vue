<script setup lang="ts">
// A title that keeps the line breaks it was given and shrinks, from `max` down to `min` pixels,
// until its longest line fits the width and all its lines fit `maxHeight`. When it can't fit even
// at `min` (an event's long name, with no breaks yet), it also wraps at spaces and shrinks again.
// Font, line height and letter spacing come from the template's class. With `lines`, each line is
// its own span (`.poster-fit-line`), for templates that style lines one by one.
const props = defineProps<{
  text: string;
  max: number;
  min: number;
  maxHeight: number;
  lines?: boolean;
}>();

const el = useTemplateRef<HTMLElement>('el');
const size = ref(props.max);
const wrap = ref(false);
const text = computed(() =>
  props.text
    .split('\n')
    .map((line) => line.trim())
    .join('\n'),
);

async function fit() {
  const node = el.value;
  if (!node) return;
  // Measured in the final font, which may not have started loading yet: `fonts.ready` alone can
  // resolve before it's even asked for. Test DOMs have no font loading.
  if ('fonts' in document) {
    const style = getComputedStyle(node);
    await document.fonts.load(`${style.fontWeight} 100px ${style.fontFamily}`, text.value);
    await document.fonts.ready;
  }
  const fits = (px: number) => {
    node.style.fontSize = `${String(px)}px`;
    return node.scrollWidth <= node.clientWidth + 1 && node.scrollHeight <= props.maxHeight + 1;
  };
  const largest = () => {
    let low = props.min;
    let high = props.max;
    if (fits(high)) return high;
    while (high - low > 1) {
      const middle = Math.floor((low + high) / 2);
      if (fits(middle)) low = middle;
      else high = middle;
    }
    return low;
  };
  node.style.whiteSpace = 'pre';
  let best = largest();
  const wraps = !fits(best);
  if (wraps) {
    node.style.whiteSpace = 'pre-line';
    best = largest();
  }
  node.style.fontSize = `${String(best)}px`;
  wrap.value = wraps;
  size.value = best;
}

// A font that arrives late (its stylesheet still loading) changes every measure: fit again.
const refit = () => void fit();
onMounted(() => {
  void fit();
  if ('fonts' in document) document.fonts.addEventListener('loadingdone', refit);
});
onBeforeUnmount(() => {
  if ('fonts' in document) document.fonts.removeEventListener('loadingdone', refit);
});
watch(
  () => [text.value, props.max, props.min, props.maxHeight],
  () => nextTick(fit),
);
defineExpose({ size });
</script>

<template>
  <h1
    ref="el"
    class="poster-fit-title"
    :style="{ fontSize: `${size}px`, whiteSpace: wrap ? 'pre-line' : 'pre' }"
  >
    <template v-if="props.lines">
      <span v-for="(line, index) in text.split('\n')" :key="index" class="poster-fit-line">{{
        line
      }}</span>
    </template>
    <template v-else>{{ text }}</template>
  </h1>
</template>

<style scoped>
.poster-fit-title {
  display: block;
  width: 100%;
  margin: 0;
}
</style>
