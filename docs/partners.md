# Partners page

`/partners` shows the companies and studios that help LNB: sponsors, game partners and prize partners. It's public. Admins manage it from `/admin/partners`. The design is in `docs/design.md` (Partners page).

## Model

- `partner` (`server/db/schema/partners.ts`): a kind, a name, a description in English and French, an optional link, a logo and a position. `visible` is the admins' switch.
- The kind is one of `PARTNER_KINDS` (`shared/schemas/partners.ts`), in the page's order: `sponsor` (money, equipment or food), `game` (studios and publishers who give game keys for prizes and giveaways) and `prize` (brands that give gifts for winners). The kinds are fixed in the code, each with an icon. A kind with no visible partner is left out of the page.
- The description is required in English. A French text left empty falls back to English. The link is optional and must start with `https://`.
- `partner_setting`: one row with `contactUrl`, an `https://` link or a `mailto:` address. Without it the "Want to support LNB?" band is hidden.

Positions are per kind. A new partner goes last in its kind, and another kind puts it last there.

## Logos

Admins upload one logo per partner (`POST /api/admin/partners/logo`, multipart with a `file` field). It is stored on the VPS's disk (Nitro storage `partner-logos`, `.data/partner-logos/`), never hotlinked, and served without sign-in from `GET /api/partners/logos/:key`.

- PNG and WebP, up to 1 MB: decoded and re-encoded as WebP, 800 px wide at most, which drops metadata and keeps transparency.
- SVG, up to 1 MB: kept as it is, but refused when it holds a script, a `foreignObject`, an event handler or a `javascript:` link (`isUnsafeSvg`). It is served with `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox` and `nosniff`, and shown through `<img>`, where scripts never run.
- Files are named by the SHA-256 of their bytes, so a logo never changes once stored and is cached for a year.
- The logo is uploaded as soon as it's picked in the form and attached when the form is saved. `partners:prune-logos` removes logos no partner uses, a day after they were stored, every night (`jobs.prunePartnerLogos`).
- The logo route isn't behind the `partners` flag, so the admin form can preview a logo while the page is off.
- The page shows every logo on a light plate (`bg-plate`) in both color modes, so one upload works everywhere.

## Admin

`/admin/partners` is for site admins, with no separate role. The contact link, then one section per kind: each partner with its logo, name, description, a switch, the arrows (which reorder inside the kind), edit and delete. Delete asks first. Every change is logged in `admin_audit` (`partner.*`, `partners.settings`).

## Flags

`partners` turns the page, its public API and its footer link off. `partners.contact` turns off the contact band only: the saved link stays. The admin section is never gated. See `docs/feature-flags.md`.

## API

All routes are in the API reference (`/api/docs`): `GET /api/partners`, `GET /api/partners/logos/:key` and `/api/admin/partners/*`.

## Links

The page is linked from the footer ("The site" column), not from the header or the home page.
