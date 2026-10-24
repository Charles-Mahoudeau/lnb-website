<script setup lang="ts">
import { schoolForTenant } from '#shared/utils/schools';

// The top of every poster: the LNB logo and name, then the schools' logos.
const props = defineProps<{ schools: string[] }>();
</script>

<template>
  <div class="poster-header">
    <div class="poster-brand">
      <img src="/logo.svg" alt="" class="poster-brand-logo" />
      <span class="poster-brand-name">La Nuit Blanche</span>
    </div>
    <div class="poster-schools">
      <template v-for="tid in props.schools" :key="tid">
        <img
          v-if="SCHOOL_LOGOS[tid]"
          :src="SCHOOL_LOGOS[tid].src"
          :alt="schoolForTenant(tid)"
          class="poster-school-logo"
          :style="{
            width: `${SCHOOL_LOGOS[tid].width}px`,
            height: `${SCHOOL_LOGOS[tid].height}px`,
          }"
        />
        <span v-else class="poster-school-name">{{ schoolForTenant(tid) }}</span>
      </template>
    </div>
  </div>
</template>

<style scoped>
.poster-header {
  position: absolute;
  top: 40px;
  right: 48px;
  left: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 48px;
}

.poster-brand {
  display: flex;
  align-items: center;
  gap: 12px;
}

.poster-brand-logo {
  width: 48px;
  height: 48px;
}

.poster-brand-name {
  font-family: var(--poster-display);
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.015em;
}

.poster-schools {
  display: flex;
  align-items: center;
  gap: 18px;
}

.poster-school-logo {
  object-fit: contain;
}

.poster-school-name {
  font-family: var(--poster-display);
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.01em;
}
</style>
