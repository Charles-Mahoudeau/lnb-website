<script setup lang="ts">
import { PARTNER_REFERENT_ROLES } from '#shared/schemas/partner-events';
import type { PartnerAdminView, PartnerGameKey } from '#shared/schemas/partner-events';

// One game: its status and places, art, the referent for the organizer, then its teams and the
// students interested in it. See docs/partner-events.md.
const props = defineProps<{
  slug: string;
  game: PartnerAdminView['games'][number];
  teams: PartnerAdminView['teams'];
  interest: PartnerAdminView['interest'];
  closed: boolean;
}>();
const emit = defineEmits<{ changed: [] }>();

const { t } = useI18n();
const toast = useToast();

const form = reactive({
  status: props.game.status,
  starters: props.game.starters,
  substitutes: props.game.substitutes,
  referentPseudo: props.game.referent.pseudo,
  referentEmail: props.game.referent.email,
  referentBirthDate: props.game.referent.birthDate ?? '',
  referentRole: props.game.referent.role,
});
const artKey = ref(props.game.artKey);
const artUrl = ref(props.game.art);
const pending = ref(false);
const search = ref('');

const statuses = computed(() => [
  { value: 'confirmed', label: t('partnerEvents.status.confirmed') },
  { value: 'study', label: t('partnerEvents.status.study') },
]);

