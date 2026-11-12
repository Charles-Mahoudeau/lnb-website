<script setup lang="ts">
import type { AnticheatStatus } from '#shared/schemas/anticheat';

// A file's admin label as a pill in the status colors. State only, never decoration.
const props = defineProps<{ status: AnticheatStatus | null }>();
const { t } = useI18n();

const COLORS = {
  approved: 'success',
  accepted: 'success',
  review: 'warning',
  refused: 'error',
  banned: 'error',
  pending: 'neutral',
} as const;

const status = computed(() => props.status ?? 'pending');
</script>

<template>
  <UBadge :color="COLORS[status]" variant="subtle" :label="t(`admin.anticheat.status.${status}`)" />
</template>
