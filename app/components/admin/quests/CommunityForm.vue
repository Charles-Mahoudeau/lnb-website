<script setup lang="ts">
// Plans a community quest in a side drawer (docs/quests.md). Dates are entered in Paris time.
// Closes with true once saved.
import { FLASH_OBJECTIVES } from '#shared/schemas/quests';
import { parisLocalToIso } from '#shared/utils/paris-time';

const emit = defineEmits<{ close: [saved: boolean] }>();
const { t } = useI18n();
const toast = useToast();

const monday = new Date();
monday.setDate(monday.getDate() + ((8 - monday.getDay()) % 7 || 7));
const day = (date: Date) => date.toISOString().slice(0, 10);
const sunday = new Date(monday);
sunday.setDate(monday.getDate() + 6);

const firstType: (typeof FLASH_OBJECTIVES)[number] = 'mine';

const state = reactive({
  titleFr: '',
  titleEn: '',
  type: firstType,
  target: '',
  goal: 1_000_000,
  startsLocal: `${day(monday)}T00:00`,
  endsLocal: `${day(sunday)}T23:59`,
  tiers: [
    { name: 'Bronze', at: 50, reward: 1000 },
    { name: 'Argent', at: 100, reward: 2500 },
    { name: 'Or', at: 150, reward: 5000 },
  ],
  thresholdPercent: 0.5,
  topBonusPercent: 20,
});
const pending = ref(false);
const objectiveItems = computed(() =>
  FLASH_OBJECTIVES.map((value) => ({ value, label: t(`admin.quests.objective.${value}`) })),
);

async function onSubmit() {
  const startsAt = parisLocalToIso(state.startsLocal);
  const endsAt = parisLocalToIso(state.endsLocal);
  if (!startsAt || !endsAt || endsAt <= startsAt) {
    toast.add({
      title: t('admin.quests.community.badDates'),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
    return;
  }
  pending.value = true;
  try {
    await questAdminActions.createCommunity({
      startsAt,
      endsAt,
      definition: {
        title: { fr: state.titleFr.trim(), en: state.titleEn.trim() },
        objective: {
          type: state.type,
          ...(state.target.trim() ? { target: state.target.trim() } : {}),
        },
        goal: state.goal,
        tiers: state.tiers.map((tier) => ({
          name: tier.name,
          at: tier.at,
          reward: tier.reward,
        })),
        thresholdPercent: state.thresholdPercent,
        topBonusPercent: state.topBonusPercent,
      },
    });
    toast.add({
      title: t('admin.quests.community.planned'),
      color: 'success',
      icon: 'i-lucide-circle-check',
    });
    emit('close', true);
  } catch (error) {
    toast.add({
      title: t('admin.quests.errors.invalid'),
      description: error instanceof QuestError ? error.detail : undefined,
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <USlideover
    :title="t('admin.quests.community.newTitle')"
    :description="t('admin.quests.community.newLede')"
    :close="{ onClick: () => emit('close', false) }"
    @update:open="(open: boolean) => !open && emit('close', false)"
  >
    <template #body>
      <form id="community-form" class="flex flex-col gap-6" @submit.prevent="onSubmit">
        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField :label="t('admin.quests.editor.nameFr')" name="titleFr" required>
            <UInput v-model="state.titleFr" :maxlength="80" class="w-full" />
          </UFormField>
          <UFormField :label="t('admin.quests.editor.nameEn')" name="titleEn" required>
            <UInput v-model="state.titleEn" :maxlength="80" class="w-full" />
          </UFormField>
          <UFormField :label="t('admin.quests.editor.type')" name="type">
            <USelect v-model="state.type" :items="objectiveItems" class="w-full" />
          </UFormField>
          <UFormField
            :label="t('admin.quests.editor.target')"
            name="target"
            :help="t('admin.quests.editor.targetHelp')"
          >
            <UInput
              v-model="state.target"
              placeholder="#minecraft:mineable/pickaxe"
              class="w-full"
            />
          </UFormField>
          <UFormField :label="t('admin.quests.community.goal')" name="goal">
            <UInput v-model.number="state.goal" type="number" min="1" class="w-full" />
          </UFormField>
          <div />
          <UFormField :label="t('admin.quests.community.starts')" name="starts">
            <UInput v-model="state.startsLocal" type="datetime-local" class="w-full" />
          </UFormField>
          <UFormField :label="t('admin.quests.community.ends')" name="ends">
            <UInput v-model="state.endsLocal" type="datetime-local" class="w-full" />
          </UFormField>
        </div>

        <fieldset class="flex flex-col gap-3">
          <legend class="mb-3 font-semibold text-highlighted">
            {{ t('admin.quests.community.tiers') }}
          </legend>
          <div
            v-for="(tier, index) in state.tiers"
            :key="index"
            class="flex flex-wrap items-end gap-3"
          >
            <UFormField
              :label="t('admin.quests.community.tierName')"
              :name="`tier-${index}-name`"
              class="min-w-24 flex-1"
            >
              <UInput v-model="tier.name" size="md" class="w-full" />
            </UFormField>
            <UFormField
              :label="t('admin.quests.community.at')"
              :name="`tier-${index}-at`"
              class="w-28"
            >
              <UInput v-model.number="tier.at" type="number" min="1" size="md" class="w-full" />
            </UFormField>
            <UFormField
              :label="t('admin.quests.editor.base')"
              :name="`tier-${index}-reward`"
              class="w-32"
            >
              <UInput v-model.number="tier.reward" type="number" min="0" size="md" class="w-full" />
            </UFormField>
            <UButton
              v-if="state.tiers.length > 1"
              color="neutral"
              variant="ghost"
              size="md"
              icon="i-lucide-trash-2"
              :aria-label="t('admin.quests.editor.removeTier')"
              @click="state.tiers.splice(index, 1)"
            />
          </div>
          <UButton
            class="self-start"
            color="neutral"
            variant="ghost"
            size="md"
            icon="i-lucide-plus"
            :label="t('admin.quests.editor.addTier')"
            @click="state.tiers.push({ name: '', at: 200, reward: 5000 })"
          />
        </fieldset>

        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField
            :label="t('admin.quests.community.threshold')"
            name="threshold"
            :help="t('admin.quests.community.thresholdHelp')"
          >
            <UInput
              v-model.number="state.thresholdPercent"
              type="number"
              step="0.1"
              min="0"
              class="w-full"
            />
          </UFormField>
          <UFormField :label="t('admin.quests.community.bonus')" name="bonus">
            <UInput v-model.number="state.topBonusPercent" type="number" min="0" class="w-full" />
          </UFormField>
        </div>
      </form>
    </template>
    <template #footer>
      <div class="flex w-full flex-wrap justify-end gap-3">
        <UButton
          color="neutral"
          variant="outline"
          :label="t('admin.cancel')"
          @click="emit('close', false)"
        />
        <UButton
          type="submit"
          form="community-form"
          :loading="pending"
          :label="t('admin.quests.community.plan')"
        />
      </div>
    </template>
  </USlideover>
</template>
