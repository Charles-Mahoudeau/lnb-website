# Changelog: guide for the mod

For the Minecraft mod developer. It explains what the changelog is, how the server and the site talk about it, and how to show it in game. The feature itself (admin, public site, decisions) is in `docs/changelog.md`; the full request and response schemas are in the API reference at `/api/docs` (tag "Changelog: Minecraft server").

## What it is

Admins write short posts about what changed on the server ("Saison 4.2: new districts"). Each post has:

- a title, an optional one-line **summary**, and a **body** in Markdown;
- an optional **version tag** (a short label such as "Saison 4.2");
- a publication date;
- a text in **French or English**, or both. A post is written in one language and may have a machine translation (DeepL) that an editor checked or not. The API only ever returns published text, in one language per call.

Players read posts on the website. The mod's job is to tell players when something new was published, and to let them read it in game.

## How the pieces fit

```
admin writes a post  ->  site stores it  ->  mod asks "what is new for this player?"
                                          ->  mod shows it  ->  mod says "seen"
```

The site keeps who has seen what, one row per Minecraft UUID and post. The mod keeps nothing: it can ask on every join and the site answers the same way until the player has seen the post. This holds for any UUID, including players who never linked a site account.

## Authentication

Every request carries the Minecraft server's secret, the same one used for Warden and the economy:

```
Authorization: Bearer <WARDEN_SERVER_SECRET>
```

Base URL: the site's address (for example `https://lnb.bde-teknantes.fr`). The routes are all under `/api/changelog/server/`. Send `content-type: application/json` on the POST.

Never put the secret in a client-side mod. These calls must be made by the server (or by a server-side part of the mod), never by players' clients.

## The flow to implement

1. **On join**, call `GET /api/changelog/server/unseen?player=<uuid>&lang=<fr|en>`.
2. If `post` is `null`, do nothing.
3. Otherwise show the notice to the player (see "What to show"). Use `title`, `summary` and `versionTag` for the notice, and `body` when the player opens the post.
4. When the notice has actually been shown, call `POST /api/changelog/server/posts/<id>/seen` with the player's UUID. The call is idempotent, so calling it twice is harmless.
5. For a `/changelog` command (or similar), call `GET /api/changelog/server/posts` to list recent posts, and `GET /api/changelog/server/posts/<id>` for the text of one.

`unseen` only returns a post that is **published less than 14 days ago** and **not yet seen by that player**, and only the **latest** such post. A player coming back after a month gets nothing; a player who missed two posts gets the newest one. The older ones stay reachable through the list.

Mark a post as seen after showing it, not before. If the player disconnects between the request and the display, they will be offered the post again at the next join, which is what you want.

## Endpoints

All answers are JSON. Times are ISO 8601 in UTC. `id` is a UUID, `url` is the absolute address of the post on the website.

### `GET /api/changelog/server/unseen`

Query: `player` (the Minecraft UUID, with dashes, required), `lang` (`fr` or `en`, French by default).

```bash
curl -H "Authorization: Bearer $SECRET" \
  "$SITE/api/changelog/server/unseen?player=5c2a7a3e-0000-4000-8000-00000000c10a&lang=fr"
```

```json
{
  "post": {
    "id": "0b1f6a52-8a8f-4a1e-9d52-0c3a7f4d9e11",
    "slug": "saison-4-2",
    "title": "Saison 4.2",
    "summary": "Nouveaux quartiers et une économie rééquilibrée.",
    "versionTag": "Saison 4.2",
    "publishedAt": "2027-01-12T18:00:00.000Z",
    "lang": "fr",
    "url": "https://lnb.bde-teknantes.fr/minecraft/changelog/saison-4-2",
    "body": "## Nouveaux quartiers\n\n- Le marché a déménagé au spawn.\n"
  }
}
```

When nothing is to show: `{ "post": null }`. `summary` and `versionTag` can be `null`.

### `POST /api/changelog/server/posts/:id/seen`

```bash
curl -X POST -H "Authorization: Bearer $SECRET" -H "content-type: application/json" \
  -d '{"player":"5c2a7a3e-0000-4000-8000-00000000c10a"}' \
  "$SITE/api/changelog/server/posts/0b1f6a52-8a8f-4a1e-9d52-0c3a7f4d9e11/seen"
```

Answers `204` with no body. Calling it again for the same player and post is fine. `404` if the post doesn't exist or isn't published.

### `GET /api/changelog/server/posts`

