<script setup lang="ts">
// A poster scaled down to `width` pixels, for the library and the editor. The poster keeps its
// print layout and is shrunk with a transform, so it looks the same at every size.
const props = defineProps<{ poster: PosterRender; width: number }>();

const scale = computed(() => props.width / POSTER_WIDTH);
</script>

<template>
  <div
    class="relative shrink-0 overflow-hidden rounded-sm"
    :style="{ width: `${props.width}px`, height: `${Math.round(POSTER_HEIGHT * scale)}px` }"
  >
    <div class="absolute top-0 left-0 origin-top-left" :style="{ transform: `scale(${scale})` }">
      <PostersPoster :poster="props.poster" />
    </div>
  </div>
</template>
