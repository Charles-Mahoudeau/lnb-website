<script setup lang="ts">
import { teamMemberBody } from '#shared/schemas/team';
import type { TeamAdminMember, TeamAdminPole, TeamUserOption } from '#shared/schemas/team';

// Adds an account to the team, or edits a member. Closes with true once saved, or false.
const props = defineProps<{
  poles: TeamAdminPole[];
  poleId: string;
  member?: TeamAdminMember;
}>();
const emit = defineEmits<{ close: [saved: boolean] }>();

const { t } = useI18n();
const toast = useToast();

const state = reactive({
  userId: props.member?.userId ?? '',
  poleId: props.poleId,
  role: { en: props.member?.role.en ?? '', fr: props.member?.role.fr ?? '' },
  bio: { en: props.member?.bio.en ?? '', fr: props.member?.bio.fr ?? '' },
  visible: props.member?.visible ?? true,
});
const pending = ref(false);

const poleItems = computed(() =>
  props.poles.map((pole) => ({ value: pole.id, label: pole.name.en })),
);

// The account is picked from a search, only when adding: a member's account never changes.
const search = ref('');
const results = ref<TeamUserOption[]>([]);
const picked = ref<TeamUserOption>();
let timer: ReturnType<typeof setTimeout> | undefined;
watch(search, (q) => {
  clearTimeout(timer);
  if (!q.trim()) {
    results.value = [];
    return;
  }
  timer = setTimeout(() => {
    teamActions
      .searchUsers(q.trim())
      .then((found) => (results.value = found.items))
      .catch(() => (results.value = []));
  }, 250);
});
onBeforeUnmount(() => {
  clearTimeout(timer);
});

function pick(option: TeamUserOption) {
  picked.value = option;
  state.userId = option.userId;
  results.value = [];
  search.value = '';
}

async function onSubmit() {
  pending.value = true;
  try {
    if (props.member) {
      const { userId: _userId, ...patch } = state;
      await teamActions.updateMember(props.member.userId, patch);
    } else {
      await teamActions.addMember(state);
    }
    toast.add({
      title: t(props.member ? 'admin.team.member.saved' : 'admin.team.member.added'),
      color: 'success',
      icon: 'i-lucide-circle-check',
    });
    emit('close', true);
  } catch (error) {
    const problem = error instanceof TeamError ? error.problem : 'failed';
    toast.add({
      title: t(`admin.team.errors.${problem}`),
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
    :title="t(props.member ? 'admin.team.member.editTitle' : 'admin.team.member.addTitle')"
    :close="false"
  >
    <template #body>
      <UForm
        id="team-member"
        :schema="teamMemberBody"
        :state="state"
        class="flex flex-col gap-5"
        @submit="onSubmit"
      >
        <UFormField :label="t('admin.team.member.account')" name="userId" required>
          <div v-if="props.member || picked" class="flex items-center gap-3">
            <UAvatar
              :src="(props.member?.image ?? picked?.image) || undefined"
              :alt="props.member?.name ?? picked?.name"
              :ui="avatarTint(state.userId)"
              class="text-sm"
            />
            <div class="flex min-w-0 flex-col">
              <span class="font-semibold text-highlighted">
                {{ props.member?.name ?? picked?.name }}
              </span>
              <span class="truncate text-sm text-muted">
                {{ props.member?.email ?? picked?.email }}
              </span>
            </div>
            <UButton
              v-if="!props.member"
              class="ml-auto"
              color="neutral"
              variant="ghost"
              size="md"
              :label="t('admin.team.edit')"
              @click="
                picked = undefined;
                state.userId = '';
              "
            />
          </div>
          <div v-else class="flex flex-col gap-2">
            <UInput
              v-model="search"
              icon="i-lucide-search"
              :placeholder="t('admin.team.member.search')"
              autofocus
              class="w-full"
            />
            <ul v-if="results.length" class="flex flex-col rounded-md bg-elevated p-1">
              <li v-for="option in results" :key="option.userId">
                <button
                  type="button"
                  class="flex w-full items-center gap-3 rounded-sm px-2 py-1.5 text-left hover:bg-accented"
                  @click="pick(option)"
                >
                  <UAvatar
                    :src="option.image ?? undefined"
                    :alt="option.name"
                    size="md"
                    :ui="avatarTint(option.userId)"
                    class="text-xs"
                  />
                  <span class="flex min-w-0 flex-col">
                    <span class="font-semibold text-highlighted">{{ option.name }}</span>
                    <span class="truncate text-sm text-muted">
                      {{ option.email }}
                    </span>
                  </span>
                  <UBadge
                    v-if="option.school"
                    class="ml-auto"
                    color="neutral"
                    variant="soft"
                    size="sm"
                    :label="option.school"
                  />
                </button>
              </li>
            </ul>
            <p v-else-if="search.trim()" class="text-sm text-muted">
              {{ t('admin.team.member.noResults') }}
            </p>
          </div>
        </UFormField>
        <UFormField :label="t('admin.team.member.pole')" name="poleId">
          <USelect v-model="state.poleId" :items="poleItems" value-key="value" class="w-full" />
        </UFormField>
        <UFormField :label="t('admin.team.member.roleEn')" name="role.en" required>
          <UInput v-model="state.role.en" :maxlength="60" class="w-full" />
        </UFormField>
        <UFormField :label="t('admin.team.member.roleFr')" name="role.fr" required>
          <UInput v-model="state.role.fr" :maxlength="60" class="w-full" />
        </UFormField>
        <UFormField
          :label="t('admin.team.member.bioEn')"
          :help="t('admin.team.member.bioHelp')"
          name="bio.en"
        >
          <UTextarea v-model="state.bio.en" :maxlength="300" :rows="2" class="w-full" />
        </UFormField>
        <UFormField :label="t('admin.team.member.bioFr')" name="bio.fr">
          <UTextarea v-model="state.bio.fr" :maxlength="300" :rows="2" class="w-full" />
        </UFormField>
        <USwitch v-model="state.visible" :label="t('admin.team.member.visible')" />
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
          form="team-member"
          :loading="pending"
          :label="t(props.member ? 'admin.team.member.save' : 'admin.team.member.add')"
        />
      </div>
    </template>
  </UModal>
</template>
