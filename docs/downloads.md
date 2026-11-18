# Minecraft downloads

`/minecraft/download` tells a new player what to install to join the Minecraft server, in three numbered steps: a launcher, the LNB instance, then import it and play. Java is not a step: Prism and PrismCracked install the Java they need, so it sits in a collapsed Troubleshooting section under the steps, for the rare launcher that complains. A line under the launcher step says so and opens that section. It is public (no sign-in), like the mod list, and in the Minecraft menu and the footer. The layout is proposition A, "Steps rail", of [the downloads mocks](https://claude.ai/artifact/Gmk3d3VgxzPRE5Kd2GCp9d). The Troubleshooting section is layout C ("Collapsed + hint") of [the Java mocks](https://claude.ai/artifact/6ydDJNjntDyy5hT7j9HZcw).

## Where each download comes from

| Step            | Download                        | Source                                                                                                 |
| --------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 1               | Prism Launcher                  | A link to prismlauncher.org for the visitor's system (`VENDOR_LINKS` in `shared/schemas/downloads.ts`) |
| 1               | PrismCracked (offline accounts) | The Files library, one file per system                                                                 |
| 2               | The LNB instance zip            | The Files library                                                                                      |
| Troubleshooting | Java 21 JRE (Temurin)           | A link to adoptium.net for the visitor's system, on the JRE package                                    |

Java and Prism are links, not files, so they never go stale and nothing of theirs is hosted by us. PrismCracked and the instance zip are library files an admin picks, so the links never break and the versions are the ones tested.

## The system

The page picks the visitor's system from the `User-Agent` (`detectOs`, `shared/utils/os.ts`): macOS, Linux, or Windows for everything else, phones included. The server reads the same header, so the first paint already shows the right buttons. Under every download "Other systems" opens the buttons for the other two systems. A PrismCracked system with no file is left out of that list.

## Package managers

On Linux and macOS, the launcher step and the Java troubleshooting entry add an "Or use your package manager" block (`DownloadPackages`): Homebrew on macOS, and on Linux one chip per distribution (Ubuntu, Debian, Fedora, Arch Linux, NixOS, openSUSE) with the command and a Copy button. The commands are in `PACKAGE_COMMANDS` (`shared/schemas/downloads.ts`). They are text only, never run by the site. Java commands install the JRE where the package manager has one (Homebrew only has the Temurin JDK, and says so). Prism has no package for Ubuntu, Debian, Fedora or openSUSE, so those use Flatpak. The chosen distribution is shared by both blocks. PrismCracked is in no package manager, and says so. The commands are in the body font on purpose: `docs/design.md` allows no monospace face.

## Admin

`/admin/mods/downloads` (Warden admins, in the Mods group) has one row per slot: `instance`, `cracked-windows`, `cracked-macos`, `cracked-linux`. A row picks a file of the library and an optional version label, saves, or empties the slot (the file stays in the library). A slot nobody filled shows "Not available yet" on the page.

- `download_file` (`server/db/schema/downloads.ts`): one row per filled slot, pointing at a `stored_file` with `on delete restrict`. `usageOfFiles` lists it as "Download page", so the library refuses to delete a file a slot uses (`fileInUse`).
- A slot only takes a file of the new library kind `download` (`notDownloadFile` otherwise). The kind accepts `zip`, `exe`, `msi`, `dmg`, `pkg`, `appimage` and `gz`, and only a zip is checked for the zip header. It is separate from `asset` because the launcher's manifest lists every asset, and an installer must never reach a launcher. The upload's "Automatic" kind sends installers to `download`; a zip stays an asset, so pick Download for the instance zip, or change its kind in the file's drawer.
- Every change is written to `admin_audit` (`downloads.update`, with the slot, the file and the version).
- Routes: `GET /api/downloads` (public), `GET /api/admin/downloads`, `PUT` and `DELETE /api/admin/downloads/{slot}`.

The download links are `/api/files/<sha256>/<name>`, so the `files` flag must be on as well. The file size limit of the library (100 MB) applies, which is tight for a Linux AppImage.

## Flag

`downloads` switches the page, its API and its menu and footer links off. The admin section is never gated.

## Not verified

The page and the admin section haven't been looked at in a real browser yet, nor on a phone, nor in light mode. The install commands and the vendor page addresses are written from memory and have to be checked on each distribution. The vendor addresses answered 200 when they were added.
