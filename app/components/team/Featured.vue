<script setup lang="ts">
import type { TeamPublicPole } from '#shared/schemas/team';

// The featured pole (the bureau): a raised band with large photos and a short bio each.
defineProps<{ pole: TeamPublicPole }>();

const { locale } = useI18n();
</script>

<template>
  <section class="flex flex-col gap-6 rounded-lg bg-elevated p-6 sm:p-8">
    <div class="flex flex-col gap-1">
      <h2 class="text-2xl font-bold text-highlighted">{{ teamText(pole.name, locale) }}</h2>
      <p v-if="teamText(pole.description, locale)" class="max-w-prose text-muted">
        {{ teamText(pole.description, locale) }}
      </p>
    </div>
    <ul class="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
      <li v-for="member in pole.members" :key="member.id" class="flex min-w-0 flex-col gap-3">
        <UAvatar
          :src="member.image ?? undefined"
          :alt="member.name"
          :ui="avatarTint(member.id)"
          class="size-16 text-xl"
        />
        <div class="flex flex-col gap-0.5">
          <p class="font-display font-medium text-highlighted">{{ member.name }}</p>
          <p class="text-muted">{{ teamText(member.role, locale) }}</p>
        </div>
        <p v-if="teamText(member.bio, locale)" class="text-sm text-muted">
          {{ teamText(member.bio, locale) }}
        </p>
        <UBadge
          v-if="member.school"
          color="neutral"
          variant="soft"
          :label="member.school"
          class="self-start"
        />
      </li>
    </ul>
  </section>
</template>
