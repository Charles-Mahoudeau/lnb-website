<script setup lang="ts">
// Badge: a tilted player badge hanging from a strap, with the art, the title, the date and the QR
// code, and the footer line centred under it. Ported from the "Badge" boards of the LNB posters
// canvas.
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
  <div class="poster-strap" />

  <div class="poster-badge">
    <div class="poster-hole" />
    <img
      v-if="art && fields.art"
      :src="art"
      alt=""
      class="poster-art"
      :style="{ objectPosition: focusPosition(fields.art) }"
    />
    <div v-else class="poster-art poster-art-empty" />

    <div class="poster-titles">
      <span v-if="fields.kicker" class="poster-kicker">{{ fields.kicker }}</span>
      <PostersFitTitle
        :text="fields.title"
        :max="84"
        :min="40"
        :max-height="176"
        class="poster-title"
      />
    </div>

    <div class="poster-perforation" />

    <div class="poster-bottom">
      <div class="poster-when">
        <div v-if="date" class="poster-date">
          <span class="poster-day">{{ date.day }}</span>
          <span class="poster-month">{{ date.monthShort }}</span>
        </div>
        <span v-if="date" class="poster-time">{{ date.when }}</span>
        <span v-if="fields.place" class="poster-place">{{ fields.place }}</span>
      </div>
      <div class="poster-spacer" />
      <div v-if="props.poster.content.qrEnabled" class="poster-qr">
        <PostersQr
          :url="props.poster.qrUrl"
          :placeholder="print('qrPlaceholder')"
          class="poster-qr-card"
        />
        <span class="poster-qr-label">{{ qrLabel }}</span>
      </div>
    </div>
  </div>

  <PostersHeader :schools="fields.schools" />

  <PostersSticker v-if="sticker" :lines="sticker" class="poster-sticker-place" />

  <p v-if="footer" class="poster-footer">{{ footer }}</p>
</template>

<style scoped>
.poster-strap {
  position: absolute;
  top: 0;
  left: 367px;
  width: 60px;
  height: 196px;
  background: var(--poster-strap);
}

.poster-badge {
  position: absolute;
  top: 160px;
  left: 137px;
  overflow: hidden;
  width: 520px;
  height: 820px;
  border-radius: 24px;
  background: #ffffff;
  box-shadow:
    0 10px 15px -3px rgb(0 0 0 / 0.1),
    0 4px 6px -4px rgb(0 0 0 / 0.1);
  transform: rotate(2deg);
}

.poster-hole {
  position: absolute;
  top: 24px;
  left: 215px;
  width: 90px;
  height: 18px;
  border-radius: 9999px;
  background: var(--poster-bg);
}

.poster-art {
  position: absolute;
  top: 64px;
  left: 32px;
  width: 456px;
  height: 290px;
  border-radius: 12px;
  object-fit: cover;
}

.poster-art-empty {
  background: var(--poster-ink);
}

.poster-titles {
  position: absolute;
  top: 372px;
  right: 32px;
  left: 36px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.poster-kicker {
  overflow: hidden;
  padding-left: 3px;
  color: var(--poster-kicker);
  font-family: var(--poster-display);
  font-size: 24px;
  font-weight: 500;
  letter-spacing: -0.01em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.poster-title {
  font-family: var(--poster-display);
  font-weight: 900;
  line-height: 0.9;
  letter-spacing: -0.04em;
}

.poster-perforation {
  position: absolute;
  top: 600px;
  right: 32px;
  left: 32px;
  border-top: 3px dashed var(--poster-line);
}

.poster-bottom {
  position: absolute;
  top: 624px;
  right: 32px;
  left: 32px;
  display: flex;
  align-items: center;
  gap: 20px;
  height: 168px;
}

.poster-when {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.poster-date {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.poster-day {
  color: var(--poster-date);
  font-family: var(--poster-display);
  font-size: 72px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  letter-spacing: -0.03em;
}

.poster-month {
  font-family: var(--poster-display);
  font-size: 22px;
  font-weight: 700;
}

.poster-time {
  font-size: 19px;
  font-weight: 600;
  line-height: 26px;
}

.poster-place {
  color: var(--poster-muted);
  font-size: 15px;
  line-height: 21px;
}

.poster-spacer {
  flex-grow: 1;
}

.poster-qr {
  display: flex;
  flex: none;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.poster-qr-card {
  --size: 140px;
}

.poster-qr-label {
  max-width: 180px;
  font-size: 14px;
  font-weight: 600;
  text-align: center;
}

.poster-sticker-place {
  --size: 160px;
  --rotate: 12deg;
  top: 420px;
  left: 560px;
}

.poster-footer {
  position: absolute;
  right: 48px;
  bottom: 44px;
  left: 48px;
  margin: 0;
  color: var(--poster-muted);
  font-size: 16px;
  line-height: 22px;
  text-align: center;
}
</style>
