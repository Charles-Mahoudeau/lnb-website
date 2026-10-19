# Team page

`/team` shows the people who run LNB: the featured pole (the bureau) as a band, the other poles as columns, and a "Join the team" button. It's public. Admins manage it from `/admin/team`. The design is in `docs/design.md` (Team page).

## Model

- `team_pole` (`server/db/schema/team.ts`): a name and description in English and French, an icon from `TEAM_ICONS` (`shared/schemas/team.ts`), a position and a `featured` flag. A partial unique index allows one featured pole: featuring one un-features the other. With none featured, every pole is a column. A pole with members can't be deleted (`hasMembers`).
- `team_member`: one row per account (the user ID is the key, deleted with the account), in one pole, with a role and a bio in both languages (a French text left empty falls back to English), a position, `visible` (the admins' switch) and `showSelf` (the member's own switch).
- Name, photo and school come from the account and are never copied. A member's name and photo change when the account's do.
- `team_setting`: one row with `joinUrl`. It must start with `https://`. Without it the button is hidden.

Members are accounts only. Placeholder "ghost" members, for people who never signed in, are planned: `user_id` would become nullable and the row would carry a name and a photo.

## Who shows

A member appears publicly when `visible` and `showSelf` are on and no site ban is in force (an expired ban doesn't count). A banned account keeps its row, so lifting the ban brings it back. Poles without a visible member are left out. The row goes with the account, including the 24-month cleanup.

Members switch themselves off on `/account` ("Show me on the team page"), which only shows for accounts on the team. The admin form tells managers to ask for agreement before adding someone: the page is public.

## Photos

Profile photos are 96 px JPEGs behind `/api/avatars/:key`, which needs a sign-in. `GET /api/team/photos/:key` serves a photo without one, only while its account is a shown member, and answers 404 for any other key. Hiding a member stops it at once, but browsers may keep it for a day.

## Admin

`/admin/team` is for site admins. The join link, then each pole with its members: arrows reorder, a switch hides a member, and the modals add and edit. Accounts are found by name or email, and one that is already on the team doesn't come up. Every change is logged in `admin_audit` (`teamPole.*`, `teamMember.*`, `team.settings`).

## Flags

`team` turns the page, its public API and its links (footer, home) off. `team.join` turns off the button only: the saved link stays. The admin Team section is never gated. See `docs/feature-flags.md`.

## API

All routes are in the API reference (`/api/docs`): `GET /api/team`, `GET /api/team/photos/:key`, `GET` and `PATCH /api/team/me`, and `/api/admin/team/*`.

## Links

The page is linked from the footer ("The site" column) and the home page's LNB card, not from the header.
