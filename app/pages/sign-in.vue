<script setup lang="ts">
definePageMeta({ auth: false });

const { t, locale } = useI18n();
const route = useRoute();
const { user, signIn } = useAuth();

const redirect = computed(() => safeRedirect(route.query.redirect));

// Better Auth comes back here with `?error=` when Microsoft or the allowlist refuses the sign-in.
const errorMessage = computed(() => {
  const error = route.query.error;
  if (!error) return null;
  if (error === TENANT_NOT_ALLOWED) return t('auth.errors.tenantNotAllowed');
  if (error === SIGN_IN_DISABLED) return t('auth.errors.signInDisabled');
  return t('auth.errors.generic');
});

if (user.value) {
  await navigateTo(redirect.value, { replace: true });
}

// The banner shows the next event, so the page isn't empty while people sign in.
const nextEvent = computed(() =>
  UPCOMING_EVENTS.find((event) => new Date(event.startsAt).getTime() > Date.now()),
);
const nextEventWhen = computed(
  () =>
    nextEvent.value &&
    formatEventDate(nextEvent.value.startsAt, locale.value, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }),
);

useSeoMeta({ title: () => t('auth.signInPage.title'), robots: 'noindex' });

const pending = ref(false);
const failed = ref(false);

async function onSignIn() {
  pending.value = true;
  failed.value = false;
  try {
    // The page leaves for Microsoft, so `pending` stays on until then.
    await signIn(redirect.value);
  } catch {
    pending.value = false;
    failed.value = true;
  }
}
</script>

<template>
  <div class="grid lg:min-h-hero lg:grid-cols-12">
    <section
      class="dark relative isolate flex aspect-video flex-col justify-end overflow-hidden bg-banner-fallback lg:col-span-7 lg:aspect-auto"
    >
      <template v-if="nextEvent">
        <template v-if="nextEvent.banner">
          <img
            :src="nextEvent.banner"
            alt=""
            class="absolute inset-0 -z-1 size-full object-cover"
          />
          <div
            class="absolute inset-0 -z-1 bg-linear-to-t from-banner via-banner/60 via-40% to-transparent to-70%"
          />
        </template>
        <EventsIconScatter v-else class="-z-1" />
        <div class="relative flex flex-col gap-1 p-4 sm:p-8">
          <h2 class="text-xl font-bold text-on-banner sm:text-2xl">
            {{ t(`events.${nextEvent.key}.title`) }}
          </h2>
          <p class="text-on-banner-muted tabular-nums">
            {{
              t('auth.signInPage.nextEvent', {
                date: nextEventWhen,
                where: t(`events.${nextEvent.key}.where`),
              })
            }}
          </p>
        </div>
      </template>
    </section>

    <div class="flex items-center px-4 py-10 sm:px-8 lg:col-span-5 lg:px-12">
      <div class="flex w-full max-w-sm flex-col items-start gap-6">
        <img src="/logo.svg" alt="" class="size-14 dark:hidden" />
        <img src="/logo-dark.svg" alt="" class="hidden size-14 dark:block" />

        <div class="flex flex-col gap-2">
          <h1 class="text-4xl font-bold text-highlighted">{{ t('auth.signInPage.title') }}</h1>
          <p class="text-lg text-muted">{{ t('auth.signInPage.lede') }}</p>
        </div>

        <UAlert
          v-if="errorMessage || failed"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :description="errorMessage ?? t('auth.errors.generic')"
        />

        <UButton
          icon="i-simple-icons-microsoft"
          :label="t('auth.signInWithMicrosoft')"
          :loading="pending"
          block
          @click="onSignIn"
        />

        <p class="text-sm text-muted">{{ t('auth.signInPage.noPassword') }}</p>
      </div>
    </div>
  </div>
</template>
