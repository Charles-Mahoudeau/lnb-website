<script setup lang="ts">
import { AdminTeamMemberModal, AdminTeamPoleModal } from '#components';

import type { TeamAdminMember, TeamAdminPole } from '#shared/schemas/team';

// The team: the join link, then each pole with its members. Order is set with the arrows, and a
// switch hides a member without removing them.
const { t } = useI18n();
const toast = useToast();
const overlay = useOverlay();
const { isEnabled } = useFlags();

const { data, error, refresh } = await useAdminTeam();

const poles = computed(() => data.value?.poles ?? []);

const poleModal = overlay.create(AdminTeamPoleModal);
const memberModal = overlay.create(AdminTeamMemberModal);

function fail(caught: unknown) {
  const problem = caught instanceof TeamError ? caught.problem : 'failed';
  toast.add({
    title: t(`admin.team.errors.${problem}`),
    color: 'error',
    icon: 'i-lucide-circle-alert',
  });
}

/** Runs a change, then reloads the team whatever happens, so the page shows what is stored. */
async function run(change: () => Promise<unknown>, done?: string) {
  try {
    await change();
    if (done) toast.add({ title: t(done), color: 'success', icon: 'i-lucide-circle-check' });
  } catch (caught) {
    fail(caught);
  }
  await refresh();
}

const joinUrl = ref(data.value?.joinUrl ?? '');
const savingJoin = ref(false);
const joinValid = computed(
  () => !joinUrl.value.trim() || /^https:\/\/\S+\.\S+/.test(joinUrl.value.trim()),
);
async function saveJoin() {
  savingJoin.value = true;
  await run(() => teamActions.setSettings({ joinUrl: joinUrl.value }), 'admin.team.join.saved');
  joinUrl.value = data.value?.joinUrl ?? '';
  savingJoin.value = false;
}

async function onEditPole(pole: TeamAdminPole) {
  if (await poleModal.open({ pole }).result) await refresh();
}
async function onDeletePole(pole: TeamAdminPole) {
  await run(() => teamActions.deletePole(pole.id), 'admin.team.pole.deleted');
}
async function onAddMember(pole: TeamAdminPole) {
  if (await memberModal.open({ poles: poles.value, poleId: pole.id }).result) {
    await refresh();
  }
}
async function onEditMember(member: TeamAdminMember, pole: TeamAdminPole) {
  if (await memberModal.open({ poles: poles.value, poleId: pole.id, member }).result) {
    await refresh();
  }
}

function flags(member: TeamAdminMember): { key: string; label: string }[] {
  return [
    ...(member.banned ? [{ key: 'banned', label: t('admin.team.badges.banned') }] : []),
    ...(!member.visible ? [{ key: 'hidden', label: t('admin.team.badges.hidden') }] : []),
    ...(!member.showSelf ? [{ key: 'self', label: t('admin.team.badges.hiddenBySelf') }] : []),
  ];
}
</script>

