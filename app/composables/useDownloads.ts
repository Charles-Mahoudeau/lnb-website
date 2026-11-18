import { DOWNLOAD_PROBLEMS } from '#shared/schemas/downloads';
import type {
  DownloadProblem,
  DownloadSettingsBody,
  DownloadSlot,
  DownloadSlotBody,
  DownloadsAdminView,
  DownloadsPublicView,
} from '#shared/schemas/downloads';

// The Minecraft download page (/minecraft/download) and its admin section. See docs/downloads.md.

/** The files the page offers from the Files library. */
export function useDownloads() {
  return useFetch<DownloadsPublicView>('/api/downloads', { key: 'downloads' });
}

/** Every slot of the page, with its file. */
export function useAdminDownloads() {
  return useFetch<DownloadsAdminView>('/api/admin/downloads', { key: 'downloads-admin' });
}

/** The reason the API gave for a refused change, or `failed`. */
export function downloadProblem(error: unknown): DownloadProblem | 'failed' {
  const problem = (error as { data?: { data?: { problem?: unknown } } }).data?.data?.problem;
  return DOWNLOAD_PROBLEMS.includes(problem as DownloadProblem)
    ? (problem as DownloadProblem)
    : 'failed';
}

export const downloadActions = {
  setSettings: (body: DownloadSettingsBody) =>
    $fetch<DownloadsAdminView>('/api/admin/downloads', { method: 'PATCH', body }),
  set: (slot: DownloadSlot, body: DownloadSlotBody) =>
    $fetch<DownloadsAdminView>(`/api/admin/downloads/${slot}`, { method: 'PUT', body }),
  clear: (slot: DownloadSlot) =>
    $fetch<DownloadsAdminView>(`/api/admin/downloads/${slot}`, { method: 'DELETE' }),
};
