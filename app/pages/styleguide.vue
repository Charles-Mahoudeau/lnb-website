<script setup lang="ts">
import type { DropdownMenuItem, TableColumn, TabsItem } from '@nuxt/ui';

// A living reference for docs/design.md, built from the real themed components.
// Dev only (and in tests): it isn't part of the public site.
if (!import.meta.dev && !import.meta.test) {
  throw createError({ statusCode: 404, statusMessage: 'Page not found' });
}

definePageMeta({ auth: false });

useSeoMeta({ title: 'Style guide', robots: 'noindex' });

const colors = [
  { name: 'Page background', variable: '--ui-bg', usage: 'bg-default' },
  { name: 'Surface', variable: '--ui-bg-elevated', usage: 'bg-elevated' },
  { name: 'Raised', variable: '--ui-bg-accented', usage: 'bg-accented' },
  { name: 'Border', variable: '--ui-border', usage: 'border-default' },
  { name: 'Text', variable: '--ui-text', usage: 'text-default' },
  { name: 'Muted text', variable: '--ui-text-muted', usage: 'text-muted' },
  { name: 'Action fill', variable: '--lnb-action', usage: 'bg-action' },
  { name: 'Red text, links, focus', variable: '--ui-primary', usage: 'text-primary' },
  { name: 'Banner', variable: '--color-banner', usage: 'bg-banner' },
  { name: 'Text on banners', variable: '--color-on-banner', usage: 'text-on-banner' },
  { name: 'Success', variable: '--ui-success', usage: 'color="success"' },
  { name: 'Warning', variable: '--ui-warning', usage: 'color="warning"' },
];

const campuses = ['Paris', 'Lyon', 'Nantes', 'Marseille'];
const campus = ref('Paris');
const email = ref('alex@gmail.com');
const linkCode = ref([1, 9, 6, 0]);
const notify = ref(true);
const reminders = ref(true);

const tabs: TabsItem[] = [{ label: 'Upcoming' }, { label: 'My events' }, { label: 'Past' }];

const events = [
  {
    day: 28,
    month: 'Oct',
    title: 'Werewolf and board game evening',
    when: 'Wed, 18:30',
    where: 'Room 2.04',
    registered: 22,
    capacity: 30,
  },
  {
    day: 7,
    month: 'Nov',
    title: 'Valorant 5v5 inter-school cup',
    when: 'Sat, 14:00',
    where: 'Online',
    registered: 16,
    capacity: 16,
  },
];

const accountItems: DropdownMenuItem[][] = [
  [
    { label: 'My events', icon: 'i-lucide-calendar' },
    { label: 'Notifications', icon: 'i-lucide-bell' },
    { label: 'Settings', icon: 'i-lucide-settings' },
  ],
  [{ label: 'Sign out', icon: 'i-lucide-log-out', color: 'error' }],
];

type Registration = {
  name: string;
  school: string;
  registeredAt: string;
  status: 'Registered' | 'Waitlist';
};

const registrations: Registration[] = [
  { name: 'Alex Laurent', school: 'Epitech', registeredAt: '12 Oct, 14:02', status: 'Registered' },
  { name: 'Inès Moreau', school: 'e-artsup', registeredAt: '12 Oct, 15:40', status: 'Registered' },
  { name: 'Sam Nguyen', school: 'ISEG', registeredAt: '13 Oct, 09:15', status: 'Waitlist' },
];

const columns: TableColumn<Registration>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'school', header: 'School' },
  { accessorKey: 'registeredAt', header: 'Registered' },
  { accessorKey: 'status', header: 'Status' },
];

const cancelOpen = ref(false);
const toast = useToast();

function showToast() {
  toast.add({
    title: 'Registered for Smash and Mario Kart Night',
    icon: 'i-lucide-circle-check',
    color: 'success',
  });
}
</script>

