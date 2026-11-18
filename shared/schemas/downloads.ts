import { z } from 'zod';

// The Minecraft download page (/minecraft/download). Contracts shared by the routes and the
// pages. See docs/downloads.md.

/** The systems the page has a download for. */
export const DOWNLOAD_OSES = ['windows', 'macos', 'linux'] as const;
export const downloadOs = z.enum(DOWNLOAD_OSES);
export type DownloadOs = z.infer<typeof downloadOs>;

/** The places on the page that hold a file of the Files library. */
export const DOWNLOAD_SLOTS = [
  'instance',
  'cracked-windows',
  'cracked-macos',
  'cracked-linux',
] as const;
export const downloadSlot = z.enum(DOWNLOAD_SLOTS);
export type DownloadSlot = z.infer<typeof downloadSlot>;

export const DOWNLOAD_PROBLEMS = ['fileNotFound', 'notDownloadFile'] as const;
export type DownloadProblem = (typeof DOWNLOAD_PROBLEMS)[number];

/** Java 21 and Prism come from their own sites. Only the address of each system's page is kept. */
export const VENDOR_LINKS = {
  java: {
    host: 'adoptium.net',
    windows: 'https://adoptium.net/temurin/releases/?version=21&os=windows&arch=any&package=jre',
    macos: 'https://adoptium.net/temurin/releases/?version=21&os=mac&arch=any&package=jre',
    linux: 'https://adoptium.net/temurin/releases/?version=21&os=linux&arch=any&package=jre',
  },
  prism: {
    host: 'prismlauncher.org',
    windows: 'https://prismlauncher.org/download/windows/',
    macos: 'https://prismlauncher.org/download/macos/',
    linux: 'https://prismlauncher.org/download/linux/',
  },
} as const satisfies Record<string, Record<DownloadOs, string> & { host: string }>;

/** The install commands of each package manager, shown beside the vendor downloads. */
export const PACKAGE_DISTROS = ['ubuntu', 'debian', 'fedora', 'arch', 'nixos', 'suse'] as const;
export type PackageDistro = (typeof PACKAGE_DISTROS)[number];

const FLATPAK = 'flatpak install flathub org.prismlauncher.PrismLauncher';

/** One way to install a tool: the command, and the key of a note shown under it. */
export interface PackageEntry {
  command: string;
  note?: string;
}

/**
 * Commands to install Java 21 (the JRE where there is one) and Prism with the system's package manager. Prism has no package
 * for Ubuntu, Debian, Fedora or openSUSE, so those use Flatpak. A command is shown as text, never
 * run by the site. `note` is a key under `download.packages.notes`.
 */
export const PACKAGE_COMMANDS = {
  java: {
    macos: { command: 'brew install --cask temurin@21', note: 'macosJdk' },
    linux: {
      ubuntu: { command: 'sudo apt install openjdk-21-jre' },
      debian: { command: 'sudo apt install openjdk-21-jre', note: 'debianJava' },
      fedora: { command: 'sudo dnf install java-21-openjdk' },
      arch: { command: 'sudo pacman -S jre21-openjdk' },
      nixos: {
        command: 'programs.java = { enable = true; package = pkgs.temurin-jre-bin-21; };',
        note: 'nixosConfig',
      },
      suse: { command: 'sudo zypper install java-21-openjdk' },
    },
  },
  prism: {
    macos: 'brew install --cask prismlauncher',
    linux: {
      ubuntu: { command: FLATPAK, note: 'flatpakSetup' },
      debian: { command: FLATPAK, note: 'flatpakSetup' },
      fedora: { command: FLATPAK, note: 'flatpakFedora' },
      arch: { command: 'sudo pacman -S prismlauncher' },
      nixos: {
        command: 'environment.systemPackages = [ pkgs.prismlauncher ];',
        note: 'nixosConfig',
      },
      suse: { command: FLATPAK, note: 'flatpakSetup' },
    },
  },
} as const satisfies Record<
  string,
  { macos: string | PackageEntry; linux: Record<PackageDistro, PackageEntry> }
>;

/** PATCH /api/admin/downloads. An empty value or null removes the link. */
export const downloadSettingsBody = z.object({
  crackedReleaseUrl: z
    .string()
    .trim()
    .max(500)
    .refine((value) => value === '' || /^https:\/\/[^\s/]+\.[^\s/]+\S*$/.test(value))
    .nullable()
    .transform((value) => value || null),
});
export type DownloadSettingsBody = z.input<typeof downloadSettingsBody>;

/** PUT /api/admin/downloads/{slot} */
export const downloadSlotParams = z.object({ slot: downloadSlot });
export const downloadSlotBody = z.object({
  fileId: z.uuid().describe('A file of the library whose kind is `download`.'),
  version: z
    .string()
    .trim()
    .max(40)
    .nullable()
    .optional()
    .transform((value) => value || null)
    .describe('A label for people, such as `1.4.0`. Optional.'),
});
export type DownloadSlotBody = z.input<typeof downloadSlotBody>;

/** A library file as the page offers it. */
export const downloadFileView = z.object({
  name: z.string(),
  size: z.number().int().describe('Bytes.'),
  version: z.string().nullable(),
  sha256: z.string().describe('Lowercase hex.'),
  url: z.string().describe('The public download link, a path on this site.'),
});
export type DownloadFileView = z.infer<typeof downloadFileView>;

/** GET /api/downloads. A slot nobody has filled is null. */
export const downloadsPublicView = z.object({
  instance: downloadFileView.nullable(),
  cracked: z.object({
    windows: downloadFileView.nullable(),
    macos: downloadFileView.nullable(),
    linux: downloadFileView.nullable(),
  }),
  crackedReleaseUrl: z.string().nullable().describe('The releases page shown beside PrismCracked.'),
});
export type DownloadsPublicView = z.infer<typeof downloadsPublicView>;

/** GET /api/admin/downloads: every slot, with its file when there is one. */
export const downloadsAdminView = z.object({
  crackedReleaseUrl: z.string().nullable(),
  slots: z.array(
    z.object({
      slot: downloadSlot,
      file: downloadFileView.extend({ id: z.uuid() }).nullable(),
      updatedAt: z.string().nullable().meta({ format: 'date-time' }),
    }),
  ),
});
export type DownloadsAdminView = z.infer<typeof downloadsAdminView>;
