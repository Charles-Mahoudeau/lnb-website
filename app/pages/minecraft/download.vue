<script setup lang="ts">
import { VENDOR_LINKS } from '#shared/schemas/downloads';
import type { DownloadFileView, DownloadOs, PackageDistro } from '#shared/schemas/downloads';

// What a new player needs to join the Minecraft server: Java 21, a launcher (Prism, or PrismCracked
// for people without the game) and the LNB instance (docs/downloads.md). Public, like the mod list.
definePageMeta({ auth: false, flag: 'downloads' });

const { t, locale } = useI18n();
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

const size = (file: DownloadFileView) => formatBytes(file.size, locale.value);
</script>

<template>
  <UContainer class="py-8 sm:py-12">
    <header class="mb-8 flex max-w-prose flex-col gap-3">
      <h1>{{ t('download.title') }}</h1>
      <p class="text-muted">{{ t('download.lede') }}</p>
    </header>

    <ol class="flex flex-col gap-4">
      <!-- Java 21, from Adoptium. -->
      <DownloadStep
        :number="1"
        icon="i-lucide-coffee"
        :title="t('download.steps.java.title')"
        :lede="t('download.steps.java.lede')"
      >
        <div class="flex flex-col items-start gap-3">
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
      </DownloadStep>

      <!-- Prism from its own site, PrismCracked from the Files library. -->
      <DownloadStep
        :number="2"
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
            <p v-if="os !== 'windows'" class="text-sm text-muted">
              {{ t('download.packages.none') }}
            </p>
          </div>
        </div>
      </DownloadStep>

      <!-- The instance zip, from the Files library: the page's one solid button. -->
      <DownloadStep
        :number="3"
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
        :number="4"
        icon="i-lucide-play"
        :title="t('download.steps.play.title')"
        :lede="t('download.steps.play.lede')"
      />
    </ol>
  </UContainer>
</template>
