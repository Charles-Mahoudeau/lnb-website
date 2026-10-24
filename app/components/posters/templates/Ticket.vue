<script setup lang="ts">
// Ticket: a white ticket with the art on top, the title, then a perforation and the stub with
// the date and the QR code. Ported from the "Ticket" boards of the LNB posters canvas.
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
  <PostersHeader :schools="fields.schools" />

  <div class="poster-ticket">
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
        :max="116"
        :min="48"
        :max-height="footer ? 170 : 210"
        class="poster-title"
      />
      <p v-if="footer" class="poster-footer">{{ footer }}</p>
    </div>

    <div class="poster-perforation" />
    <div class="poster-notch poster-notch-left" />
    <div class="poster-notch poster-notch-right" />

    <div class="poster-stub">
      <div class="poster-when">
        <div v-if="date" class="poster-date">
          <span class="poster-day">{{ date.day }}</span>
          <span class="poster-month">{{ date.month }}</span>
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

  <PostersSticker v-if="sticker" :lines="sticker" class="poster-sticker-place" />
</template>

<style scoped>
.poster-ticket {
  position: absolute;
  top: 112px;
  left: 48px;
  overflow: hidden;
  width: 698px;
  height: 968px;
  border-radius: 16px;
  background: #ffffff;
}

.poster-art {
  position: absolute;
  top: 0;
  left: 0;
  width: 698px;
  height: 408px;
  object-fit: cover;
}

.poster-art-empty {
  background: var(--poster-ink);
}

.poster-titles {
  position: absolute;
  top: 408px;
  right: 32px;
  left: 36px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  height: 291px;
  gap: 6px;
}

.poster-kicker {
  overflow: hidden;
  padding-left: 4px;
  color: var(--poster-kicker);
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
  line-height: 0.88;
  letter-spacing: -0.04em;
}

.poster-footer {
  overflow: hidden;
  margin: 10px 0 0 4px;
  color: var(--poster-muted);
  font-size: 19px;
  font-weight: 600;
  line-height: 26px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.poster-perforation {
  position: absolute;
  top: 699px;
  right: 32px;
  left: 32px;
  border-top: 3px dashed var(--poster-line);
}

.poster-notch {
  position: absolute;
  top: 676px;
  width: 48px;
  height: 48px;
  border-radius: 9999px;
  background: var(--poster-bg);
}

.poster-notch-left {
  left: -24px;
}

.poster-notch-right {
  right: -24px;
}

.poster-stub {
  position: absolute;
  top: 736px;
  right: 40px;
  left: 40px;
  display: flex;
  align-items: center;
  gap: 24px;
  height: 200px;
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
  gap: 14px;
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

.poster-month {
  font-family: var(--poster-display);
  font-size: 28px;
  font-weight: 700;
}

.poster-time {
  font-size: 22px;
  font-weight: 600;
  line-height: 30px;
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
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.poster-qr-card {
  --size: 168px;
}

.poster-qr-label {
  max-width: 200px;
  font-size: 16px;
  font-weight: 600;
  text-align: center;
}

.poster-sticker-place {
  top: 430px;
  left: 588px;
}
</style>
