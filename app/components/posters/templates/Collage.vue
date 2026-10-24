<script setup lang="ts">
// Collage: three photos taped on the paper, the kicker and the title on labels, then the date and
// the QR code. Ported from the "Collage" boards of the LNB posters canvas.
const props = defineProps<{ poster: PosterRender }>();
const { t } = useI18n();

const fields = computed(() => props.poster.fields);
const photos = computed(() =>
  [0, 1, 2].map((index) => {
    const image = posterPhoto(props.poster, index);
    return image ? { src: posterArtUrl(image.key, null, 'violet'), image } : null;
  }),
);
const PHOTO_PLACES = ['poster-photo-1', 'poster-photo-2', 'poster-photo-3'];
const sticker = computed(() => posterSticker(props.poster.content));
const date = computed(() =>
  fields.value.startsAt ? posterDate(fields.value.startsAt, props.poster.locale) : null,
);
const footer = computed(() => props.poster.content.footer.trim());
const print = (key: string) => t(`posters.print.${key}`, {}, { locale: props.poster.locale });
const qrLabel = computed(() => props.poster.content.qrLabel ?? print('qrLabel'));
</script>

<template>
  <div
    v-for="(photo, index) in photos"
    :key="index"
    class="poster-photo"
    :class="PHOTO_PLACES[index]"
  >
    <img
      v-if="photo"
      :src="photo.src"
      alt=""
      :style="{ objectPosition: focusPosition(photo.image) }"
    />
  </div>

  <div class="poster-tape poster-tape-1" />
  <div class="poster-tape poster-tape-2" />
  <div class="poster-tape poster-tape-3" />

  <PostersHeader :schools="fields.schools" />

  <PostersSticker v-if="sticker" :lines="sticker" class="poster-sticker-place" />

  <div class="poster-titles">
    <span v-if="fields.kicker" class="poster-kicker">{{ fields.kicker }}</span>
    <PostersFitTitle
      :text="fields.title"
      :max="84"
      :min="40"
      :max-height="footer ? 150 : 164"
      lines
      class="poster-title"
    />
  </div>

  <p v-if="footer" class="poster-footer">{{ footer }}</p>

  <div class="poster-bottom" :class="{ 'poster-bottom-low': footer }">
    <div class="poster-when">
      <span v-if="date" class="poster-day">{{ date.day }}</span>
      <div class="poster-when-text">
        <span v-if="date" class="poster-month">{{ date.month }}</span>
        <span v-if="date" class="poster-time">{{ date.when }}</span>
        <span v-if="fields.place" class="poster-place">{{ fields.place }}</span>
      </div>
    </div>
    <div class="poster-spacer" />
    <div v-if="props.poster.content.qrEnabled" class="poster-qr">
      <span class="poster-qr-label">{{ qrLabel }}</span>
      <PostersQr
        :url="props.poster.qrUrl"
        :placeholder="print('qrPlaceholder')"
        class="poster-qr-card"
      />
    </div>
  </div>
</template>

<style scoped>
.poster-photo {
  position: absolute;
  display: flex;
  padding: 8px;
  background: #ffffff;
}

.poster-photo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.poster-photo-1 {
  top: 196px;
  left: 44px;
  width: 300px;
  height: 380px;
  transform: rotate(-6deg);
}

.poster-photo-2 {
  top: 128px;
  left: 280px;
  width: 470px;
  height: 380px;
  transform: rotate(4deg);
}

.poster-photo-3 {
  top: 452px;
  left: 470px;
  width: 250px;
  height: 170px;
  transform: rotate(-3deg);
}

.poster-tape {
  position: absolute;
  width: 120px;
  height: 32px;
  background: var(--poster-tape);
}

.poster-tape-1 {
  top: 176px;
  left: 96px;
  transform: rotate(-14deg);
}

.poster-tape-2 {
  top: 112px;
  left: 640px;
  transform: rotate(32deg);
}

.poster-tape-3 {
  top: 600px;
  left: 610px;
  width: 110px;
  height: 30px;
  transform: rotate(-24deg);
}

.poster-sticker-place {
  --size: 144px;
  --rotate: -10deg;
  top: 500px;
  left: 300px;
}

.poster-titles {
  position: absolute;
  top: 672px;
  right: 56px;
  left: 40px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  transform: rotate(-2deg);
  transform-origin: left top;
}

.poster-kicker {
  overflow: hidden;
  max-width: 100%;
  padding: 7px 16px;
  background: var(--poster-label);
  color: #ffffff;
  font-family: var(--poster-display);
  font-size: 26px;
  font-weight: 500;
  letter-spacing: -0.01em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.poster-title {
  font-family: var(--poster-display);
  font-weight: 900;
  line-height: 0.95;
  letter-spacing: -0.04em;
}

/* Each line is a label of its own, every other one indented. */
.poster-title :deep(.poster-fit-line) {
  display: block;
  width: fit-content;
  max-width: 100%;
  padding: 0.1em 0.28em 0.17em 0.24em;
  background: var(--poster-ink);
  color: #ffffff;
}

.poster-title :deep(.poster-fit-line + .poster-fit-line) {
  margin-top: 8px;
}

.poster-title :deep(.poster-fit-line:nth-child(even)) {
  margin-left: 0.8em;
}

.poster-footer {
  position: absolute;
  top: 892px;
  right: 48px;
  left: 48px;
  overflow: hidden;
  margin: 0;
  color: var(--poster-muted);
  font-size: 18px;
  font-weight: 600;
  line-height: 24px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.poster-bottom {
  --qr: 168px;
  position: absolute;
  top: 900px;
  right: 48px;
  left: 48px;
  display: flex;
  align-items: center;
  gap: 32px;
  height: 180px;
}

.poster-bottom-low {
  --qr: 156px;
  top: 924px;
  height: 160px;
}

.poster-when {
  display: flex;
  align-items: center;
  gap: 18px;
  min-width: 0;
}

.poster-day {
  color: var(--poster-date);
  font-family: var(--poster-display);
  font-size: 112px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  letter-spacing: -0.03em;
}

.poster-when-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.poster-month {
  font-family: var(--poster-display);
  font-size: 26px;
  font-weight: 700;
  line-height: 32px;
}

.poster-time {
  font-size: 21px;
  font-weight: 600;
  line-height: 28px;
}

.poster-place {
  color: var(--poster-muted);
  font-size: 17px;
  line-height: 24px;
}

.poster-spacer {
  flex-grow: 1;
}

.poster-qr {
  display: flex;
  flex: none;
  align-items: center;
  gap: 16px;
}

.poster-qr-label {
  width: 104px;
  font-size: 17px;
  font-weight: 600;
  line-height: 23px;
  text-align: right;
}

.poster-qr-card {
  --size: var(--qr);
}
</style>
