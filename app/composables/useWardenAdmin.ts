import type {
  WardenAppealListItem,
  WardenBanBody,
  WardenBanView,
  WardenNoteBody,
  WardenNoteView,
  WardenPlayerDetail,
  WardenFeed,
  WardenFeedQuery,
  WardenSettingsView,
} from '#shared/schemas/warden';

// The Warden admin panel's data and actions. Writes throw a WardenError with the API's problem.

async function call<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    throw toWardenError(error);
  }
}

/** Bans in force and recent notes, for Moderation > Bans. */
export function useWardenFeed(kind: Ref<WardenFeedQuery['kind']>) {
  return useFetch<WardenFeed>('/api/warden/admin/feed', {
    key: 'warden-admin-feed',
    query: computed(() => ({ kind: kind.value })),
  });
}

/** Appeals waiting for an answer, and answering them. */
export function useWardenAppeals() {
  const appeals = useFetch<WardenAppealListItem[]>('/api/warden/admin/appeals', {
    key: 'warden-admin-appeals',
    query: { status: 'pending' },
  });
  return {
    appeals,
    decide: (id: string, accept: boolean, response: string) =>
      call(() =>
        $fetch(`/api/warden/admin/appeals/${id}/decision`, {
          method: 'POST',
          body: { accept, response },
        }),
      ),
  };
}

/** The global settings. */
export function useWardenSettings() {
  const settings = useFetch<WardenSettingsView>('/api/warden/admin/settings', {
    key: 'warden-admin-settings',
  });
  return {
    settings,
    // Site admins only: wipes every ban, appeal, note and anticheat sanction.
    resetSanctions: (confirm: string) =>
      call(() =>
        $fetch('/api/warden/admin/reset-sanctions', { method: 'POST', body: { confirm } }),
      ),
    save: (patch: Partial<WardenSettingsView>) =>
      call(() =>
        $fetch<WardenSettingsView>('/api/warden/admin/settings', { method: 'PATCH', body: patch }),
      ),
  };
}

/** One player's admin page, and every action on them. */
export function useWardenAdminPlayer(userId: string) {
  const base = `/api/warden/admin/players/${userId}`;
  const player = useFetch<WardenPlayerDetail>(base, { key: `warden-admin-player-${userId}` });
  return { player, ...useWardenPlayerActions(userId) };
}

/** Every action on a player, without loading their page. */
export function useWardenPlayerActions(userId: string) {
  const base = `/api/warden/admin/players/${userId}`;
  return {
    ban: (body: WardenBanBody) =>
      call(() => $fetch<WardenBanView>(`${base}/bans`, { method: 'POST', body })),
    /** Moves the end of a ban in force. `null` makes it permanent. */
    updateBan: (banId: string, expiresAt: string | null) =>
      call(() =>
        $fetch<WardenBanView>(`/api/warden/admin/bans/${banId}`, {
          method: 'PATCH',
          body: { expiresAt },
        }),
      ),
    revoke: (banId: string, reason?: string) =>
      call(() =>
        $fetch<WardenBanView>(`/api/warden/admin/bans/${banId}/revoke`, {
          method: 'POST',
          body: { reason },
        }),
      ),
    addNote: (body: WardenNoteBody) =>
      call(() => $fetch<WardenNoteView>(`${base}/notes`, { method: 'POST', body })),
    setMaxAccounts: (maxAccounts: number | null) =>
      call(() => $fetch(base, { method: 'PATCH', body: { maxAccounts } })),
    setWardenAdmin: (wardenAdmin: boolean) =>
      call(() => $fetch(`${base}/role`, { method: 'PUT', body: { wardenAdmin } })),
    revokeDevice: (deviceId: string) =>
      call(() => $fetch(`${base}/devices/${deviceId}`, { method: 'DELETE' })),
    unlink: (uuid: string) => call(() => $fetch(`${base}/accounts/${uuid}`, { method: 'DELETE' })),
    dismissTransfer: (transferId: string) =>
      call(() => $fetch(`/api/warden/admin/transfers/${transferId}/dismiss`, { method: 'POST' })),
  };
}
