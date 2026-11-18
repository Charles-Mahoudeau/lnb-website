<script setup lang="ts">
import { VENDOR_LINKS } from '#shared/schemas/downloads';
import type { DownloadFileView, DownloadOs, PackageDistro } from '#shared/schemas/downloads';

// What a new player needs to join the Minecraft server: a launcher (Prism, or PrismCracked for
// people without the game) and the LNB instance. The launchers install Java themselves, so it only
// appears under Troubleshooting (docs/downloads.md). Public, like the mod list.
definePageMeta({ auth: false, flag: 'downloads' });

const { t, locale } = useI18n();
const { isEnabled } = useFlags();
useSeoMeta({ title: () => t('download.title'), description: () => t('download.lede') });

const { data } = await useDownloads();

// The visitor's system comes from the user agent, which the server sees too, so the first paint
// already shows the right buttons.
const userAgent = import.meta.server
  ? useRequestHeaders(['user-agent'])['user-agent']
  : navigator.userAgent;
const os = ref<DownloadOs>(detectOs(userAgent));
const distro = ref<PackageDistro>('ubuntu');

const osLabel = computed(() => t(`download.systems.${os.value}`));
const buttonLabel = computed(() => t('download.downloadFor', { os: osLabel.value }));

const cracked = computed(() => data.value?.cracked);
const crackedLinks = computed(() => ({
  windows: cracked.value?.windows?.url,
  macos: cracked.value?.macos?.url,
  linux: cracked.value?.linux?.url,
}));
const crackedFile = computed<DownloadFileView | null>(() => cracked.value?.[os.value] ?? null);
const instance = computed(() => data.value?.instance ?? null);

const troubleshootingOpen = ref(false);
async function showTroubleshooting() {
  troubleshootingOpen.value = true;
  await nextTick();
  document.getElementById('troubleshooting')?.scrollIntoView({ behavior: 'smooth' });
}

const size = (file: DownloadFileView) => formatBytes(file.size, locale.value);
</script>

