<script setup lang="ts">
// An amount of LNBits typed as text, with up to two decimals ("12", "12.5", "12,50"), and kept as
// integer cents in the v-model: undefined while the field is empty or not an amount. More decimals
// are refused with a message. `invalid` says whether the text is wrong, for the form to block.
// See docs/economy.md, Units.
const props = defineProps<{
  allowZero?: boolean;
  /** The most, in whole LNBits. */
  maxLnbits?: number;
  placeholder?: string;
}>();
const cents = defineModel<number | undefined>({ default: undefined });
const invalid = defineModel<boolean>('invalid', { default: false });
const { t } = useI18n();

const text = ref(cents.value === undefined ? '' : centsToInput(cents.value));
const error = ref<string | null>(null);

function parse(value: string) {
  return parseLnbitsInput(value, { allowZero: props.allowZero, maxLnbits: props.maxLnbits });
}

// A value set from outside (a form that loads its data) shows up in the field, unless it is
// what the field already says.
watch(cents, (value) => {
  const typed = text.value.trim() ? parse(text.value) : undefined;
  if ((typed?.ok ? typed.cents : undefined) === value) return;
  text.value = value === undefined ? '' : centsToInput(value);
  error.value = null;
  invalid.value = false;
});

function onInput(value: string) {
  text.value = value;
  if (!value.trim()) {
    error.value = null;
    invalid.value = false;
    cents.value = undefined;
    return;
  }
  const result = parse(value);
  if (result.ok) {
    error.value = null;
    invalid.value = false;
    cents.value = result.cents;
  } else {
    error.value = t(`economy.amountInput.${result.error}`);
    invalid.value = true;
    cents.value = undefined;
  }
}
</script>

<template>
  <div class="flex flex-col gap-1">
    <UInput
      :model-value="text"
      inputmode="decimal"
      autocomplete="off"
      class="w-full"
      :color="error ? 'error' : undefined"
      :placeholder="placeholder ?? t('economy.amountInput.placeholder')"
      :aria-invalid="error ? 'true' : undefined"
      @update:model-value="onInput(String($event))"
    />
    <p v-if="error" class="text-sm text-error" role="alert">{{ error }}</p>
  </div>
</template>
