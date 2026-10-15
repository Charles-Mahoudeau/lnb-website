import type {
  WardenAppealView,
  WardenAuditView,
  WardenBanBody,
  WardenBanView,
  WardenManualLinkBody,
  WardenManualLinkView,
  WardenMinecraftLookup,
  WardenNoteBody,
  WardenNoteView,
  WardenPage,
  WardenPlayerDetail,
  WardenPlayerRow,
  WardenPlayersQuery,
  WardenSettingsView,
  WardenUserOption,
} from '#shared/schemas/warden';

// The Warden admin panel's data and actions. Writes throw a WardenError with the API's problem.

async function call<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    throw toWardenError(error);
  }
}

/** Players for the list, refetched when the query changes. */
export function useWardenAdminPlayers(query: Ref<WardenPlayersQuery>) {
  return useFetch<WardenPage<WardenPlayerRow>>('/api/warden/admin/players', {
    key: 'warden-admin-players',
    query,
  });
}

export interface WardenAppealListItem {
  appeal: WardenAppealView;
  ban: WardenBanView;
  player: { userId: string; name: string };
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

/** The audit log, filtered, with older entries on demand. */
export function useWardenAudit(
  filters: Ref<{ userId?: string; action?: string; source?: string }>,
) {
  const audit = useFetch<WardenPage<WardenAuditView>>('/api/warden/admin/audit', {
    key: 'warden-admin-audit',
    query: filters,
  });
  return {
    audit,
    more: (cursor: string) =>
      call(() =>
        $fetch<WardenPage<WardenAuditView>>('/api/warden/admin/audit', {
          query: { ...filters.value, cursor },
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
  return {
    player,
    ban: (body: WardenBanBody) =>
      call(() => $fetch<WardenBanView>(`${base}/bans`, { method: 'POST', body })),
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
    regenerateToken: () => call(() => $fetch(`${base}/token`, { method: 'POST' })),
    unlink: (uuid: string) => call(() => $fetch(`${base}/accounts/${uuid}`, { method: 'DELETE' })),
  };
}

/** Link codes made by hand: looking accounts up, making, cancelling, and the recent ones. */
export function useWardenManualLinks() {
  const recent = useFetch<WardenManualLinkView[]>('/api/warden/admin/link-requests', {
    key: 'warden-admin-link-requests',
  });
  return {
    recent,
    lookup: (username: string, cracked: boolean) =>
      call(() =>
        $fetch<WardenMinecraftLookup>(
          `/api/warden/admin/minecraft/${encodeURIComponent(username)}`,
          {
            query: { cracked: String(cracked) },
          },
        ),
      ),
    searchUsers: (q: string) =>
      call(() => $fetch<WardenUserOption[]>('/api/warden/admin/users', { query: { q } })),
    create: (body: WardenManualLinkBody) =>
      call(() =>
        $fetch<WardenManualLinkView>('/api/warden/admin/link-requests', { method: 'POST', body }),
      ),
    cancel: (id: string) =>
      call(() =>
        $fetch<WardenManualLinkView>(`/api/warden/admin/link-requests/${id}`, { method: 'DELETE' }),
      ),
  };
}
