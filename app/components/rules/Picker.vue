<script setup lang="ts">
import { RULES_PER_SANCTION } from '#shared/schemas/rules';
import { ruleText } from '#shared/utils/rules';

// Chooses the rules a warning or a ban names, as toggle chips grouped by category. Optional: a
// sanction without a rule is fine. Used by moderators, so it reads the admin list.
const selected = defineModel<string[]>({ required: true });

const { t, locale } = useI18n();
const { data } = await useAdminRules();

const groups = computed(() =>
  (data.value?.categories ?? [])
    .map((category) => ({
      category,
      rules: category.rules.filter((rule) => !rule.retired),
    }))
    .filter((group) => group.rules.length),
);

function toggle(id: string) {
  selected.value = selected.value.includes(id)
    ? selected.value.filter((item) => item !== id)
    : [...selected.value, id];
}
</script>

<template>
  <fieldset v-if="groups.length" class="flex flex-col gap-3">
    <legend class="mb-1 text-sm font-medium">
      {{ t('rules.picker.label') }}
      <span class="font-normal text-muted">{{
        t('rules.picker.optional', { max: RULES_PER_SANCTION })
      }}</span>
    </legend>
    <div v-for="group in groups" :key="group.category.id" class="flex flex-col gap-2">
      <span class="text-xs font-semibold tracking-wide text-muted uppercase">
        {{ group.category.number }}. {{ ruleText(group.category.name, locale) }}
      </span>
      <div class="flex flex-wrap gap-2">
        <UButton
          v-for="rule in group.rules"
          :key="rule.id"
          type="button"
          size="sm"
          class="max-w-full rounded-full"
          :color="selected.includes(rule.id) ? 'secondary' : 'neutral'"
          :variant="selected.includes(rule.id) ? 'soft' : 'outline'"
          :aria-pressed="selected.includes(rule.id)"
          :disabled="!selected.includes(rule.id) && selected.length >= RULES_PER_SANCTION"
          @click="toggle(rule.id)"
        >
          <span class="tabular-nums">{{ rule.number }}</span>
          <span class="truncate">{{ ruleText(rule.title, locale) }}</span>
        </UButton>
      </div>
    </div>
  </fieldset>
</template>
