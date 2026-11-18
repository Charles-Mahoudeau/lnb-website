<script setup lang="ts">
import { ruleAnchor } from '#shared/utils/rules';

// The Minecraft server rules, in one raised section per category. Public, like the mod list.
// With the `rules` flag off the page says they are being rewritten.
definePageMeta({ auth: false });

const { t, locale } = useI18n();
useSeoMeta({ title: () => t('rules.title'), description: () => t('rules.lede') });

const { data } = await usePublicRules();
const categories = computed(() => data.value?.categories ?? []);

// The categories that are open, by ID. A link to a rule opens its category, and without one the
// first category is open.
const open = ref<Record<string, boolean>>({});
const highlighted = ref<string | null>(null);
const route = useRoute();

function showAnchor(hash: string) {
  const anchor = hash.replace(/^#/, '');
  const category = categories.value.find((item) =>
    item.rules.some((rule) => ruleAnchor(rule.ref) === anchor),
  );
  if (!category) return false;
  open.value = { ...open.value, [category.id]: true };
  highlighted.value = anchor;
  void nextTick(() => {
    document.getElementById(anchor)?.scrollIntoView({
      block: 'center',
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  });
  return true;
}

if (
  !categories.value.some((item) =>
    item.rules.some((rule) => `#${ruleAnchor(rule.ref)}` === route.hash),
  )
) {
  const first = categories.value[0];
  if (first) open.value = { [first.id]: true };
}
onMounted(() => {
  if (route.hash) showAnchor(route.hash);
  window.addEventListener('hashchange', onHashChange);
});
onBeforeUnmount(() => {
  window.removeEventListener('hashchange', onHashChange);
});
function onHashChange() {
  showAnchor(window.location.hash);
}

const allOpen = computed(
  () => categories.value.length > 0 && categories.value.every((item) => open.value[item.id]),
);
function toggleAll() {
  const next = !allOpen.value;
  open.value = Object.fromEntries(categories.value.map((item) => [item.id, next]));
}
</script>

<template>
  <UContainer class="flex max-w-4xl flex-col gap-8 py-12">
    <div class="flex flex-col gap-3">
      <h1 class="text-4xl font-bold text-highlighted">{{ t('rules.title') }}</h1>
      <p class="max-w-prose text-muted">{{ t('rules.lede') }}</p>
      <p v-if="data?.updatedAt" class="text-sm text-muted">
        {{ t('rules.updated', { date: formatWardenDate(data.updatedAt, locale) }) }}
      </p>
    </div>

    <section
      v-if="data && !data.enabled"
      class="flex flex-col items-start gap-3 rounded-lg bg-elevated p-6"
    >
      <IconTile icon="i-lucide-pencil-line" />
      <h2 class="text-xl font-bold text-highlighted">{{ t('rules.rewriting.title') }}</h2>
      <p class="max-w-prose text-muted">{{ t('rules.rewriting.body') }}</p>
    </section>

    <p v-else-if="!categories.length" class="rounded-lg bg-elevated p-6 text-muted">
      {{ t('rules.empty') }}
    </p>

    <template v-else>
      <div class="flex justify-end">
        <UButton
          color="neutral"
          variant="ghost"
          size="md"
          :icon="allOpen ? 'i-lucide-chevrons-down-up' : 'i-lucide-chevrons-up-down'"
          :label="allOpen ? t('rules.collapseAll') : t('rules.expandAll')"
          @click="toggleAll"
        />
      </div>
      <div class="flex flex-col gap-2">
        <RulesCategory
          v-for="category in categories"
          :key="category.id"
          :open="open[category.id] ?? false"
          :category="category"
          :highlighted="highlighted"
          @update:open="(value: boolean) => (open[category.id] = value)"
        />
      </div>
    </template>
  </UContainer>
</template>
