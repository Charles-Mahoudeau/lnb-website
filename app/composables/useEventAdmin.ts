import type {
  EventProblem,
  EventRoomBody,
  EventRoomPatchBody,
  EventRoomView,
  EventTypeBody,
  EventTypePatchBody,
  EventTypeView,
} from '#shared/schemas/events';
import { EVENT_PROBLEMS } from '#shared/schemas/events';

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
