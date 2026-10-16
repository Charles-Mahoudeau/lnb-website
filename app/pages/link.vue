<script setup lang="ts">
import type { LinkProblem } from '#shared/schemas/link';
import type { WardenLinkPreview } from '#shared/schemas/warden';

const { t, locale } = useI18n();
const route = useRoute();
const toast = useToast();
const { user, school } = useAuth();
const linkCode = useLinkCode();

useSeoMeta({ title: () => t('link.title'), robots: 'noindex' });

type Step =
  | { name: 'enter' }
  | { name: 'confirm'; appId: string; warden?: WardenLinkPreview }
  | { name: 'schoolNotAllowed'; appId: string }
  | { name: 'done'; appId: string; redirecting: boolean };
const step = ref<Step>({ name: 'enter' });

// UPinInput with type="number" gives one number per box.
const digits = ref<number[]>([]);
const code = computed(() => normalizeLinkCode(digits.value.join('')));
const problem = ref<LinkProblem | null>(null);
const pending = ref(false);

// Shown with a space in the middle, as most apps display it: 123 456.
const spacedCode = computed(() => `${code.value.slice(0, 3)} ${code.value.slice(3)}`);
const app = computed(() => ('appId' in step.value ? getLinkApp(step.value.appId) : undefined));
const appName = computed(() => app.value?.name ?? '');
const appSchools = computed(() =>
  new Intl.ListFormat(locale.value, { type: 'conjunction' }).format(
    (app.value?.schools ?? []).map((tid) => schoolForTenant(tid) ?? tid),
  ),
);

// Apps can send people to /link?code=123456, and add redirect_uri and state to get the token back
// in the browser once linked.
const redirect = computed(() => {
  const { redirect_uri: uri, state } = route.query;
  if (typeof uri !== 'string') return undefined;
  return { uri, state: typeof state === 'string' ? state : undefined };
});

watch(digits, () => (problem.value = null));

async function run(action: () => Promise<void>) {
  pending.value = true;
  problem.value = null;
  try {
    await action();
  } catch (error) {
    problem.value = error instanceof LinkCodeError ? error.problem : 'failed';
  } finally {
    pending.value = false;
  }
}

function onContinue() {
  if (code.value.length !== LINK_CODE_LENGTH || pending.value) return;
  return run(async () => {
    const { appId } = await linkCode.check(code.value);
    const linkApp = getLinkApp(appId);
    if (!linkApp) throw new LinkCodeError('unknown');
    if (redirect.value && !isAllowedRedirect(linkApp, redirect.value.uri)) {
      throw new LinkCodeError('invalidRedirect');
    }
    if (user.value && !canLinkFromSchool(linkApp, user.value.tenantId)) {
      // Refuse the code so the app stops waiting and can tell the person why.
      await linkCode.deny(code.value).catch(() => {});
      step.value = { name: 'schoolNotAllowed', appId };
      return;
    }
    // Warden codes carry a Minecraft account: show it, and the slot it takes.
    const warden = appId === 'warden' ? await linkCode.wardenPreview(code.value) : undefined;
    step.value = { name: 'confirm', appId, warden };
  });
}

function onLink(appId: string) {
  return run(async () => {
    const { redirectTo } = await linkCode.approve(code.value, redirect.value);
    step.value = { name: 'done', appId, redirecting: redirectTo !== undefined };
    toast.add({ title: t('link.done.toast'), color: 'success', icon: 'i-lucide-circle-check' });
    if (redirectTo) {
      await navigateTo(redirectTo, { external: !redirectTo.startsWith('/'), replace: true });
    }
  });
}

async function onCancel() {
  // Refuse the code so the app stops waiting. It expires on its own if this fails.
  await linkCode.deny(code.value).catch(() => {});
  startOver();
}

function startOver() {
  digits.value = [];
  problem.value = null;
  step.value = { name: 'enter' };
  // The code, redirect_uri and state came with the previous app's link, not the next one.
  if (Object.keys(route.query).length > 0) void navigateTo({ query: {} }, { replace: true });
}

onMounted(() => {
  // Better Auth's verification_uri_complete still says ?user_code=, so both work.
  const fromLink = route.query.code ?? route.query.user_code;
  if (typeof fromLink !== 'string') return;
  const prefilled = normalizeLinkCode(fromLink);
  if (prefilled.length !== LINK_CODE_LENGTH) return;
  digits.value = prefilled.split('').map(Number);
  void onContinue();
});
</script>

