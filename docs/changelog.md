# Changelog

Posts about what changed on the Minecraft server, written by admins in one language and shown on the site and, later, in game. Status: all four slices built (tables, service, Markdown rendering, `changelog` flag, publish job, audit actions; the admin with DeepL translation; the public pages, the feed and the site's API; the mod's API and seen state). The in-game display is left to a discussion with the mod developer; the API below is what the site commits to.

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

## Images

- **Upload:** in the editor's Write mode, an "Add an image" button above the body, or a file dropped or pasted into the text. The image goes in as `![file name](/api/media/<key>)` at the cursor, with the alt text selected to be replaced. `POST /api/admin/changelog/images` (Warden admins and admins, multipart `file`, answers `{ key, url, width, height }`), heavy-write rate limit like other uploads.
- **Where they live:** the `event-images` storage, under keys `changelog-<sha256>.webp` (a hyphen, not a slash, so the key fits `/api/media/<key>`, which serves them with the event images). Checked by their bytes (PNG, JPEG, WebP or GIF; anything else is `imageUnreadable`), at most 5 MB (`imageTooLarge`), re-encoded as WebP without metadata, at most 1600 pixels wide. An animated GIF keeps its first frame, as for events.
- **Rendering:** `renderChangelog` keeps only `/api/media/<key>` images, with `loading="lazy"` and their alt text; any other image becomes its alt text. `changelog-prose` makes them responsive and rounded. The Atom feed makes their paths absolute.
- **Not audited:** an upload has no audit entry. Editing the post that uses it is audited.
- **Orphans:** images no post uses any more are not cleaned up yet. The nightly event-image prune skips the `changelog-` prefix, since posts are Markdown text and aren't scanned for keys.
- **In game:** the game shows no images: the mod gets the Markdown source and should drop image syntax, keeping the alt text.

## Public site

- `/minecraft/changelog`: the newest post as a raised band without an image (version badge, date, title, whole summary, one button), older posts as dated rows with the version as a badge. A cover image appears on the band only when the post has one. A "Load more" button, no page numbers.
- `/minecraft/changelog/:slug`: the post at reading width with a side column (language switch, recent posts, the `/changelog` hint), Older and Newer links under the text. The side column drops below the text on phones.
- `/minecraft/changelog.atom`: Atom feed of the last 20 posts. Posts are in the sitemap.
- The language follows the browser or the account (never in the URL), with a switch in the side column when both exist.

## Admin

- List: rows with title, version tag, status pill, date and a language badge (Translated, Not reviewed). "New post" is the one solid button.
- Editor: a publishing band on top (status, publish date, version tag, summary), then one raised section with language tabs and the "Translate" button, two selectable mode cards (Write, On the site) and the fields. The in-game preview is not part of this first version.

## API

Two sets of routes, so the mod's can be added beside the site's.

**For the site** (built, `/api/changelog/posts*`): public, no sign-in, off with a 503 `disabled` while the `changelog` flag is off. They fall under the general `api` rate limit.

- `GET /api/changelog/posts?lang=fr|en&limit=10&before=<cursor>`: published posts, newest first, without their body: `slug`, `title`, `summary`, `versionTag`, `publishedAt`, `lang` (the language actually returned), `languages` (what the post has), `coverUrl`, and `next` (the cursor of the following page, or null). `lang` defaults to French, then the source language.
- `GET /api/changelog/posts/:slug?lang=`: the same for one post, with `html` (from `renderChangelog`) and `older` and `newer` (`{ slug, title }` or null). 404 for an unknown or unpublished post.

**For the mod** (built, `/api/changelog/server/*`): `Authorization: Bearer <WARDEN_SERVER_SECRET>`, as for Warden and the economy. A wrong or missing secret is a 401; while the `changelog` flag is off, a 503 `disabled`; a bad UUID or query a 400 `invalid`; an unknown or unpublished post a 404 `notFound`. `lang` is `fr` or `en`, French by default, the source language when the post has no text in it; the answer's `lang` is the language actually returned. All have `openapi.ts` entries.

Seen state is one row per Minecraft UUID and post, for any UUID, whether or not a site account has linked it, so an unlinked player isn't offered the same post at every join. It is data about a player, so it follows the account rules: deleted when the site account that linked the UUID is deleted (by hand or by `users:delete-inactive`, through `changelogService.forgetUsers`), never shown to other people. Unlinking an account keeps it, like playtime.

### `GET /api/changelog/server/posts?lang=fr&limit=10&before=<cursor>`

Published posts, newest first, without their body. `limit` is 1 to 50 (10 by default). `next` is the cursor to pass as `before` for the following page, or null.

```json
{
  "posts": [
    {
      "id": "0b1f6a52-8a8f-4a1e-9d52-0c3a7f4d9e11",
      "slug": "saison-4-2",
      "title": "Saison 4.2",
      "summary": "Nouveaux quartiers et une économie rééquilibrée.",
      "versionTag": "Saison 4.2",
      "publishedAt": "2027-01-12T18:00:00.000Z",
      "lang": "fr",
      "url": "https://lnb.bde-teknantes.fr/minecraft/changelog/saison-4-2"
    }
  ],
  "next": null
}
```

