import type { EventList, EventQuery, EventView } from '#shared/schemas/events';

// Events, as everyone sees them.

/** Published events, upcoming or past. */
export function useEventList(query: MaybeRefOrGetter<EventQuery>, key: string) {
  return useFetch<EventList>('/api/events', { key, query: computed(() => toValue(query)) });
}

/** One event. A draft is a 404, except for events managers. */
export function useEvent(id: MaybeRefOrGetter<string>) {
  return useFetch<EventView>(() => `/api/events/${toValue(id)}`, {
    key: computed(() => `event-${toValue(id)}`),
  });
}
