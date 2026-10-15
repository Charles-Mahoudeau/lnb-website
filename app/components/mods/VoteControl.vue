<script setup lang="ts">
// Up, score, down in one pill. Your vote is state, so it's marked in neutral (docs/design.md).
// Clicking your current vote clears it. `blocked` says why voting isn't possible, as a tooltip.
const props = defineProps<{
  score: number;
  up: number;
  down: number;
  myVote: -1 | 0 | 1;
  name: string;
  blocked?: string | null;
  pending?: boolean;
}>();

const emit = defineEmits<{ vote: [value: -1 | 0 | 1] }>();

const { t } = useI18n();

function onClick(value: -1 | 1) {
  emit('vote', props.myVote === value ? 0 : value);
}
</script>

<template>
  <UTooltip :text="props.blocked ?? undefined" :disabled="!props.blocked">
    <div
      class="inline-flex shrink-0 items-center gap-0.5 rounded-md bg-default p-0.5"
      role="group"
      :aria-label="t('mods.vote.group', { name: props.name })"
    >
      <UButton
        size="md"
        square
        icon="i-lucide-arrow-big-up"
        color="neutral"
        :variant="props.myVote === 1 ? 'soft' : 'ghost'"
        :class="props.myVote === 1 ? 'text-highlighted' : 'text-muted'"
        :aria-label="t('mods.vote.up')"
        :aria-pressed="props.myVote === 1"
        :disabled="!!props.blocked || props.pending"
        @click="onClick(1)"
      />
      <UTooltip :text="t('mods.vote.split', { up: props.up, down: props.down })">
        <span
          class="min-w-8 text-center font-semibold text-highlighted tabular-nums"
          :aria-label="t('mods.vote.score', { score: props.score, up: props.up, down: props.down })"
        >
          {{ props.score }}
        </span>
      </UTooltip>
      <UButton
        size="md"
        square
        icon="i-lucide-arrow-big-down"
        color="neutral"
        :variant="props.myVote === -1 ? 'soft' : 'ghost'"
        :class="props.myVote === -1 ? 'text-highlighted' : 'text-muted'"
        :aria-label="t('mods.vote.down')"
        :aria-pressed="props.myVote === -1"
        :disabled="!!props.blocked || props.pending"
        @click="onClick(-1)"
      />
    </div>
  </UTooltip>
</template>
