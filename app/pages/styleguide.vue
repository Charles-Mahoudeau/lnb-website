<script setup lang="ts">
import type { NavigationMenuItem, TableColumn, TabsItem } from '@nuxt/ui';

import { EventsAdminImagePicker } from '#components';

import type { EventAdminView, EventSummary, EventView } from '#shared/schemas/events';
import type { ModView } from '#shared/schemas/mods';

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
  { name: 'Second accent', variable: '--ui-secondary', usage: 'text-secondary' },
  { name: 'Banner', variable: '--color-banner', usage: 'bg-banner' },
  { name: 'Banner fallback', variable: '--color-banner-fallback', usage: 'bg-banner-fallback' },
  { name: 'Text on banners', variable: '--color-on-banner', usage: 'text-on-banner' },
  { name: 'Success', variable: '--ui-success', usage: 'color="success"' },
  { name: 'Warning', variable: '--ui-warning', usage: 'color="warning"' },
];

// A suggestion as the mod list shows it, with your vote on it.
const sampleMod = ref<ModView>({
  id: 1,
  list: 'suggestion',
  source: 'modrinth',
  name: 'Farmer’s Delight',
  summary: 'A cozy expansion to farming and cooking.',
  pageUrl: 'https://modrinth.com/mod/farmers-delight',
  iconUrl: null,
  score: 9,
  up: 11,
  down: 2,
  suggested: true,
  proposerName: 'Léa M.',
  reason: 'Cooking gives everyone something to do between builds.',
  createdAt: '2026-10-14T18:00:00.000Z',
  myVote: 1,
  mine: false,
});

function onSampleVote(value: -1 | 0 | 1) {
  const mod = sampleMod.value;
  const up = mod.up - (mod.myVote === 1 ? 1 : 0) + (value === 1 ? 1 : 0);
  const down = mod.down - (mod.myVote === -1 ? 1 : 0) + (value === -1 ? 1 : 0);
  sampleMod.value = { ...mod, up, down, score: up - down, myVote: value };
}

// Example IDs, picked so each avatar gets a different tint.
const people = [
  { id: 'user-1', name: 'Alex Laurent' },
  { id: 'user-6', name: 'Inès Moreau' },
  { id: 'user-2', name: 'Sam Nguyen' },
  { id: 'user-3', name: 'Léa Martin' },
  { id: 'user-5', name: 'Yanis Touré' },
];

const campuses = ['Paris', 'Lyon', 'Nantes', 'Marseille'];
const campus = ref('Paris');
const email = ref('alex@gmail.com');
const linkCode = ref([1, 9, 6, 0]);
const notify = ref(true);
const reminders = ref(true);
const notifyDemo = ref(true);
const reminderDemo = ref([60]);

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

// An Epitech admin, so the menu shows every entry.
const sampleUser = {
  id: 'user-1',
  name: 'Alex Laurent',
  email: 'alex.laurent@epitech.eu',
  tenantId: '901cb4ca-b862-4029-9306-e5cd0f6d9f86',
  role: 'admin',
};

