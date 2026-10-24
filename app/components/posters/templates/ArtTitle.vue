<script setup lang="ts">
// Art title: a huge title filled with the art (treated or not), then a big date and the QR code.
// Ported from the "ArtTitle" boards of the LNB posters canvas; the dark medium board is its long
// title stress test, with the footer line under the title.
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

// The art shows through the letters. Without art, the title is plain ink.
const fill = computed(() =>
  art.value && fields.value.art
    ? {
        backgroundImage: `url("${art.value}")`,
        backgroundPosition: focusPosition(fields.value.art),
      }
    : undefined,
);
</script>

<template>
  <PostersHeader :schools="fields.schools" />

  <div class="poster-titles">
    <span v-if="fields.kicker" class="poster-kicker">{{ fields.kicker }}</span>
    <PostersFitTitle
      :text="fields.title"
      :max="176"
      :min="64"
      :max-height="footer ? 300 : 420"
      class="poster-title"
      :class="{ 'poster-title-art': fill }"
      :style="fill"
    />
    <p v-if="footer" class="poster-footer">{{ footer }}</p>
  </div>

  <PostersSticker v-if="sticker" :lines="sticker" class="poster-sticker-place" />

  <div class="poster-rule" />

  <div class="poster-bottom">
    <div class="poster-when">
      <span v-if="date" class="poster-day">{{ date.day }}</span>
      <span v-if="date" class="poster-month">{{ date.month }}</span>
      <span v-if="date" class="poster-time">{{ date.when }}</span>
      <span v-if="fields.place" class="poster-place">{{ fields.place }}</span>
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
.poster-titles {
  position: absolute;
  top: 140px;
  right: 24px;
  left: 40px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.poster-kicker {
  overflow: hidden;
  padding-left: 6px;
  color: var(--poster-kicker);
  font-family: var(--poster-display);
  font-size: 34px;
  font-weight: 500;
  letter-spacing: -0.01em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.poster-title {
  color: var(--poster-ink);
  font-family: var(--poster-display);
  font-weight: 900;
  line-height: 0.86;
  letter-spacing: -0.045em;
}

.poster-title-art {
  background-size: cover;
  background-clip: text;
  color: transparent;
  -webkit-text-fill-color: transparent;
}

.poster-footer {
  max-width: 560px;
  margin: 18px 0 0 4px;
  font-family: var(--poster-display);
  font-size: 26px;
  font-weight: 500;
  line-height: 36px;
  letter-spacing: -0.01em;
}

.poster-sticker-place {
  --size: 176px;
  top: 400px;
  left: 540px;
}

.poster-rule {
  position: absolute;
  top: 640px;
  right: 48px;
  left: 48px;
  height: 4px;
  background: var(--poster-ink);
}

.poster-bottom {
  position: absolute;
  top: 680px;
  right: 48px;
  left: 48px;
  display: flex;
  align-items: flex-start;
  gap: 32px;
}

.poster-when {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.poster-day {
  color: var(--poster-date);
  font-family: var(--poster-display);
  font-size: 200px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 0.82;
  letter-spacing: -0.05em;
}

.poster-month {
  font-family: var(--poster-display);
  font-size: 40px;
  font-weight: 700;
  line-height: 46px;
}

.poster-time {
  font-size: 26px;
  font-weight: 600;
  line-height: 34px;
}

.poster-place {
  color: var(--poster-muted);
  font-size: 20px;
  line-height: 28px;
}

.poster-spacer {
  flex-grow: 1;
}

.poster-qr {
  display: flex;
  flex: none;
  flex-direction: column;
  align-items: flex-end;
  gap: 14px;
}

.poster-qr-label {
  max-width: 220px;
  font-size: 20px;
  font-weight: 600;
  line-height: 26px;
  text-align: right;
}

.poster-qr-card {
  --size: 200px;
}
</style>
