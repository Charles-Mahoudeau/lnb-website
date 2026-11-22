<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui';

import { WardenConfirmModal } from '#components';

import type {
  ChangelogCreateBody,
  ChangelogDetail,
  ChangelogPatchBody,
  ChangelogTextView,
} from '#shared/schemas/changelog';
import { isoToParisLocal, parisLocalToIso } from '#shared/utils/paris-time';

// The changelog editor (docs/changelog.md, admin editor B): a publishing band on top, then one
// raised section with the language tabs, the Translate button, two mode cards (Write, On the
// site) and the fields. Without `post` it creates one, in the language picked first. Publishing,
// scheduling and translating save the text first, so what is stored is what the editor sees.
const props = defineProps<{ post?: ChangelogDetail }>();

type Lang = 'en' | 'fr';
const LANGS: Lang[] = ['en', 'fr'];
const { t, d, locale } = useI18n();
const toast = useToast();
const overlay = useOverlay();
const confirm = overlay.create(WardenConfirmModal);

const current = ref<ChangelogDetail | undefined>(props.post);
const sourceLang = ref<Lang>(props.post?.sourceLang ?? (locale.value === 'fr' ? 'fr' : 'en'));
const otherLang = computed<Lang>(() => (sourceLang.value === 'en' ? 'fr' : 'en'));
const lang = ref<Lang>(sourceLang.value);
const mode = ref<'write' | 'site'>('write');

const texts = reactive<Record<Lang, ChangelogTextView>>({
  en: { title: '', summary: '', body: '' },
  fr: { title: '', summary: '', body: '' },
});
const versionTag = ref('');
const publishLocal = ref('');
const baseline = ref('');
const translationBaseline = ref('');
const busy = ref<'save' | 'publish' | 'schedule' | 'unpublish' | 'translate' | null>(null);

const snapshot = () => JSON.stringify({ texts, versionTag: versionTag.value });

function load(post: ChangelogDetail) {
  current.value = post;
  sourceLang.value = post.sourceLang;
  for (const key of LANGS) Object.assign(texts[key], post.texts[key]);
  versionTag.value = post.versionTag ?? '';
  publishLocal.value = post.publishedAt ? isoToParisLocal(post.publishedAt) : '';
  baseline.value = snapshot();
  translationBaseline.value = JSON.stringify(texts[otherLang.value]);
}
if (props.post) load(props.post);

const status = computed(() => current.value?.status ?? 'draft');
const dirty = computed(() => !current.value || snapshot() !== baseline.value);
const source = computed(() => texts[sourceLang.value]);
const translationChanged = computed(
  () => JSON.stringify(texts[otherLang.value]) !== translationBaseline.value,
);
const hasTranslation = computed(() => Boolean(current.value?.texts[otherLang.value].title));
const unreviewed = computed(() => hasTranslation.value && current.value?.translationUnreviewed);
const canSave = computed(() => Boolean(source.value.title.trim() && source.value.body.trim()));
const scheduleAt = computed(() => {
  const iso = parisLocalToIso(publishLocal.value);
  return iso && Date.parse(iso) > Date.now() ? iso : null;
});

const pageTitle = computed(() => source.value.title.trim() || t('admin.changelog.untitled'));

function fail(caught: unknown) {
  const problem = caught instanceof ChangelogError ? caught.problem : 'failed';
  toast.add({
    title: t(`admin.changelog.errors.${problem}`),
    color: 'error',
    icon: 'i-lucide-circle-alert',
  });
}

function done(message: string) {
  toast.add({ title: t(message), color: 'success', icon: 'i-lucide-circle-check' });
}

/** Runs a change with its button busy. Returns whether it worked. */
async function run(which: NonNullable<typeof busy.value>, change: () => Promise<void>) {
  busy.value = which;
  try {
    await change();
    return true;
  } catch (caught) {
    fail(caught);
    return false;
  } finally {
    busy.value = null;
  }
}

const refreshLists = () =>
  refreshNuxtData(['changelog-admin', `changelog-admin-${current.value?.id ?? ''}`]);

const patchBody = (reviewed: boolean): ChangelogPatchBody => {
  const body: ChangelogPatchBody = {
    source: { ...source.value },
    versionTag: versionTag.value.trim() || null,
  };
  const other = texts[otherLang.value];
  // A translation is sent only when it was edited or marked read: saving it marks it reviewed.
  if ((translationChanged.value || reviewed) && (other.title.trim() || other.body.trim())) {
    body.translation = { ...other };
  }
  return body;
};

async function persist(reviewed = false) {
  if (!current.value) {
    const body: ChangelogCreateBody = {
      sourceLang: sourceLang.value,
      source: { ...source.value },
      versionTag: versionTag.value.trim() || null,
    };
    const created = await changelogActions.create(body);
    await refreshNuxtData('changelog-admin');
    await navigateTo(`/admin/minecraft/changelog/${created.id}`);
    return;
  }
  load(await changelogActions.update(current.value.id, patchBody(reviewed)));
  await refreshLists();
}

