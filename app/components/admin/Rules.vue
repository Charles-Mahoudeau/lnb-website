<script setup lang="ts">
import { AdminRulesCategoryModal, AdminRulesRuleDrawer, WardenConfirmModal } from '#components';

import type { RuleAdminCategory, RuleAdminItem } from '#shared/schemas/rules';
import { ruleText } from '#shared/utils/rules';

// The rules: one raised section per category, rules as rows with arrows, an edit drawer and a
// retire button. The numbers shown are the ones the public page and the sanctions use.
const { t, locale } = useI18n();
const toast = useToast();
const overlay = useOverlay();
const { isEnabled } = useFlags();

const { data, error, refresh } = await useAdminRules();
const categories = computed(() => data.value?.categories ?? []);

const categoryModal = overlay.create(AdminRulesCategoryModal);
const ruleDrawer = overlay.create(AdminRulesRuleDrawer);
const confirm = overlay.create(WardenConfirmModal);

function fail(caught: unknown) {
  const problem = caught instanceof RuleError ? caught.problem : 'failed';
  toast.add({
    title: t(`admin.rules.errors.${problem}`),
    color: 'error',
    icon: 'i-lucide-circle-alert',
  });
}

/** Runs a change, then reloads the list whatever happens, so the page shows what is stored. */
async function run(change: () => Promise<unknown>, done?: string) {
  try {
    await change();
    if (done) toast.add({ title: t(done), color: 'success', icon: 'i-lucide-circle-check' });
  } catch (caught) {
    fail(caught);
  }
  await refresh();
}

async function onAddCategory() {
  const added: unknown = await categoryModal.open({}).result;
  if (added === true) await refresh();
}
async function onEditCategory(category: RuleAdminCategory) {
  const saved: unknown = await categoryModal.open({ category }).result;
  if (saved === true) await refresh();
}
async function onDeleteCategory(category: RuleAdminCategory) {
  const confirmed: unknown = await confirm.open({
    title: t('admin.rules.category.deleteTitle', { name: category.name.en }),
    description: t('admin.rules.category.deleteLede'),
    confirmLabel: t('admin.rules.category.delete'),
    cancelLabel: t('admin.cancel'),
    destructive: true,
  }).result;
  if (confirmed === true)
    await run(() => ruleActions.removeCategory(category.id), 'admin.rules.category.deleted');
}
async function onRule(categoryId: string, rule?: RuleAdminItem) {
  const saved: unknown = await ruleDrawer.open({
    rule,
    categoryId,
    categories: categories.value,
  }).result;
  if (saved === true) await refresh();
}

const loadingDraft = ref(false);
async function onDraft() {
  loadingDraft.value = true;
  await run(() => ruleActions.loadDraft(), 'admin.rules.draft.loaded');
  loadingDraft.value = false;
}
</script>

