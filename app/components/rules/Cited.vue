<script setup lang="ts">
import type { RuleCitation } from '#shared/schemas/rules';
import { ruleAnchor, ruleText } from '#shared/utils/rules';

// The rules a warning or a ban names, as small links to the rule on the rules page. The number
// and title are the ones kept when the sanction was made, so they never change afterwards.
defineProps<{ rules: RuleCitation[] }>();

const { locale } = useI18n();
</script>

<template>
  <ul v-if="rules.length" class="flex flex-wrap gap-2">
    <li v-for="cited in rules" :key="cited.ruleId">
      <ULink
        :to="`/minecraft/rules#${ruleAnchor(cited.ref)}`"
        class="inline-flex max-w-full items-center gap-1.5 rounded-full bg-accented px-3 py-0.5 text-sm text-default hover:text-highlighted"
      >
        <span class="font-semibold text-muted tabular-nums">{{ cited.number }}</span>
        <span class="truncate">{{ ruleText(cited.title, locale) }}</span>
      </ULink>
    </li>
  </ul>
</template>