const onSave = (reviewed = false) =>
  run('save', async () => {
    await persist(reviewed);
    done(reviewed ? 'admin.changelog.reviewed' : 'admin.changelog.saved');
  });

/** Saves pending changes, then does `change` on the saved post. */
function afterSave(which: NonNullable<typeof busy.value>, change: (id: string) => Promise<void>) {
  return run(which, async () => {
    if (dirty.value) await persist();
    if (current.value) await change(current.value.id);
  });
}

const onPublish = () =>
  afterSave('publish', async (id) => {
    load(await changelogActions.publish(id));
    await refreshLists();
    done('admin.changelog.published');
  });

const onSchedule = () =>
  afterSave('schedule', async (id) => {
    if (!scheduleAt.value) return;
    load(await changelogActions.schedule(id, scheduleAt.value));
    await refreshLists();
    done('admin.changelog.scheduled');
  });

async function onUnpublish() {
  const published = status.value === 'published';
  const confirmed: unknown = await confirm.open({
    title: t(`admin.changelog.${published ? 'unpublishTitle' : 'unscheduleTitle'}`),
    description: t(`admin.changelog.${published ? 'unpublishLede' : 'unscheduleLede'}`),
    confirmLabel: t(`admin.changelog.${published ? 'unpublish' : 'unschedule'}`),
    cancelLabel: t('admin.cancel'),
    destructive: true,
  }).result;
  if (confirmed !== true || !current.value) return;
  const id = current.value.id;
  await run('unpublish', async () => {
    load(await changelogActions.unpublish(id));
    await refreshLists();
    done('admin.changelog.unpublished');
  });
}

// Translation: the stored source goes to DeepL, and the answer is a draft to read and save.
const { data: translation } = await useChangelogTranslation();
const canTranslate = computed(() => translation.value?.available === true);

async function onTranslate() {
  if (hasTranslation.value) {
    const confirmed: unknown = await confirm.open({
      title: t('admin.changelog.translateReplaceTitle', {
        language: t(`admin.changelog.languages.${otherLang.value}`),
      }),
      description: t('admin.changelog.translateReplaceLede'),
      confirmLabel: t('admin.changelog.translate'),
      cancelLabel: t('admin.cancel'),
    }).result;
    if (confirmed !== true) return;
  }
  await afterSave('translate', async (id) => {
    load(await changelogActions.translate(id));
    lang.value = otherLang.value;
    await refreshLists();
    done('admin.changelog.translationDone');
  });
}

// "On the site" shows the body as the public page renders it: the same server renderer.
const html = ref('');
const previewing = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;
async function render() {
  try {
    html.value = (await changelogActions.preview(texts[lang.value].body)).html;
  } catch {
    html.value = '';
  } finally {
    previewing.value = false;
  }
}
watch(
  [() => texts[lang.value].body, mode],
  () => {
    clearTimeout(timer);
    if (mode.value !== 'site') return;
    previewing.value = true;
    timer = setTimeout(() => void render(), 250);
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  clearTimeout(timer);
});

// Images: uploaded to the media library, then inserted as Markdown where the cursor is. The alt
// text starts as the file name and is selected, so typing replaces it.
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const bodyBox = useTemplateRef<HTMLElement>('bodyBox');
const imageInput = useTemplateRef<HTMLInputElement>('imageInput');
const uploading = ref(false);
const dragging = ref(false);

async function addImage(file: File) {
  const target = lang.value;
  const area = bodyBox.value?.querySelector('textarea');
  const problem = !IMAGE_TYPES.includes(file.type)
    ? 'imageUnreadable'
    : file.size > MAX_IMAGE_BYTES
      ? 'imageTooLarge'
      : null;
  if (problem) {
    fail(new ChangelogError(problem));
    return;
  }
  const from = area?.selectionStart ?? texts[target].body.length;
  const to = area?.selectionEnd ?? from;
  uploading.value = true;
  try {
    const { url } = await changelogActions.uploadImage(file);
    const alt = file.name
      .replace(/\.[^.]+$/, '')
      .replace(/[-_]+/g, ' ')
      .replace(/[[\]\\]/g, '');
    const body = texts[target].body;
    texts[target].body = `${body.slice(0, from)}![${alt}](${url})${body.slice(to)}`;
    await nextTick();
    area?.focus();
    area?.setSelectionRange(from + 2, from + 2 + alt.length);
  } catch (caught) {
    fail(caught);
  } finally {
    uploading.value = false;
  }
}

const firstImage = (files: FileList | null | undefined) =>
  Array.from(files ?? []).find((file) => file.type.startsWith('image/'));

