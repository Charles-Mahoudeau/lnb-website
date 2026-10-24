<script setup lang="ts">
// Banner: the art across the top, the title under it, then the date and the QR code. Ported from
// the "Main" boards of the LNB posters canvas.
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
      :max="132"
      :min="56"
      :max-height="footer ? 184 : 232"
      class="poster-title"
    />
    <p v-if="footer" class="poster-footer">{{ footer }}</p>
  </div>

  <div class="poster-rule" />

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
      <PostersQr :url="props.poster.qrUrl" :placeholder="print('qrPlaceholder')" />
    </div>
  </div>
</template>

<style scoped>
.poster-art {
  position: absolute;
  top: 112px;
  left: 0;
  width: 794px;
  height: 488px;
  object-fit: cover;
}

.poster-art-empty {
  background: var(--poster-ink);
}

.poster-sticker-place {
  top: 516px;
  left: 584px;
}

.poster-titles {
  position: absolute;
  top: 624px;
  right: 40px;
  left: 44px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.poster-kicker {
  overflow: hidden;
  padding-left: 4px;
  color: var(--poster-kicker);
  font-family: var(--poster-display);
  font-size: 30px;
  font-weight: 500;
  letter-spacing: -0.01em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.poster-title {
  font-family: var(--poster-display);
  font-weight: 900;
  line-height: 0.88;
  letter-spacing: -0.04em;
}

.poster-footer {
  margin: 4px 0 0 4px;
  overflow: hidden;
  color: var(--poster-muted);
  font-size: 18px;
  font-weight: 600;
  line-height: 24px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.poster-rule {
  position: absolute;
  top: 912px;
  right: 48px;
  left: 48px;
  height: 4px;
  background: var(--poster-ink);
}

.poster-bottom {
  position: absolute;
  top: 936px;
  right: 48px;
  left: 48px;
  display: flex;
  align-items: center;
  gap: 32px;
  height: 152px;
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
  font-size: 104px;
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
</style>
