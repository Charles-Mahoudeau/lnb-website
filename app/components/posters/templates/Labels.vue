<script setup lang="ts">
// Labels: a tall art, with the kicker and each title line on its own label, slightly tilted, then
// the date and the QR code. Ported from the "Labels" boards of the LNB posters canvas.
const props = defineProps<{ poster: PosterRender }>();
const { t } = useI18n();

const fields = computed(() => props.poster.fields);
const art = computed(() => posterArt(props.poster));
const sticker = computed(() => posterSticker(props.poster.content));
const date = computed(() =>
  fields.value.startsAt ? posterDate(fields.value.startsAt, props.poster.locale) : null,
);
const footer = computed(() => props.poster.content.footer.trim());
const print = (key: string) => t(`posters.print.${key}`, {}, { locale: props.poster.locale });
const qrLabel = computed(() => props.poster.content.qrLabel ?? print('qrLabel'));
</script>

<template>
  <img
    v-if="art && fields.art"
    :src="art"
    alt=""
    class="poster-art"
    :style="{ objectPosition: focusPosition(fields.art) }"
  />
  <div v-else class="poster-art poster-art-empty" />

  <PostersHeader :schools="fields.schools" />

  <PostersSticker v-if="sticker" :lines="sticker" class="poster-sticker-place" />

  <div class="poster-titles">
    <span v-if="fields.kicker" class="poster-kicker">{{ fields.kicker }}</span>
    <PostersFitTitle
      :text="fields.title"
      :max="120"
      :min="48"
      :max-height="footer ? 250 : 300"
      lines
      class="poster-title"
    />
  </div>

  <p v-if="footer" class="poster-footer">{{ footer }}</p>

  <div class="poster-bottom">
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
.poster-art {
  position: absolute;
  top: 120px;
  left: 0;
  width: 794px;
  height: 620px;
  object-fit: cover;
}

.poster-art-empty {
  background: var(--poster-muted);
}

.poster-sticker-place {
  --size: 152px;
  --rotate: 12deg;
  top: 152px;
  left: 600px;
}

.poster-titles {
  position: absolute;
  top: 560px;
  /* Leaves room for the tilt, which pushes the lower lines right. */
  right: 64px;
  left: 40px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  transform: rotate(-3deg);
  transform-origin: left top;
}

.poster-kicker {
  overflow: hidden;
  max-width: 100%;
  padding: 8px 18px;
  background: var(--poster-label);
  color: #ffffff;
  font-family: var(--poster-display);
  font-size: 28px;
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
  padding: 0.08em 0.22em 0.15em 0.18em;
  background: var(--poster-ink);
  color: #ffffff;
}

.poster-title :deep(.poster-fit-line + .poster-fit-line) {
  margin-top: 10px;
}

.poster-title :deep(.poster-fit-line:nth-child(even)) {
  margin-left: 1em;
}

.poster-footer {
  position: absolute;
  top: 888px;
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
  position: absolute;
  top: 948px;
  right: 48px;
  left: 48px;
  display: flex;
  align-items: center;
  gap: 32px;
  height: 136px;
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
  font-size: 96px;
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
  font-size: 24px;
  font-weight: 700;
  line-height: 30px;
}

.poster-time {
  font-size: 20px;
  font-weight: 600;
  line-height: 26px;
}

.poster-place {
  color: var(--poster-muted);
  font-size: 16px;
  line-height: 22px;
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
  --size: 136px;
}
</style>
