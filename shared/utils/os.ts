import type { DownloadOs } from '../schemas/downloads.ts';

/**
 * The system a visitor is on, from their user agent, for the download page (docs/downloads.md).
 * Phones and tablets, and anything unknown, count as Windows: the page still shows the other
 * systems under each download.
 */
export function detectOs(userAgent: string | undefined): DownloadOs {
  const agent = (userAgent ?? '').toLowerCase();
  if (/iphone|ipad|android/.test(agent)) return 'windows';
  if (/macintosh|mac os x/.test(agent)) return 'macos';
  if (/linux|x11|cros/.test(agent)) return 'linux';
  return 'windows';
}