// The home hero for an event without banner art, with registrations.
const sampleEvent: EventSummary = {
  id: '0b6f3c1e-2a4d-4c1b-9b7e-5f1c2d3e4a5b',
  name: 'Werewolf and Among Us night',
  startsAt: '2026-11-04T18:30:00.000Z',
  endsAt: '2026-11-04T22:30:00.000Z',
  cancelled: false,
  room: { name: 'Wakanda', details: 'Campus Nantes' },
  type: {
    id: '1b6f3c1e-2a4d-4c1b-9b7e-5f1c2d3e4a5b',
    nameEn: 'Game night',
    nameFr: 'Soirée jeux',
    icon: 'i-lucide-dices',
  },
  schools: ['901cb4ca-b862-4029-9306-e5cd0f6d9f86'],
  capacity: 40,
  registered: 18,
  images: null,
  me: null,
};
const sampleAttendees: EventAttendees = {
  registered: 18,
  capacity: 40,
  people: people.map(({ id, name }) => ({ id, name, image: null })),
};
// An event page's data, in the registration states the panel shows.
function sampleView(registration: EventView['registration'], overrides: Partial<EventView> = {}) {
  return {
    ...sampleEvent,
    descriptionHtml: '<p>Two rounds of <strong>Werewolf</strong>, then Among Us.</p>',
    summary: 'Two rounds of Werewolf, then Among Us.',
    price: null,
    registrationOpensAt: null,
    registrationClosesAt: null,
    hidden: false,
    registration,
    attendees: sampleAttendees.people.map((person) => ({ ...person, image: null })),
    ...overrides,
  } satisfies EventView;
}
const panels = [
  // Signed out, as on the style guide: the API sends no names.
  {
    label: 'Open, signed out',
    event: sampleView({ state: 'open', waitlist: 0, me: null }, { attendees: null }),
  },
  {
    label: 'Full, on the waitlist',
    event: sampleView(
      { state: 'full', waitlist: 4, me: { status: 'waitlist', position: 2 } },
      { registered: 40 },
    ),
  },
  {
    label: 'Registered',
    event: sampleView({ state: 'open', waitlist: 0, me: { status: 'registered', position: null } }),
  },
  {
    label: 'Not open yet',
    event: sampleView(
      { state: 'notYet', waitlist: 0, me: null },
      { registrationOpensAt: '2026-11-02T11:00:00.000Z' },
    ),
  },
  {
    label: 'Cancelled',
    event: sampleView({ state: 'cancelled', waitlist: 0, me: null }, { cancelled: true }),
  },
];

// An event as managers see it, for the BDE status block.
function sampleAdmin(overrides: Partial<EventAdminView>): EventAdminView {
  return {
    id: sampleEvent.id,
    name: sampleEvent.name,
    startsAt: sampleEvent.startsAt,
    endsAt: sampleEvent.endsAt,
    hidden: false,
    cancelledAt: null,
    room: { id: sampleEvent.type.id, name: 'Wakanda', details: 'Campus Nantes', archived: false },
    type: { ...sampleEvent.type, archived: false },
    capacity: 40,
    counts: { registered: 18, waitlist: 0 },
    bdeSync: true,
    bdeStatus: 'synced',
    description: 'Two rounds of **Werewolf**.',
    banner: null,
    embed: null,
    images: null,
    schools: sampleEvent.schools,
    registrationOpensAt: null,
    registrationClosesAt: null,
    price: null,
    reminderOffsets: [60],
    announcedAt: null,
    bde: {
      attempts: 0,
      nextAttemptAt: null,
      lastError: null,
      pageUrl: 'https://bde-teknantes.fr/home/event/42',
    },
    createdAt: sampleEvent.startsAt,
    updatedAt: sampleEvent.startsAt,
    ...overrides,
  };
}
const bdeStates = [
  sampleAdmin({}),
  sampleAdmin({
    bdeStatus: 'pending',
    bde: {
      attempts: 2,
      nextAttemptAt: '2026-11-01T12:30:00.000Z',
      lastError: { status: 503 },
      pageUrl: null,
    },
  }),
  sampleAdmin({
    bdeStatus: 'failed',
    bde: {
      attempts: 1,
      nextAttemptAt: null,
      lastError: { status: 422, url: ['must be an https link on an allowed domain'] },
      pageUrl: null,
    },
  }),
];

// The image picker talks to the admin API, so it opens for events managers only.
const picker = useOverlay().create(EventsAdminImagePicker);
function openPicker() {
  void picker.open({ title: 'Choose the banner' });
}