### `GET /api/changelog/server/posts/:id?lang=en`

The same fields plus `body`, the Markdown source in the language returned, and `blocks`, the same text already split (see "Blocks" below).

```json
{
  "id": "0b1f6a52-8a8f-4a1e-9d52-0c3a7f4d9e11",
  "slug": "saison-4-2",
  "title": "Season 4.2",
  "summary": "New districts and a rebalanced economy.",
  "versionTag": "Season 4.2",
  "publishedAt": "2027-01-12T18:00:00.000Z",
  "lang": "en",
  "url": "https://lnb.bde-teknantes.fr/minecraft/changelog/saison-4-2",
  "body": "## New districts\n\n- The market moved to the spawn.\n",
  "blocks": [
    { "type": "heading", "level": 2, "content": [{ "text": "New districts" }] },
    {
      "type": "list",
      "ordered": false,
      "items": [{ "depth": 0, "content": [{ "text": "The market moved to the spawn." }] }]
    }
  ]
}
```

### Blocks

`blocks` is on `posts/:id`, `unseen` and the public detail, so the mod needs no Markdown parser. `body` stays. Block `type`s: `heading` (`level` 1-6, `content`), `paragraph` (`content`), `quote` (`content`, one block per quoted paragraph), `list` (`ordered`, `items` of `{ depth, content }`, nested items flattened with a deeper `depth`), `code` (`text`), `table` (`header` and `rows`, each cell a `content` array) and `rule`. `content` is a list of inlines: `{ text, bold?, italic?, code?, link? }`. A line break is `"\n"` in `text`; an image is its alt text; links are absolute http(s) or mailto. Built by `changelogBlocks` (`server/services/changelog-blocks.ts`) from the same tokens as the site's HTML.

### Public routes for the title screen

`GET /api/changelog/public/posts` and `GET /api/changelog/public/posts/:id`: the same answers as the server's routes (list without body; detail with `body` and `blocks`), with no secret and no seen tracking, so the title screen can't show a "new" dot. Published only, 503 `disabled` while the flag is off, 404 `notFound`. A per-IP limit (`changelog-public`, 120 a minute, on top of the general one) and `Cache-Control: public, max-age=60` on successful answers.

### `GET /api/changelog/server/unseen?player=<uuid>&lang=fr`

The latest published post under 14 days old that the player has not seen, in the shape above with `body`, or `null`.

```json
{ "post": null }
```

### `POST /api/changelog/server/posts/:id/seen`

```json
{ "player": "5c2a7a3e-0000-4000-8000-00000000c10a" }
```

Answers 204 with no body, again and again for the same player and post.

The guide for the mod developer, with the flow, examples and error handling, is [changelog-mod.md](changelog-mod.md).

## Open for the mod discussion

- How the game shows a post (chat line and book, a toast and a screen, or something else).

Answered: the server calls `unseen` on join and the mod passes `lang`; the site sends pre-rendered blocks; "mark all as seen" and a per-player missed list aren't needed for the first version.

## Slices

1. Data and service (built; `server/services/changelog.ts`, `server/db/schema/changelog.ts`, `renderChangelog` in `server/services/events/markdown.ts`, task `changelog:publish-scheduled` behind `jobs.changelogPublish`; the cover is a key in the `event-images` storage): schema, Markdown rendering with tables, publish job, flag, audit events, tests.
2. Admin (built): list and editor, DeepL translation. Routes under `server/api/admin/changelog/` for Warden admins and admins, Markdown preview from the public renderer (`POST /api/admin/changelog/preview`), pages `/admin/minecraft/changelog`, `/new` and `/:id`, Ctrl K entries. Scheduling is audited as `minecraft.changelog.schedule`. The admin routes don't check the `changelog` flag (it hides the public side only, like other admin sections). Images in the body can be uploaded (see Images). **The cover picker is not built**: the event image picker is behind the events-manager role, so Warden admins can't use it; the service takes a `coverKey` but no UI or schema sets it yet. The Translate button needs `DEEPL_API_KEY` (a free key ends in `:fx` and uses `api-free.deepl.com`, others `api.deepl.com`); without it the button is disabled with a note. DeepL isn't checked against the real API yet: code, links and URLs are swapped for `<x id="n"/>` tags and sent with `tag_handling: xml` and `ignore_tags: x`.
3. Public pages, feed, sitemap, i18n strings, `docs/design.md` section, `/styleguide` entries (built). With the flag off the pages, the feed and the routes answer 503 like other flagged features, and the sitemap leaves the posts out. The feed is `/minecraft/changelog.atom` (`?lang=`, French by default, the source language when a post has no French); the list page links it in its head. Browser checked in dark mode only.
4. The mod's API (`/api/changelog/server/*`) and seen state (built): the routes, OpenAPI entries, tests. Seen rows have no foreign key (migration `changelog-seen-uuid`) and are deleted with the account.
