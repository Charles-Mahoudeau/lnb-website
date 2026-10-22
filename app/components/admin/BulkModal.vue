<script setup lang="ts">
import type { AdminBanBody, AdminBulkBody, AdminBulkResult } from '#shared/schemas/admin';

// Asks before an action on many accounts: who it applies to and who it leaves alone (a dry run
// on the server), plus what the action needs (a ban's reason and length, a role, the count to
// type for a deletion). Closes with what to add to the request, or null.
type Action = AdminBulkBody['action'];
type RoleChange = NonNullable<AdminBulkBody['roles']>;

const props = defineProps<{
  action: Action;
  selection: AdminBulkBody['selection'];
  /** A few of the people when picked by hand, to show who. Empty for "all matching". */
  people: { userId: string; name: string }[];
}>();
const emit = defineEmits<{ close: [extra: { ban?: AdminBanBody; roles?: RoleChange } | null] }>();

const { t, locale } = useI18n();
const actions = useAdminUserActions();

const DAY = 24 * 3600;
const presets = [
  { key: 'day', seconds: DAY },
  { key: 'week', seconds: 7 * DAY },
  { key: 'month', seconds: 30 * DAY },
  { key: 'permanent', seconds: null },
] as const;
type PresetKey = (typeof presets)[number]['key'];

const reason = ref('');
const preset = ref<PresetKey>('week');
const mode = ref<RoleChange['mode']>('add');
const role = ref<RoleChange['role']>('events-manager');
const typed = ref('');

const durationSeconds = computed(
  () => presets.find((item) => item.key === preset.value)?.seconds ?? null,
);
const endText = computed(() => {
  if (durationSeconds.value === null) return t('admin.banModal.never');
  const end = new Date(Date.now() + durationSeconds.value * 1000).toISOString();
  return t('admin.banModal.ends', { date: formatWardenDateTime(end, locale.value) });
});

const roleChange = computed<RoleChange | undefined>(() =>
  props.action === 'roles' ? { role: role.value, mode: mode.value } : undefined,
);

// Who the action applies to: asked again when the role change does.
const preview = ref<AdminBulkResult | null>(null);
const failed = ref(false);
async function check() {
  preview.value = null;
  failed.value = false;
  try {
    const result = await actions.bulk({
      action: props.action,
      selection: props.selection,
      roles: roleChange.value,
      dryRun: true,
    });
    preview.value = result;
  } catch {
    failed.value = true;
  }
}
onMounted(check);
watch(roleChange, check);

const applied = computed(() => preview.value?.applied ?? 0);
const everyone = computed(() => 'filters' in props.selection);
const chips = computed(() => props.people.slice(0, 6));
const more = computed(() => (preview.value?.total ?? props.people.length) - chips.value.length);

const ready = computed(() => {
  if (!preview.value || applied.value === 0) return false;
  if (props.action === 'ban') return reason.value.trim().length > 0;
  if (props.action === 'delete') return typed.value.trim() === String(applied.value);
  return true;
});

function submit() {
  if (!ready.value) return;
  emit('close', {
    ban:
      props.action === 'ban'
        ? { reason: reason.value.trim(), durationSeconds: durationSeconds.value }
        : undefined,
    roles: roleChange.value,
  });
}

const destructive = computed(() => props.action === 'ban' || props.action === 'delete');
const count = computed(() => preview.value?.total ?? props.people.length);
</script>

