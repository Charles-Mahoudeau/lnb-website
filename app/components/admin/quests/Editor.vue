<script setup lang="ts">
// Creates a quest, or edits one, in a side drawer (docs/quests.md). Closes with true once saved.
// A quest's id and family can't change after creation: the server and completions use them.
// Items are given as SNBT, the way the game saves a stack (`/quests reward add` captures one).
import {
  FLASH_OBJECTIVES,
  QUEST_CATEGORIES,
  QUEST_OBJECTIVES,
  questItemReward,
} from '#shared/schemas/quests';
import type { QuestDefinitionInput } from '#shared/schemas/quests';

const props = defineProps<{ quest?: QuestDefinitionInput }>();
const emit = defineEmits<{ close: [saved: boolean] }>();

const { t } = useI18n();
const toast = useToast();

const editing = computed(() => !!props.quest);
const q = props.quest;
const ind = q?.family === 'individual' ? q : undefined;
const srv = q?.family === 'server' ? q : undefined;
const fla = q?.family === 'flash' ? q : undefined;

const state = reactive({
  family: q?.family ?? 'individual',
  id: q?.id ?? '',
  nameFr: q?.name.fr ?? '',
  nameEn: q?.name.en ?? '',
  descriptionFr: q?.description?.fr ?? '',
  descriptionEn: q?.description?.en ?? '',
  icon: q?.icon ?? 'minecraft:stone',
  enabled: q?.enabled ?? true,
  objectiveType: q?.objective.type ?? 'mine',
  objectiveTarget: q?.objective.target ?? '',
  // individual
  category: ind?.category ?? 'mining',
  tiers: (ind?.tiers ?? [{ amount: 1000, reward: 50, items: [] }]).map((tier) => ({
    amount: tier.amount,
    reward: tier.reward,
    items: JSON.stringify(tier.items ?? [], null, 2),
  })),
  // server
  advancement: srv?.advancement ?? '',
  tier: srv?.tier ?? 'rare',
  reward: srv?.reward ?? 1000,
  ranks: (srv?.ranks ?? [100, 60, 20]).join(', '),
  restShare: srv?.restShare ?? 2,
  items: JSON.stringify(srv?.items ?? [], null, 2),
  hidden: srv?.hidden ?? false,
  // flash
  min: fla?.range.min ?? 5,
  max: fla?.range.max ?? 12,
  rewardPerUnit: fla?.rewardPerUnit ?? 4,
  weight: fla?.weight ?? 1,
  minPlayers: fla?.minPlayers ?? 2,
});
const pending = ref(false);
const openItems = ref<number | null>(null);

const familyItems = computed(() =>
  (['individual', 'server', 'flash'] as const).map((value) => ({
    value,
    label: t(`admin.quests.family.${value}`),
  })),
);
const objectiveItems = computed(() =>
  (state.family === 'flash' ? FLASH_OBJECTIVES : QUEST_OBJECTIVES).map((value) => ({
    value,
    label: t(`admin.quests.objective.${value}`),
  })),
);
const categoryItems = computed(() =>
  QUEST_CATEGORIES.map((value) => ({ value, label: t(`quests.category.${value}`) })),
);
const tierItems = computed(() =>
  (['rare', 'epic', 'legendary'] as const).map((value) => ({
    value,
    label: t(`quests.server.tier.${value}`),
  })),
);

function parseItems(text: string) {
  const value: unknown = JSON.parse(text || '[]');
  if (!Array.isArray(value)) throw new Error('items');
  return value.map((item) => questItemReward.parse(item));
}

function definition() {
  const base = {
    id: state.id.trim(),
    family: state.family,
    name: { fr: state.nameFr.trim(), en: state.nameEn.trim() },
    ...(state.descriptionFr || state.descriptionEn
      ? { description: { fr: state.descriptionFr.trim(), en: state.descriptionEn.trim() } }
      : {}),
    icon: state.icon.trim(),
    enabled: state.enabled,
    objective: {
      type: state.family === 'server' ? 'advancement' : state.objectiveType,
      ...(state.objectiveTarget.trim() ? { target: state.objectiveTarget.trim() } : {}),
    },
  };
  if (state.family === 'individual') {
    return {
      ...base,
      category: state.category,
      tiers: state.tiers.map((tier) => ({
        amount: tier.amount,
        reward: tier.reward,
        items: parseItems(tier.items),
      })),
    };
  }
  if (state.family === 'server') {
    return {
      ...base,
      advancement: state.advancement.trim(),
      tier: state.tier,
      reward: state.reward,
      ranks: state.ranks
        .split(',')
        .map((part) => Number(part.trim()))
        .filter((n) => !Number.isNaN(n)),
      restShare: state.restShare,
      items: parseItems(state.items),
      hidden: state.hidden,
    };
  }
  return {
    ...base,
    range: { min: state.min, max: state.max },
    rewardPerUnit: state.rewardPerUnit,
    weight: state.weight,
    minPlayers: state.minPlayers,
  };
}