function onPick(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (file) void addImage(file);
}

function onDrop(event: DragEvent) {
  dragging.value = false;
  const file = firstImage(event.dataTransfer?.files);
  if (!file) return;
  event.preventDefault();
  void addImage(file);
}

function onPaste(event: ClipboardEvent) {
  const file = firstImage(event.clipboardData?.files);
  if (!file) return;
  event.preventDefault();
  void addImage(file);
}

const langItems = computed<TabsItem[]>(() =>
  LANGS.map((value) => {
    const isSource = value === sourceLang.value;
    const warn = !isSource && unreviewed.value;
    const state = isSource
      ? t('admin.changelog.source')
      : unreviewed.value
        ? t('admin.changelog.notReviewed')
        : hasTranslation.value
          ? ''
          : t('admin.changelog.notTranslated');
    return {
      value,
      label: t(`admin.changelog.languages.${value}`),
      badge: state
        ? { label: state, color: warn ? 'warning' : 'neutral', variant: 'subtle', size: 'sm' }
        : undefined,
    };
  }),
);

const modes = computed(() =>
  (['write', 'site'] as const).map((value) => ({
    value,
    label: t(`admin.changelog.modes.${value}.label`),
    description: t(`admin.changelog.modes.${value}.description`),
    icon: value === 'write' ? 'i-lucide-pencil-line' : 'i-lucide-panel-top',
  })),
);

const statusColors = { draft: 'neutral', scheduled: 'neutral', published: 'success' } as const;
const shown = computed(() => texts[lang.value]);
const dateShown = computed(() => {
  const iso = parisLocalToIso(publishLocal.value);
  return iso ? d(iso, { dateStyle: 'long', timeZone: 'Europe/Paris' }) : '';
});
</script>