<template>
  <UModal
    :title="t(`admin.users.bulk.modal.title.${action}`, count)"
    :description="t(`admin.users.bulk.modal.body.${action}`)"
    :close="false"
  >
    <template #body>
      <form id="admin-bulk" class="flex flex-col gap-5" @submit.prevent="submit">
        <p v-if="failed" class="text-sm text-error">
          {{ t('admin.users.bulk.modal.checkFailed') }}
        </p>
        <p v-else-if="!preview" class="text-sm text-muted">
          {{ t('admin.users.bulk.modal.checking') }}
        </p>
        <template v-else>
          <p class="text-sm text-muted tabular-nums">
            <template v-if="applied === 0">{{ t('admin.users.bulk.modal.nobody') }}</template>
            <template v-else-if="preview.skipped">
              {{ t('admin.users.bulk.modal.applies', { applied, total: preview.total }) }}
            </template>
            <template v-else-if="everyone">{{ t('admin.users.bulk.modal.everyone') }}</template>
          </p>

          <div v-if="chips.length" class="flex flex-wrap gap-2">
            <span
              v-for="person in chips"
              :key="person.userId"
              class="flex items-center gap-2 rounded-full bg-accented py-0.5 pr-3 pl-0.5 text-sm"
            >
              <UAvatar :alt="person.name" size="2xs" :ui="avatarTint(person.userId)" />
              {{ person.name }}
            </span>
            <span v-if="more > 0" class="rounded-full bg-accented px-3 py-0.5 text-sm text-muted">
              {{ t('admin.users.bulk.modal.skippedMore', { n: more }) }}
            </span>
          </div>

          <UAlert
            v-if="preview.skipped"
            color="warning"
            variant="subtle"
            icon="i-lucide-circle-alert"
            :title="t('admin.users.bulk.modal.skipped', { n: preview.skipped })"
          >
            <template #description>
              <ul class="mt-1 flex flex-col gap-0.5">
                <li v-for="item in preview.skippedUsers" :key="item.userId">
                  {{ item.name ?? item.userId }}:
                  {{ t(`admin.users.bulk.modal.reason.${item.problem}`) }}
                </li>
                <li v-if="preview.skipped > preview.skippedUsers.length">
                  {{
                    t('admin.users.bulk.modal.skippedMore', {
                      n: preview.skipped - preview.skippedUsers.length,
                    })
                  }}
                </li>
              </ul>
            </template>
          </UAlert>
        </template>

        <template v-if="action === 'ban'">
          <UFormField
            :label="t('admin.banModal.reason')"
            :hint="t('admin.banModal.reasonHint')"
            required
          >
            <UTextarea v-model="reason" :rows="3" :maxlength="500" autoresize class="w-full" />
          </UFormField>
          <fieldset class="flex flex-col gap-2">
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
            <span class="text-sm text-muted">{{ endText }}</span>
          </fieldset>
        </template>

        <template v-if="action === 'roles'">
          <div class="flex flex-wrap gap-2">
            <UButton
              v-for="item in ['add', 'remove'] as const"
              :key="item"
              type="button"
              size="md"
              color="neutral"
              :variant="mode === item ? 'soft' : 'outline'"
              :aria-pressed="mode === item"
              :label="t(`admin.users.bulk.modal.${item}`)"
              @click="mode = item"
            />
          </div>
          <div class="flex flex-wrap gap-2">
            <UButton
              type="button"
              size="md"
              color="neutral"
              :variant="role === 'warden-admin' ? 'soft' : 'outline'"
              :aria-pressed="role === 'warden-admin'"
              :label="t('admin.roles.wardenAdmin')"
              @click="role = 'warden-admin'"
            />
            <UButton
              type="button"
              size="md"
              color="neutral"
              :variant="role === 'events-manager' ? 'soft' : 'outline'"
              :aria-pressed="role === 'events-manager'"
              :label="t('admin.roles.eventsManager')"
              @click="role = 'events-manager'"
            />
          </div>
        </template>

        <UFormField
          v-if="action === 'delete' && preview && applied > 0"
          :label="t('admin.users.bulk.modal.typeCount', { n: applied })"
        >
          <UInput v-model="typed" inputmode="numeric" autocomplete="off" class="w-full" />
        </UFormField>
      </form>
    </template>
    <template #footer>
      <div class="flex w-full flex-wrap justify-end gap-3">
        <UButton
          color="neutral"
          variant="soft"
          :label="t('admin.cancel')"
          @click="emit('close', null)"
        />
        <UButton
          type="submit"
          form="admin-bulk"
          :color="destructive ? 'error' : 'primary'"
          :variant="destructive ? 'outline' : 'solid'"
          :label="t(`admin.users.bulk.modal.confirm.${action}`, applied)"
          :disabled="!ready"
        />
      </div>
    </template>
  </UModal>
</template>
