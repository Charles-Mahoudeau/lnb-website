import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';

import EventsAdminTeams from '~/components/events/admin/Teams.vue';

import type { AdminTeamsView } from '#shared/schemas/event-teams';
import type { EventAdminView } from '#shared/schemas/events';

const ID = '0b6f3c1e-2a4d-4c1b-9b7e-5f1c2d3e4a5b';

const teams: AdminTeamsView = {
  min: 3,
  max: 4,
  capacity: 8,
  counts: { registered: 1, waitlist: 0, incomplete: 1, without: 1 },
  teams: [
    {
      id: '2b6f3c1e-2a4d-4c1b-9b7e-5f1c2d3e4a5b',
      name: 'Night Owls',
      status: 'registered',
      position: null,
      forced: true,
      captainUserId: 'u1',
      pendingInvites: 2,
      members: [
        {
          userId: 'u1',
          name: 'Ada Lovelace',
          email: 'ada@epitech.eu',
          image: null,
          school: 'Epitech',
          captain: true,
          otherTeams: 1,
        },
      ],
    },
  ],
  without: [
    {
      userId: 'u2',
      name: 'Grace Hopper',
      email: 'grace@epitech.eu',
      image: null,
      school: 'Epitech',
      lookingHidden: false,
    },
  ],
};
registerEndpoint(`/api/admin/events/${ID}/teams`, () => teams);

describe('admin event teams', () => {
  it('shows teams with emails, the bypasses, and the players without a team', async () => {
    const wrapper = await mountSuspended(EventsAdminTeams, {
      props: { event: { id: ID, cancelledAt: null } as EventAdminView },
    });
    const text = wrapper.text();
    expect(text).toContain('Teams of 3 to 4');
    expect(text).toContain('Night Owls');
    expect(text).toContain('Validated by hand');
    expect(text).toContain('In two teams');
    expect(text).toContain('ada@epitech.eu');
    expect(text).toContain('2 invitations waiting');
    expect(text).toContain('Players without a team');
    expect(text).toContain('Grace Hopper');
    expect(text).toContain('Add to a team');
  });
});
