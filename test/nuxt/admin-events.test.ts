import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';

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
