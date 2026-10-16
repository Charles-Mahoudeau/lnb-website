import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';

import EventsAgenda from '~/components/events/Agenda.vue';
import EventsRegistrationPanel from '~/components/events/RegistrationPanel.vue';

import type { EventSummary, EventView } from '#shared/schemas/events';

const DAY = 86_400_000;
const at = (offset: number) => new Date(Date.now() + offset).toISOString();

function summary(overrides: Partial<EventSummary> = {}): EventSummary {
  return {
    id: '0b6f3c1e-2a4d-4c1b-9b7e-5f1c2d3e4a5b',
    name: 'Werewolf and Among Us night',
    startsAt: at(5 * DAY),
    endsAt: at(5 * DAY + 4 * 3600_000),
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
    registered: 23,
    images: null,
    me: null,
    ...overrides,
  };
}

function view(overrides: Partial<EventView> = {}): EventView {
  return {
    ...summary(),
    descriptionHtml: '<p>Two rounds.</p>',
    summary: 'Two rounds.',
    price: null,
    registrationOpensAt: null,
    registrationClosesAt: null,
    hidden: false,
    registration: { state: 'open', waitlist: 0, me: null },
    attendees: null,
    ...overrides,
  };
}

describe('events agenda', () => {
  it('opens on the next event, then lists the others', async () => {
    const agenda = await mountSuspended(EventsAgenda, {
      props: {
        events: [
          summary(),
          summary({
            id: '2b6f3c1e-2a4d-4c1b-9b7e-5f1c2d3e4a5b',
            name: 'Smash Bros cup',
            capacity: 2,
            registered: 2,
          }),
        ],
        featureNext: true,
      },
    });
    const text = agenda.text();
    expect(text).toContain('Next event, in 5 days');
    expect(text).toContain('23 of 40 places taken, 17 left');
    expect(text).toContain('Smash Bros cup');
    expect(text).toContain('Full');
  });
});

describe('registration panel', () => {
  it('shows the places taken', async () => {
    const text = (
      await mountSuspended(EventsRegistrationPanel, { props: { event: view() } })
    ).text();
    expect(text).toContain('of 40 places taken');
    expect(text).toContain('17 left');
  });

  it('says when registration opens', async () => {
    const panel = await mountSuspended(EventsRegistrationPanel, {
      props: {
        event: view({
          registrationOpensAt: at(2 * DAY),
          registration: { state: 'notYet', waitlist: 0, me: null },
        }),
      },
    });
    expect(panel.text()).toContain('Registration opens on');
    expect(panel.text()).not.toContain('Register');
  });

  it('asks visitors to sign in, and hides who is going', async () => {
    const text = (
      await mountSuspended(EventsRegistrationPanel, { props: { event: view() } })
    ).text();
    expect(text).toContain('Sign in to register');
    expect(text).toContain('Sign in to see who’s going.');
  });

  it('shows the caller where they stand', async () => {
    const registered = await mountSuspended(EventsRegistrationPanel, {
      props: {
        event: view({
          registration: {
            state: 'open',
            waitlist: 0,
            me: { status: 'registered', position: null },
          },
        }),
      },
    });
    expect(registered.text()).toContain('You’re registered');
    expect(registered.text()).toContain('Cancel registration');
    const waiting = await mountSuspended(EventsRegistrationPanel, {
      props: {
        event: view({
          registration: { state: 'full', waitlist: 3, me: { status: 'waitlist', position: 2 } },
        }),
      },
    });
    expect(waiting.text()).toContain('Waitlist, number 2');
    expect(waiting.text()).toContain('Leave the waitlist');
  });

  it('marks cancelled and past events', async () => {
    const cancelled = await mountSuspended(EventsRegistrationPanel, {
      props: { event: view({ cancelled: true }) },
    });
    expect(cancelled.text()).toContain('Cancelled');
    const past = await mountSuspended(EventsRegistrationPanel, {
      props: { event: view({ startsAt: at(-2 * DAY), endsAt: at(-DAY) }) },
    });
    expect(past.text()).toContain('This event is over');
  });
});
