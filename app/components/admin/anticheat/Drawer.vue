<script setup lang="ts">
import { AdminAnticheatConfirm } from '#components';

import AdminAnticheatDrawer from './Drawer.vue';

import type {
  AnticheatDecision,
  AnticheatFileDetail,
  AnticheatFileRow,
  AnticheatHistoryEntry,
} from '#shared/schemas/anticheat';

// A file or a project, in a side drawer so the table keeps its place. A project row opens its
// decision, metadata and versions (each opens the file); a file opens the score, the actions and
// the criteria, identity, players and history. Closes with true when something changed.
const props = defineProps<{ row: AnticheatFileRow }>();
const emit = defineEmits<{ close: [changed: boolean] }>();

const { t, d } = useI18n();
const toast = useToast();
const overlay = useOverlay();

const projectMode = computed(() => props.row.sha512 === null && props.row.projectId !== null);
const changed = ref(false);

const file = projectMode.value ? null : useAnticheatFile(props.row.sha512!);
const project = projectMode.value ? useAnticheatProject(props.row.projectId!) : null;
const fileData = computed(() => file?.data.value ?? null);
const projectData = computed(() => project?.data.value ?? null);

const failed = computed(() => Boolean((file ?? project)?.error.value));
const tab = ref('criteria');
const noting = ref(false);
const noteText = ref('');
const pending = ref(false);

const projectRef = computed(() => {
  if (projectData.value) {
    return {
      id: projectData.value.id,
      name: projectData.value.name,
      decision: projectData.value.decision.decision,
    };
  }
  return fileData.value?.project ?? null;
});
const decision = computed<AnticheatDecision | null>(
  () => projectData.value?.decision.decision ?? fileData.value?.decision.decision ?? null,
);
// What each button acts on: approve project and (with a project) ban act on the project, approve
// hash (and ban without a project) on the file. A button is disabled when its target already has
// that decision.
const projectDecision = computed<AnticheatDecision | null>(
  () => projectData.value?.decision.decision ?? fileData.value?.project?.decision ?? null,
);
const fileDecision = computed<AnticheatDecision | null>(
  () => fileData.value?.decision.decision ?? null,
);
const banTarget = computed(() => (projectRef.value ? projectDecision.value : fileDecision.value));
const status = computed(() => fileData.value?.status ?? props.row.status);
const score = computed(() => fileData.value?.score ?? props.row.score);
const title = computed(
  () => fileData.value?.declared.name ?? projectData.value?.name ?? props.row.name,
);
const inQueue = computed(() => fileData.value?.status === 'review' && !fileData.value.reviewedAt);

const tabs = computed(() => [
  { label: t('admin.anticheat.drawer.criteria'), value: 'criteria' },
  { label: t('admin.anticheat.drawer.identity'), value: 'identity' },
  { label: t('admin.anticheat.drawer.players'), value: 'players' },
  { label: t('admin.anticheat.drawer.history'), value: 'history' },
]);

async function reload() {
  changed.value = true;
  await Promise.all([file?.refresh(), project?.refresh()]);
}

function fail(error: unknown) {
  const problem = error instanceof AnticheatError ? error.problem : 'failed';
  toast.add({
    title: t(`admin.anticheat.errors.${problem}`),
    color: 'error',
    icon: 'i-lucide-circle-alert',
  });
}

async function run(work: () => Promise<unknown>, done: string) {
  pending.value = true;
  try {
    await work();
    toast.add({ title: t(done), color: 'success', icon: 'i-lucide-circle-check' });
    await reload();
  } catch (error) {
    fail(error);
  } finally {
    pending.value = false;
  }
}

