<script setup lang="ts">
import { en, fr } from '@nuxt/ui/locale';

const { t, locale, setLocale } = useI18n();
const { user, school, signOut } = useAuth();
const { isEnabled } = useFlags();

// The events they registered to or wait for, still to come.
const { data: myEvents } = await useMyEvents(!!user.value && isEnabled('events'));

// Kept in the lnb_locale cookie for now, like a first visit's browser language.
async function changeLocale(code: string) {
  if (code === 'en' || code === 'fr') {
    await setLocale(code);
  }
}

useSeoMeta({ title: () => t('account.title'), robots: 'noindex' });
</script>

<template>
  <UContainer v-if="user" class="flex max-w-2xl flex-col items-start gap-6 py-14">
    <h1 class="text-4xl font-bold text-highlighted">{{ t('account.title') }}</h1>

    <dl class="grid w-full gap-4 rounded-lg bg-elevated p-6 sm:grid-cols-3">
      <div class="flex flex-col gap-0.5">
        <dt class="text-sm text-muted">{{ t('account.name') }}</dt>
        <dd class="text-highlighted">{{ user.name }}</dd>
      </div>
      <div class="flex min-w-0 flex-col gap-0.5">
        <dt class="text-sm text-muted">{{ t('account.email') }}</dt>
        <dd class="truncate text-highlighted">{{ user.email }}</dd>
      </div>
      <div v-if="school" class="flex flex-col gap-0.5">
        <dt class="text-sm text-muted">{{ t('account.school') }}</dt>
        <dd class="text-highlighted">{{ school }}</dd>
      </div>
    </dl>

    <section v-if="isEnabled('events')" class="flex w-full flex-col gap-4">
      <div class="flex flex-wrap items-baseline justify-between gap-3">
        <h2 class="text-2xl font-bold text-highlighted">{{ t('account.myEvents') }}</h2>
        <ULink :to="{ path: '/events', query: { tab: 'mine' } }" class="font-semibold text-primary">
          {{ t('account.allMyEvents') }}
        </ULink>
      </div>
      <EventsAgenda v-if="myEvents?.upcoming.length" :events="myEvents.upcoming" />
      <div v-else class="flex flex-col items-start gap-3 rounded-lg bg-elevated p-6">
        <p class="text-muted">{{ t('account.noEvents') }}</p>
        <UButton to="/events" color="neutral" variant="soft" :label="t('account.seeEvents')" />
      </div>
    </section>

    <section class="flex w-full flex-col gap-4">
      <h2 class="text-2xl font-bold text-highlighted">{{ t('account.preferences') }}</h2>
      <div class="grid gap-4 rounded-lg bg-elevated p-6 sm:grid-cols-2">
        <UFormField :label="t('language')">
          <ULocaleSelect
            :model-value="locale"
            :locales="[en, fr]"
            class="w-full"
            @update:model-value="changeLocale"
          />
        </UFormField>
        <UFormField :label="t('account.theme')">
          <UColorModeSelect class="w-full" />
        </UFormField>
      </div>
    </section>

    <UButton
      color="neutral"
      variant="soft"
      icon="i-lucide-log-out"
      :label="t('auth.signOut')"
      @click="signOut"
    />
  </UContainer>
</template>