<template>
  <UContainer class="flex flex-col gap-16 py-12">
    <header class="flex max-w-2xl flex-col gap-3">
      <h1 class="text-4xl font-bold">Style guide</h1>
      <p class="text-muted">
        The Soft night design language, rendered with the real themed components. The rules behind
        it are in <code>docs/design.md</code>. Toggle the color mode in the header to check light
        mode. Names and events are example content.
      </p>
    </header>

    <section class="flex flex-col gap-6">
      <h2 class="text-2xl font-bold">Color</h2>
      <p class="max-w-2xl text-muted">
        Deep crimson is the only accent and only marks actions. Status colors are for state, never
        decoration. Use the semantic classes, never raw palette colors.
      </p>
      <ul class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <li
          v-for="color in colors"
          :key="color.variable"
          class="overflow-hidden rounded-md border border-default"
        >
          <div class="h-14" :style="{ background: `var(${color.variable})` }" />
          <div class="flex flex-col gap-0.5 p-3 text-sm">
            <span class="font-semibold">{{ color.name }}</span>
            <code class="text-xs text-muted">{{ color.usage }}</code>
          </div>
        </li>
      </ul>
    </section>

    <section class="flex flex-col gap-6">
      <h2 class="text-2xl font-bold">Type</h2>
      <div class="flex flex-col gap-4">
        <p class="font-display text-4xl font-bold">Smash and Mario Kart Night</p>
        <p class="font-display text-2xl font-bold">Upcoming events</p>
        <p class="font-display text-xl font-bold">Registration</p>
        <p class="max-w-prose">
          Bring your controller or borrow one of ours. The bracket starts at 8 pm, and free play
          runs until the doors close.
        </p>
        <p class="text-sm text-muted">Registration closes 2 hours before the start.</p>
      </div>
      <p class="text-sm text-muted">
        Headings: Unbounded, automatic on <code>h1</code> to <code>h3</code>, or
        <code>font-display</code>. Everything else: Figtree.
      </p>
    </section>

    <section class="flex flex-col gap-6">
      <h2 class="text-2xl font-bold">Buttons</h2>
      <p class="max-w-2xl text-muted">
        One solid red button per view or per item, for the main action. Neutral for secondary
        actions, ghost for tertiary ones, error outline for destructive ones.
      </p>
      <div class="flex flex-wrap items-center gap-3">
        <UButton label="Register" />
        <UButton
          label="Add to calendar"
          color="neutral"
          variant="soft"
          icon="i-lucide-calendar-plus"
        />
        <UButton label="See details" color="neutral" variant="outline" />
        <UButton label="Not now" color="neutral" variant="ghost" />
        <UButton label="Cancel registration" color="error" variant="outline" />
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <UButton label="Register" size="md" />
        <UButton label="Join waitlist" size="md" color="neutral" variant="outline" />
        <UButton label="Full" size="md" disabled />
        <UButton label="Registering" size="md" loading />
        <ULink to="#" class="font-semibold text-primary underline underline-offset-4"
          >Event rules</ULink
        >
      </div>
    </section>

    <section class="flex flex-col gap-6">
      <h2 class="text-2xl font-bold">Status</h2>
      <div class="flex flex-wrap items-center gap-3">
        <UBadge label="Registered" color="success" variant="subtle" />
        <UBadge label="Waitlist" color="warning" variant="subtle" />
        <UBadge label="Full" color="error" variant="subtle" />
        <UBadge label="Online" color="neutral" variant="subtle" />
      </div>
      <UAlert
        title="Registration closes tonight"
        description="Register before 23:59 to keep your spot."
        icon="i-lucide-clock"
        color="neutral"
        variant="subtle"
        class="max-w-xl"
      />
    </section>

    <section class="grid gap-10 lg:grid-cols-2">
      <div class="flex flex-col gap-5">
        <h2 class="text-2xl font-bold">Form</h2>
        <UFormField
          label="School email"
          error="Use your school email, for example name@epitech.eu."
        >
          <UInput v-model="email" type="email" class="w-full" />
        </UFormField>
        <UFormField label="Campus">
          <USelect v-model="campus" :items="campuses" class="w-full" />
        </UFormField>
        <UFormField label="Team name" hint="Optional">
          <UInput placeholder="Night Owls" class="w-full" />
        </UFormField>
        <UFormField label="Link code">
          <UPinInput v-model="linkCode" :length="6" :separator="3" type="number" otp />
        </UFormField>
        <UCheckbox v-model="notify" label="Email me when a spot opens" />
        <USwitch v-model="reminders" label="Event reminders" />
      </div>

      <div class="flex flex-col gap-5">
        <h2 class="text-2xl font-bold">Lists</h2>
        <UTabs :items="tabs" :content="false" variant="link" />
        <ul class="flex flex-col gap-2">
          <li
            v-for="event in events"
            :key="event.title"
            class="flex items-center gap-4 rounded-lg bg-elevated py-3 pr-4 pl-3"
          >
            <div
              class="flex w-14 shrink-0 flex-col items-center border-r border-default py-1 tabular-nums"
            >
              <span class="font-display text-2xl leading-none font-bold">{{ event.day }}</span>
              <span class="mt-1 text-sm text-muted">{{ event.month }}</span>
            </div>
            <div class="min-w-0 flex-1">
              <h3 class="font-sans text-base font-bold tracking-normal">{{ event.title }}</h3>
              <p class="text-sm text-muted">{{ event.when }}, {{ event.where }}</p>
            </div>
            <UButton v-if="event.registered < event.capacity" label="Register" size="md" />
            <UButton v-else label="Join waitlist" size="md" color="neutral" variant="outline" />
          </li>
        </ul>
        <p class="text-sm text-muted">
          Event lists are dated rows, not card grids. The date uses <code>font-display</code> and
          tabular numbers.
        </p>
      </div>
    </section>

    <section class="grid gap-10 lg:grid-cols-3">
      <div class="flex flex-col gap-5">
        <h2 class="text-2xl font-bold">Card</h2>
        <UCard :ui="{ body: 'p-0 sm:p-0' }">
          <div class="aspect-92/43 bg-accented" />
          <div class="flex flex-col gap-3 p-5">
            <UBadge label="Registered" color="success" variant="subtle" class="self-start" />
            <h3 class="text-lg font-bold">Winter Nuit Blanche</h3>
            <p class="text-sm text-muted tabular-nums">Fri 11 Dec, 20:00, e-artsup atrium</p>
            <UButton
              label="See details"
              size="md"
              color="neutral"
              variant="soft"
              class="self-start"
            />
          </div>
        </UCard>
      </div>

      <div class="flex flex-col gap-5">
        <h2 class="text-2xl font-bold">Overlays</h2>
        <div class="flex flex-wrap gap-3">
          <UModal
            v-model:open="cancelOpen"
            title="Cancel your registration?"
            description="Your spot goes to the next person on the waitlist. You can register again if spots are still open."
          >
            <UButton label="Open dialog" color="neutral" variant="outline" />
            <template #footer>
              <div class="flex w-full justify-end gap-3">
                <UButton
                  label="Keep my spot"
                  color="neutral"
                  variant="ghost"
                  @click="cancelOpen = false"
                />
                <UButton
                  label="Cancel registration"
                  color="error"
                  variant="outline"
                  @click="cancelOpen = false"
                />
              </div>
            </template>
          </UModal>
          <UButton label="Show toast" color="neutral" variant="outline" @click="showToast" />
        </div>
      </div>

      <div class="flex flex-col gap-5">
        <h2 class="text-2xl font-bold">Account menu</h2>
        <UDropdownMenu :items="accountItems">
          <UButton color="neutral" variant="ghost" class="self-start">
            <UAvatar text="AL" size="sm" />
            Alex Laurent
          </UButton>
        </UDropdownMenu>
      </div>
    </section>

    <section class="flex flex-col gap-6">
      <h2 class="text-2xl font-bold">Minecraft</h2>
      <p class="max-w-2xl text-muted">
        Skin heads from /api/warden/heads, sharp at every size, with a plain fallback when the head
        can't load (unknown here). Nametags use Monocraft and look the same in both modes.
      </p>
      <div class="flex flex-wrap items-center gap-6">
        <WardenMinecraftHead uuid="069a79f4-44e9-4726-a5be-fca90e38aaf5" size="sm" />
        <WardenMinecraftHead uuid="069a79f4-44e9-4726-a5be-fca90e38aaf5" />
        <WardenMinecraftHead uuid="069a79f4-44e9-4726-a5be-fca90e38aaf5" size="lg" />
        <WardenNametag username="Renard_Lunaire" name="Charles M." />
        <WardenNametag username="Renard_Lunaire" />
      </div>
    </section>

    <section class="flex flex-col gap-6">
      <h2 class="text-2xl font-bold">Table</h2>
      <UTable :data="registrations" :columns="columns" class="tabular-nums">
        <template #status-cell="{ row }">
          <UBadge
            :label="row.original.status"
            :color="row.original.status === 'Registered' ? 'success' : 'warning'"
            variant="subtle"
          />
        </template>
      </UTable>
    </section>
  </UContainer>
</template>