<template>
  <AdminPage
    :title="pageTitle"
    :parents="[{ label: t('admin.nav.changelog'), to: '/admin/minecraft/changelog' }]"
  >
    <template #actions>
      <template v-if="current && status !== 'published'">
        <UButton
          color="neutral"
          variant="outline"
          size="md"
          :label="t('admin.changelog.save')"
          :loading="busy === 'save'"
          :disabled="!canSave || !dirty || busy !== null"
          @click="onSave()"
        />
        <UButton
          v-if="scheduleAt"
          color="neutral"
          variant="soft"
          size="md"
          icon="i-lucide-clock"
          :label="t('admin.changelog.schedule')"
          :loading="busy === 'schedule'"
          :disabled="!canSave || busy !== null"
          @click="onSchedule"
        />
        <UButton
          v-if="status === 'scheduled'"
          color="error"
          variant="outline"
          size="md"
          :label="t('admin.changelog.unschedule')"
          :disabled="busy !== null"
          @click="onUnpublish"
        />
        <UButton
          size="md"
          :label="t('admin.changelog.publish')"
          :loading="busy === 'publish'"
          :disabled="!canSave || busy !== null"
          @click="onPublish"
        />
      </template>
      <template v-else-if="current">
        <UButton
          color="error"
          variant="outline"
          size="md"
          :label="t('admin.changelog.unpublish')"
          :disabled="busy !== null"
          @click="onUnpublish"
        />
        <UButton
          size="md"
          :label="t('admin.changelog.save')"
          :loading="busy === 'save'"
          :disabled="!canSave || !dirty || busy !== null"
          @click="onSave()"
        />
      </template>
      <UButton
        v-else
        size="md"
        :label="t('admin.changelog.save')"
        :loading="busy === 'save'"
        :disabled="!canSave || busy !== null"
        @click="onSave()"
      />
    </template>

    <div class="flex max-w-4xl flex-col gap-4">
      <section class="flex flex-wrap items-start gap-x-5 gap-y-4 rounded-lg bg-elevated p-5">
        <div class="flex flex-col gap-2">
          <span class="text-sm font-medium text-highlighted">
            {{ t('admin.changelog.statusLabel') }}
          </span>
          <div class="flex h-10 items-center">
            <UBadge
              :color="statusColors[status]"
              :variant="status === 'draft' ? 'outline' : 'subtle'"
              size="lg"
              :label="t(`admin.changelog.status.${status}`)"
            />
          </div>
        </div>
        <UFormField
          :label="t('admin.changelog.publishOn')"
          :help="status === 'published' ? undefined : t('admin.changelog.publishOnHelp')"
          class="max-w-72"
        >
          <UInput
            v-model="publishLocal"
            type="datetime-local"
            class="w-52 tabular-nums"
            :disabled="status === 'published'"
            :aria-label="dateShown || t('admin.changelog.publishOn')"
          />
        </UFormField>
        <UFormField :label="t('admin.changelog.versionTag')" class="w-40">
          <UInput v-model="versionTag" :maxlength="40" class="w-full" />
        </UFormField>
        <UFormField
          :label="t('admin.changelog.summary')"
          :help="t('admin.changelog.summaryHelp')"
          class="basis-full"
        >
          <UInput v-model="texts[lang].summary" :maxlength="400" class="w-full" />
        </UFormField>
      </section>

      <section class="flex flex-col gap-5 rounded-lg bg-elevated p-5">
        <div class="flex flex-wrap items-center gap-3">
          <UTabs
            v-if="current"
            v-model="lang"
            :items="langItems"
            variant="pill"
            :content="false"
            size="md"
          />
          <URadioGroup
            v-else
            v-model="sourceLang"
            orientation="horizontal"
            :legend="t('admin.changelog.writtenIn')"
            :items="
              LANGS.map((value) => ({ value, label: t(`admin.changelog.languages.${value}`) }))
            "
            value-key="value"
            @update:model-value="lang = sourceLang"
          />
          <span class="flex-1" />
          <UButton
            v-if="current"
            color="neutral"
            variant="soft"
            size="md"
            icon="i-lucide-languages"
            :label="
              t('admin.changelog.translateTo', {
                language: t(`admin.changelog.languages.${otherLang}`),
              })
            "
            :loading="busy === 'translate'"
            :disabled="!canTranslate || !canSave || busy !== null"
            @click="onTranslate"
          />
        </div>
        <p v-if="current && !canTranslate" class="-mt-2 text-sm text-muted">
          {{ t('admin.changelog.translationUnavailable') }}
        </p>

        <UAlert
          v-if="current && lang !== sourceLang && unreviewed"
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          :title="t('admin.changelog.unreviewedTitle')"
          :description="t('admin.changelog.unreviewedLede')"
          :actions="[
            {
              label: t('admin.changelog.markReviewed'),
              color: 'neutral',
              variant: 'outline',
              size: 'md',
              loading: busy === 'save',
              onClick: () => onSave(true),
            },
          ]"
        />
        <p v-else-if="current && lang !== sourceLang && !hasTranslation" class="text-sm text-muted">
          {{
            t('admin.changelog.notTranslatedLede', {
              language: t(`admin.changelog.languages.${sourceLang}`),
            })
          }}
        </p>

        <URadioGroup
          v-model="mode"
          variant="card"
          color="secondary"
          orientation="horizontal"
          :legend="t('admin.changelog.mode')"
          :items="modes"
          value-key="value"
          :ui="{ fieldset: 'grid grid-cols-1 gap-3 sm:grid-cols-2' }"
        />

        <template v-if="mode === 'write'">
          <UFormField :label="t('admin.changelog.titleField')" required>
            <UInput v-model="texts[lang].title" :maxlength="160" class="w-full" />
          </UFormField>
          <UFormField
            :label="t('admin.changelog.body')"
            :help="t('admin.changelog.bodyHelp')"
            required
          >
            <div
              ref="bodyBox"
              class="flex flex-col gap-2"
              @dragover.prevent="dragging = true"
              @dragleave="dragging = false"
              @drop="onDrop"
              @paste.capture="onPaste"
            >
              <div class="flex flex-wrap items-center gap-2">
                <input
                  ref="imageInput"
                  type="file"
                  class="hidden"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  @change="onPick"
                />
                <UButton
                  color="neutral"
                  variant="soft"
                  size="md"
                  icon="i-lucide-image-plus"
                  :label="t('admin.changelog.addImage')"
                  :loading="uploading"
                  :disabled="uploading"
                  @click="imageInput?.click()"
                />
                <span class="text-sm text-muted">{{ t('admin.changelog.addImageHelp') }}</span>
              </div>
              <UTextarea
                v-model="texts[lang].body"
                :rows="16"
                class="w-full"
                :ui="{
                  // No `autoresize`: it collapses the page on every keystroke and jumps the scroll to the top.
                  base: ['resize-y', dragging && 'ring-2 ring-secondary ring-inset'],
                }"
                :aria-busy="uploading"
              />
            </div>
          </UFormField>
        </template>
        <article v-else class="flex max-w-prose flex-col gap-4" :aria-busy="previewing">
          <div class="flex flex-wrap items-center gap-2">
            <UBadge
              v-if="versionTag.trim()"
              color="neutral"
              variant="subtle"
              :label="versionTag.trim()"
            />
            <UBadge v-if="dateShown" color="neutral" variant="outline" :label="dateShown" />
          </div>
          <h1 class="font-display text-3xl font-bold text-highlighted">
            {{ shown.title || t('admin.changelog.untitled') }}
          </h1>
          <p v-if="shown.summary" class="text-lg text-muted">{{ shown.summary }}</p>
          <!-- eslint-disable-next-line vue/no-v-html -->
          <div class="changelog-prose" v-html="html" />
        </article>
      </section>
    </div>
  </AdminPage>
</template>