<template>
  <UContainer class="py-8 sm:py-12">
    <header class="mb-8 flex max-w-prose flex-col gap-3">
      <h1>{{ t('download.title') }}</h1>
      <p class="text-muted">{{ t('download.lede') }}</p>
      <ULink v-if="isEnabled('rules')" to="/minecraft/rules" class="text-sm text-primary underline">
        {{ t('download.rulesLink') }}
      </ULink>
    </header>

    <ol class="flex flex-col gap-4">
      <!-- Prism from its own site, PrismCracked from the Files library. -->
      <DownloadStep
        :number="1"
        icon="i-lucide-rocket"
        :title="t('download.steps.launcher.title')"
        :lede="t('download.steps.launcher.lede')"
      >
        <div class="grid gap-6 md:grid-cols-2 md:gap-0">
          <div class="flex flex-col items-start gap-3 md:pr-6">
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="font-sans text-base font-semibold text-highlighted">
                {{ t('download.launchers.prism.name') }}
              </h3>
              <UBadge color="secondary" variant="soft" :label="t('download.launchers.prism.who')" />
            </div>
            <p class="text-muted">{{ t('download.launchers.prism.text') }}</p>
            <p class="text-sm text-muted">
              {{ t('download.opens', { host: VENDOR_LINKS.prism.host }) }}
            </p>
            <UButton
              :to="VENDOR_LINKS.prism[os]"
              target="_blank"
              external
              color="neutral"
              variant="soft"
              icon="i-lucide-external-link"
              :label="buttonLabel"
            />
            <DownloadOtherSystems :current="os" :links="VENDOR_LINKS.prism" external />
            <DownloadPackages v-model:distro="distro" tool="prism" :os="os" />
          </div>

          <div
            class="flex flex-col items-start gap-3 border-default max-md:border-t max-md:pt-6 md:border-l md:pl-6"
          >
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="font-sans text-base font-semibold text-highlighted">
                {{ t('download.launchers.cracked.name') }}
              </h3>
              <UBadge color="neutral" variant="soft" :label="t('download.launchers.cracked.who')" />
              <UBadge color="neutral" variant="outline" :label="t('download.hosted')" />
            </div>
            <p class="text-muted">{{ t('download.launchers.cracked.text') }}</p>
            <template v-if="crackedFile">
              <p class="text-sm text-muted tabular-nums">
                {{ crackedFile.name }}, {{ size(crackedFile) }}
                <template v-if="crackedFile.version">, {{ crackedFile.version }}</template>
              </p>
              <UButton
                :to="crackedFile.url"
                external
                color="neutral"
                variant="soft"
                icon="i-lucide-download"
                :label="buttonLabel"
              />
              <DownloadOtherSystems :current="os" :links="crackedLinks" />
            </template>
            <p v-else class="text-sm text-muted">{{ t('download.unavailable') }}</p>
            <ULink
              v-if="data?.crackedReleaseUrl"
              :href="data.crackedReleaseUrl"
              target="_blank"
              external
              class="inline-flex items-center gap-1 font-medium text-primary hover:underline"
            >
              {{ t('download.releases') }}
              <UIcon name="i-lucide-external-link" class="size-4" />
            </ULink>
            <p v-if="os !== 'windows'" class="text-sm text-muted">
              {{ t('download.packages.none') }}
            </p>
          </div>
        </div>
        <p class="flex items-start gap-2 text-sm text-muted">
          <UIcon name="i-lucide-info" class="mt-0.5 size-4 shrink-0" />
          <span>
            <strong class="font-semibold text-highlighted">{{
              t('download.javaHint.title')
            }}</strong>
            {{ t('download.javaHint.text') }}
            <button
              type="button"
              class="font-medium text-primary hover:underline"
              @click="showTroubleshooting"
            >
              {{ t('download.troubleshooting.title') }}
            </button>
          </span>
        </p>
      </DownloadStep>

      <!-- The instance zip, from the Files library: the page's one solid button. -->
      <DownloadStep
        :number="2"
        icon="i-lucide-package"
        :title="t('download.steps.instance.title')"
        :lede="t('download.steps.instance.lede')"
      >
        <div v-if="instance" class="flex flex-col items-start gap-3">
          <div class="flex flex-wrap items-center gap-2">
            <p class="text-sm text-muted tabular-nums">{{ instance.name }}, {{ size(instance) }}</p>
            <UBadge
              v-if="instance.version"
              color="neutral"
              variant="outline"
              :label="instance.version"
            />
            <UBadge color="neutral" variant="outline" :label="t('download.hosted')" />
          </div>
          <UButton
            :to="instance.url"
            external
            icon="i-lucide-download"
            :label="t('download.downloadZip')"
          />
        </div>
        <p v-else class="text-sm text-muted">{{ t('download.unavailable') }}</p>
      </DownloadStep>

      <DownloadStep
        :number="3"
        icon="i-lucide-play"
        :title="t('download.steps.play.title')"
        :lede="t('download.steps.play.lede')"
      />
    </ol>

    <!-- Java, for the rare launcher that can't install it itself. -->
    <section id="troubleshooting" class="mt-10 scroll-mt-24">
      <UCollapsible v-model:open="troubleshootingOpen" class="rounded-lg bg-elevated">
        <UButton
          color="neutral"
          variant="ghost"
          block
          class="justify-start p-4 sm:p-6"
          trailing-icon="i-lucide-chevron-down"
          :ui="{ trailingIcon: 'ms-auto transition-transform group-data-[state=open]:rotate-180' }"
        >
          <IconTile icon="i-lucide-wrench" />
          <span class="flex min-w-0 flex-col items-start gap-1 text-start">
            <span class="font-display text-xl text-default">
              {{ t('download.troubleshooting.title') }}
            </span>
            <span class="text-sm font-normal text-wrap text-muted">
              {{ t('download.troubleshooting.lede') }}
            </span>
          </span>
        </UButton>
        <template #content>
          <div class="flex flex-col items-start gap-3 border-t border-default p-4 sm:p-6">
            <h3 class="font-sans text-base font-semibold text-highlighted">
              {{ t('download.troubleshooting.java.title') }}
            </h3>
            <p class="max-w-prose text-muted">{{ t('download.troubleshooting.java.text') }}</p>
            <ul class="max-w-prose list-disc space-y-1 ps-5 text-muted">
              <li>{{ t('download.troubleshooting.java.jre') }}</li>
              <li>{{ t('download.troubleshooting.java.jdk') }}</li>
              <li>{{ t('download.troubleshooting.java.version') }}</li>
            </ul>
            <p class="text-sm text-muted">
              {{ t('download.javaName') }},
              {{ t('download.opens', { host: VENDOR_LINKS.java.host }) }}
            </p>
            <UButton
              :to="VENDOR_LINKS.java[os]"
              target="_blank"
              external
              color="neutral"
              variant="soft"
              icon="i-lucide-external-link"
              :label="buttonLabel"
            />
            <DownloadOtherSystems :current="os" :links="VENDOR_LINKS.java" external />
            <DownloadPackages v-model:distro="distro" tool="java" :os="os" />
          </div>
        </template>
      </UCollapsible>
    </section>
  </UContainer>
</template>
