<script setup lang="ts">
import type { AnticheatBulkBody } from '#shared/schemas/anticheat';

// Asks before an action on the players of a file. It states how many players it applies to and
// what the action needs (a reason, a ban's length, a penalty's points). Closes with the body to
// send, or null. Follows the rules of AdminBulkModal in docs/design.md.
const props = defineProps<{
  action: AnticheatBulkBody['action'];
  people: { userId: string; name: string }[];
}>();
const emit = defineEmits<{ close: [body: Omit<AnticheatBulkBody, 'userIds'> | null] }>();

const { t } = useI18n();

const DAY = 24 * 3600;
const presets = [
  { key: 'day', seconds: DAY },
  { key: 'week', seconds: 7 * DAY },
  { key: 'month', seconds: 30 * DAY },
  { key: 'permanent', seconds: null },
] as const;

const reason = ref('');
const preset = ref<(typeof presets)[number]['key']>('week');
const points = ref(5);

const chips = computed(() => props.people.slice(0, 6));
const more = computed(() => props.people.length - chips.value.length);
const ready = computed(
  () => reason.value.trim().length > 0 && (props.action !== 'penalty' || points.value >= 1),
);

function submit() {
  if (!ready.value) return;
  const seconds = presets.find((item) => item.key === preset.value)?.seconds ?? null;
  emit('close', {
    action: props.action,
    reason: reason.value.trim(),
    ...(props.action === 'ban' ? { durationSeconds: seconds } : {}),
    ...(props.action === 'penalty' ? { points: points.value } : {}),
  });
}
</script>

<template>
  <UModal
    :title="t(`admin.anticheat.bulk.title.${action}`, people.length)"
    :description="t(`admin.anticheat.bulk.body.${action}`)"
    :close="false"
  >
    <template #body>
      <form id="anticheat-bulk" class="flex flex-col gap-5" @submit.prevent="submit">
        <p class="text-sm text-muted tabular-nums">
          {{ t('admin.anticheat.bulk.applies', people.length) }}
        </p>
        <div class="flex flex-wrap gap-2">
          <span
            v-for="person in chips"
            :key="person.userId"
            class="flex items-center gap-2 rounded-full bg-accented py-0.5 pr-3 pl-0.5 text-sm"
          >
            <UserAvatar :user-id="person.userId" :name="person.name" size="2xs" />
            {{ person.name }}
          </span>
          <span v-if="more > 0" class="rounded-full bg-accented px-3 py-0.5 text-sm text-muted">
            {{ t('admin.anticheat.bulk.more', { n: more }) }}
          </span>
        </div>

        <UFormField
          :label="t('admin.banModal.reason')"
          :hint="t('admin.banModal.reasonHint')"
          required
        >
          <UTextarea v-model="reason" :rows="3" :maxlength="500" autoresize class="w-full" />
        </UFormField>

        <fieldset v-if="action === 'ban'" class="flex flex-col gap-2">
          <legend class="mb-2 text-sm font-medium">{{ t('admin.banModal.length') }}</legend>
          <div class="flex flex-wrap gap-2">
            <UButton
              v-for="item in presets"
              :key="item.key"
              type="button"
              size="md"
              color="neutral"
              :variant="preset === item.key ? 'soft' : 'outline'"
              :aria-pressed="preset === item.key"
              :label="t(`admin.banModal.presets.${item.key}`)"
              @click="preset = item.key"
            />
          </div>
        </fieldset>

        <UFormField v-if="action === 'penalty'" :label="t('admin.anticheat.bulk.points')">
          <UInputNumber v-model="points" :min="1" :max="50" />
        </UFormField>
      </form>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          color="neutral"
          variant="ghost"
          :label="t('admin.anticheat.cancel')"
          @click="emit('close', null)"
        />
        <UButton
          v-if="action === 'ban'"
          type="submit"
          form="anticheat-bulk"
          color="error"
          variant="outline"
          :disabled="!ready"
          :label="t('admin.anticheat.bulk.confirm.ban', people.length)"
        />
        <UButton
          v-else
          type="submit"
          form="anticheat-bulk"
          :disabled="!ready"
          :label="t(`admin.anticheat.bulk.confirm.${action}`, people.length)"
        />
      </div>
    </template>
  </UModal>
</template>