async function run(action: () => Promise<unknown>, success: string): Promise<boolean> {
  pending.value = true;
  try {
    await action();
    emit('changed');
    toast.add({ title: success, color: 'success', icon: 'i-lucide-circle-check' });
    return true;
  } catch (cause) {
    const problem = cause instanceof PartnerEventError ? cause.problem : 'failed';
    toast.add({
      title: t(`partnerEvents.problems.${problem}`),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
    return false;
  } finally {
    pending.value = false;
  }
}

const save = () =>
  run(
    () =>
      partnerEventAdminActions.game(props.slug, props.game.key, {
        status: form.status,
        starters: form.starters,
        substitutes: form.substitutes,
        artKey: artKey.value,
        referentPseudo: form.referentPseudo,
        referentEmail: form.referentEmail,
        referentBirthDate: form.referentBirthDate || null,
        referentRole: form.referentRole,
      }),
    t('admin.partnerEvents.saved'),
  );

const picker = ref<HTMLInputElement | null>(null);
async function onChosen(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  await run(async () => {
    const stored = await partnerEventAdminActions.upload(props.slug, file);
    artKey.value = stored.key;
    artUrl.value = stored.url;
  }, t('admin.partnerEvents.game.uploaded'));
}

// Team referent dialog
const editing = ref<PartnerAdminView['teams'][number] | null>(null);
const editingOpen = computed({
  get: () => editing.value !== null,
  set: (open) => {
    if (!open) editing.value = null;
  },
});
async function saveReferent(
  referent: Parameters<typeof partnerEventAdminActions.teamReferent>[2]['referent'],
) {
  const team = editing.value;
  if (!team) return;
  if (
    await run(
      () => partnerEventAdminActions.teamReferent(props.slug, team.id, { referent }),
      t('admin.partnerEvents.saved'),
    )
  ) {
    editing.value = null;
  }
}
const disband = (team: PartnerAdminView['teams'][number]) =>
  run(
    () => partnerEventAdminActions.disband(props.slug, team.id),
    t('admin.partnerEvents.teams.disbanded'),
  );

const rows = computed(() => {
  const q = search.value.trim().toLowerCase();
  return q
    ? props.interest.filter((r) => `${r.name} ${r.email}`.toLowerCase().includes(q))
    : props.interest;
});
</script>

<template>
  <div class="flex flex-col gap-6">
    <UCard>
      <template #header>
        <div class="flex flex-wrap items-center gap-4">
          <img v-if="artUrl" :src="artUrl" alt="" class="h-11 w-18 rounded-lg object-cover" />
          <h2 class="min-w-0 flex-1 text-lg">
            {{ t(`partnerEvents.games.${partnerGameMessageKey(game.key as PartnerGameKey)}`) }}
          </h2>
          <UButton
            color="neutral"
            variant="outline"
            size="sm"
            icon="i-lucide-upload"
            :label="t('admin.partnerEvents.game.upload')"
            :disabled="pending"
            @click="picker?.click()"
          />
          <input ref="picker" type="file" accept="image/*" class="hidden" @change="onChosen" />
        </div>
      </template>
      <form class="flex flex-col gap-5" @submit.prevent="save">
        <div class="grid gap-4 sm:grid-cols-3">
          <UFormField :label="t('admin.partnerEvents.game.status')">
            <USelect v-model="form.status" :items="statuses" class="w-full" />
          </UFormField>
          <UFormField :label="t('admin.partnerEvents.game.starters')">
            <UInput
              v-model.number="form.starters"
              type="number"
              :min="1"
              :max="16"
              class="w-full"
            />
          </UFormField>
          <UFormField :label="t('admin.partnerEvents.game.substitutes')">
            <UInput
              v-model.number="form.substitutes"
              type="number"
              :min="0"
              :max="8"
              class="w-full"
            />
          </UFormField>
        </div>
        <div>
          <h3 class="font-sans text-sm font-semibold text-highlighted">
            {{ t('admin.partnerEvents.game.referent') }}
          </h3>
          <p class="text-sm text-muted">{{ t('admin.partnerEvents.game.referentHint') }}</p>
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField :label="t('admin.partnerEvents.referent.pseudo')">
            <UInput v-model="form.referentPseudo" class="w-full" :maxlength="60" />
          </UFormField>
          <UFormField :label="t('admin.partnerEvents.referent.email')">
            <UInput v-model="form.referentEmail" type="email" class="w-full" :maxlength="120" />
          </UFormField>
          <UFormField :label="t('admin.partnerEvents.referent.birthDate')">
            <UInput v-model="form.referentBirthDate" type="date" class="w-full" />
          </UFormField>
          <UFormField :label="t('admin.partnerEvents.referent.role')">
            <USelect
              v-model="form.referentRole"
              :items="[...PARTNER_REFERENT_ROLES]"
              class="w-full"
            />
          </UFormField>
        </div>
        <div class="flex justify-end">
          <UButton type="submit" :label="t('admin.partnerEvents.save')" :loading="pending" />
        </div>
      </form>
    </UCard>

    <UCard v-if="game.status === 'confirmed'">
      <template #header>
        <h2 class="text-lg">
          {{ t('admin.partnerEvents.teams.title') }}
          <span class="text-sm text-muted">{{ teams.length }}</span>
        </h2>
      </template>
      <p v-if="teams.length === 0" class="text-muted">{{ t('admin.partnerEvents.teams.none') }}</p>
      <div v-else class="overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead class="text-muted">
            <tr>
              <th class="px-3 py-2 font-semibold">{{ t('admin.partnerEvents.teams.team') }}</th>
              <th class="px-3 py-2 font-semibold">
                {{ t('admin.partnerEvents.teams.abbreviation') }}
              </th>
              <th class="px-3 py-2 font-semibold">{{ t('admin.partnerEvents.teams.starters') }}</th>
              <th class="px-3 py-2 font-semibold">
                {{ t('admin.partnerEvents.teams.substitutes') }}
              </th>
              <th class="px-3 py-2 font-semibold">{{ t('admin.partnerEvents.teams.captain') }}</th>
              <th class="px-3 py-2 font-semibold">{{ t('admin.partnerEvents.teams.referent') }}</th>
              <th class="px-3 py-2">
                <span class="sr-only">{{ t('admin.partnerEvents.teams.actions') }}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="team in teams" :key="team.id" class="border-t border-default">
              <td class="px-3 py-2 font-medium whitespace-nowrap text-highlighted">
                {{ team.name }}
              </td>
              <td class="px-3 py-2">{{ team.abbreviation }}</td>
              <td class="px-3 py-2 tabular-nums">{{ team.starters }}/{{ game.starters }}</td>
              <td class="px-3 py-2 tabular-nums">{{ team.substitutes }}/{{ game.substitutes }}</td>
              <td class="px-3 py-2 whitespace-nowrap">{{ team.captain ?? '' }}</td>
              <td class="px-3 py-2 whitespace-nowrap">
                <UBadge
                  v-if="team.referent"
                  color="neutral"
                  variant="soft"
                  :label="team.referent.pseudo"
                />
                <span v-else class="text-muted">{{
                  game.referent.pseudo || t('admin.partnerEvents.teams.notSet')
                }}</span>
              </td>
              <td class="px-3 py-2 whitespace-nowrap">
                <UButton
                  size="sm"
                  color="neutral"
                  variant="ghost"
                  :label="t('admin.partnerEvents.teams.referentAction')"
                  :disabled="pending"
                  @click="editing = team"
                />
                <UButton
                  size="sm"
                  color="neutral"
                  variant="ghost"
                  :label="t('partnerEvents.teams.disband')"
                  :disabled="pending || closed"
                  @click="disband(team)"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </UCard>
    <p v-else class="text-muted">{{ t('admin.partnerEvents.teams.study') }}</p>

    <UCard>
      <template #header>
        <div class="flex flex-wrap items-center gap-3">
          <h2 class="min-w-0 flex-1 text-lg">
            {{ t('admin.partnerEvents.interest.title') }}
            <span class="text-sm text-muted">{{ interest.length }}</span>
          </h2>
          <UInput
            v-model="search"
            icon="i-lucide-search"
            :placeholder="t('admin.partnerEvents.interest.search')"
            class="w-64 max-w-full"
          />
        </div>
      </template>
      <p v-if="rows.length === 0" class="text-muted">
        {{ t('admin.partnerEvents.interest.none') }}
      </p>
      <div v-else class="overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead class="text-muted">
            <tr>
              <th class="px-3 py-2 font-semibold">{{ t('admin.partnerEvents.interest.name') }}</th>
              <th class="px-3 py-2 font-semibold">
                {{ t('admin.partnerEvents.interest.school') }}
              </th>
              <th class="px-3 py-2 font-semibold">{{ t('admin.partnerEvents.interest.email') }}</th>
              <th class="px-3 py-2 font-semibold">
                {{ t('admin.partnerEvents.interest.inGame') }}
              </th>
              <th class="px-3 py-2 font-semibold">{{ t('admin.partnerEvents.interest.rank') }}</th>
              <th class="px-3 py-2 font-semibold">
                {{ t('admin.partnerEvents.interest.status') }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.userId" class="border-t border-default">
              <td class="px-3 py-2 font-medium whitespace-nowrap text-highlighted">
                {{ row.name }}
              </td>
              <td class="px-3 py-2">{{ row.school ?? '' }}</td>
              <td class="px-3 py-2 whitespace-nowrap">{{ row.email }}</td>
              <td class="px-3 py-2 whitespace-nowrap">{{ row.inGameName }}</td>
              <td class="px-3 py-2 whitespace-nowrap">{{ row.rank }}</td>
              <td class="px-3 py-2">
                <UBadge
                  :color="row.status === 'team' ? 'success' : 'neutral'"
                  variant="soft"
                  :label="t(`admin.partnerEvents.interest.statuses.${row.status}`)"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </UCard>

    <AdminPartnerEventsReferentModal
      v-model:open="editingOpen"
      :team-name="editing?.name ?? ''"
      :referent="editing?.referent ?? null"
      :pending="pending"
      @save="saveReferent"
    />
  </div>
</template>