Query: `lang` (`fr` or `en`), `limit` (1 to 50, 10 by default), `before` (the cursor from `next`, to get the following page).

Published posts, newest first, **without their body**:

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

`next` is a cursor string when there are more posts, or `null` at the end. Pass it back as `before` unchanged.

### `GET /api/changelog/server/posts/:id`

Query: `lang`. The same fields as above plus `body`. `404` if the post doesn't exist or isn't published.

## Language

Pass `lang=fr` or `lang=en`, matching the player's language in the game. French is the default. If a post has no text in the requested language, the site answers with the other one: **always read the `lang` field of the answer**, not the one you asked for, if you need to know (for example to show "(French only)").

Titles, summaries and bodies are all in that one language. The mod does not need to translate anything.

## Reading the body

The body is **Markdown** written by admins, kept as source: the site sends no pre-rendered text. What can appear:

| Markdown                             | Suggested rendering in game                                    |
| ------------------------------------ | -------------------------------------------------------------- |
| `## Heading`, `### Heading`          | A bold or coloured line, with a blank line before it           |
| Paragraphs                           | Plain text lines                                               |
| `**bold**`, `*italic*`, `` `code` `` | Minecraft bold, italic, and a grey or distinct colour for code |
| `- item`, `1. item`                  | A line starting with a bullet or the number                    |
| `> quote`                            | An indented or grey line                                       |
| `[text](url)`                        | Clickable text if the screen supports it, otherwise the text   |
| Tables                               | One line per row, cells separated by a space or a bar          |
| Fenced code blocks                   | Plain lines in a code colour                                   |
| `![alt](/api/media/…)`               | **Drop the image, keep the alt text**                          |

Notes:

- There is no raw HTML in bodies, so you never need to parse any.
- Image addresses are relative (`/api/media/<key>`). The game can't show images, so show the alt text (or nothing) and, if useful, a link to `url` ("See the pictures on the website").
- A link can be relative (`/minecraft/rules`). Resolve it against the site's address, or just point players to `url`.
- Keep the in-game text short: the summary is meant for the notice (a chat line or a toast), and the `url` is the answer for anything long. A reasonable design is: notice = title + summary, a click or a command opens the body, and a link points to `url` for the full post.
- A Markdown parser (CommonMark with the table extension) does the job. Don't write your own.

## Errors

| Status | Meaning                                         | What the mod should do                     |
| ------ | ----------------------------------------------- | ------------------------------------------ |
| 400    | Bad UUID or query (`invalid`)                   | A bug in the mod: log it                   |
| 401    | Missing or wrong secret                         | Check the configuration: log it            |
| 404    | Unknown or unpublished post (`notFound`)        | Ignore, the post may have been unpublished |
| 503    | `disabled`: an admin switched the changelog off | Show nothing, try again at the next join   |
| 5xx    | The site had a problem                          | Show nothing, try again at the next join   |

**The changelog must never get in the way of joining the server.** Make the call asynchronously with a short timeout (a few seconds), and if it fails for any reason, show nothing and move on. Don't retry in a loop, and don't mark a post as seen when it wasn't shown.

## Good to know

- **Unpublished or edited posts.** An admin can unpublish a post, and it then disappears from every call. Editing a published post doesn't notify players again: `unseen` won't offer it a second time to someone who already saw it.
- **Several posts in one day.** The player gets the latest one in the notice. Older ones are in the list.
- **Cost.** `unseen` is a single small query. Calling it on every join is fine; you don't need to cache the answer. Cache the list for a minute or so if the `/changelog` command is busy.
- **Privacy.** The site stores a Minecraft UUID and the time a post was seen, nothing else. The rows are deleted when the player's site account is deleted.
- **Testing.** There is no "unsee" call. To see the notice again, use a fresh player UUID. A post needs to be published (by an admin, in the admin at `/admin/minecraft/changelog`) and less than 14 days old to be offered.

## Open questions for the mod developer

These are not decided yet. Tell the site team what you need:

1. **How to show the notice and the post** (a chat line with a click, a toast, a book, a screen, or something else). The site can add a pre-rendered block list to the answers (headings, paragraphs, list items, links with their styles) if parsing Markdown in the mod is a burden.
2. **Where the `unseen` call is made**: by the Minecraft server on join, or by the mod. Either works with the same routes.
3. **Players whose language isn't known to the server.** Today the call defaults to French. If the mod can read the client's language, pass it as `lang`.
4. Whether a **"mark all as seen"** call or a **"see the posts I missed"** list per player is wanted. Neither exists today.