async function ask(kind: 'approveProject' | 'approveHash' | 'ban' | 'clear') {
  const banned = kind === 'ban';
  const modal = overlay.create(AdminAnticheatConfirm, {
    props: {
      title: t(`admin.anticheat.confirm.${kind}.title`),
      body: t(`admin.anticheat.confirm.${kind}.body`),
      label: t(`admin.anticheat.confirm.${kind}.label`),
      destructive: banned,
    },
  });
  const result = (await modal.open().result) as { note: string | undefined } | null;
  if (!result) return;
  const wanted: AnticheatDecision | null = kind === 'clear' ? null : banned ? 'banned' : 'approved';
  const body = { decision: wanted, note: result.note };
  const fileOnly =
    kind === 'approveHash' || (kind === 'clear' && fileData.value?.decision.decision != null);
  const target = fileOnly || !projectRef.value ? null : projectRef.value.id;
  if (target) {
    await run(async () => {
      const outcome = await anticheatActions.decideProject(target, body);
      if (banned && outcome.affectedPlayers > 0) {
        toast.add({
          title: t('admin.anticheat.confirm.affected', outcome.affectedPlayers),
          color: 'warning',
          icon: 'i-lucide-triangle-alert',
        });
      }
    }, `admin.anticheat.confirm.${kind}.done`);
  } else if (props.row.sha512 ?? fileData.value) {
    const sha = props.row.sha512 ?? fileData.value!.sha512;
    await run(() => anticheatActions.decideFile(sha, body), `admin.anticheat.confirm.${kind}.done`);
  }
}

const sha = computed(() => props.row.sha512 ?? '');
const reviewed = () =>
  run(() => anticheatActions.reviewed(sha.value), 'admin.anticheat.drawer.reviewedDone');
const rescore = () =>
  run(() => anticheatActions.rescore(sha.value), 'admin.anticheat.drawer.rescored');
async function addNote() {
  if (!noteText.value.trim()) return;
  await run(
    () => anticheatActions.note(sha.value, noteText.value.trim()),
    'admin.anticheat.note.done',
  );
  noteText.value = '';
  noting.value = false;
}

async function openVersion(version: {
  sha512: string;
  filename: string;
  score: number | null;
  status: AnticheatFileDetail['status'];
}) {
  const next = overlay.create(AdminAnticheatDrawer, {
    props: {
      row: {
        ...props.row,
        projectId: null,
        sha512: version.sha512,
        name: version.filename,
        fileCount: 1,
        status: version.status,
        score: version.score,
      },
    },
  });
  if (await next.open().result) await reload();
}

