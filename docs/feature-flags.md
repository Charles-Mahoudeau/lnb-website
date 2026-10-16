# Feature flags

Admins switch a feature, or one part of it, off and on from `/admin/flags`, without a deploy. A change is logged in `admin_audit` (`flag.update`) and shows on the Overview.

## How it works

- `shared/flags.ts` lists every flag. It is the source of truth: the database stores only the flags an admin changed (`feature_flag`), so a flag with no row is on.
- A flag with a `parent` is a part of that feature. Turning the parent off turns every part off, whatever the part's own switch says. Turning the parent back on restores each part to its own switch.
- `flagService` (`server/services/flags.ts`) reads the rows through a 10 second in-memory cache. A change clears the cache of the instance that took it, and reaches the others within 10 seconds.
- Gated routes call `await requireFlag(event, 'key')` after their auth guard. It throws a 503 with the problem `disabled`. Admin routes are never gated, so admins can still manage a switched-off feature.
- `GET /api/flags` returns the effective state of every flag. The app's `useFlags()` reads it before each page (`app/middleware/flag.global.ts`), so the header, buttons and pages follow. The client only decides what to show: the server refuses on its own.
- A page sets `definePageMeta({ flag: 'key' })` to show a 503 while its feature is off.

## Flags

| Flag                                                                                   | Off means                                                                                                                                                 |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `signIn`, `signIn.epitech`, `signIn.eartsup`, `signIn.iseg`                            | New sign-ins are refused, for everyone or for one school. Existing sessions stay. Existing admins can always sign in.                                     |
| `modList`, `.voting`, `.suggestions`, `.search`, `.icons`                              | The public mod list, or only that action. The existing `mod_list_settings.open` is a separate setting for the same pages.                                 |
| `warden`, `.linking`, `.appeals`, `.serverApi`                                         | The player-facing Warden pages, or only that part. With `serverApi` off the Minecraft plugin's calls get a 503.                                           |
| `appLinking`                                                                           | `/link` and `POST /api/link/approve`.                                                                                                                     |
| `avatars`, `avatars.microsoftPhoto`                                                    | Saving the Microsoft photo at sign-in. Saved photos stay.                                                                                                 |
| `events`, `.home`, `.registration`, `.imageSearch`, `.bdeSync`                         | The events pages and API, or only the events on the front page, sign-ups, SteamGridDB in the picker, or pushes to the BDE website (they wait as pending). |
| `jobs`, `.deleteInactive`, `.pruneAvatars`, `.closeStaleSessions`, `.pruneEventImages` | The scheduled task skips its run and reports `skipped`.                                                                                                   |

Sign-in can't use `requireFlag`: Better Auth's `validateUserInfo` in `server/lib/auth.ts` reads the flags through `server/lib/flag-gate.ts`, which the Nitro plugin `server/plugins/flags.ts` plugs in. A refused visitor lands on `/sign-in?error=sign_in_disabled`. An admin is recognised by the email of their existing account, so a switched-off sign-in can't lock admins out of this page.

## Adding a flag

1. Add `{ key, parent? }` to `FLAG_DEFINITIONS` in `shared/flags.ts`. A part's key is `parent.name`, and the parent comes first in the list.
2. Add its label and description under `admin.flags.items` in both locale files. The key has dots replaced by underscores (`modList_voting`), see `flagMessageKey`.
3. Gate the server: `await requireFlag(event, 'key')` in each route, or `flagService.isEnabled` in a job.
4. Gate the client: `useFlags().isEnabled('key')` for what to show, or `definePageMeta({ flag: 'key' })` for a page.

No migration is needed. `test/unit/flags.test.ts` checks the list and the translations.
