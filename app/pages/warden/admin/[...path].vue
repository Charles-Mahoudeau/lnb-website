<script setup lang="ts">
// The Warden admin moved to /admin/warden. Old links and bookmarks still land on the right page,
// including the tab from ?tab=.
definePageMeta({
  redirect: (to) => {
    const params = to.params as { path?: string | string[] };
    const path = ([] as string[]).concat(params.path ?? []).filter(Boolean);
    if (path.length) return { path: `/admin/warden/${path.join('/')}`, query: {} };
    const tab = String(to.query.tab ?? '');
    const tabs = ['players', 'appeals', 'activity', 'settings'];
    return { path: `/admin/warden/${tabs.includes(tab) ? tab : 'players'}`, query: {} };
  },
});
</script>

<template>
  <div />
</template>