<template>
  <UAlert
    v-if="error || !data"
    color="error"
    variant="subtle"
    icon="i-lucide-circle-alert"
    :description="t('admin.team.errors.failed')"
  />
  <div v-else class="flex max-w-4xl flex-col gap-8">
    <p class="text-muted">{{ t('admin.team.note') }}</p>

    <section class="flex flex-col gap-3 rounded-lg bg-elevated p-5">
      <h2 class="text-xl font-bold text-highlighted">{{ t('admin.team.join.title') }}</h2>
      <p class="text-sm text-muted">{{ t('admin.team.join.help') }}</p>
      <UAlert
        v-if="!isEnabled('team.join')"
        color="warning"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        :description="t('admin.team.join.flagOff')"
      />
      <form class="flex flex-wrap items-start gap-3" @submit.prevent="saveJoin">
        <UFormField
          :label="t('admin.team.join.label')"
          name="joinUrl"
          class="min-w-64 flex-1"
          :error="joinValid ? undefined : 'https://…'"
        >
          <UInput
            v-model="joinUrl"
            type="url"
            inputmode="url"
            placeholder="https://"
            :maxlength="500"
            class="w-full"
          />
        </UFormField>
        <UButton
          type="submit"
          color="neutral"
          variant="soft"
          class="mt-6"
          :disabled="!joinValid"
          :loading="savingJoin"
          :label="t('admin.team.join.save')"
        />
      </form>
    </section>

    <p v-if="!poles.length" class="rounded-lg bg-elevated p-6 text-muted">
      {{ t('admin.team.empty') }}
    </p>

    <section
      v-for="(pole, poleIndex) in poles"
      :key="pole.id"
      class="flex flex-col gap-3 rounded-lg bg-elevated p-5"
    >
      <div class="flex flex-wrap items-center gap-3">
        <IconTile :icon="pole.icon" />
        <div class="flex min-w-0 flex-1 flex-col">
          <div class="flex flex-wrap items-center gap-2">
            <h2 class="text-xl font-bold text-highlighted">{{ pole.name.en }}</h2>
            <UBadge
              v-if="pole.featured"
              color="neutral"
              variant="soft"
              size="sm"
              :label="t('admin.team.featured')"
            />
          </div>
          <p class="text-sm text-muted">{{ pole.name.fr }}</p>
        </div>
        <div class="flex items-center gap-1">
          <UButton
            icon="i-lucide-arrow-up"
            size="md"
            color="neutral"
            variant="ghost"
            :aria-label="t('admin.team.moveUp')"
            :disabled="poleIndex === 0"
            @click="run(() => teamActions.movePole(pole.id, 'up'))"
          />
          <UButton
            icon="i-lucide-arrow-down"
            size="md"
            color="neutral"
            variant="ghost"
            :aria-label="t('admin.team.moveDown')"
            :disabled="poleIndex === poles.length - 1"
            @click="run(() => teamActions.movePole(pole.id, 'down'))"
          />
          <UButton
            size="md"
            color="neutral"
            variant="ghost"
            :label="t('admin.team.edit')"
            @click="onEditPole(pole)"
          />
          <UButton
            v-if="!pole.members.length"
            size="md"
            color="error"
            variant="outline"
            :label="t('admin.team.delete')"
            @click="onDeletePole(pole)"
          />
        </div>
      </div>

      <ul v-if="pole.members.length" class="flex flex-col gap-1">
        <li
          v-for="(member, memberIndex) in pole.members"
          :key="member.userId"
          class="flex flex-wrap items-center gap-3 rounded-md bg-default px-3 py-2"
        >
          <UAvatar
            :src="member.image ?? undefined"
            :alt="member.name"
            size="lg"
            :ui="avatarTint(member.userId)"
            class="text-sm"
          />
          <div class="flex min-w-0 flex-1 flex-col">
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-semibold text-highlighted">{{ member.name }}</span>
              <UBadge
                v-for="flag in flags(member)"
                :key="flag.key"
                color="neutral"
                variant="soft"
                size="sm"
                :label="flag.label"
              />
            </div>
            <span class="truncate text-sm text-muted"
              >{{ member.role.en }}, {{ member.email }}</span
            >
          </div>
          <USwitch
            :model-value="member.visible"
            :aria-label="t('admin.team.member.visible')"
            @update:model-value="
              (visible) => run(() => teamActions.updateMember(member.userId, { visible }))
            "
          />
          <div class="flex items-center gap-1">
            <UButton
              icon="i-lucide-arrow-up"
              size="md"
              color="neutral"
              variant="ghost"
              :aria-label="t('admin.team.moveUp')"
              :disabled="memberIndex === 0"
              @click="run(() => teamActions.moveMember(member.userId, 'up'))"
            />
            <UButton
              icon="i-lucide-arrow-down"
              size="md"
              color="neutral"
              variant="ghost"
              :aria-label="t('admin.team.moveDown')"
              :disabled="memberIndex === pole.members.length - 1"
              @click="run(() => teamActions.moveMember(member.userId, 'down'))"
            />
            <UButton
              size="md"
              color="neutral"
              variant="ghost"
              :label="t('admin.team.edit')"
              @click="onEditMember(member, pole)"
            />
            <UButton
              size="md"
              color="neutral"
              variant="ghost"
              :label="t('admin.team.remove')"
              @click="
                run(() => teamActions.removeMember(member.userId), 'admin.team.member.removed')
              "
            />
          </div>
        </li>
      </ul>
      <p v-else class="text-sm text-muted">{{ t('admin.team.noMembers') }}</p>

      <UButton
        icon="i-lucide-plus"
        size="md"
        color="neutral"
        variant="soft"
        class="self-start"
        :label="t('admin.team.addMember')"
        @click="onAddMember(pole)"
      />
    </section>
  </div>
</template>
