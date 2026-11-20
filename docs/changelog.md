# Changelog

Posts about what changed on the Minecraft server, written by admins in one language and shown on the site and, later, in game. Status: slice 1 built (tables, service, Markdown rendering, `changelog` flag, publish job, audit actions); the admin, the public pages and the API are not. The in-game display is left to a discussion with the mod developer; the API below is what the site commits to.

Original mock (not code to port): [changelog mocks](https://claude.ai/artifact/Q7FywHY51Wi9TPX5aGbHQv), list B (no image, with an optional cover), post page B with navigation, admin editor B (publishing band on top, Write and On the site modes).

## Decisions

- **Who writes:** Warden admins and admins. No new role. The admin entry "Changelog" sits in the Minecraft group (`/admin/minecraft/changelog`, `/admin/minecraft/changelog/:id`).
- **Flag:** `changelog` hides the public pages, the feed and the API (feature flags rule: a feature that can misbehave gets a flag).
- **Languages:** English and French. A post has a source language and an optional translation. Both are fully editable. A post with one language is shown in that language to everyone, with a "Not translated" note.
- **Translation:** DeepL (free tier), on demand from a "Translate" button, never automatic. The text is sent as Markdown; code spans and URLs are kept as they are. The result is stored as a draft translation marked "not reviewed" until an editor saves it. `DEEPL_API_KEY` in the environment; without it, or over quota, the button is hidden or shows an error and publishing still works. Source text leaves the site only when an editor presses the button.
- **Fields:** title, summary (optional, used for the card and the in-game notice), body (Markdown), version tag (optional, such as "Saison 4.2"), cover image (optional, from the media library), status (draft, scheduled, published), publish date.
- **Markdown:** full Markdown through `markdown-it`: headings, lists, tables, code, quotes, links. No raw HTML. Images only from our own media library. Rendering is shared with events (`server/services/events/markdown.ts`), extended for tables.
- **Lifecycle:** scheduled posts are published by a periodic job. Editing a published post does not notify anyone again. Deleting is an unpublish; the audit log (`docs/activity-log.md`) records create, edit, translate, publish, unpublish.
- **Not included:** categories, tags, comments, reactions, analytics, push notifications (push is for events only), a "major update" re-notify.

## Public site

- `/minecraft/changelog`: the newest post as a raised band without an image (version badge, date, title, whole summary, one button), older posts as dated rows with the version as a badge. A cover image appears on the band only when the post has one. A "Load more" button, no page numbers.
- `/minecraft/changelog/:slug`: the post at reading width with a side column (language switch, recent posts, the `/changelog` hint), Older and Newer links under the text. The side column drops below the text on phones.
- `/minecraft/changelog.atom`: Atom feed of the last 20 posts. Posts are in the sitemap.
- The language follows the browser or the account (never in the URL), with a switch in the side column when both exist.

## Admin

- List: rows with title, version tag, status pill, date and a language badge (Translated, Not reviewed). "New post" is the one solid button.
- Editor: a publishing band on top (status, publish date, version tag, summary), then one raised section with language tabs and the "Translate" button, two selectable mode cards (Write, On the site) and the fields. The in-game preview is not part of this first version.

## API

The mod reads with `Authorization: Bearer <WARDEN_SERVER_SECRET>`, as for Warden and the economy. All routes need an `openapi.ts` entry.

- `GET /api/changelog?lang=fr|en&limit=10&before=<cursor>`: published posts, newest first, with `id`, `slug`, `title`, `summary`, `versionTag`, `publishedAt`, `lang` (the language actually returned) and `url`.
- `GET /api/changelog/:id?lang=`: the same, with `body` (Markdown). A pre-rendered block list for the game is a decision for the mod developer's discussion; it would be added here as `blocks`.
- `GET /api/changelog/unseen?player=<uuid>&lang=`: the latest published post under 14 days old that the player has not seen, or `null`.
- `POST /api/changelog/:id/seen` with `{ "player": "<uuid>" }`: idempotent.

Seen state is one row per Minecraft UUID and post. It is data about a player, so it follows the account rules: deleted with a deleted account, never shown to other people.

## Open for the mod discussion

- How the game shows a post (chat line and book, a toast and a screen, or something else), and whether the site sends a pre-rendered block list.
- Whether `unseen` is called on join by the server or by the mod.
- What happens for a player whose language isn't known to the server.

## Slices

1. Data and service (built; `server/services/changelog.ts`, `server/db/schema/changelog.ts`, `renderChangelog` in `server/services/events/markdown.ts`, task `changelog:publish-scheduled` behind `jobs.changelogPublish`; the cover is a key in the `event-images` storage; seen rows reference `minecraft_account`, and `markSeen` ignores a UUID no account has linked): schema, Markdown rendering with tables, publish job, flag, audit events, tests.
2. Admin: list and editor, DeepL translation, cover picker.
3. Public pages, feed, sitemap, i18n strings, `docs/design.md` section, `/styleguide` entries.
4. API and seen state, OpenAPI entries, tests.
