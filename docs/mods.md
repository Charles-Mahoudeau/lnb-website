# Mod list

The mod list at `/minecraft/mod-list` lets members vote on the mods of the LNB Minecraft server and suggest new ones. It has two tabs: the official list, which the Minecraft team picks, and the suggestions, which members add. Admins manage both from the Mods section of the admin area (`/admin/mods`).

## Rules

- Anyone can see the page and the scores. Voting and suggesting need an account. A Warden ban in force blocks both, and so does closing the list in the settings.
- A vote is +1 or −1, one per account and mod, and the score is their sum. Clicking your current vote clears it. Both tabs are votable. Nobody can vote on their own suggestion, even after it's promoted.
- A mod appears once across both tabs, matched by its source and project ID. Mods added by hand have no project ID, so they aren't matched.
- A mod must run on the server's Minecraft version and loader, from the settings, when it's added. Changing the settings doesn't check the mods already in the list again. A Fabric mod counts as running on Quilt; a Forge mod doesn't count as running on NeoForge.
- A suggestion needs a reason of 10 to 500 characters. The reason and the proposer's first name and initial are public. The proposer can edit the reason (the votes stay) or withdraw the suggestion, which deletes it with its votes.
- Each account can have `maxSuggestions` suggestions in the list (5 by default). Removed ones count; withdrawn and promoted ones free a slot.
- Moderation happens after a suggestion appears. Admins can:
  - **Add it to the official list**: it keeps its votes and its proposer.
  - **Edit** any mod, in either tab: change the reason, even to nothing (people can't do that), and change who gets the credit, or credit nobody. The new proposer's own vote on it is cleared, since nobody votes on their own suggestion.
  - **Convert** any mod to a Modrinth or CurseForge mod, or to a manual one, in place. The votes, proposer, reason, tab and status stay. The details are replaced, and a Modrinth or CurseForge mod is checked like a new one (it must exist, fit the server and not be in the list already). Converting to a manual mod keeps the current icon unless an icon URL is given.
  - **Remove it** with a reason. It's hidden from the list, but stays in the table: the mod can't be suggested again, and it still counts toward the proposer's limit. The proposer sees the reason under their suggestions until they dismiss it. Admins can restore it.
- Removing an official mod deletes it with its votes. It can then be added or suggested again.
- A deleted account's votes go with it. Its suggestions stay, credited to a former member.
- Every admin change is written to `warden_audit` (`mod.add`, `mod.edit`, `mod.convert`, `mod.promote`, `mod.remove`, `mod.restore`, `mod.delete`, `modSettings.update`) and shows in Warden's activity log. These actions aren't sent to the Minecraft server.

## Sources

Search goes through the site (`GET /api/minecraft/mods/search`), so visitors never contact Modrinth or CurseForge, and the CurseForge key never leaves the server.

- **Modrinth** comes first. Compatibility comes from each search hit's game versions and categories, which include the loaders.
- **CurseForge** fills in mods that aren't on Modrinth, matched by name or slug. Its search is filtered to the server's version and loader. It's only used when `CURSEFORGE_API_KEY` is set (from [console.curseforge.com](https://console.curseforge.com)). Without it, search is Modrinth only.
- Searches are cached for an hour per query, version and loader, and limited to 20 a minute per account, in memory.
- When a mod is added, its project is fetched again from the source, so the name, summary, page and compatibility can't be forged by the client. They're stored once and never refreshed.
- Admins can also add a mod by hand, for mods on neither source: a name, a summary, an https page URL, and an optional icon URL.

Icons are downloaded once, when the mod is added (PNG, JPEG, WebP or GIF, up to 512 KB), and kept in the `mod-icons` Nitro storage (`.data/mod-icons`). The page shows them from `/api/minecraft/mods/:id/icon`, cached for a year. A mod without an icon shows its initials on a plain tile. Search results' icons go through the site as well, from `/api/minecraft/mods/catalog-icon`, which only fetches from `cdn.modrinth.com` and `media.forgecdn.net` and caches each icon for a day, so nothing is hotlinked and the route can't fetch anything else.

## Environment

| Variable              | Required | Use                                                            |
| --------------------- | -------- | -------------------------------------------------------------- |
| `CURSEFORGE_API_KEY`  | No       | Turns on CurseForge in search                                  |
| `MODRINTH_USER_AGENT` | No       | How the site identifies itself to Modrinth, with a contact URL |

## Data

- `mod_list_settings`: one row with `open`, `max_suggestions`, `game_version` and `loader`.
- `mod`: both tabs (`list` is `official` or `suggestion`), with `status` `visible` or `removed`, the source, the stored details, the proposer and reason, and the moderation fields.
- `mod_vote`: one row per account and mod, with `value` −1 or 1. Clearing a vote deletes the row.

The routes are listed in the API reference at `/api/docs`, under Minecraft.
