import type {
  ModAddBody,
  ModAdminRow,
  ModListName,
  ModSettingsPatchBody,
  ModSettingsView,
} from '#shared/schemas/mods';

// The Mods section of the admin area. Writes throw a ModError with the API's problem.

async function call<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    throw toModError(error);
  }
}

/** The mod list settings, and saving them. */
export function useModSettings() {
  return {
    settings: useFetch<ModSettingsView>('/api/minecraft/admin/settings', {
      key: 'mod-admin-settings',
    }),
    save: (patch: ModSettingsPatchBody) =>
      call(() =>
        $fetch<ModSettingsView>('/api/minecraft/admin/settings', { method: 'PATCH', body: patch }),
      ),
  };
}

/** One tab of the mod list, for admins, refetched when the status changes. */
export function useModAdminList(list: ModListName, status: Ref<'visible' | 'removed'>) {
  return useFetch<{ items: ModAdminRow[] }>('/api/minecraft/admin/mods', {
    key: `mod-admin-${list}`,
    query: computed(() => ({ list, status: status.value })),
  });
}

const post = (id: number, action: string, body?: object) =>
  call(() => $fetch(`/api/minecraft/admin/mods/${String(id)}/${action}`, { method: 'POST', body }));

/** What admins can do to the list. Each throws a ModError when refused. */
export const modAdminActions = {
  add: (body: ModAddBody) =>
    call(() => $fetch<{ id: number }>('/api/minecraft/admin/mods', { method: 'POST', body })),
  promote: (id: number) => post(id, 'promote'),
  remove: (id: number, reason: string) => post(id, 'remove', { reason }),
  restore: (id: number) => post(id, 'restore'),
  deleteOfficial: (id: number) =>
    call(() => $fetch(`/api/minecraft/admin/mods/${String(id)}`, { method: 'DELETE' })),
};
