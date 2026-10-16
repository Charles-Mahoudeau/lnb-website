import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';

import EventsAdminList from '~/components/events/admin/List.vue';
import EventsAdminRooms from '~/components/events/admin/Rooms.vue';
import EventsAdminTypes from '~/components/events/admin/Types.vue';

import type { EventRoomView, EventTypeView } from '#shared/schemas/events';

const rooms: EventRoomView[] = [
  { id: 'r1', name: 'Wakanda', details: 'Campus Nantes', archived: false },
  { id: 'r2', name: 'Old foyer', details: null, archived: true },
];
const types: EventTypeView[] = [
  { id: 't1', nameEn: 'Tournament', nameFr: 'Tournoi', icon: 'i-lucide-swords', archived: false },
];
registerEndpoint('/api/admin/event-rooms', () => ({ items: rooms }));
registerEndpoint('/api/admin/event-types', () => ({ items: types }));

describe('events admin', () => {
  it('lists rooms, with archived ones marked and offered back', async () => {
    const text = (await mountSuspended(EventsAdminRooms)).text();
    expect(text).toContain('Wakanda');
    expect(text).toContain('Campus Nantes');
    expect(text).toContain('Archived');
    expect(text).toContain('Restore');
    expect(text).toContain('Archive');
  });

  it('lists types with both names', async () => {
    const text = (await mountSuspended(EventsAdminTypes)).text();
    expect(text).toContain('Tournament');
    expect(text).toContain('Tournoi');
  });
});

describe('admin events list', () => {
  it('shows each event with its registrations and waitlist', async () => {
    registerEndpoint('/api/admin/events', () => ({
      items: [
        {
          id: '0b6f3c1e-2a4d-4c1b-9b7e-5f1c2d3e4a5b',
          name: 'Smash Bros inter-school cup',
          startsAt: '2026-11-28T13:00:00.000Z',
          endsAt: '2026-11-28T19:00:00.000Z',
          hidden: false,
          cancelledAt: null,
          room: rooms[0],
          type: types[0],
          capacity: 32,
          counts: { registered: 32, waitlist: 4 },
          bdeSync: false,
          bdeStatus: null,
        },
      ],
    }));
    const text = (await mountSuspended(EventsAdminList)).text();
    expect(text).toContain('Smash Bros inter-school cup');
    expect(text).toContain('32 / 32');
    expect(text).toContain('4 waiting');
  });
});
