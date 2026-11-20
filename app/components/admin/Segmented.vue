<script setup lang="ts">
// A small segmented switch for a part inside a tab (Modpack, Vote: Mods and Suggestions). Each
// segment is its own route.
const props = defineProps<{ items: { label: string; to: string }[] }>();
const route = useRoute();

const model = computed({
  get: () =>
    [...props.items]
      .sort((a, b) => b.to.length - a.to.length)
      .find((item) => route.path === item.to || route.path.startsWith(`${item.to}/`))?.to,
  set: (to) => {
    if (to && to !== route.path) void navigateTo(to);
  },
});
const tabs = computed(() => props.items.map((item) => ({ label: item.label, value: item.to })));
</script>

<template>
  <UTabs
    v-model="model"
    :items="tabs"
    variant="pill"
    size="sm"
    :content="false"
    class="self-start"
  />
</template>
