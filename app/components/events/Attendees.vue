<script setup lang="ts">
// Who's going to an event: the first avatars, a few first names, and the spots left.
const props = defineProps<{ attendees: EventAttendees }>();

const { t, locale } = useI18n();

const SHOWN_AVATARS = 6;
const SHOWN_NAMES = 3;

const avatars = computed(() => props.attendees.people.slice(0, SHOWN_AVATARS));
const moreAvatars = computed(() => props.attendees.registered - avatars.value.length);

// Microsoft names start with the first name, as shortName() on the server assumes too.
const names = computed(() => {
  const firstNames = props.attendees.people
    .slice(0, SHOWN_NAMES)
    .map((person) => person.name.trim().split(/\s+/)[0]!);
  const others = props.attendees.registered - firstNames.length;
  return others > 0
    ? t('events.attendees.names', { names: firstNames.join(', '), count: others }, others)
    : new Intl.ListFormat(locale.value, { type: 'conjunction' }).format(firstNames);
});

const count = computed(() => {
  const { registered, capacity } = props.attendees;
  const text = t('events.attendees.registered', { count: registered }, registered);
  if (capacity === undefined) return text;
  const left = Math.max(capacity - registered, 0);
  return `${text}, ${t('events.attendees.spotsLeft', { count: left }, left)}`;
});
</script>

<template>
  <section class="flex flex-col gap-3 rounded-lg bg-accented p-5">
    <h2 class="text-xl font-bold text-highlighted">{{ t('events.attendees.title') }}</h2>
    <div v-if="avatars.length" class="flex ps-2">
      <!-- Avatar tints are translucent: a solid base keeps overlapping avatars apart. -->
      <span
        v-for="person in avatars"
        :key="person.id"
        class="-ms-2 rounded-full bg-accented ring-2 ring-accented"
      >
        <UAvatar
          :src="person.image ?? undefined"
          :alt="person.name"
          size="xl"
          :ui="avatarTint(person.id)"
          class="text-sm"
        />
      </span>
      <span
        v-if="moreAvatars > 0"
        class="-ms-2 grid h-10 place-items-center rounded-full bg-elevated px-2.5 text-sm font-semibold text-highlighted tabular-nums ring-2 ring-accented"
      >
        +{{ moreAvatars }}
      </span>
    </div>
    <p v-if="avatars.length" class="text-muted">{{ names }}</p>
    <p class="text-muted tabular-nums">{{ count }}</p>
  </section>
</template>
