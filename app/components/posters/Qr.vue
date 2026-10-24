<script setup lang="ts">
import { encode } from 'uqr';

// The QR code on its white card, holding the poster's short link. Without a link yet (a poster
// not saved), a dashed placeholder. `--size` sets the card's side.
const props = defineProps<{ url: string | null; placeholder: string }>();

const code = computed(() => {
  if (!props.url) return null;
  const { size, data } = encode(props.url, { ecc: 'M', border: 0 });
  let path = '';
  data.forEach((row, y) => {
    row.forEach((on, x) => {
      if (on) path += `M${String(x)} ${String(y)}h1v1h-1z`;
    });
  });
  return { size, path };
});
</script>

<template>
  <div class="poster-card">
    <svg
      v-if="code"
      :viewBox="`0 0 ${code.size} ${code.size}`"
      class="poster-code"
      shape-rendering="crispEdges"
      role="img"
      :aria-label="props.url ?? undefined"
    >
      <path :d="code.path" fill="#0b0e27" />
    </svg>
    <div v-else class="poster-placeholder">{{ props.placeholder }}</div>
  </div>
</template>

<style scoped>
.poster-card {
  display: flex;
  flex: none;
  width: var(--size, 152px);
  height: var(--size, 152px);
  padding: calc(var(--size, 152px) / 19);
  border-radius: 9px;
  background: #ffffff;
}

.poster-code {
  width: 100%;
  height: 100%;
}

.poster-placeholder {
  display: flex;
  flex-grow: 1;
  align-items: center;
  justify-content: center;
  padding: 8px;
  border: 2px dashed var(--poster-muted);
  color: var(--poster-muted);
  font-size: 13px;
  font-weight: 600;
  text-align: center;
}
</style>
