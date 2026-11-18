import type { MapAdminView, MapPublicView, MapSettingsBody } from '#shared/schemas/map';

// The Minecraft map page (/minecraft/map). The admin side is in useAdminMap.

/** The address of the live map. */
export function useMap() {
  return useFetch<MapPublicView>('/api/map', { key: 'map' });
}

/** The stored address and the default one. */
export function useAdminMap() {
  return useFetch<MapAdminView>('/api/admin/map', { key: 'map-admin' });
}

export const mapActions = {
  setSettings: (body: MapSettingsBody) =>
    $fetch<MapAdminView>('/api/admin/map', { method: 'PATCH', body }),
};