<template>
  <UContainer class="flex min-h-hero flex-col items-center justify-center py-14">
    <!-- A single short task, so the page is centered, unlike content pages. -->
    <div class="flex w-full max-w-sm flex-col items-center gap-6 text-center">
      <template v-if="step.name === 'enter'">
        <div class="flex flex-col gap-2">
          <h1 class="text-4xl font-bold text-highlighted">{{ t('link.title') }}</h1>
          <p class="text-lg text-muted">{{ t('link.lede') }}</p>
        </div>

        <form class="flex w-full flex-col items-center gap-6" @submit.prevent="onContinue">
          <UFormField
            :label="t('link.code')"
            :error="problem ? t(`link.errors.${problem}`) : undefined"
            :ui="{ labelWrapper: 'justify-center', container: 'flex flex-col items-center' }"
          >
            <UPinInput
              v-model="digits"
              :length="LINK_CODE_LENGTH"
              :separator="3"
              type="number"
              otp
              autofocus
              :disabled="pending"
            />
          </UFormField>

          <UButton
            type="submit"
            :label="t('link.continue')"
            :loading="pending"
            :disabled="code.length !== LINK_CODE_LENGTH"
            block
          />
        </form>

        <p class="text-sm text-muted">{{ t('link.help') }}</p>
      </template>

      <template v-else-if="step.name === 'confirm'">
        <h1 class="text-4xl font-bold text-highlighted">
          {{ t('link.confirm.title', { app: appName }) }}
        </h1>

        <div class="flex w-full flex-col gap-4 rounded-lg bg-elevated p-5 text-left">
          <p>{{ t(`link.apps.${step.appId}.description`) }}</p>
          <p class="text-sm text-muted">
            {{ t('link.confirm.matchCode', { app: appName }) }}
            <span class="font-display font-medium whitespace-nowrap text-highlighted tabular-nums">
              {{ spacedCode }}
            </span>
          </p>
          <template v-if="step.warden">
            <USeparator />
            <div class="flex items-center gap-4">
              <WardenMinecraftHead :uuid="step.warden.uuid" size="lg" />
              <div class="flex min-w-0 flex-col gap-0.5">
                <span class="text-sm text-muted">{{ t('link.warden.account') }}</span>
                <span class="font-semibold break-all text-highlighted">
                  {{ step.warden.username }}
                </span>
                <span class="text-sm text-muted">
                  {{
                    step.warden.cracked
                      ? t('warden.accounts.cracked')
                      : t('warden.accounts.premium')
                  }}
                </span>
              </div>
            </div>
            <div class="flex flex-col gap-2">
              <div class="flex gap-1.5" aria-hidden="true">
                <span
                  v-for="slot in step.warden.limit.max"
                  :key="slot"
                  :class="[
                    'h-2 w-6 rounded-full',
                    slot <= step.warden.limit.used
                      ? 'bg-inverted/40'
                      : slot === step.warden.limit.used + 1
                        ? 'bg-action'
                        : 'bg-accented',
                  ]"
                />
              </div>
              <span class="text-sm text-muted">
                {{
                  step.warden.limit.used < step.warden.limit.max
                    ? t('link.warden.slots', { max: step.warden.limit.max }, step.warden.limit.max)
                    : t('link.errors.accountLimitReached')
                }}
              </span>
            </div>
          </template>
          <USeparator />
          <div class="flex flex-col gap-3">
            <span class="text-sm text-muted">
              {{ t('link.confirm.shared', { app: appName }) }}
            </span>
            <div class="flex gap-3">
              <UIcon name="i-lucide-id-card" class="mt-0.5 size-5 shrink-0 text-muted" />
              <div class="flex flex-col">
                <span class="text-highlighted">{{ t('link.confirm.identity.title') }}</span>
                <span class="text-sm text-muted">
                  {{ step.warden ? t('link.warden.identity') : t('link.confirm.identity.details') }}
                </span>
              </div>
            </div>
          </div>
          <USeparator />
          <div v-if="user" class="flex items-center gap-3">
            <UAvatar :src="user.image ?? undefined" :alt="user.name" :ui="avatarTint(user.id)" />
            <div class="flex min-w-0 flex-col">
              <span class="text-sm text-muted">{{ t('link.confirm.account') }}</span>
              <span class="truncate text-highlighted">
                {{ school ? `${user.name}, ${school}` : user.name }}
              </span>
            </div>
          </div>
        </div>

        <UAlert
          v-if="problem"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :description="t(`link.errors.${problem}`)"
          class="text-left"
        />

        <p class="text-sm text-muted">{{ t('link.confirm.warning') }}</p>

        <div class="flex flex-wrap justify-center gap-3">
          <UButton
            icon="i-lucide-link"
            :label="t('link.confirm.link')"
            :loading="pending"
            :disabled="!!step.warden && step.warden.limit.used >= step.warden.limit.max"
            @click="onLink(step.appId)"
          />
          <UButton
            color="neutral"
            variant="soft"
            :label="t('link.confirm.cancel')"
            :disabled="pending"
            @click="onCancel"
          />
        </div>
      </template>

      <template v-else-if="step.name === 'schoolNotAllowed'">
        <div class="grid size-12 place-items-center rounded-full bg-accented text-muted">
          <UIcon name="i-lucide-school" class="size-6" />
        </div>
        <div class="flex flex-col gap-2">
          <h1 class="text-4xl font-bold text-highlighted">
            {{ t('link.schoolNotAllowed.title', { app: appName }) }}
          </h1>
          <p class="text-lg text-muted">
            {{
              t('link.schoolNotAllowed.lede', {
                app: appName,
                schools: appSchools,
                school: school ?? '',
              })
            }}
          </p>
        </div>
        <UButton
          color="neutral"
          variant="soft"
          :label="t('link.done.another')"
          @click="startOver"
        />
      </template>

      <template v-else>
        <div class="grid size-12 place-items-center rounded-full bg-accented text-success">
          <UIcon name="i-lucide-check" class="size-6" />
        </div>
        <div class="flex flex-col gap-2">
          <h1 class="text-4xl font-bold text-highlighted">
            {{ t('link.done.title', { app: appName }) }}
          </h1>
          <p class="text-lg text-muted">
            {{ t(step.redirecting ? 'link.done.redirecting' : 'link.done.lede', { app: appName }) }}
          </p>
        </div>
        <UButton
          v-if="!step.redirecting"
          color="neutral"
          variant="soft"
          :label="t('link.done.another')"
          @click="startOver"
        />
      </template>
    </div>
  </UContainer>
</template>
