<script setup lang="ts">
import { ruleBody } from '#shared/schemas/rules';
import type { RuleAdminCategory, RuleAdminItem } from '#shared/schemas/rules';

// Adds a rule, or edits one, in a side drawer so the list keeps its place. Closes with true once
// something changed. English is required, French is optional (English shows when it is empty).
const props = defineProps<{
  rule?: RuleAdminItem;
  categoryId: string;
  categories: RuleAdminCategory[];
}>();
const emit = defineEmits<{ close: [saved: boolean] }>();

const { t } = useI18n();
const toast = useToast();

const state = reactive({
  categoryId: props.categoryId,
  title: { en: props.rule?.title.en ?? '', fr: props.rule?.title.fr ?? '' },
  text: { en: props.rule?.text.en ?? '', fr: props.rule?.text.fr ?? '' },
});
const lang = ref<'en' | 'fr'>('en');
const pending = ref(false);

const langItems = [
  { label: 'English', value: 'en' },
  { label: 'Français', value: 'fr' },
];
const categoryItems = computed(() =>
  props.categories.map((category) => ({
    value: category.id,
    label: category.name.en,
  })),
);

function fail(error: unknown) {
  const problem = error instanceof RuleError ? error.problem : 'failed';
  toast.add({
    title: t(`admin.rules.errors.${problem}`),
    color: 'error',
    icon: 'i-lucide-circle-alert',
  });
}

async function run(change: () => Promise<unknown>, done: string) {
  pending.value = true;
  try {
    await change();
    toast.add({ title: t(done), color: 'success', icon: 'i-lucide-circle-check' });
    emit('close', true);
  } catch (error) {
    fail(error);
  } finally {
    pending.value = false;
  }
}

function onSubmit() {
  void run(
    () => (props.rule ? ruleActions.updateRule(props.rule.id, state) : ruleActions.addRule(state)),
    props.rule ? 'admin.rules.rule.saved' : 'admin.rules.rule.added',
  );
}
</script>

<template>
  <USlideover
    :title="t(props.rule ? 'admin.rules.rule.editTitle' : 'admin.rules.rule.addTitle')"
    :description="
      props.rule?.number ? t('admin.rules.rule.number', { number: props.rule.number }) : undefined
    "
    :close="{ onClick: () => emit('close', false) }"
    @update:open="(open: boolean) => !open && emit('close', false)"
  >
    <template #body>
      <UForm
        id="rule-form"
        :schema="ruleBody"
        :state="state"
        class="flex flex-col gap-5"
        @submit="onSubmit"
      >
        <UFormField :label="t('admin.rules.rule.category')" name="categoryId">
          <USelect
            v-model="state.categoryId"
            :items="categoryItems"
            value-key="value"
            class="w-full"
          />
        </UFormField>
        <UTabs v-model="lang" :items="langItems" :content="false" color="neutral" size="md" />
        <UFormField
          :label="t('admin.rules.rule.title')"
          :name="`title.${lang}`"
          :required="lang === 'en'"
        >
          <UInput v-model="state.title[lang]" :maxlength="120" class="w-full" />
        </UFormField>
        <UFormField
          :label="t('admin.rules.rule.text')"
          :name="`text.${lang}`"
          :required="lang === 'en'"
          :help="t(lang === 'en' ? 'admin.rules.rule.textHelpEn' : 'admin.rules.rule.textHelpFr')"
        >
          <UTextarea
            v-model="state.text[lang]"
            :maxlength="600"
            :rows="4"
            autoresize
            class="w-full"
          />
        </UFormField>
        <p v-if="props.rule" class="text-sm text-muted">
          {{ t('admin.rules.rule.anchor', { anchor: `r${props.rule.ref}` }) }}
          {{
            t('admin.rules.rule.citations', { count: props.rule.citations }, props.rule.citations)
          }}
        </p>
      </UForm>
    </template>
    <template #footer>
      <div class="flex w-full flex-wrap items-center justify-between gap-3">
        <UButton
          v-if="props.rule && !props.rule.retired"
          color="error"
          variant="outline"
          :disabled="pending"
          :label="t('admin.rules.rule.retire')"
          @click="
            run(() => ruleActions.setRetired(props.rule!.id, true), 'admin.rules.rule.retired')
          "
        />
        <UButton
          v-else-if="props.rule"
          color="neutral"
          variant="soft"
          :disabled="pending"
          :label="t('admin.rules.rule.restore')"
          @click="
            run(() => ruleActions.setRetired(props.rule!.id, false), 'admin.rules.rule.restored')
          "
        />
        <span v-else />
        <UButton
          type="submit"
          form="rule-form"
          :loading="pending"
          :label="t(props.rule ? 'admin.rules.rule.save' : 'admin.rules.rule.add')"
        />
      </div>
    </template>
  </USlideover>
</template>
