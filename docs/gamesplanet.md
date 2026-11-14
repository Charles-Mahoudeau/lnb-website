# Gamesplanet promotion

Gamesplanet is a game partner with an affiliate programme. People who buy through our link pay the same or less, and LNB gets a small commission that helps fund its events. Every link to Gamesplanet ends in `?ref=teknantes`. The design is in `docs/design.md` (Gamesplanet promotion).

This page describes what is built. The pages that show the deals (the partners band, the home card, the event card, the footer row) and the admin section come in later steps.

## Why not their banners

Gamesplanet's banners (`fr.gpaf.net/b/`) are iframes that run a script from their servers. We can't restyle them, they would load a third-party script for every visitor, and our rule is that images are stored on our side, never hotlinked. So we read their product feeds and build our own cards.

## Feeds

Three public XML feeds on `fr.gamesplanet.com/api/v1/products/`, read by the server only:

| Feed         | What it holds                                                    | Read                          |
| ------------ | ---------------------------------------------------------------- | ----------------------------- |
| `charts.xml` | Their best sellers (about 57), in order                          | Every 6 hours, with the flash |
| `flash.xml`  | Flash sales, each with the time its price ends (about 490)       | Every 6 hours                 |
| `feed.xml`   | The whole catalog (about 8,800 games, 12 MB), with Steam app ids | Every night at 02:30          |

`shared/utils/gamesplanet.ts` reads the XML: one `<product>` at a time, so the 12 MB file is never a tree in memory. A broken product is skipped. Prices become euro cents. A game is "available in France" unless France is in its country blacklist or a whitelist leaves it out.

The French feed is used for everyone: one store, euro prices, one set of covers.

An `ETag` of each feed is kept in `gamesplanet_setting`, and sent back as `If-None-Match`: a feed that didn't change answers 304 and is not read again. A failure never wipes data:

- A catalog under 500 games, or empty charts, are refused as broken answers.
- The charts and the flash feed are independent: one failing doesn't stop the other, and the last good list stays.
- A game no feed has listed for 14 days is removed (at the catalog read).

## Data

- `gamesplanet_game` (`server/db/schema/gamesplanet.ts`): one compact row per game, with no description. Its link is stored without a query string. `chart_rank` is the place in the best sellers, `flash_ends_at` the end of a flash price (a game not in flash has none), and `teaser_key` and `packshot_key` name our copies of its covers.
- `gamesplanet_setting`: one row (id 1) with the affiliate `ref_code` (default `teknantes`), the feeds' ETags and the last time the deals and the catalog were read.
- `gamesplanet_pin`: the games admins put first, in order. At most three, and removed with their game.

Links are built when shown, with `withRef(url, ref)`. The ref is never stored in a link.

## Covers

The covers of the games the site shows are downloaded by the server (`gamesplanet:sync-deals`), re-encoded as WebP (620 px wide for the teaser, 500 px for the packshot, which drops metadata) and stored on the VPS's disk (Nitro storage `gamesplanet-covers`, `.data/gamesplanet-covers/`), named by the SHA-256 of their bytes. They are never hotlinked.

- Only `https` images on `gamesplanet.com` and `gpstatic.com` hosts are fetched, with no redirects, a 15 second timeout and a 3 MB cap.
- A cover that fails is logged and tried again at the next read. When a game's source image changes, our copy is dropped and downloaded again.
- Covers are kept for the pinned games and the 8 first best sellers France can buy. `gamesplanet:prune-covers` (every night) forgets the covers of other games, then deletes the files nothing uses, after a day.

## Scheduled tasks

| Task                       | When          | Does                                                              |
| -------------------------- | ------------- | ----------------------------------------------------------------- |
| `gamesplanet:sync-deals`   | every 6 hours | Reads the best sellers and the flash sales, then downloads covers |
| `gamesplanet:sync-catalog` | 02:30         | Reads the whole catalog                                           |
| `gamesplanet:prune-covers` | 03:00         | Removes covers nothing uses                                       |

## Flags

`gamesplanet` switches everything off, including the reading of the feeds. Its parts, `gamesplanet.home`, `gamesplanet.events` and `gamesplanet.footer`, switch off one placement. Each task also has a `jobs.*` flag (`gamesplanetCatalog`, `gamesplanetDeals`, `pruneGamesplanetCovers`). See `docs/feature-flags.md`.

## Public side and admin

- `GET /api/gamesplanet` (flag `gamesplanet`) returns up to three deals: pinned games first, then the best sellers France can buy, with the ref on every link. The price is shown with a discount only when it is below the regular one, and the end date only for a flash price still running. `GET /api/gamesplanet/covers/:key` serves our copies, cached for a year.
- The partners page (`/partners`) shows the band (`PartnersGamesplanet`) above the kinds while the flag is on and deals exist. Its badge (`GamesplanetBadge`) opens the disclosure bubble.
- `/admin/gamesplanet` (full admins) sets the ref, pins and orders games (found by name in the catalog), previews the best sellers and reads a feed now. Changes are in the audit log.

## Home card and events

- The home card (`HomeGamesplanet`) sits in the side column below the partner event promo, with the three deals one at a time and arrows between them. It needs `gamesplanet` and `gamesplanet.home`.
- An event has an optional `gamesplanet_uid`. Events managers switch on "Gamesplanet offer" in the event form and find the game with `GET /api/admin/events/gamesplanet/search`: by name, or by pasting a Gamesplanet or Steam link. Only the uid is stored, with no foreign key, so a game that leaves the catalog just makes the card disappear.
- The event page (`EventsGamesplanet`, under the registration box) shows the deal from the catalog while the event isn't over or cancelled, and `gamesplanet` and `gamesplanet.events` are on. Covers of games attached to events that aren't over are kept. Duplicating an event keeps its game.

## Clicks and the footer

- Every link to Gamesplanet on the site goes through `/go/gp/<game uid or "site">?from=<partners|home|event|footer>` (`server/routes/go/gp/[uid].get.ts`, not in the API reference). It redirects with a 302 to the game's page, or Gamesplanet's home page for `site`, with the affiliate ref. It only redirects to games in our catalog: anything else goes to `/partners`.
- This is the one piece of analytics the site has, approved for this partnership. `gamesplanet_click` keeps a count per Paris day, placement and game, and nothing else: no account, IP address, user agent or referrer is read. Only `GET` requests with a known `from` are counted. Counts older than 400 days are deleted by `gamesplanet:prune-covers`. The admin page shows the last 30 days by placement and the five most clicked games.
- The footer has a row above its columns (`gamesplanet.footer`) and an affiliate notice in the legal line. The notice stays while `gamesplanet` is on, even with the row off, and says that clicks are counted anonymously. There is no privacy page yet: when one is written, it should say the same.
- The public API's `url` is the direct link with the ref, for integrations. Our own pages use the counted links.
