import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';

import EventsAgenda from '~/components/events/Agenda.vue';
import EventsTeams from '~/components/events/Teams.vue';

import type { EventTeamsView } from '#shared/schemas/event-teams';
import type { EventSummary, EventView } from '#shared/schemas/events';

const DAY = 86_400_000;
const at = (offset: number) => new Date(Date.now() + offset).toISOString();

function summary(overrides: Partial<EventSummary> = {}): EventSummary {
  return {
    id: '0b6f3c1e-2a4d-4c1b-9b7e-5f1c2d3e4a5b',
    name: 'Rocket League 3v3',
    startsAt: at(5 * DAY),
    endsAt: at(5 * DAY + 4 * 3600_000),
    cancelled: false,
    room: { name: 'Wakanda', details: null },
    type: {
      id: '1b6f3c1e-2a4d-4c1b-9b7e-5f1c2d3e4a5b',
      nameEn: 'Tournament',
      nameFr: 'Tournoi',
      icon: 'i-lucide-trophy',
    },
    schools: ['901cb4ca-b862-4029-9306-e5cd0f6d9f86'],
    capacity: 4,
    registered: 12,
    teams: { min: 3, max: 4, registered: 2, waitlist: 1 },
    images: null,
    me: null,
    ...overrides,
  };
}

const event: EventView = {
  ...summary(),
  descriptionHtml: '',
  summary: '',
  price: null,
  registrationOpensAt: null,
  registrationClosesAt: null,
  hidden: false,
  registration: { state: 'open', waitlist: 0, me: null },
  attendees: null,
};

const teams: EventTeamsView = {
  teams: [
    {
      id: '2b6f3c1e-2a4d-4c1b-9b7e-5f1c2d3e4a5b',
      name: 'Night Owls',
      status: 'registered',
      position: null,
      players: 3,
      acceptsRequests: true,
      members: null,
      mine: false,
      captain: false,
    },
    {
      id: '3b6f3c1e-2a4d-4c1b-9b7e-5f1c2d3e4a5b',
      name: 'Les Éclairs',
      status: 'incomplete',
      position: null,
      players: 1,
      acceptsRequests: true,
      members: null,
      mine: false,
      captain: false,
    },
  ],
  looking: { count: 4, players: null },
  me: null,
};

describe('event teams', () => {
  it('shows the size asked for and every team, and keeps names for members', async () => {
    const wrapper = await mountSuspended(EventsTeams, { props: { event, teams } });
    const text = wrapper.text();
    expect(text).toContain('Teams of 3 to 4');
    expect(text).toContain('Night Owls');
    expect(text).toContain('Les Éclairs');
    expect(text).toContain('Needs 2 more');
    expect(text).toContain('Sign in to see who is in each team.');
    // Signed out: nothing to start a team with.
    expect(wrapper.find('form').exists()).toBe(false);
  });

  it('offers to start a team to a registered player without one', async () => {
    const wrapper = await mountSuspended(EventsTeams, {
      props: {
        event,
        teams: { ...teams, me: { registered: true, lookingHidden: false, teamIds: [] } },
      },
    });
    expect(wrapper.find('form').exists()).toBe(true);
  });

  it('counts teams, not people, as the places of the agenda', async () => {
    const agenda = await mountSuspended(EventsAgenda, { props: { events: [summary()] } });
    expect(agenda.text()).toContain('2 of 4 teams');
  });
});
