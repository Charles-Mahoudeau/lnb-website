import { FILE_EXTENSIONS } from '#shared/schemas/files';
import type { FileKind } from '#shared/schemas/files';

// Helpers for the Files library page. See docs/files.md.

/** What the file picker offers: every extension any kind accepts. */
export const FILE_ACCEPT = [...new Set(Object.values(FILE_EXTENSIONS).flat())]
  .map((extension) => `.${extension}`)
  .join(',');

/** A jar is a mod unless the admin says otherwise, and anything else is an asset. */
export function defaultFileKind(name: string): FileKind {
  return name.toLowerCase().endsWith('.jar') ? 'mod' : 'asset';
}

/** "7.9 MB" in English, "7,9 Mo" in French. */
export function formatBytes(bytes: number, locale: string): string {
  const [unit, divisor] =
    bytes < 1024
      ? (['byte', 1] as const)
      : bytes < 1024 * 1024
        ? (['kilobyte', 1024] as const)
        : (['megabyte', 1024 * 1024] as const);
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit,
    unitDisplay: unit === 'byte' ? 'narrow' : 'short',
    maximumFractionDigits: 1,
  }).format(bytes / divisor);
}
