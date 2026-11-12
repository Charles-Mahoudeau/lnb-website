<script setup lang="ts">
import type {
  AnticheatDecision,
  AnticheatProjectKind,
  AnticheatProjectSearchResult,
} from '#shared/schemas/anticheat';

// Approves or bans a Modrinth or CurseForge project that no player has used yet. It is found by
// search, or by its ID when the search can't help.
// Closes with the new project's ID once saved, or null.
const props = defineProps<{ decision: AnticheatDecision; kind: AnticheatProjectKind }>();
const emit = defineEmits<{ close: [projectId: string | null] }>();

const { t, locale } = useI18n();
const toast = useToast();

const byId = ref(false);
const source = ref<'modrinth' | 'curseforge'>('modrinth');
const sourceId = ref('');
const pending = ref(false);

const sources = computed(() => [
  { value: 'modrinth', label: 'Modrinth' },
  { value: 'curseforge', label: 'CurseForge' },
]);

const query = ref('');
const results = ref<AnticheatProjectSearchResult[]>([]);
const picked = ref<AnticheatProjectSearchResult | null>(null);
const state = ref<'idle' | 'loading' | 'done' | 'error'>('idle');
const errorKey = ref('failed');

let timer: ReturnType<typeof setTimeout> | undefined;
let latest = 0;
watch(query, (value) => {
  clearTimeout(timer);
  const q = value.trim();
  if (q.length < 2) {
    results.value = [];
    state.value = 'idle';
    return;
  }
  timer = setTimeout(() => void run(q), 300);
});
onBeforeUnmount(() => {
  clearTimeout(timer);
});

async function run(q: string) {
  const id = ++latest;
  state.value = 'loading';
  try {
    const { items } = await anticheatActions.searchProjects(q, props.kind);
    if (id !== latest) return;
    results.value = items;
    state.value = 'done';
  } catch (error) {
    if (id !== latest) return;
    const problem = error instanceof AnticheatError ? error.problem : 'failed';
    errorKey.value = problem === 'rateLimited' || problem === 'unavailable' ? problem : 'failed';
    state.value = 'error';
  }
}

const downloads = (count: number) =>
  new Intl.NumberFormat(locale.value, { notation: 'compact' }).format(count);

const target = computed(() =>
  byId.value
    ? { source: source.value, sourceId: sourceId.value.trim() }
    : picked.value
      ? { source: picked.value.source, sourceId: picked.value.sourceId }
      : null,
);
const ready = computed(() => Boolean(target.value?.sourceId));

async function submit() {
  const chosen = target.value;
  if (!chosen?.sourceId) return;
  pending.value = true;
  try {
    const { id } = await anticheatActions.createProject({
      source: chosen.source,
      sourceId: chosen.sourceId,
      kind: props.kind,
      decision: props.decision,
    });
    toast.add({
      title: t(`admin.anticheat.project.done.${props.decision}`),
      color: 'success',
      icon: 'i-lucide-circle-check',
    });
    emit('close', id);
  } catch (error) {
    const problem = error instanceof AnticheatError ? error.problem : 'failed';
    toast.add({
      title: t(`admin.anticheat.errors.${problem}`),
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
    :title="t(`admin.anticheat.project.title.${decision}`)"
    :description="t(`admin.anticheat.project.body.${decision}`)"
    :close="false"
  >
    <template #body>
      <form id="anticheat-project" class="flex flex-col gap-4" @submit.prevent="submit">
        <template v-if="byId">
          <UFormField :label="t('admin.anticheat.project.source')">
            <template #hint>
              <UButton
                color="neutral"
                variant="link"
                size="xs"
                class="p-0 underline"
                :label="t('admin.anticheat.project.useSearch')"
                @click="byId = !byId"
              />
            </template>
            <USelect v-model="source" :items="sources" class="w-full" />
          </UFormField>
          <UFormField
            :label="t('admin.anticheat.project.id')"
            :help="t(`admin.anticheat.project.idHelp.${source}`)"
          >
            <UInput v-model="sourceId" class="w-full" autofocus />
          </UFormField>
        </template>
        <template v-else-if="picked">
          <div class="flex items-center gap-3 rounded-md bg-default p-2">
            <ModsIcon :name="picked.name" :src="picked.iconUrl" size="sm" />
            <span class="flex min-w-0 grow flex-col">
              <span class="truncate font-semibold text-highlighted">{{ picked.name }}</span>
              <span class="truncate text-sm text-muted">
                {{ picked.source === 'modrinth' ? 'Modrinth' : 'CurseForge' }}
              </span>
            </span>
            <UButton
              color="neutral"
              variant="ghost"
              :label="t('admin.anticheat.project.change')"
              @click="picked = null"
            />
          </div>
        </template>
        <template v-else>
          <UFormField :label="t('admin.anticheat.project.search.label')" name="query">
            <template #hint>
              <UButton
                color="neutral"
                variant="link"
                size="xs"
                class="p-0 underline"
                :label="t('admin.anticheat.project.useId')"
                @click="byId = !byId"
              />
            </template>
            <UInput
              v-model="query"
              type="search"
              icon="i-lucide-search"
              :loading="state === 'loading'"
              :placeholder="t(`admin.anticheat.project.search.placeholder.${kind}`)"
              autofocus
              class="w-full"
            />
          </UFormField>
          <UAlert
            v-if="state === 'error'"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-alert"
            :description="t(`admin.anticheat.errors.${errorKey}`)"
          />
          <p v-else-if="state === 'done' && results.length === 0" class="text-muted">
            {{ t('admin.anticheat.project.search.empty') }}
          </p>
          <ul
            v-if="results.length"
            class="flex max-h-72 flex-col gap-0.5 overflow-y-auto rounded-md bg-default p-1"
          >
            <li v-for="result in results" :key="`${result.source}:${result.sourceId}`">
              <button
                type="button"
                class="flex w-full items-center gap-3 rounded-md p-2 text-left enabled:hover:bg-accented disabled:cursor-default"
                :disabled="result.registered"
                @click="picked = result"
              >
                <ModsIcon
                  :name="result.name"
                  :src="result.iconUrl"
                  size="sm"
                  :class="result.registered ? 'opacity-50' : ''"
                />
                <span
                  :class="['flex min-w-0 grow flex-col', result.registered ? 'opacity-60' : '']"
                >
                  <span class="truncate font-semibold text-highlighted">{{ result.name }}</span>
                  <span class="truncate text-sm text-muted">
                    <template v-if="result.registered">
                      {{ t('admin.anticheat.project.search.registered') }}
                    </template>
                    <template v-else>
                      {{
                        t('admin.anticheat.project.search.meta', {
                          author:
                            result.author || t('admin.anticheat.project.search.unknownAuthor'),
                          downloads: downloads(result.downloads),
                        })
                      }}
                    </template>
                  </span>
                </span>
                <UBadge
                  color="neutral"
                  variant="soft"
                  size="sm"
                  :label="result.source === 'modrinth' ? 'Modrinth' : 'CurseForge'"
                />
              </button>
            </li>
          </ul>
        </template>
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
          v-if="decision === 'banned'"
          type="submit"
          form="anticheat-project"
          color="error"
          variant="outline"
          :loading="pending"
          :disabled="!ready"
          :label="t('admin.anticheat.project.confirm.banned')"
        />
        <UButton
          v-else
          type="submit"
          form="anticheat-project"
          :loading="pending"
          :disabled="!ready"
          :label="t('admin.anticheat.project.confirm.approved')"
        />
      </div>
    </template>
  </UModal>
</template>
