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
- `gamesplanet_setting`: one row (id 1) with the affiliate `ref_code` (default `teknantes`) and the feeds' ETags.

Links are built when shown, with `withRef(url, ref)`. The ref is never stored in a link.

## Covers

The covers of the games the site shows are downloaded by the server (`gamesplanet:sync-deals`), re-encoded as WebP (620 px wide for the teaser, 500 px for the packshot, which drops metadata) and stored on the VPS's disk (Nitro storage `gamesplanet-covers`, `.data/gamesplanet-covers/`), named by the SHA-256 of their bytes. They are never hotlinked.

- Only `https` images on `gamesplanet.com` and `gpstatic.com` hosts are fetched, with no redirects, a 15 second timeout and a 3 MB cap.
- A cover that fails is logged and tried again at the next read. When a game's source image changes, our copy is dropped and downloaded again.
- Covers are kept for the 8 first best sellers France can buy. `gamesplanet:prune-covers` (every night) forgets the covers of other games, then deletes the files nothing uses, after a day.

## Scheduled tasks

| Task                       | When          | Does                                                              |
| -------------------------- | ------------- | ----------------------------------------------------------------- |
| `gamesplanet:sync-deals`   | every 6 hours | Reads the best sellers and the flash sales, then downloads covers |
| `gamesplanet:sync-catalog` | 02:30         | Reads the whole catalog                                           |
| `gamesplanet:prune-covers` | 03:00         | Removes covers nothing uses                                       |

## Flags

`gamesplanet` switches everything off, including the reading of the feeds. Its parts, `gamesplanet.home`, `gamesplanet.events` and `gamesplanet.footer`, switch off one placement. Each task also has a `jobs.*` flag (`gamesplanetCatalog`, `gamesplanetDeals`, `pruneGamesplanetCovers`). See `docs/feature-flags.md`.

## Still to come

The partners band and its public API, the admin section (ref code, pinned games, a "Sync now" button, click counts), the home card, the Gamesplanet link on events, the click route and its anonymous daily counts, and the footer row.