const when = (iso: string) =>
  d(iso, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Paris' });

const text = (value: unknown, fallback = '–') =>
  typeof value === 'string' || typeof value === 'number' ? String(value) : fallback;

function historyLine(entry: AnticheatHistoryEntry) {
  const data = entry.data as { from?: unknown; to?: unknown; body?: unknown; note?: unknown };
  if (entry.kind === 'score')
    return t('admin.anticheat.history.score', {
      from: text(data.from),
      to: text(data.to),
    });
  if (entry.kind === 'note') return text(data.body, '');
  return typeof data.note === 'string' ? data.note : '';
}

const metadata = computed(() => {
  const data = projectData.value;
  if (!data) return [];
  return [
    { label: 'Modrinth', value: data.modrinthId },
    { label: 'CurseForge', value: data.curseforgeId },
    { label: t('admin.anticheat.drawer.declaredModId'), value: data.declaredModId },
    { label: t('admin.anticheat.drawer.modIds'), value: data.modIds.join(', ') || null },
  ].filter((item) => item.value);
});
</script>

<template>
  <USlideover
    :title="title"
    :description="t(`admin.anticheat.kinds.${row.kind}`)"
    :ui="{ content: 'max-w-xl' }"
    @update:open="(open: boolean) => !open && emit('close', changed)"
  >
    <template #body>
      <UAlert
        v-if="failed"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :description="t('admin.anticheat.errors.failed')"
      />
      <div v-else class="flex flex-col gap-6">
        <div class="flex items-center gap-4">
          <span class="font-display text-5xl font-bold text-highlighted tabular-nums">
            {{ score ?? '–' }}
          </span>
          <div class="flex flex-col gap-1">
            <AdminAnticheatStatusBadge :status="status" class="self-start" />
            <p class="text-sm text-muted">
              {{
                t(
                  `admin.anticheat.path.${fileData?.breakdown?.path ?? (projectMode ? (row.fileCount === 0 ? 'noFiles' : 'project') : 'pending')}`,
                )
              }}
            </p>
          </div>
        </div>

        <UAlert
          v-if="row.waiting > 0"
          color="warning"
          variant="subtle"
          icon="i-lucide-hourglass"
          :description="t('admin.anticheat.drawer.waiting', row.waiting)"
        />
        <UAlert
          v-if="fileData?.factsDisputed"
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          :description="t('admin.anticheat.drawer.disputed')"
        />

        <div class="flex flex-wrap gap-2">
          <UButton
            v-if="projectRef"
            size="md"
            :loading="pending"
            :disabled="projectDecision === 'approved'"
            :label="t('admin.anticheat.drawer.approveProject')"
            @click="ask('approveProject')"
          />
          <UButton
            v-if="!projectMode"
            size="md"
            color="neutral"
            variant="soft"
            :loading="pending"
            :disabled="fileDecision === 'approved'"
            :label="t('admin.anticheat.drawer.approveHash')"
            @click="ask('approveHash')"
          />
          <UButton
            size="md"
            color="error"
            variant="outline"
            :loading="pending"
            :disabled="banTarget === 'banned'"
            :label="
              projectRef ? t('admin.anticheat.drawer.banProject') : t('admin.anticheat.drawer.ban')
            "
            @click="ask('ban')"
          />
          <UButton
            v-if="decision"
            size="md"
            color="neutral"
            variant="ghost"
            :loading="pending"
            :label="t('admin.anticheat.drawer.clear')"
            @click="ask('clear')"
          />
          <template v-if="!projectMode">
            <UButton
              v-if="inQueue"
              size="md"
              color="neutral"
              variant="soft"
              :loading="pending"
              :label="t('admin.anticheat.drawer.reviewed')"
              @click="reviewed"
            />
            <UButton
              size="md"
              color="neutral"
              variant="ghost"
              icon="i-lucide-refresh-cw"
              :loading="pending"
              :label="t('admin.anticheat.drawer.rescore')"
              @click="rescore"
            />
            <UButton
              size="md"
              color="neutral"
              variant="ghost"
              icon="i-lucide-message-square-plus"
              :label="t('admin.anticheat.drawer.addNote')"
              @click="noting = !noting"
            />
          </template>
        </div>

        <form v-if="noting" class="flex flex-col gap-2" @submit.prevent="addNote">
          <UTextarea v-model="noteText" :rows="3" :maxlength="1000" autoresize class="w-full" />
          <UButton
            type="submit"
            size="md"
            color="neutral"
            variant="soft"
            class="self-start"
            :disabled="!noteText.trim()"
            :label="t('admin.anticheat.note.save')"
          />
        </form>

        <p v-if="decision" class="text-sm text-muted">
          {{ t(`admin.anticheat.drawer.decided.${decision}`) }}
          <template v-if="(fileData ?? projectData)?.decision.note">
            {{ (fileData ?? projectData)!.decision.note }}
          </template>
        </p>

        <template v-if="fileData">
          <UTabs v-model="tab" :items="tabs" variant="pill" :content="false" />
          <AdminAnticheatCriteria
            v-if="tab === 'criteria' && fileData.breakdown"
            :breakdown="fileData.breakdown"
          />
          <p v-else-if="tab === 'criteria'" class="text-muted">
            {{ t('admin.anticheat.drawer.notScored') }}
          </p>
          <dl v-if="tab === 'identity'" class="grid grid-cols-3 gap-x-4 gap-y-2">
            <dt class="text-muted">{{ t('admin.anticheat.drawer.hash') }}</dt>
            <dd class="col-span-2"><AdminAnticheatHash :sha512="fileData.sha512" /></dd>
            <dt class="text-muted">{{ t('admin.anticheat.drawer.filename') }}</dt>
            <dd class="col-span-2 break-all">{{ fileData.filename }}</dd>
            <template v-for="key in ['modId', 'name', 'version', 'loader'] as const" :key="key">
              <template v-if="fileData.declared[key]">
                <dt class="text-muted">{{ t(`admin.anticheat.drawer.declared.${key}`) }}</dt>
                <dd class="col-span-2">{{ fileData.declared[key] }}</dd>
              </template>
            </template>
            <dt class="text-muted">{{ t('admin.anticheat.drawer.lookup') }}</dt>
            <dd class="col-span-2">{{ t(`admin.anticheat.lookup.${fileData.lookupState}`) }}</dd>
            <template v-if="fileData.project">
              <dt class="text-muted">{{ t('admin.anticheat.drawer.project') }}</dt>
              <dd class="col-span-2">{{ fileData.project.name }}</dd>
            </template>
            <template v-if="fileData.rulesVersion !== null">
              <dt class="text-muted">{{ t('admin.anticheat.drawer.rules') }}</dt>
              <dd class="col-span-2 tabular-nums">{{ fileData.rulesVersion }}</dd>
            </template>
            <dt class="text-muted">{{ t('admin.anticheat.drawer.firstSeen') }}</dt>
            <dd class="col-span-2 tabular-nums">{{ when(fileData.firstSeenAt) }}</dd>
            <dt class="text-muted">{{ t('admin.anticheat.drawer.lastSeen') }}</dt>
            <dd class="col-span-2 tabular-nums">{{ when(fileData.lastSeenAt) }}</dd>
          </dl>
          <AdminAnticheatFilePlayers
            v-if="tab === 'players'"
            :sha512="fileData.sha512"
            :first="fileData.players"
            @changed="reload"
          />
          <ul v-if="tab === 'history'" class="flex flex-col divide-y divide-default">
            <li v-if="!fileData.history.length" class="py-2 text-muted">
              {{ t('admin.anticheat.history.empty') }}
            </li>
            <li
              v-for="entry in fileData.history"
              :key="entry.id"
              class="flex flex-col gap-0.5 py-2"
            >
              <span class="font-medium">{{
                t(`admin.anticheat.history.kinds.${entry.kind}`)
              }}</span>
              <span v-if="historyLine(entry)" class="text-sm break-words">{{
                historyLine(entry)
              }}</span>
              <span class="text-sm text-muted tabular-nums">
                {{ when(entry.at) }}<template v-if="entry.actor">, {{ entry.actor }}</template>
              </span>
            </li>
          </ul>
        </template>

        <template v-else-if="projectData">
          <dl v-if="metadata.length" class="grid grid-cols-3 gap-x-4 gap-y-2">
            <template v-for="item in metadata" :key="item.label">
              <dt class="text-muted">{{ item.label }}</dt>
              <dd class="col-span-2 break-all">{{ item.value }}</dd>
            </template>
          </dl>
          <section class="flex flex-col gap-2">
            <h3 class="text-lg">{{ t('admin.anticheat.drawer.versions') }}</h3>
            <p v-if="!projectData.files.length" class="text-muted">
              {{ t('admin.anticheat.drawer.noVersions') }}
            </p>
            <ul class="flex flex-col divide-y divide-default">
              <li v-for="version in projectData.files" :key="version.sha512">
                <button
                  type="button"
                  class="flex w-full items-center gap-3 py-2 text-left hover:bg-accented"
                  @click="openVersion(version)"
                >
                  <span class="min-w-0 grow">
                    <span class="block truncate font-medium text-highlighted">{{
                      version.filename
                    }}</span>
                    <span class="block text-sm text-muted">{{ version.version ?? '' }}</span>
                  </span>
                  <AdminAnticheatStatusBadge :status="version.status" />
                  <span class="w-8 text-right tabular-nums">{{ version.score ?? '–' }}</span>
                </button>
              </li>
            </ul>
          </section>
          <section class="flex flex-col gap-2">
            <h3 class="text-lg">{{ t('admin.anticheat.drawer.history') }}</h3>
            <ul class="flex flex-col divide-y divide-default">
              <li
                v-for="entry in projectData.history"
                :key="entry.id"
                class="flex flex-col gap-0.5 py-2"
              >
                <span class="font-medium">{{
                  t(`admin.anticheat.history.kinds.${entry.kind}`)
                }}</span>
                <span class="text-sm text-muted tabular-nums">
                  {{ when(entry.at) }}<template v-if="entry.actor">, {{ entry.actor }}</template>
                </span>
              </li>
            </ul>
          </section>
        </template>

        <p v-else class="text-muted">{{ t('admin.anticheat.loading') }}</p>
      </div>
    </template>
    <template #footer>
      <UButton
        color="neutral"
        variant="ghost"
        :label="t('admin.anticheat.close')"
        @click="emit('close', changed)"
      />
    </template>
  </USlideover>
</template>