// Later events, for the agenda and the next-event card.
const sampleAgenda: EventSummary[] = [
  sampleEvent,
  {
    ...sampleEvent,
    id: '2b6f3c1e-2a4d-4c1b-9b7e-5f1c2d3e4a5b',
    name: 'Smash Bros inter-school cup',
    startsAt: '2026-11-28T13:00:00.000Z',
    endsAt: '2026-11-28T19:00:00.000Z',
    room: { name: 'Amphi B', details: null },
    type: { ...sampleEvent.type, nameEn: 'Tournament', nameFr: 'Tournoi', icon: 'i-lucide-swords' },
    capacity: 32,
    registered: 32,
  },
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

// The admin sidebar, as in layouts/admin.vue. The real one is at /admin.
const adminNav: NavigationMenuItem[] = [
  { label: 'Overview', icon: 'i-lucide-layout-dashboard', to: '/styleguide', exact: true },
  { label: 'Users', icon: 'i-lucide-users' },
  {
    label: 'Warden',
    icon: 'i-lucide-pickaxe',
    defaultOpen: true,
    children: [{ label: 'Players' }, { label: 'Appeals' }, { label: 'Settings' }],
  },
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
    <header class="flex max-w-2xl flex-col items-start gap-3">
      <div class="flex w-full items-center justify-between gap-4">
        <h1 class="text-4xl font-bold">Style guide</h1>
        <UColorModeButton />
      </div>
      <p class="text-muted">
        The Soft night design language, rendered with the real themed components. The rules behind
        it are in <code>docs/design.md</code>. Toggle the color mode next to the title to check
        light mode. Names and events are example content.
      </p>
    </header>

    <section class="flex flex-col gap-6">
      <h2 class="text-2xl font-bold">Color</h2>
      <p class="max-w-2xl text-muted">
        Deep crimson only marks actions. Dusk violet, the second accent, marks state and brings
        color to dates, icon tiles and the current page, never to actions. Status colors are for
        state, never decoration. Use the semantic classes, never raw palette colors.
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
              <span class="font-display text-2xl leading-none font-bold text-secondary">
                {{ event.day }}
              </span>
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
          Event lists are dated rows, not card grids. The date uses <code>font-display</code>,
          tabular numbers and the second accent.
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
        <div class="flex flex-wrap items-center gap-3">
          <AccountMenu :user="sampleUser" />
          <UButton
            color="neutral"
            variant="outline"
            size="lg"
            icon="i-lucide-user"
            label="Sign in"
          />
        </div>
        <p class="text-sm text-muted">
          The header's sign-in button (neutral outline, with the person icon) and the account menu:
          profile on the menu background, shortcuts on icon tiles, sign out as an outline button.
        </p>
      </div>
    </section>

    <section class="flex flex-col gap-6">
      <h2 class="text-2xl font-bold">Event hero</h2>
      <p class="max-w-2xl text-muted">
        The home hero for the next event. Without banner art it sits on the fallback with scattered
        activity icons. Who's going shows once the event has registrations, with or without art. It
        stays dark in both color modes.
      </p>
      <div class="overflow-hidden rounded-lg">
        <EventsHero :event="sampleEvent" :attendees="sampleAttendees" />
      </div>
    </section>

    <section class="flex flex-col gap-6">
      <h2 class="text-2xl font-bold">Home intro</h2>
      <p class="max-w-2xl text-muted">
        The home hero when no event is planned (<code>HomeIntro</code>): what the association does,
        on the fallback with the scattered icons. The sign-in button shows signed out only.
      </p>
      <div class="overflow-hidden rounded-lg">
        <HomeIntro />
      </div>
    </section>

    <section class="flex flex-col gap-6">
      <h2 class="text-2xl font-bold">Event agenda</h2>
      <p class="max-w-2xl text-muted">
        Events grouped by month, as dated rows. On the events page the next event opens its month as
        a larger card (<code>EventsNextCard</code>), so it's where the eye starts.
      </p>
      <EventsAgenda :events="sampleAgenda" feature-next />
    </section>

    <section class="flex flex-col gap-6">
      <h2 class="text-2xl font-bold">Event registration</h2>
      <p class="max-w-2xl text-muted">
        The panel beside an event's description (<code>EventsRegistrationPanel</code>): the places
        taken, then where you stand and the one action that fits. Status colors only for state:
        registered, waitlist, full, cancelled. Signed out, it asks to sign in and hides the names.
      </p>
      <div class="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div v-for="panel in panels" :key="panel.label" class="flex flex-col gap-2">
          <span class="text-sm text-muted">{{ panel.label }}</span>
          <EventsRegistrationPanel :event="panel.event" />
        </div>
      </div>
    </section>

    <section class="flex flex-col gap-6">
      <h2 class="text-2xl font-bold">Notifications</h2>
      <p class="max-w-2xl text-muted">
        Push notifications, about events only. The prompt is a bottom sheet on phones and a dialog
        on desktop, offered after a registration (<code>PushPrePrompt</code>), the settings are one
        card on /account (<code>PushSettings</code>), and managers confirm every action that
        notifies people. Switches are controls, so they use the action red when on.
      </p>
      <div class="grid items-start gap-10 lg:grid-cols-2">
        <div class="flex flex-col gap-4 rounded-lg bg-elevated p-6">
          <div class="flex items-center gap-4">
            <IconTile icon="i-lucide-bell" />
            <div class="min-w-0 flex-1">
              <p class="font-semibold text-highlighted">Notifications on this device</p>
              <p class="text-sm text-muted">{{ notifyDemo ? 'On' : 'Off' }}</p>
            </div>
            <USwitch v-model="notifyDemo" aria-label="Notifications on this device" />
          </div>
          <div class="flex items-center gap-4 border-t border-default pt-3">
            <div class="min-w-0 flex-1">
              <p class="font-medium text-highlighted">Reminders</p>
              <p class="text-sm text-muted">Before events you registered for</p>
            </div>
            <USwitch :model-value="true" aria-label="Reminders" />
          </div>
          <div class="flex items-baseline gap-3 border-t border-default pt-3">
            <span class="font-display text-2xl text-highlighted tabular-nums">3</span>
            <span class="text-muted">Received in the last 7 days</span>
          </div>
        </div>
        <div class="flex flex-col gap-4">
          <div class="flex flex-wrap gap-2" role="group" aria-label="Reminders">
            <UButton
              v-for="minutes in [15, 60, 180, 1440]"
              :key="minutes"
              size="md"
              :color="reminderDemo.includes(minutes) ? 'secondary' : 'neutral'"
              :variant="reminderDemo.includes(minutes) ? 'subtle' : 'soft'"
              :aria-pressed="reminderDemo.includes(minutes)"
              :label="`${minutes} min`"
              @click="
                reminderDemo = reminderDemo.includes(minutes)
                  ? reminderDemo.filter((m) => m !== minutes)
                  : [...reminderDemo, minutes]
              "
            />
          </div>
          <UAlert
            color="warning"
            variant="subtle"
            icon="i-lucide-triangle-alert"
            description="4 of them already received 3 or more this week. Nothing is blocked."
          />
          <UAlert
            color="neutral"
            variant="subtle"
            icon="i-lucide-circle-check"
            description="Nobody is over the weekly limit of 3."
          />
          <div class="flex gap-3 rounded-lg bg-accented p-3">
            <img src="/logo.svg" alt="" class="size-9 shrink-0 rounded-md dark:hidden" />
            <img src="/logo-dark.svg" alt="" class="hidden size-9 shrink-0 rounded-md dark:block" />
            <div>
              <p class="font-semibold text-highlighted">Smash night starts in 1 hour</p>
              <p class="text-sm text-muted">Friday 24 October at 20:00, Room 2.04.</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="flex flex-col gap-6">
      <h2 class="text-2xl font-bold">Event details</h2>
      <p class="max-w-2xl text-muted">
        The practical details of an event page (<code>EventsDetails</code>): icons in muted text,
        the value in bold, its precision below, and the calendar file as a link.
      </p>
      <EventsDetails :event="panels[0]!.event" class="max-w-xl" />
    </section>

    <section class="flex flex-col gap-6">
      <h2 class="text-2xl font-bold">BDE website status</h2>
      <p class="max-w-2xl text-muted">
        In the event form (<code>EventsAdminBdeStatus</code>): on the BDE website, waiting for a
        retry, or refused with the BDE's own messages.
      </p>
      <div class="grid items-start gap-4 lg:grid-cols-3">
        <EventsAdminBdeStatus
          v-for="state in bdeStates"
          :key="state.bdeStatus ?? ''"
          :event="state"
        />
      </div>
    </section>

    <section class="flex flex-col gap-6">
      <h2 class="text-2xl font-bold">Event image picker</h2>
      <p class="max-w-2xl text-muted">
        A modal in two steps (<code>EventsAdminImagePicker</code>): the art, from SteamGridDB, an
        upload or a link, then the focal point with the three crops. It calls the admin API, so it
        only works signed in as an events manager.
      </p>
      <div>
        <UButton
          color="neutral"
          variant="soft"
          icon="i-lucide-image"
          label="Open the picker"
          @click="openPicker"
        />
      </div>
    </section>

    <section class="flex flex-col gap-6">
      <h2 class="text-2xl font-bold">Icons and avatars</h2>
      <p class="max-w-2xl text-muted">
        Icons that introduce an item sit on a tile tinted with the second accent
        (<code>IconTile</code>). Avatars without a photo get a tint per person from
        <code>avatarTint</code>, so someone keeps the same color everywhere.
      </p>
      <div class="flex flex-wrap items-center gap-3">
        <IconTile icon="i-lucide-gamepad-2" />
        <IconTile icon="i-lucide-dices" />
        <IconTile icon="i-lucide-calendar" />
        <IconTile icon="i-lucide-puzzle" />
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <UAvatar
          v-for="person in people"
          :key="person.id"
          :alt="person.name"
          :ui="avatarTint(person.id)"
        />
      </div>
    </section>

    <section class="flex flex-col gap-6">
      <h2 class="text-2xl font-bold">Admin</h2>
      <p class="max-w-2xl text-muted">
        The admin area replaces the header with a sidebar on a surface step, without a border. The
        current page is marked with the second accent, since it's state, and the navbar shows where
        you are.
      </p>
      <div class="flex max-w-3xl overflow-hidden rounded-lg">
        <div class="flex w-60 shrink-0 flex-col gap-4 bg-elevated p-4">
          <span class="font-display font-bold text-highlighted">Admin</span>
          <UNavigationMenu :items="adminNav" orientation="vertical" />
        </div>
        <div class="flex min-w-0 flex-1 flex-col gap-4 p-6">
          <div class="flex items-center gap-1.5 font-semibold text-highlighted">
            <span class="font-medium text-muted">Warden</span>
            <UIcon name="i-lucide-chevron-right" class="size-4 text-dimmed" />
            <span>Players</span>
          </div>
          <p class="text-muted">Page content</p>
        </div>
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
      <h2 class="text-2xl font-bold">Mod list</h2>
      <p class="max-w-2xl text-muted">
        One row per mod: icon (or initials on a plain tile), name, summary, the reason when it was
        suggested, and the vote pill. Your vote is state, so it's marked in neutral, never in red.
        Clicking your current vote clears it.
      </p>
      <ul class="flex max-w-3xl flex-col gap-2">
        <ModsRow :mod="sampleMod" :blocked="null" @vote="onSampleVote" />
      </ul>
      <div class="flex flex-wrap items-center gap-6">
        <ModsVoteControl :score="4" :up="5" :down="1" :my-vote="0" name="No vote" />
        <ModsVoteControl :score="4" :up="5" :down="1" :my-vote="1" name="Upvoted" />
        <ModsVoteControl :score="4" :up="5" :down="1" :my-vote="-1" name="Downvoted" />
        <ModsVoteControl
          :score="4"
          :up="5"
          :down="1"
          :my-vote="0"
          name="Blocked"
          blocked="Voting is closed"
        />
        <ModsIcon name="Sodium" :src="null" />
        <ModsIcon name="Simple Voice Chat" :src="null" size="sm" />
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
