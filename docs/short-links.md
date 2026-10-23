# Short links

Events managers and admins make short links of the form `<site>/go/<shortId>` that send people to another page. A link can count clicks, ask people to sign in, stay inside some schools, and record who clicked. They are managed at `/admin/short-links` (events managers and site admins), and are switched off as a whole by the `shortLinks` flag.

Original mock (not code to port): [short links admin mock](https://claude.ai/artifact/1ovR7Yb7L5igxsFFQ8DNS1), layout A, "Table and drawer".

## Who can open a link

Each link has one of three `access` values:

| Access    | Who gets through                                                                  |
| --------- | --------------------------------------------------------------------------------- |
| `any`     | Everyone, signed in or not. Clicks are counted, nobody is identified.             |
| `signed`  | Anyone signed in. Sign-in is already limited to the three schools.                |
| `schools` | Signed-in students whose Microsoft tenant ID is in the link's list (`tenantIds`). |

The check is `decideAccess` in `shared/utils/short-links.ts`. A signed-out visitor to a locked link is sent to `/short-link?state=signIn`, whose button leads to `/sign-in?redirect=/go/<id>`, so they land on the destination after signing in. A student from another school is sent to `/short-link?state=wrongSchool`. An unknown, turned-off or flag-off link goes to `state=off`. The destination is never in those pages or in `GET /api/short-links/:shortId`.

## The redirect

`GET /go/:shortId` is a server route (`server/routes/go/[shortId].get.ts`), outside `/api`, so it isn't in the API reference (the `/api/short-links/{shortId}` entry describes it). It answers 302 with `Cache-Control: no-store` and `Referrer-Policy: no-referrer`. IDs are lowercase letters, numbers and single dashes, 2 to 40 characters, and unique. An empty ID at creation gets 6 random characters from an alphabet without look-alikes. The ID can't change afterwards, so printed links keep working.

Destinations are `https://` only.

## What is counted and recorded

One `short_link_click` row per followed link, with the time, whether the visitor was signed in, and an `outcome`: `opened`, or `wrongSchool` for a signed-in visitor from the wrong school. A signed-out visit to a locked link is not stored: it only redirects to sign-in.

- **Link previews and crawlers aren't counted**: HEAD requests, no user agent, or a user agent such as Discord, Slack, Teams or a bot (`isPreviewRequest`). They still get the redirect.
- **Who clicked** is stored (`userId` and the school's `tenantId`) only when the link has "Record who clicks" on, the visitor is signed in, the link was followed, and the `shortLinks.tracking` flag is on. Recording needs sign-in, so an `any` link can't turn it on (a database check, and a refusal in the body schema). A refused visitor from the wrong school is never identified.
- The sign-in page says "LNB records that you opened it" for links that record.
- No IP address or user agent is stored. An open link only knows how many times it was followed: there is no unique count for it.
- Deleting an account keeps its clicks and forgets who they were (`user_id` is set to null). Deleting a link deletes its clicks. There is no other pruning for now.
- Turning "Record who clicks" off, or the flag, stops new recording. People already recorded stay.

## Admin

- The list is a table: the short URL and name, who can open it, clicks, people (only for links that record), created, a switch, and copy. Rows open the link's page; "New link" and "Edit" open the form in a drawer.
- The form: destination, short ID with "Generate", a name only managers see, who can open it (three cards, then the school buttons for `schools`), "Record who clicks" (disabled without sign-in or with the flag off), "Link is on", and a plain-words summary of who can open it.
- The link page: the short URL, two badges (who can open it, records or counts only), four counts (clicks, people, clicks without sign-in, refused for the wrong school), clicks per day for 30 Paris days (stacked: signed in and not), and, for links that record: people by school, and the 50 people who clicked last. "Export CSV" lists date, name, email and school for every recorded click.
- The export hands out names and emails, so it writes `shortLink.export` to the admin log. Creating, changing and deleting write `shortLink.create`, `.update` and `.delete`, shown on the Overview.
- Cells starting with `=`, `+`, `-` or `@` get a quote in the CSV, so a spreadsheet can't run a name.

## Flags

`shortLinks` switches `/go/` off (visitors see the "doesn't work any more" page, managers still manage links). `shortLinks.tracking` only stops recording who clicked.

## API

The routes are in the API reference under "Short links" and "Short links: managers". Problem codes: `shortLinkNotFound`, `shortIdTaken`.

## Tests

`test/unit/short-links.test.ts` covers the access rules, preview detection, ID rules, the body schemas and the translations. The service itself needs a database and isn't covered by tests: it was checked by hand against local PostgreSQL (open link counts, an Epitech link followed by Epitech and refused for ISEG, previews not counted, CSV).
