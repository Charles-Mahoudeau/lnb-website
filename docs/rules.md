# Server rules

The rules of the Minecraft server: a public page at `/minecraft/rules`, an editor in the admin (`/admin/warden/rules`), a read-only route for the Minecraft server, and a way for warnings and bans to name the rules they apply.

## Rules

- A rule has a title and a text in English and French. English is required. French is optional: when it is empty, the English text shows in French too (`ruleText` in `shared/utils/rules.ts`).
- Rules sit in categories (a name in both languages and an icon from `RULE_ICONS`). Order is set with arrows, never by dragging, like the team and partners pages.
- **Numbers are computed.** A category that still has a rule that is not retired is numbered from 1, and its rules are "category.rule" (`2.3`). Move or retire a rule and the numbers follow. A category with no live rule is skipped.
- **A rule is never deleted.** Retiring it (`retired_at`) takes it off the page and out of the numbers. Its anchor and the sanctions that name it still work. Restoring puts it last in its category. A category can only be deleted when it holds no rule at all, retired ones included.
- **Anchors are stable.** Each rule has a `ref`, an identity number that never changes, and its anchor on the page is `r<ref>` (`/minecraft/rules#r7`). Moving, renumbering or changing the category of a rule keeps it.
- There are no penalties in the rules: no "warning, then ban" per rule. The page says moderators decide case by case. Rules carry no severity either.
- The page has no history of versions. It shows a "last updated" date (the latest change to any rule or category), and changes are written to the admin audit log (`rule.*`). There is no per-player "changed since your visit" mark.
- Players don't accept the rules, and nothing gates joining on them. The schema doesn't prevent adding that later.
- Access: the page is public, like the mod list. Editing is for Warden admins and site admins (the moderators who enforce the rules), with no new role.

## The page

`/minecraft/rules` (layout A, "Accordion", chosen from [the rules mocks](https://claude.ai/artifact/FLHwDwMaPD68qmVALgi43Q); see `docs/design.md`). One raised section per category that opens on click, the first one open unless the link points at a rule. "Open all" opens every category. A rule's link button copies its anchor, and a link to `#r7` opens its category, scrolls to the rule and tints it.

With the `rules` flag off, `GET /api/rules` still answers 200 with `enabled: false` and no category, and the page says the rules are being rewritten. The menu and footer links go away with the flag. The admin and the Minecraft server route don't depend on the flag.

## Naming rules in sanctions

Warden's ban and warning forms have an optional "Rules broken" picker (toggle chips by category, up to 10, none retired). The body of the admin and server routes takes `ruleIds`:

- `POST /api/warden/admin/players/:userId/bans`, `POST /api/warden/server/players/:uuid/bans` (`ruleIds`)
- `POST /api/warden/admin/players/:userId/notes` and `POST /api/warden/server/players/:uuid/warnings` (`ruleIds`; a private note has none)

Naming a rule never blocks a sanction: it is optional, and moderators can sanction with none. A retired or unknown ID is a 400 `ruleNotFound`, and nothing is written.

**The sanction keeps a copy.** `warden_ban.rule_citations` and `warden_note.rule_citations` hold, for each named rule, `{ ruleId, ref, number, title: { en, fr } }` as they were that day. Editing, moving or retiring the rule never rewrites a past sanction. The `ban` and warning audit entries record the numbers.

Where the citations show:

- the player's `/minecraft/account`: the active ban and the history of bans and warnings (`rules` on `activeBan` and on history items), as links to the rule on the rules page;
- the admin: a player's timeline, and the appeals list;
- the Minecraft server: `ban.rules` in a login denial, in the `kick` event for a ban, in `GET /api/warden/server/players/:uuid` (`activeBan.rules`), and in the mod's `GET /api/warden/client/me` (`activeBan.rules`). The mod and the Minecraft server decide how to word the in-game message.

## The Minecraft server route

`GET /api/warden/server/rules?lang=en|fr` (default `en`) returns the rules as plain text in one language, with French falling back to English per text, each rule's `id` (for `ruleIds`), `ref`, `number`, `title` and `text`, and `updatedAt`. It needs the Warden server secret and the `warden.serverApi` flag. For a `/rules` command or a screen on a first join.

## Admin

`/admin/warden/rules` (Warden admins and site admins): one raised section per category with its rules as rows (number, title, text cut to one line, a "Retired" badge, a "No French" warning badge, arrows and Edit). A rule opens in a side drawer with English and French tabs, its category, its anchor, how many sanctions name it, and "Retire rule" (outline destructive) or "Restore rule". "Add rule" and "Add category" are neutral soft: there is no solid red button.

With no rule yet, the page offers **"Load the draft rules"**: 14 rules in 5 categories in both languages (`server/lib/rules-draft.ts`) to edit. It only loads into an empty list, and nothing shows to visitors until the page is on.

## Data

`rule_category` and `rule` (`server/db/schema/rules.ts`), plus `rule_citations` on `warden_ban` and `warden_note`. Contracts are in `shared/schemas/rules.ts`, the pure numbering in `shared/utils/rules.ts`, the logic in `server/services/rules.ts`. The routes are under `server/api/rules/`, `server/api/admin/rules/` and `server/api/warden/server/rules.get.ts`, and documented at `/api/docs`.

## Not verified

The page and the admin haven't been checked in a real browser yet, in either color mode, and the mod hasn't been updated to show cited rules in its messages.
