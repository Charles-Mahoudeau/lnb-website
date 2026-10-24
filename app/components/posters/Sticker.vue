<script setup lang="ts">
// The round tilted sticker: a big line, a small one, a big one. Place and size it from the
// template with `left`, `top` and `--size`.
const props = defineProps<{ lines: [string, string, string] }>();
</script>

<template>
  <div class="poster-sticker">
    <span class="poster-big">{{ props.lines[0] }}</span>
    <span v-if="props.lines[1]" class="poster-small">{{ props.lines[1] }}</span>
    <span v-if="props.lines[2]" class="poster-big">{{ props.lines[2] }}</span>
  </div>
</template>

<style scoped>
.poster-sticker {
  --size: 168px;
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  width: var(--size);
  height: var(--size);
  padding: 16px;
  border-radius: 9999px;
  background: var(--poster-sticker);
  color: #ffffff;
  font-family: var(--poster-display);
  text-align: center;
  transform: rotate(-12deg);
}

.poster-big {
  font-size: calc(var(--size) / 6);
  font-weight: 700;
  line-height: 1;
}

.poster-small {
  font-size: calc(var(--size) / 12);
  font-weight: 500;
  line-height: 1.2;
}
</style>
