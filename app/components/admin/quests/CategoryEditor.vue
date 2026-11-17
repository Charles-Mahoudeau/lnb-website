<script setup lang="ts">
// Creates a category, or edits one, in a side drawer (docs/quests.md). Closes with true once
// saved. A category's family and id can't change: quests name it by them.
import type { QuestCategory, QuestCategoryFamily } from '#shared/schemas/quests';

const props = defineProps<{ category?: QuestCategory; family?: QuestCategoryFamily }>();
const emit = defineEmits<{ close: [saved: boolean] }>();

const { t } = useI18n();
const toast = useToast();

const editing = computed(() => !!props.category);
const c = props.category;
const state = reactive({
  family: c?.family ?? props.family ?? 'individual',
  id: c?.id ?? '',
  nameFr: c?.name.fr ?? '',
  nameEn: c?.name.en ?? '',
  icon: c?.icon ?? 'minecraft:book',
  siteIcon: c?.siteIcon ?? '',
  sortOrder: c?.sortOrder ?? 0,
  subcategories: (c?.subcategories ?? []).map((sub) => ({
    id: sub.id,
    nameFr: sub.name.fr,
    nameEn: sub.name.en,
  })),
});
const pending = ref(false);

const familyItems = computed(() =>
  (['individual', 'server'] as const).map((value) => ({
    value,
    label: t(`admin.quests.categories.family.${value}`),
  })),
);

function body() {
  return {
    id: state.id.trim(),
    family: state.family,
    name: { fr: state.nameFr.trim(), en: state.nameEn.trim() },
    icon: state.icon.trim(),
    ...(state.siteIcon.trim() ? { siteIcon: state.siteIcon.trim() } : {}),
    sortOrder: state.sortOrder,
    subcategories: state.subcategories.map((sub) => ({
      id: sub.id.trim(),
      name: { fr: sub.nameFr.trim(), en: sub.nameEn.trim() },
    })),
  };
}

function failed(error: unknown) {
  const problem = error instanceof QuestError ? error.problem : 'failed';
  const key = problem === 'idTaken' || problem === 'categoryInUse' ? problem : ('invalid' as const);
  toast.add({
    title: t(`admin.quests.categories.errors.${key}`),
    description: error instanceof QuestError ? error.detail : undefined,
    color: 'error',
    icon: 'i-lucide-circle-alert',
  });
}

async function onSubmit() {
  pending.value = true;
  try {
    const category = body();
    if (editing.value) {
      await questAdminActions.updateCategory(category.family, category.id, category);
    } else {
      await questAdminActions.createCategory(category);
    }
    toast.add({
      title: t(editing.value ? 'admin.quests.categories.saved' : 'admin.quests.categories.created'),
      color: 'success',
      icon: 'i-lucide-circle-check',
    });
    emit('close', true);
  } catch (error) {
    failed(error);
  } finally {
    pending.value = false;
  }
}