<template>
  <UAlert
    v-if="error || !data"
    color="error"
    variant="subtle"
    icon="i-lucide-circle-alert"
    :description="t('admin.rules.errors.failed')"
  />
  <div v-else class="flex max-w-4xl flex-col gap-6">
    <p class="text-muted">{{ t('admin.rules.note') }}</p>

    <UAlert
      v-if="!isEnabled('rules')"
      color="warning"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      :description="t('admin.rules.flagOff')"
    />

    <section
      v-if="!categories.length"
      class="flex flex-col items-start gap-3 rounded-lg bg-elevated p-6"
    >
      <h2 class="text-xl font-bold text-highlighted">{{ t('admin.rules.draft.title') }}</h2>
      <p class="max-w-prose text-muted">{{ t('admin.rules.draft.body') }}</p>
      <div class="flex flex-wrap gap-3">
        <UButton
          color="neutral"
          variant="soft"
          icon="i-lucide-file-text"
          :loading="loadingDraft"
          :label="t('admin.rules.draft.button')"
          @click="onDraft"
        />
        <UButton
          color="neutral"
          variant="outline"
          icon="i-lucide-plus"
          :label="t('admin.rules.addCategory')"
          @click="onAddCategory"
        />
      </div>
    </section>

    <section
      v-for="(category, categoryIndex) in categories"
      :key="category.id"
      class="flex flex-col gap-3 rounded-lg bg-elevated p-5"
    >
      <div class="flex flex-wrap items-center gap-3">
        <IconTile :icon="`i-lucide-${category.icon}`" />
        <div class="flex min-w-0 flex-1 flex-col">
          <h2 class="text-xl font-bold text-highlighted">
            <span v-if="category.number" class="tabular-nums">{{ category.number }}.</span>
            {{ category.name.en }}
          </h2>
          <p class="text-sm text-muted">
            {{ category.name.fr || t('admin.rules.noFrench') }}
          </p>
        </div>
        <div class="flex items-center gap-1">
          <UButton
            icon="i-lucide-arrow-up"
            size="md"
            color="neutral"
            variant="ghost"
            :aria-label="t('admin.rules.category.moveUp')"
            :disabled="categoryIndex === 0"
            @click="run(() => ruleActions.moveCategory(category.id, 'up'))"
          />
          <UButton
            icon="i-lucide-arrow-down"
            size="md"
            color="neutral"
            variant="ghost"
            :aria-label="t('admin.rules.category.moveDown')"
            :disabled="categoryIndex === categories.length - 1"
            @click="run(() => ruleActions.moveCategory(category.id, 'down'))"
          />
          <UButton
            size="md"
            color="neutral"
            variant="ghost"
            :label="t('admin.rules.edit')"
            @click="onEditCategory(category)"
          />
          <UButton
            size="md"
            color="error"
            variant="outline"
            :disabled="category.rules.length > 0"
            :title="category.rules.length ? t('admin.rules.category.deleteBlocked') : undefined"
            :label="t('admin.rules.delete')"
            @click="onDeleteCategory(category)"
          />
        </div>
      </div>

      <ul v-if="category.rules.length" class="flex flex-col gap-1">
        <li
          v-for="(rule, ruleIndex) in category.rules"
          :key="rule.id"
          class="flex flex-wrap items-center gap-3 rounded-md bg-default px-3 py-2"
          :class="{ 'opacity-60': rule.retired }"
        >
          <span class="w-10 shrink-0 font-semibold text-muted tabular-nums">
            {{ rule.number ?? '·' }}
          </span>
          <div class="flex min-w-0 flex-1 flex-col">
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-semibold text-highlighted">{{ rule.title.en }}</span>
              <UBadge
                v-if="rule.retired"
                color="neutral"
                variant="soft"
                size="sm"
                :label="t('admin.rules.badges.retired')"
              />
              <UBadge
                v-if="!rule.title.fr || !rule.text.fr"
                color="warning"
                variant="outline"
                size="sm"
                :label="t('admin.rules.badges.noFrench')"
              />
            </div>
            <span class="truncate text-sm text-muted">{{ ruleText(rule.text, locale) }}</span>
          </div>
          <div class="flex items-center gap-1">
            <UButton
              icon="i-lucide-arrow-up"
              size="md"
              color="neutral"
              variant="ghost"
              :aria-label="t('admin.rules.rule.moveUp')"
              :disabled="rule.retired || ruleIndex === 0"
              @click="run(() => ruleActions.moveRule(rule.id, 'up'))"
            />
            <UButton
              icon="i-lucide-arrow-down"
              size="md"
              color="neutral"
              variant="ghost"
              :aria-label="t('admin.rules.rule.moveDown')"
              :disabled="rule.retired || ruleIndex === category.rules.length - 1"
              @click="run(() => ruleActions.moveRule(rule.id, 'down'))"
            />
            <UButton
              size="md"
              color="neutral"
              variant="ghost"
              :label="t('admin.rules.edit')"
              @click="onRule(category.id, rule)"
            />
          </div>
        </li>
      </ul>
      <p v-else class="text-sm text-muted">{{ t('admin.rules.noneInCategory') }}</p>

      <div>
        <UButton
          icon="i-lucide-plus"
          size="md"
          color="neutral"
          variant="soft"
          :label="t('admin.rules.addRule')"
          @click="onRule(category.id)"
        />
      </div>
    </section>

    <div v-if="categories.length">
      <UButton
        icon="i-lucide-plus"
        color="neutral"
        variant="outline"
        :label="t('admin.rules.addCategory')"
        @click="onAddCategory"
      />
    </div>
  </div>
</template>
