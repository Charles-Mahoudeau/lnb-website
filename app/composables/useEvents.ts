import type {
  EventList,
  EventQuery,
  EventRegistrationResult,
  EventView,
  MyEventList,
} from '#shared/schemas/events';

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

/** The caller's registrations, upcoming and past. */
export function useMyEvents(signedIn = true) {
  return useFetch<MyEventList>('/api/account/events', { key: 'my-events', immediate: signedIn });
}

async function call<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    throw toEventError(error);
  }
}

/** Registering and cancelling. Each throws an EventError when refused. */
export const eventRegistrationActions = {
  register: (id: string) =>
    call(() =>
      $fetch<EventRegistrationResult>(`/api/events/${id}/registration`, { method: 'POST' }),
    ),
  unregister: (id: string) =>
    call(() => $fetch(`/api/events/${id}/registration`, { method: 'DELETE' })),
};
