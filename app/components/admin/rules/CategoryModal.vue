<script setup lang="ts">
import { RULE_ICONS, ruleCategoryBody } from '#shared/schemas/rules';
import type { RuleAdminCategory } from '#shared/schemas/rules';

// Adds a category of rules, or edits one: its name in both languages and its icon. Closes with
// true once saved, or false.
const props = defineProps<{ category?: RuleAdminCategory }>();
const emit = defineEmits<{ close: [saved: boolean] }>();

const { t } = useI18n();
const toast = useToast();

const state = reactive({
  icon: props.category?.icon ?? RULE_ICONS[0],
  name: { en: props.category?.name.en ?? '', fr: props.category?.name.fr ?? '' },
});
const pending = ref(false);

async function onSubmit() {
  pending.value = true;
  try {
    if (props.category) await ruleActions.updateCategory(props.category.id, state);
    else await ruleActions.addCategory(state);
    toast.add({
      title: t(props.category ? 'admin.rules.category.saved' : 'admin.rules.category.added'),
      color: 'success',
      icon: 'i-lucide-circle-check',
    });
    emit('close', true);
  } catch (error) {
    const problem = error instanceof RuleError ? error.problem : 'failed';
    toast.add({
      title: t(`admin.rules.errors.${problem}`),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <UModal
    :title="t(props.category ? 'admin.rules.category.editTitle' : 'admin.rules.category.addTitle')"
    :close="false"
  >
    <template #body>
      <UForm
        id="rule-category-form"
        :schema="ruleCategoryBody"
        :state="state"
        class="flex flex-col gap-5"
        @submit="onSubmit"
      >
        <UFormField :label="t('admin.rules.category.nameEn')" name="name.en" required>
          <UInput v-model="state.name.en" :maxlength="80" autofocus class="w-full" />
        </UFormField>
        <UFormField
          :label="t('admin.rules.category.nameFr')"
          name="name.fr"
          :help="t('admin.rules.category.nameHelp')"
        >
          <UInput v-model="state.name.fr" :maxlength="80" class="w-full" />
        </UFormField>
        <fieldset class="flex flex-col gap-2">
          <legend class="mb-2 text-sm font-medium">{{ t('admin.rules.category.icon') }}</legend>
          <div class="flex flex-wrap gap-2">
            <UButton
              v-for="icon in RULE_ICONS"
              :key="icon"
              type="button"
              size="md"
              color="neutral"
              :variant="state.icon === icon ? 'soft' : 'outline'"
              :icon="`i-lucide-${icon}`"
              :aria-pressed="state.icon === icon"
              :aria-label="t(`admin.rules.icons.${icon}`)"
              @click="state.icon = icon"
            />
          </div>
        </fieldset>
      </UForm>
    </template>
    <template #footer>
      <div class="flex w-full flex-wrap justify-end gap-3">
        <UButton
          color="neutral"
          variant="soft"
          :label="t('admin.cancel')"
          @click="emit('close', false)"
        />
        <UButton
          type="submit"
          form="rule-category-form"
          :loading="pending"
          :label="t(props.category ? 'admin.rules.category.save' : 'admin.rules.category.add')"
        />
      </div>
    </template>
  </UModal>
</template>
