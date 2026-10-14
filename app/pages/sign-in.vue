<script setup lang="ts">
definePageMeta({ auth: false });

const { t } = useI18n();
const route = useRoute();
const { user, signIn } = useAuth();

const redirect = computed(() => safeRedirect(route.query.redirect));

// Better Auth comes back here with `?error=` when Microsoft or the allowlist refuses the sign-in.
const errorMessage = computed(() => {
  const error = route.query.error;
  if (!error) return null;
  return error === TENANT_NOT_ALLOWED
    ? t('auth.errors.tenantNotAllowed')
    : t('auth.errors.generic');
});

if (user.value) {
  await navigateTo(redirect.value, { replace: true });
}

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
  <UContainer class="flex max-w-md flex-col items-start gap-6 py-14">
    <div class="flex flex-col gap-2">
      <h1 class="text-4xl font-bold text-highlighted">{{ t('auth.signInPage.title') }}</h1>
      <p class="text-muted">{{ t('auth.signInPage.lede') }}</p>
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
      @click="onSignIn"
    />
  </UContainer>
</template>