async function onSubmit() {
  let body;
  try {
    body = definition();
  } catch {
    toast.add({
      title: t('admin.quests.editor.badItems'),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
    return;
  }
  pending.value = true;
  try {
    if (editing.value) {
      const { id: _id, enabled, ...rest } = body;
      await questAdminActions.update(state.id, { definition: rest, enabled });
    } else {
      await questAdminActions.create(body);
    }
    toast.add({
      title: t(editing.value ? 'admin.quests.editor.saved' : 'admin.quests.editor.created'),
      color: 'success',
      icon: 'i-lucide-circle-check',
    });
    emit('close', true);
  } catch (error) {
    const detail = error instanceof QuestError ? error.detail : undefined;
    const problem = error instanceof QuestError ? error.problem : 'failed';
    toast.add({
      title: t(
        problem === 'idTaken' ? 'admin.quests.errors.idTaken' : 'admin.quests.errors.invalid',
      ),
      description: detail,
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  } finally {
    pending.value = false;
  }
}

async function onDelete() {
  pending.value = true;
  try {
    await questAdminActions.remove(state.id);
    toast.add({
      title: t('admin.quests.editor.deleted'),
      color: 'success',
      icon: 'i-lucide-circle-check',
    });
    emit('close', true);
  } catch (error) {
    const problem = error instanceof QuestError ? error.problem : 'failed';
    toast.add({
      title: t(
        problem === 'questInUse' ? 'admin.quests.errors.questInUse' : 'admin.quests.errors.failed',
      ),
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
    :title="
      editing
        ? t('admin.quests.editor.editTitle', { name: state.nameFr || state.id })
        : t('admin.quests.editor.newTitle')
    "
    :description="
      editing ? t(`admin.quests.family.${state.family}`) : t('admin.quests.editor.newLede')
    "
    :close="{ onClick: () => emit('close', false) }"
    @update:open="(open: boolean) => !open && emit('close', false)"
  >
    <template #body>
      <form id="quest-form" class="flex flex-col gap-6" @submit.prevent="onSubmit">
        <UFormField v-if="!editing" :label="t('admin.quests.editor.family')" name="family">
          <UTabs v-model="state.family" :items="familyItems" variant="pill" :content="false" />
        </UFormField>

        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField
            :label="t('admin.quests.editor.id')"
            name="id"
            :help="t('admin.quests.editor.idHelp')"
            required
          >
            <UInput
              v-model="state.id"
              :disabled="editing"
              placeholder="mine_stone"
              class="w-full"
            />
          </UFormField>
          <UFormField :label="t('admin.quests.editor.icon')" name="icon" required>
            <UInput v-model="state.icon" placeholder="minecraft:stone" class="w-full" />
          </UFormField>
          <UFormField :label="t('admin.quests.editor.nameFr')" name="nameFr" required>
            <UInput v-model="state.nameFr" :maxlength="80" class="w-full" />
          </UFormField>
          <UFormField :label="t('admin.quests.editor.nameEn')" name="nameEn" required>
            <UInput v-model="state.nameEn" :maxlength="80" class="w-full" />
          </UFormField>
          <UFormField :label="t('admin.quests.editor.descriptionFr')" name="descriptionFr">
            <UInput v-model="state.descriptionFr" :maxlength="280" class="w-full" />
          </UFormField>
          <UFormField :label="t('admin.quests.editor.descriptionEn')" name="descriptionEn">
            <UInput v-model="state.descriptionEn" :maxlength="280" class="w-full" />
          </UFormField>
        </div>

        <fieldset class="flex flex-col gap-4">
          <legend class="mb-3 font-semibold text-highlighted">
            {{ t('admin.quests.editor.objective') }}
          </legend>
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField
              v-if="state.family !== 'server'"
              :label="t('admin.quests.editor.type')"
              name="type"
            >
              <USelect v-model="state.objectiveType" :items="objectiveItems" class="w-full" />
            </UFormField>
            <UFormField
              v-if="state.family === 'server'"
              :label="t('admin.quests.editor.advancement')"
              name="advancement"
              required
            >
              <UInput
                v-model="state.advancement"
                placeholder="minecraft:story/enter_the_nether"
                class="w-full"
              />
            </UFormField>
            <UFormField
              v-else
              :label="t('admin.quests.editor.target')"
              name="target"
              :help="t('admin.quests.editor.targetHelp')"
            >
              <UInput
                v-model="state.objectiveTarget"
                placeholder="minecraft:stone"
                class="w-full"
              />
            </UFormField>
            <UFormField
              v-if="state.family === 'individual'"
              :label="t('admin.quests.editor.category')"
              name="category"
            >
              <USelect v-model="state.category" :items="categoryItems" class="w-full" />
            </UFormField>
            <UFormField
              v-if="state.family === 'server'"
              :label="t('admin.quests.editor.tier')"
              name="tier"
            >
              <USelect v-model="state.tier" :items="tierItems" class="w-full" />
            </UFormField>
          </div>
        </fieldset>

        <fieldset v-if="state.family === 'individual'" class="flex flex-col gap-3">
          <legend class="mb-3 font-semibold text-highlighted">
            {{ t('admin.quests.editor.tiers') }}
          </legend>
          <p class="text-sm text-muted">{{ t('admin.quests.editor.tiersHelp') }}</p>
          <div
            v-for="(tier, index) in state.tiers"
            :key="index"
            class="flex flex-col gap-2 rounded-md bg-default p-3"
          >
            <div class="flex flex-wrap items-end gap-3">
              <UFormField
                :label="t('admin.quests.editor.amount')"
                :name="`tier-${index}-amount`"
                class="min-w-28 flex-1"
              >
                <UInput
                  v-model.number="tier.amount"
                  type="number"
                  min="1"
                  size="md"
                  class="w-full"
                />
              </UFormField>
              <UFormField
                :label="t('admin.quests.editor.base')"
                :name="`tier-${index}-reward`"
                class="min-w-28 flex-1"
              >
                <UInput
                  v-model.number="tier.reward"
                  type="number"
                  min="0"
                  size="md"
                  class="w-full"
                />
              </UFormField>
              <UButton
                color="neutral"
                variant="ghost"
                size="md"
                icon="i-lucide-package"
                :label="t('admin.quests.editor.items')"
                @click="openItems = openItems === index ? null : index"
              />
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
            <UTextarea
              v-if="openItems === index"
              v-model="tier.items"
              :rows="4"
              class="w-full"
              :aria-label="t('admin.quests.editor.itemsJson')"
            />
          </div>
          <UButton
            class="self-start"
            color="neutral"
            variant="ghost"
            size="md"
            icon="i-lucide-plus"
            :label="t('admin.quests.editor.addTier')"
            @click="
              state.tiers.push({
                amount: (state.tiers.at(-1)?.amount ?? 100) * 10,
                reward: 100,
                items: '[]',
              })
            "
          />
        </fieldset>

        <fieldset v-if="state.family === 'server'" class="flex flex-col gap-4">
          <legend class="mb-3 font-semibold text-highlighted">
            {{ t('admin.quests.editor.rewards') }}
          </legend>
          <div class="grid gap-4 sm:grid-cols-3">
            <UFormField
              :label="t('admin.quests.editor.base')"
              name="reward"
              :help="t('admin.quests.editor.baseHelp')"
            >
              <UInput v-model.number="state.reward" type="number" min="0" class="w-full" />
            </UFormField>
            <UFormField
              :label="t('admin.quests.editor.ranks')"
              name="ranks"
              :help="t('admin.quests.editor.ranksHelp')"
            >
              <UInput v-model="state.ranks" class="w-full" />
            </UFormField>
            <UFormField :label="t('admin.quests.editor.restShare')" name="restShare">
              <UInput
                v-model.number="state.restShare"
                type="number"
                min="0"
                max="100"
                class="w-full"
              />
            </UFormField>
          </div>
          <UFormField
            :label="t('admin.quests.editor.itemsJson')"
            name="items"
            :help="t('admin.quests.editor.itemsHelp')"
          >
            <UTextarea v-model="state.items" :rows="4" class="w-full" />
          </UFormField>
          <USwitch
            v-model="state.hidden"
            :label="t('admin.quests.editor.hidden')"
            :description="t('admin.quests.editor.hiddenHelp')"
          />
        </fieldset>

        <fieldset v-if="state.family === 'flash'" class="flex flex-col gap-4">
          <legend class="mb-3 font-semibold text-highlighted">
            {{ t('admin.quests.editor.race') }}
          </legend>
          <div class="grid gap-4 sm:grid-cols-3">
            <UFormField :label="t('admin.quests.editor.min')" name="min">
              <UInput v-model.number="state.min" type="number" min="1" class="w-full" />
            </UFormField>
            <UFormField :label="t('admin.quests.editor.max')" name="max">
              <UInput v-model.number="state.max" type="number" min="1" class="w-full" />
            </UFormField>
            <UFormField :label="t('admin.quests.editor.perUnit')" name="rewardPerUnit">
              <UInput
                v-model.number="state.rewardPerUnit"
                type="number"
                min="0"
                step="0.5"
                class="w-full"
              />
            </UFormField>
            <UFormField
              :label="t('admin.quests.editor.weight')"
              name="weight"
              :help="t('admin.quests.editor.weightHelp')"
            >
              <UInput v-model.number="state.weight" type="number" min="1" class="w-full" />
            </UFormField>
            <UFormField :label="t('admin.quests.editor.minPlayers')" name="minPlayers">
              <UInput v-model.number="state.minPlayers" type="number" min="1" class="w-full" />
            </UFormField>
          </div>
        </fieldset>

        <USwitch v-model="state.enabled" :label="t('admin.quests.editor.enabled')" />
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
          :label="t('admin.quests.editor.delete')"
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
          form="quest-form"
          :loading="pending"
          :label="t(editing ? 'admin.quests.editor.save' : 'admin.quests.editor.create')"
        />
      </div>
    </template>
  </USlideover>
</template>
