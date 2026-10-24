<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui';

import { EventsAdminImagePicker } from '#components';

import { posterBody } from '#shared/schemas/posters';
import type { PosterBody, PosterEvent, PosterView } from '#shared/schemas/posters';
import { isoToParisLocal, parisLocalToIso } from '#shared/utils/paris-time';
import {
  allColors,
  POSTER_ACCENTS,
  POSTER_LOCALES,
  POSTER_PHOTOS_MAX,
  POSTER_TEMPLATES,
  POSTER_TREATMENTS,
  resolvePoster,
} from '#shared/utils/posters';
import type {
  PosterAccent,
  PosterField,
  PosterFields,
  PosterImage,
  PosterOverrides,
  PosterTemplate,
} from '#shared/utils/posters';

// The poster editor (docs/posters.md): the preview first, the template strip above it, and the
// settings in tabs beside it. Fields follow the event until edited. The page holds the actions:
// it calls submit(), png() and reads dirty through a template ref.
const props = defineProps<{ poster?: PosterView; eventId?: string | null }>();
const emit = defineEmits<{ submit: [body: PosterBody] }>();

const { t, locale: uiLocale } = useI18n();
const toast = useToast();
const overlay = useOverlay();
const { isEnabled } = useFlags();

// Not awaited: defineExpose must run before any await. The list fills in when it arrives.
const { data: choices } = usePosterEvents();

const saved = props.poster ? posterBodyOf(props.poster) : null;
// A copy, so edits don't touch the fetched poster until it's saved.
const start = JSON.parse(
  JSON.stringify({
    name: saved?.name ?? '',
    eventId: saved?.eventId ?? props.eventId ?? null,
    template: saved?.template ?? 'banner',
    treatment: saved?.treatment ?? null,
    locale: saved?.locale ?? 'fr',
    overrides: saved?.overrides ?? {},
    content: saved?.content ?? newPosterContent(),
  }),
) as Omit<PosterBody, 'qrUrl' | 'overrides'> & { overrides: PosterOverrides };
const state = reactive(start);
const qrTarget = ref<'event' | 'other'>(saved?.qrUrl || !start.eventId ? 'other' : 'event');
const qrUrl = ref(saved?.qrUrl ?? '');

// The poster's own event stays offered even when it's too old for the list.
const events = computed<PosterEvent[]>(() => {
  const list = choices.value?.items ?? [];
  const own = props.poster?.event;
  return own && !list.some((e) => e.id === own.id) ? [own, ...list] : list;
});
const selected = computed(() => events.value.find((e) => e.id === state.eventId) ?? null);
const source = computed(() => selected.value?.source ?? null);
const resolved = computed(() => resolvePoster(state.overrides, source.value, state.locale));
const follows = computed(() => !!source.value);

// The select menu takes '' for "no event".
const eventChoice = computed({
  get: () => state.eventId ?? '',
  set: (id: string) => {
    state.eventId = id || null;
  },
});
const eventItems = computed(() => [
  { label: t('admin.posters.fields.noEvent'), value: '' },
  ...events.value.map((e) => ({
    label: `${e.source.name}, ${formatEventDate(e.source.startsAt, uiLocale.value, { day: 'numeric', month: 'long' })}`,
    value: e.id,
  })),
]);

// The QR code can't lead to an event page without an event.
watch(
  () => state.eventId,
  (id) => {
    if (!id) qrTarget.value = 'other';
  },
);

/** A field shown as resolved: editing it pins it on the poster. */
function field<K extends PosterField>(key: K) {
  return computed({
    get: () => resolved.value.fields[key],
    set: (value: PosterFields[K]) => {
      state.overrides[key] = value;
    },
  });
}
const kicker = field('kicker');
const title = field('title');
const place = field('place');
const schools = field('schools');
const art = field('art');

function reset(key: PosterField) {
  delete state.overrides[key];
}