async function onDelete() {
  pending.value = true;
  try {
    await questAdminActions.removeCategory(state.family, state.id);
    toast.add({
      title: t('admin.quests.categories.deleted'),
      color: 'success',
      icon: 'i-lucide-circle-check',
    });
    emit('close', true);
  } catch (error) {
    failed(error);
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <USlideover
    :title="
      editing
        ? t('admin.quests.categories.editTitle', { name: state.nameFr || state.id })
        : t('admin.quests.categories.newTitle')
    "
    :description="t('admin.quests.categories.editorLede')"
    :close="{ onClick: () => emit('close', false) }"
    @update:open="(open: boolean) => !open && emit('close', false)"
  >
    <template #body>
      <form id="category-form" class="flex flex-col gap-6" @submit.prevent="onSubmit">
        <UFormField v-if="!editing" :label="t('admin.quests.categories.familyLabel')" name="family">
          <UTabs v-model="state.family" :items="familyItems" variant="pill" :content="false" />
        </UFormField>

        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField
            :label="t('admin.quests.categories.id')"
            name="id"
            :help="t('admin.quests.categories.idHelp')"
            required
          >
            <UInput
              v-model="state.id"
              :disabled="editing"
              placeholder="early_game"
              class="w-full"
            />
          </UFormField>
          <UFormField
            :label="t('admin.quests.categories.order')"
            name="sortOrder"
            :help="t('admin.quests.categories.orderHelp')"
          >
            <UInput v-model.number="state.sortOrder" type="number" min="0" class="w-full" />
          </UFormField>
          <UFormField :label="t('admin.quests.editor.nameFr')" name="nameFr" required>
            <UInput v-model="state.nameFr" :maxlength="80" class="w-full" />
          </UFormField>
          <UFormField :label="t('admin.quests.editor.nameEn')" name="nameEn" required>
            <UInput v-model="state.nameEn" :maxlength="80" class="w-full" />
          </UFormField>
          <UFormField
            :label="t('admin.quests.categories.icon')"
            name="icon"
            :help="t('admin.quests.categories.iconHelp')"
            required
          >
            <UInput v-model="state.icon" placeholder="minecraft:wooden_pickaxe" class="w-full" />
          </UFormField>
          <UFormField
            :label="t('admin.quests.categories.siteIcon')"
            name="siteIcon"
            :help="t('admin.quests.categories.siteIconHelp')"
          >
            <UInput v-model="state.siteIcon" placeholder="i-lucide-sprout" class="w-full">
              <template v-if="state.siteIcon" #trailing>
                <UIcon :name="state.siteIcon" class="size-4" />
              </template>
            </UInput>
          </UFormField>
        </div>

        <fieldset class="flex flex-col gap-3">
          <legend class="mb-3 font-semibold text-highlighted">
            {{ t('admin.quests.categories.subcategories') }}
          </legend>
          <p class="text-sm text-muted">{{ t('admin.quests.categories.subcategoriesHelp') }}</p>
          <div
            v-for="(sub, index) in state.subcategories"
            :key="index"
            class="flex flex-wrap items-end gap-3 rounded-md bg-default p-3"
          >
            <UFormField
              :label="t('admin.quests.categories.id')"
              :name="`sub-${index}-id`"
              class="min-w-28 flex-1"
            >
              <UInput v-model="sub.id" size="md" class="w-full" />
            </UFormField>
            <UFormField
              :label="t('admin.quests.editor.nameFr')"
              :name="`sub-${index}-fr`"
              class="min-w-32 flex-1"
            >
              <UInput v-model="sub.nameFr" :maxlength="80" size="md" class="w-full" />
            </UFormField>
            <UFormField
              :label="t('admin.quests.editor.nameEn')"
              :name="`sub-${index}-en`"
              class="min-w-32 flex-1"
            >
              <UInput v-model="sub.nameEn" :maxlength="80" size="md" class="w-full" />
            </UFormField>
            <UButton
              color="neutral"
              variant="ghost"
              size="md"
              icon="i-lucide-trash-2"
              :aria-label="t('admin.quests.categories.removeSub')"
              @click="state.subcategories.splice(index, 1)"
            />
          </div>
          <UButton
            class="self-start"
            color="neutral"
            variant="ghost"
            size="md"
            icon="i-lucide-plus"
            :label="t('admin.quests.categories.addSub')"
            @click="state.subcategories.push({ id: '', nameFr: '', nameEn: '' })"
          />
        </fieldset>
      </form>
    </template>
    <template #footer>
      <div class="flex w-full flex-wrap justify-end gap-3">
        <UButton
          v-if="editing"
          class="mr-auto"
          color="error"
          variant="outline"
          :loading="pending"
          :label="t('admin.quests.categories.delete')"
          @click="onDelete"
        />
        <UButton
          color="neutral"
          variant="outline"
          :label="t('admin.cancel')"
          @click="emit('close', false)"
        />
        <UButton
          type="submit"
          form="category-form"
          :loading="pending"
          :label="t(editing ? 'admin.quests.editor.save' : 'admin.quests.editor.create')"
        />
      </div>
    </template>
  </USlideover>
</template>
