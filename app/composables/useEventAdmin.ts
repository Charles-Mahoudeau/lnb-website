import type {
  EventAdminQuery,
  EventAdminRow,
  EventAdminView,
  EventBody,
  EventDuplicateBody,
  EventProblem,
  EventRegistrationAddBody,
  EventRegistrationList,
  EventUserOption,
  EventRoomBody,
  EventRoomPatchBody,
  EventRoomView,
  EventTypeBody,
  EventTypePatchBody,
  EventTypeView,
} from '#shared/schemas/events';
import { EVENT_PROBLEMS } from '#shared/schemas/events';
import type { PushImpactBody, PushImpactView } from '#shared/schemas/push';

// The Events section of the admin area. Writes throw an EventError with the API's problem.

/** A refused events request, with the reason the API gave. */
export class EventError extends Error {
  constructor(readonly problem: EventProblem | 'failed') {
    super(`Events request refused: ${problem}`);
  }
}

/** Turns a $fetch error into an EventError with the API's problem code. */
export function toEventError(error: unknown): EventError {
  const problem = (error as { data?: { data?: { problem?: unknown } } }).data?.data?.problem;
  return new EventError(
    EVENT_PROBLEMS.includes(problem as EventProblem) ? (problem as EventProblem) : 'failed',
  );
}

async function call<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    throw toEventError(error);
  }
}

/** Every room, archived ones last. */
export function useEventRooms() {
  return useFetch<{ items: EventRoomView[] }>('/api/admin/event-rooms', {
    key: 'event-admin-rooms',
  });
}

/** Every event type, archived ones last. */
export function useEventTypes() {
  return useFetch<{ items: EventTypeView[] }>('/api/admin/event-types', {
    key: 'event-admin-types',
  });
}

/** What events managers can do to rooms and types. Each throws an EventError when refused. */
export const eventAdminActions = {
  addRoom: (body: EventRoomBody) =>
    call(() => $fetch<EventRoomView>('/api/admin/event-rooms', { method: 'POST', body })),
  updateRoom: (id: string, patch: EventRoomPatchBody) =>
    call(() =>
      $fetch<EventRoomView>(`/api/admin/event-rooms/${id}`, { method: 'PATCH', body: patch }),
    ),
  addType: (body: EventTypeBody) =>
    call(() => $fetch<EventTypeView>('/api/admin/event-types', { method: 'POST', body })),
  updateType: (id: string, patch: EventTypePatchBody) =>
    call(() =>
      $fetch<EventTypeView>(`/api/admin/event-types/${id}`, { method: 'PATCH', body: patch }),
    ),
};

/** One tab of the admin events list. */
export function useAdminEvents(tab: Ref<NonNullable<EventAdminQuery['tab']>>) {
  return useFetch<{ items: EventAdminRow[] }>('/api/admin/events', {
    key: 'event-admin-list',
    query: computed(() => ({ tab: tab.value })),
  });
}

/** One event, as managers edit it. */
export function useAdminEvent(id: string) {
  return useFetch<EventAdminView>(`/api/admin/events/${id}`, { key: `event-admin-${id}` });
}

/** Everyone registered to an event, then the waitlist. */
export function useEventRegistrations(id: string) {
  return useFetch<EventRegistrationList>(`/api/admin/events/${id}/registrations`, {
    key: `event-admin-registrations-${id}`,
  });
}

const base = (id: string) => `/api/admin/events/${id}`;

/** What events managers can do to events. Each throws an EventError when refused. */
export const eventActions = {
  create: (body: EventBody) =>
    call(() => $fetch<{ id: string }>('/api/admin/events', { method: 'POST', body })),
  update: (id: string, body: EventBody) => call(() => $fetch(base(id), { method: 'PUT', body })),
  cancel: (id: string) => call(() => $fetch(`${base(id)}/cancel`, { method: 'POST' })),
  remove: (id: string) => call(() => $fetch(base(id), { method: 'DELETE' })),
  duplicate: (id: string, body: EventDuplicateBody) =>
    call(() => $fetch<{ id: string }>(`${base(id)}/duplicate`, { method: 'POST', body })),
  addRegistration: (id: string, body: EventRegistrationAddBody) =>
    call(() => $fetch(`${base(id)}/registrations`, { method: 'POST', body })),
  removeRegistration: (id: string, userId: string) =>
    call(() =>
      $fetch(`${base(id)}/registrations/${encodeURIComponent(userId)}`, { method: 'DELETE' }),
    ),
  pushImpact: (id: string, body: PushImpactBody) =>
    call(() => $fetch<PushImpactView>(`${base(id)}/push-impact`, { method: 'POST', body })),
  announce: (id: string) =>
    call(() => $fetch<{ recipients: number }>(`${base(id)}/announce`, { method: 'POST' })),
  bdeRetry: (id: string) => call(() => $fetch(`${base(id)}/bde-sync`, { method: 'POST' })),
  searchUsers: (q: string) =>
    call(() => $fetch<{ items: EventUserOption[] }>('/api/admin/events/users', { query: { q } })),
};