const startsAt = computed({
  get: () =>
    resolved.value.fields.startsAt ? isoToParisLocal(resolved.value.fields.startsAt) : '',
  set: (local: string) => {
    state.overrides.startsAt = local ? parisLocalToIso(local) : null;
  },
});
const eventStart = computed(() => {
  const iso = source.value?.startsAt;
  if (!iso || !resolved.value.pinned.startsAt || iso === resolved.value.fields.startsAt) return '';
  const date = formatEventDate(iso, uiLocale.value, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
  return t('admin.posters.fields.eventStartsAt', { date });
});

const schoolChoices = Object.entries(SCHOOLS).map(([value, label]) => ({ value, label }));
function toggleSchool(tid: string) {
  const on = new Set(schools.value);
  if (on.has(tid)) on.delete(tid);
  else on.add(tid);
  schools.value = schoolChoices.map((s) => s.value).filter((id) => on.has(id));
}

// Images go through the events' picker, which also moves the focus point.
const picker = overlay.create(EventsAdminImagePicker);
async function pickImage(title: string, current: PosterImage | null, focusOnly = false) {
  const image: unknown = await picker.open({
    title,
    image: focusOnly && current ? { ...current, url: `/api/media/${current.key}` } : undefined,
  }).result;
  if (!image || typeof image !== 'object') return undefined;
  const { key, focusX, focusY } = image as PickedEventImage;
  return { key, focusX, focusY };
}
async function pickArt(focusOnly = false) {
  const image = await pickImage(t('admin.posters.fields.artTitle'), art.value, focusOnly);
  if (image) art.value = image;
}
async function pickPhoto(index: number, focusOnly = false) {
  const current = state.content.photos[index] ?? art.value;
  const image = await pickImage(
    t('admin.posters.fields.photoTitle', { n: index + 1 }),
    current,
    focusOnly,
  );
  if (!image) return;
  const photos = [...state.content.photos];
  while (photos.length < index) photos.push(null);
  photos[index] = image;
  state.content.photos = photos;
}
function clearPhoto(index: number) {
  const photos = [...state.content.photos];
  photos[index] = null;
  state.content.photos = photos;
}
const photoSlots = Array.from({ length: POSTER_PHOTOS_MAX }, (_, i) => i);
const mediaUrl = (image: PosterImage) => `/api/media/${image.key}`;

// Colours: part by part, or all at once.
const colorElements = computed(() => posterColorElements(state.template, state.treatment));
const allAccent = computed<PosterAccent | null>(() => {
  const used = colorElements.value.map((element) => state.content.colors[element]);
  return POSTER_ACCENTS.find((accent) => used.every((value) => value === accent)) ?? null;
});
function setAll(accent: PosterAccent) {
  state.content.colors = allColors(accent);
}

const treatmentChoices = [null, ...POSTER_TREATMENTS] as const;

const tab = ref('content');
const tabs = computed<TabsItem[]>(() => [
  { label: t('admin.posters.tabs.content'), value: 'content' },
  { label: t('admin.posters.tabs.style'), value: 'style' },
  { label: t('admin.posters.tabs.qr'), value: 'qr' },
]);

// QR code
const qr = computed(() => props.poster?.qr ?? null);
const qrLabelDefault = computed(() =>
  t('posters.print.qrLabel', {}, { locale: state.locale }).replace(/\n/g, ' '),
);
const qrNeedsUrl = computed(
  () => state.content.qrEnabled && (qrTarget.value === 'other' || !state.eventId),
);
const qrUrlInvalid = computed(
  () =>
    qrNeedsUrl.value &&
    qrUrl.value.trim() !== '' &&
    !posterBody.shape.qrUrl.safeParse(qrUrl.value.trim()).success,
);
async function copyLink() {
  if (!qr.value) return;
  await navigator.clipboard.writeText(qr.value.url);
  toast.add({ title: t('admin.posters.qr.copied'), color: 'success', icon: 'i-lucide-copy' });
}

/** The poster as it would be saved. */
function body(): PosterBody {
  const name =
    state.name.trim() || source.value?.name || resolved.value.fields.title.split('\n')[0] || '';
  return JSON.parse(
    JSON.stringify({
      ...state,
      name: (name || t('admin.posters.new')).slice(0, 80),
      treatment: state.template === 'artTitle' ? state.treatment : null,
      content: { ...state.content, qrLabel: state.content.qrLabel?.trim() || null },
      qrUrl: qrTarget.value === 'other' || !state.eventId ? qrUrl.value.trim() || null : null,
    }),
  ) as PosterBody;
}

const initialBody = JSON.stringify(body());
const dirty = computed(() => JSON.stringify(body()) !== initialBody);

function submit() {
  const result = posterBody.safeParse(body());
  const missingUrl = qrNeedsUrl.value && !qrUrl.value.trim();
  if (!result.success || missingUrl) {
    const qrProblem =
      missingUrl || !!result.error?.issues.some((issue) => issue.path[0] === 'qrUrl');
    toast.add({
      title: t(qrProblem ? 'admin.posters.errors.qrUrlNeeded' : 'admin.posters.errors.invalid'),
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
    if (qrProblem) tab.value = 'qr';
    return;
  }
  emit('submit', body());
}

// The preview, and the strip's thumbnails in each template.
const render = computed<PosterRender>(() => ({
  template: state.template,
  treatment: state.template === 'artTitle' ? state.treatment : null,
  locale: state.locale,
  fields: resolved.value.fields,
  content: { ...state.content, qrLabel: state.content.qrLabel?.trim() || null },
  qrUrl: qr.value?.url ?? null,
}));

const stage = useTemplateRef<HTMLElement>('stage');
const previewWidth = ref(480);
let observer: ResizeObserver | undefined;
onMounted(() => {
  if (!stage.value) return;
  observer = new ResizeObserver(([entry]) => {
    if (entry) previewWidth.value = Math.min(572, Math.floor(entry.contentRect.width));
  });
  observer.observe(stage.value);
});
onBeforeUnmount(() => observer?.disconnect());

/** The preview as a 300 dpi PNG. */
async function png(): Promise<Blob> {
  const root = stage.value?.querySelector<HTMLElement>('.poster');
  if (!root) throw new Error('No poster to export');
  return posterPng(root);
}

const name = computed(() => body().name);

defineExpose({ submit, png, dirty, name });

function templateLabel(template: PosterTemplate) {
  return t(`admin.posters.templates.${template}`);
}
</script>

<template>
  <form class="flex flex-col gap-6" @submit.prevent="submit">
    <div class="flex flex-wrap items-center gap-2 border-b border-default pb-4">
      <button
        v-for="template in POSTER_TEMPLATES"
        :key="template"
        type="button"
        class="flex items-center gap-2.5 rounded-md border-2 py-1.5 ps-1.5 pe-3 text-sm font-semibold"
        :class="
          state.template === template
            ? 'border-primary bg-primary/15 text-primary'
            : 'border-transparent bg-elevated text-muted hover:text-highlighted'
        "
        :aria-pressed="state.template === template"
        @click="state.template = template"
      >
        <PostersPreview :poster="{ ...render, template }" :width="40" />
        {{ templateLabel(template) }}
      </button>
      <span class="grow" />
      <UFieldGroup :aria-label="t('admin.posters.colours')">
        <UButton
          v-for="accent in POSTER_ACCENTS"
          :key="accent"
          color="neutral"
          :variant="allAccent === accent ? 'subtle' : 'outline'"
          :label="t(accent === 'violet' ? 'admin.posters.allViolet' : 'admin.posters.allRed')"
          @click="setAll(accent)"
        />
      </UFieldGroup>
    </div>

    <div class="flex flex-col gap-3">
      <UAlert
        v-if="selected?.cancelled"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-x"
        :description="t('admin.posters.warnings.cancelled')"
      />
      <UAlert
        v-else-if="selected?.draft && state.content.qrEnabled && qrTarget === 'event'"
        color="warning"
        variant="subtle"
        icon="i-lucide-eye-off"
        :description="t('admin.posters.warnings.draft')"
      />
      <UAlert
        v-if="state.content.qrEnabled && !isEnabled('shortLinks')"
        color="warning"
        variant="subtle"
        icon="i-lucide-link-2-off"
        :description="t('admin.posters.warnings.shortLinksOff')"
      />
    </div>

    <div class="flex flex-wrap items-start gap-6">
      <section
        :aria-label="t('admin.posters.preview')"
        class="flex min-w-0 grow basis-96 justify-center"
      >
        <div ref="stage" class="flex w-full max-w-xl justify-center">
          <PostersPreview :poster="render" :width="previewWidth" class="shadow-lg" />
        </div>
      </section>

      <aside
        :aria-label="t('admin.posters.settings')"
        class="w-full min-w-0 shrink-0 rounded-lg bg-elevated lg:w-md"
      >
        <UTabs v-model="tab" :items="tabs" :content="false" variant="link" class="px-5" />

        <div v-if="tab === 'content'" class="flex flex-col gap-4 p-5">
          <UFormField :label="t('admin.posters.fields.event')">
            <USelectMenu
              v-model="eventChoice"
              :items="eventItems"
              value-key="value"
              :search-input="{ placeholder: t('admin.posters.fields.searchEvents') }"
              class="w-full"
            />
          </UFormField>
          <UFormField
            :label="t('admin.posters.fields.name')"
            :help="t('admin.posters.fields.nameHelp')"
          >
            <UInput
              v-model="state.name"
              :placeholder="source?.name ?? ''"
              :maxlength="80"
              class="w-full"
            />
          </UFormField>
          <UFormField :label="t('admin.posters.fields.language')">
            <UFieldGroup>
              <UButton
                v-for="lang in POSTER_LOCALES"
                :key="lang"
                color="neutral"
                :variant="state.locale === lang ? 'subtle' : 'outline'"
                :label="lang === 'fr' ? 'Français' : 'English'"
                :lang="lang"
                @click="state.locale = lang"
              />
            </UFieldGroup>
          </UFormField>
          <PostersEditorField
            :label="t('admin.posters.fields.kicker')"
            :follows="follows"
            :pinned="resolved.pinned.kicker"
            @reset="reset('kicker')"
          >
            <UInput v-model="kicker" :maxlength="40" class="w-full" />
          </PostersEditorField>
          <PostersEditorField
            :label="t('admin.posters.fields.title')"
            :help="t('admin.posters.fields.titleHelp')"
            :follows="follows"
            :pinned="resolved.pinned.title"
            @reset="reset('title')"
          >
            <UTextarea v-model="title" :rows="2" autoresize :maxlength="120" class="w-full" />
          </PostersEditorField>
          <UFormField
            :label="t('admin.posters.fields.sticker')"
            :help="t('admin.posters.fields.stickerHelp')"
          >
            <div class="grid grid-cols-3 gap-2">
              <UInput
                v-for="(_, index) in state.content.sticker"
                :key="index"
                v-model="state.content.sticker[index]"
                :maxlength="12"
                :aria-label="t(`admin.posters.fields.stickerLines.${index}`)"
              />
            </div>
          </UFormField>
          <PostersEditorField
            :label="t('admin.posters.fields.startsAt')"
            :help="eventStart || undefined"
            :follows="follows"
            :pinned="resolved.pinned.startsAt"
            @reset="reset('startsAt')"
          >
            <UInput v-model="startsAt" type="datetime-local" class="w-full" />
          </PostersEditorField>
          <PostersEditorField
            :label="t('admin.posters.fields.place')"
            :follows="follows"
            :pinned="resolved.pinned.place"
            @reset="reset('place')"
          >
            <UInput v-model="place" :maxlength="120" class="w-full" />
          </PostersEditorField>
          <PostersEditorField
            :label="t('admin.posters.fields.schools')"
            :follows="follows"
            :pinned="resolved.pinned.schools"
            @reset="reset('schools')"
          >
            <div class="flex flex-wrap gap-2">
              <UButton
                v-for="school in schoolChoices"
                :key="school.value"
                size="sm"
                :color="schools.includes(school.value) ? 'primary' : 'neutral'"
                :variant="schools.includes(school.value) ? 'subtle' : 'outline'"
                :aria-pressed="schools.includes(school.value)"
                :label="school.label"
                class="rounded-full"
                @click="toggleSchool(school.value)"
              />
            </div>
          </PostersEditorField>
          <PostersEditorField
            :label="t('admin.posters.fields.art')"
            :follows="follows"
            :pinned="resolved.pinned.art"
            @reset="reset('art')"
          >
            <div class="flex flex-wrap items-center gap-3">
              <img
                v-if="art"
                :src="mediaUrl(art)"
                alt=""
                class="h-16 w-48 rounded-sm object-cover"
                :style="{ objectPosition: focusPosition(art) }"
              />
              <span v-else class="text-sm text-muted">{{ t('admin.posters.fields.noArt') }}</span>
              <div class="flex flex-wrap gap-2">
                <UButton
                  color="neutral"
                  variant="outline"
                  size="sm"
                  :label="t('admin.posters.fields.changeArt')"
                  @click="pickArt()"
                />
                <template v-if="art">
                  <UButton
                    color="neutral"
                    variant="ghost"
                    size="sm"
                    :label="t('admin.posters.fields.moveFocus')"
                    @click="pickArt(true)"
                  />
                  <UButton
                    color="neutral"
                    variant="ghost"
                    size="sm"
                    :label="t('admin.posters.fields.removeArt')"
                    @click="art = null"
                  />
                </template>
              </div>
            </div>
          </PostersEditorField>
          <UFormField
            v-if="state.template === 'collage'"
            :label="t('admin.posters.fields.photos')"
            :help="t('admin.posters.fields.photosHelp')"
          >
            <div class="flex flex-col gap-3">
              <div
                v-for="index in photoSlots"
                :key="index"
                class="flex flex-wrap items-center gap-3"
              >
                <span class="w-16 text-sm font-semibold">
                  {{ t('admin.posters.fields.photo', { n: index + 1 }) }}
                </span>
                <img
                  v-if="posterPhoto(render, index)"
                  :src="mediaUrl(posterPhoto(render, index)!)"
                  alt=""
                  class="size-12 rounded-sm object-cover"
                  :style="{ objectPosition: focusPosition(posterPhoto(render, index)!) }"
                />
                <UButton
                  color="neutral"
                  variant="outline"
                  size="xs"
                  :label="t('admin.posters.fields.changeArt')"
                  @click="pickPhoto(index)"
                />
                <UButton
                  v-if="posterPhoto(render, index)"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  :label="t('admin.posters.fields.moveFocus')"
                  @click="pickPhoto(index, true)"
                />
                <UButton
                  v-if="state.content.photos[index]"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  :label="t('admin.posters.fields.useArt')"
                  @click="clearPhoto(index)"
                />
              </div>
            </div>
          </UFormField>
          <UFormField :label="t('admin.posters.fields.footer')">
            <UInput
              v-model="state.content.footer"
              :placeholder="t('admin.posters.fields.optional')"
              :maxlength="120"
              class="w-full"
            />
          </UFormField>
        </div>

        <div v-else-if="tab === 'style'" class="flex flex-col gap-5 p-5">
          <UFormField
            v-if="state.template === 'artTitle'"
            :label="t('admin.posters.fields.treatment')"
            :help="t('admin.posters.fields.treatmentHelp')"
          >
            <div class="flex flex-wrap gap-2">
              <UButton
                v-for="treatment in treatmentChoices"
                :key="treatment ?? 'none'"
                size="sm"
                :color="state.treatment === treatment ? 'primary' : 'neutral'"
                :variant="state.treatment === treatment ? 'subtle' : 'outline'"
                :aria-pressed="state.treatment === treatment"
                :label="t(`admin.posters.fields.treatments.${treatment ?? 'none'}`)"
                class="rounded-full"
                @click="state.treatment = treatment"
              />
            </div>
          </UFormField>
          <UFormField
            :label="t('admin.posters.colours')"
            :help="t('admin.posters.fields.colorsHelp')"
          >
            <ul class="flex flex-col divide-y divide-default">
              <li
                v-for="element in colorElements"
                :key="element"
                class="flex items-center justify-between gap-3 py-2"
              >
                <span>{{ t(`admin.posters.fields.elements.${element}`) }}</span>
                <span class="flex gap-1.5">
                  <UButton
                    v-for="accent in POSTER_ACCENTS"
                    :key="accent"
                    size="sm"
                    color="neutral"
                    :variant="state.content.colors[element] === accent ? 'subtle' : 'ghost'"
                    :aria-pressed="state.content.colors[element] === accent"
                    @click="state.content.colors[element] = accent"
                  >
                    <span
                      class="size-3 rounded-full"
                      :style="{ background: POSTER_ACCENT_COLORS[accent].ink }"
                    />
                    {{ t(`admin.posters.fields.accents.${accent}`) }}
                  </UButton>
                </span>
              </li>
            </ul>
          </UFormField>
        </div>

        <div v-else class="flex flex-col gap-4 p-5">
          <USwitch v-model="state.content.qrEnabled" :label="t('admin.posters.qr.show')" />
          <template v-if="state.content.qrEnabled">
            <div
              v-if="qr"
              class="flex flex-wrap items-center gap-3 rounded-md bg-accented px-3.5 py-3"
            >
              <span class="font-semibold break-all">{{ qr.url.replace(/^https?:\/\//, '') }}</span>
              <UButton
                color="neutral"
                variant="ghost"
                size="sm"
                icon="i-lucide-copy"
                :aria-label="t('admin.posters.qr.copy')"
                @click="copyLink"
              />
              <span class="grow" />
              <span class="font-display text-lg font-bold tabular-nums">{{ qr.clicks }}</span>
              <span class="text-sm text-muted">{{ t('admin.posters.qr.scans') }}</span>
            </div>
            <p v-else class="text-sm text-muted">{{ t('admin.posters.qr.notYet') }}</p>
            <UFormField :label="t('admin.posters.qr.leadsTo')">
              <div class="flex flex-wrap gap-2">
                <UButton
                  size="sm"
                  :color="qrTarget === 'event' ? 'primary' : 'neutral'"
                  :variant="qrTarget === 'event' ? 'subtle' : 'outline'"
                  :disabled="!state.eventId"
                  :aria-pressed="qrTarget === 'event'"
                  :label="t('admin.posters.qr.eventPage')"
                  class="rounded-full"
                  @click="qrTarget = 'event'"
                />
                <UButton
                  size="sm"
                  :color="qrTarget === 'other' ? 'primary' : 'neutral'"
                  :variant="qrTarget === 'other' ? 'subtle' : 'outline'"
                  :aria-pressed="qrTarget === 'other'"
                  :label="t('admin.posters.qr.otherLink')"
                  class="rounded-full"
                  @click="qrTarget = 'other'"
                />
              </div>
            </UFormField>
            <UFormField
              v-if="qrTarget === 'other'"
              :label="t('admin.posters.qr.url')"
              :help="t('admin.posters.qr.urlHelp')"
              :error="qrUrlInvalid ? t('admin.posters.qr.urlHelp') : undefined"
              required
            >
              <UInput
                v-model="qrUrl"
                type="url"
                inputmode="url"
                placeholder="https://"
                class="w-full"
              />
            </UFormField>
            <UFormField :label="t('admin.posters.qr.label')">
              <UInput
                :model-value="state.content.qrLabel ?? ''"
                :placeholder="qrLabelDefault"
                :maxlength="40"
                class="w-full"
                @update:model-value="state.content.qrLabel = String($event) || null"
              />
            </UFormField>
          </template>
          <ULink v-if="qr" :to="`/admin/short-links/${qr.linkId}`" class="text-sm font-semibold">
            {{ t('admin.posters.qr.open') }}
          </ULink>
        </div>
      </aside>
    </div>
  </form>
</template>
