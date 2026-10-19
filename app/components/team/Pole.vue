<script setup lang="ts">
import type { TeamPublicPole } from '#shared/schemas/team';

// A pole other than the featured one: its name, what it does, then its people.
defineProps<{ pole: TeamPublicPole }>();

const { locale } = useI18n();
</script>

<template>
  <section class="flex min-w-0 flex-col gap-4">
    <div class="flex items-center gap-3">
      <IconTile :icon="pole.icon" />
      <h3 class="text-xl font-bold text-highlighted">{{ teamText(pole.name, locale) }}</h3>
    </div>
    <p v-if="teamText(pole.description, locale)" class="text-muted">
      {{ teamText(pole.description, locale) }}
    </p>
    <ul class="flex flex-col gap-3">
      <li v-for="member in pole.members" :key="member.id" class="flex items-center gap-3">
        <UAvatar
          :src="member.image ?? undefined"
          :alt="member.name"
          size="lg"
          :ui="avatarTint(member.id)"
          class="text-sm"
        />
        <div class="flex min-w-0 flex-col">
          <p class="truncate font-semibold text-highlighted">{{ member.name }}</p>
          <p class="truncate text-sm text-muted">{{ teamText(member.role, locale) }}</p>
        </div>
      </li>
    </ul>
  </section>
</template>
