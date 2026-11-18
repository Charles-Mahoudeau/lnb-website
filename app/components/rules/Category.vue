<script setup lang="ts">
import type { RulePublicCategory } from '#shared/schemas/rules';
import { ruleAnchor, ruleText } from '#shared/utils/rules';

// One category of the rules page: a raised section that opens on click, with its rules as rows
// under it. Each rule has an anchor (r<ref>) and a button that copies its link.
const props = defineProps<{ category: RulePublicCategory; highlighted?: string | null }>();
const open = defineModel<boolean>('open', { required: true });

const { t, locale } = useI18n();
const toast = useToast();

async function copyLink(ref: number) {
  const url = `${window.location.origin}${window.location.pathname}#${ruleAnchor(ref)}`;
  try {
    await navigator.clipboard.writeText(url);
    toast.add({ title: t('rules.copied'), color: 'success', icon: 'i-lucide-circle-check' });
  } catch {
    toast.add({ title: t('rules.copyFailed'), color: 'error', icon: 'i-lucide-circle-alert' });
  }
}
</script>

<template>
  <UCollapsible v-model:open="open" class="rounded-lg bg-elevated">
    <button
      type="button"
      class="flex w-full items-center gap-4 rounded-lg p-4 text-left focus-visible:outline-2 focus-visible:outline-primary"
      :aria-expanded="open"
    >
      <IconTile :icon="`i-lucide-${props.category.icon}`" />
      <h2 class="min-w-0 flex-1 text-xl font-bold text-highlighted">
        <span class="tabular-nums">{{ props.category.number }}.</span>
        {{ ruleText(props.category.name, locale) }}
      </h2>
      <span class="hidden text-sm text-muted tabular-nums sm:inline">
        {{ t('rules.count', { count: props.category.rules.length }, props.category.rules.length) }}
      </span>
      <UIcon
        name="i-lucide-chevron-down"
        class="size-5 shrink-0 text-muted transition-transform motion-reduce:transition-none"
        :class="{ 'rotate-180': open }"
      />
    </button>
    <template #content>
      <ul class="flex flex-col divide-y divide-default px-4 pb-2 sm:pl-18">
        <li
          v-for="item in props.category.rules"
          :id="ruleAnchor(item.ref)"
          :key="item.id"
          class="group flex scroll-mt-24 items-start gap-3 py-4"
          :class="{ 'rounded-md bg-secondary/15 px-3': props.highlighted === ruleAnchor(item.ref) }"
        >
          <span class="w-9 shrink-0 font-semibold text-muted tabular-nums">{{ item.number }}</span>
          <div class="flex min-w-0 flex-1 flex-col gap-1">
            <h3 class="font-sans text-base font-semibold text-highlighted">
              {{ ruleText(item.title, locale) }}
            </h3>
            <p class="max-w-prose text-muted">{{ ruleText(item.text, locale) }}</p>
          </div>
          <UButton
            icon="i-lucide-link"
            size="md"
            color="neutral"
            variant="ghost"
            class="shrink-0 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100"
            :aria-label="t('rules.copyLink', { number: item.number })"
            @click="copyLink(item.ref)"
          />
        </li>
      </ul>
    </template>
  </UCollapsible>
</template>
