<script setup lang="ts">
import type { InterestDraft } from '~/utils/partner-events';

import { INTEREST_TEXT_MAX } from '#shared/schemas/partner-events';
import type { PartnerGameKey } from '#shared/schemas/partner-events';

// The details of the games a student ticked: in-game name and rank for each, the consent line and
// the one solid red button of the page. The page owns the state (see the partner event page).

defineProps<{
  /** The ticked games, in the page's order. */
  games: PartnerGameKey[];
  /** Whether the student has something saved already. */
  saved: boolean;
  pending: boolean;
}>();
const draft = defineModel<Partial<Record<PartnerGameKey, InterestDraft>>>('draft', {
  required: true,
});
const consent = defineModel<boolean>('consent', { required: true });
defineEmits<{ save: []; withdraw: [] }>();

const { t } = useI18n();
</script>

<template>
  <form
    class="flex flex-col gap-6 rounded-lg bg-elevated p-5 sm:p-6"
    @submit.prevent="$emit('save')"
  >
    <h3 class="text-xl text-highlighted">{{ t('partnerEvents.form.title') }}</h3>

    <fieldset
      v-for="key in games"
      :key="key"
      class="flex flex-col gap-3 border-t border-default pt-5 first-of-type:border-t-0 first-of-type:pt-0"
    >
      <legend class="font-semibold text-highlighted">
        {{ t(`partnerEvents.games.${partnerGameMessageKey(key)}`) }}
      </legend>
      <div v-if="draft[key]" class="grid gap-4 sm:grid-cols-2">
        <UFormField :label="t('partnerEvents.form.inGameName')">
          <UInput
            v-model="draft[key]!.inGameName"
            :maxlength="INTEREST_TEXT_MAX"
            :placeholder="t('partnerEvents.form.inGameNameHint')"
            class="w-full"
          />
        </UFormField>
        <UFormField :label="t('partnerEvents.form.rank')">
          <UInput
            v-model="draft[key]!.rank"
            :maxlength="INTEREST_TEXT_MAX"
            :placeholder="t('partnerEvents.form.rankHint')"
            class="w-full"
          />
        </UFormField>
      </div>
    </fieldset>

    <UCheckbox v-model="consent" :label="t('partnerEvents.form.consent')" />

    <div class="flex flex-wrap items-center gap-3">
      <UButton
        type="submit"
        :label="t('partnerEvents.form.save')"
        :loading="pending"
        :disabled="!consent || games.length === 0"
      />
      <UButton
        v-if="saved"
        color="neutral"
        variant="ghost"
        :label="t('partnerEvents.form.withdraw')"
        :disabled="pending"
        @click="$emit('withdraw')"
      />
    </div>
  </form>
</template>
