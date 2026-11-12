<script setup lang="ts">
import type { AnticheatPlayerBand } from '#shared/schemas/anticheat';

// A player's standing as a pill in the status colors. State only.
defineProps<{ band: AnticheatPlayerBand }>();
const { t } = useI18n();

const COLORS = { trusted: 'success', normal: 'neutral', held: 'warning', zero: 'error' } as const;
</script>

<template>
  <UBadge
    :color="COLORS[band]"
    variant="subtle"
    :label="t(`admin.anticheat.playerBands.${band}`)"
  />
</template>
