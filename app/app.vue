<script setup lang="ts">
const title = 'La Nuit Blanche'
const description = 'Events for Epitech, e-artsup and ISEG students.'

useHead({
  link: [{ rel: 'icon', href: '/favicon.ico' }],
  htmlAttrs: { lang: 'en' },
})

useSeoMeta({
  title,
  description,
  ogTitle: title,
  ogDescription: description,
})
</script>

<template>
  <UApp>
    <UHeader title="La Nuit Blanche" to="/">
      <template #right>
        <UColorModeButton />
      </template>
    </UHeader>

    <UMain>
      <NuxtPage />
    </UMain>

    <UFooter>
      <template #left>
        <p class="text-sm text-muted">© {{ new Date().getFullYear() }} La Nuit Blanche</p>
      </template>
    </UFooter>
  </UApp>
</template>
