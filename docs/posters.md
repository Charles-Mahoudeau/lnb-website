# Posters

Events managers and admins make A4 posters for events at `/admin/posters`. A poster follows an event (or stands alone), uses one of six templates, and is exported as a PDF (the browser's print, vector) or a 300 dpi PNG. Posters are kept in a library shared by every events manager, last write wins, as with events.

Original designs (not code to port): the [LNB posters canvas](https://claude.ai/artifact/Uv7NWsmRjuuxvtMisDxHR2). The "Posters" page has the approved templates, their red row and their stress tests. The "Editor" page has the editor mocks: proposition B (preview first, inspector on the right) and the poster grid for the library.

## Templates

| Template  | Key        | Colour elements                       | Notes                                                      |
| --------- | ---------- | ------------------------------------- | ---------------------------------------------------------- |
| Banner    | `banner`   | kicker, date, sticker                 | The art across the top                                     |
| Art title | `artTitle` | kicker, date, sticker, tint (duotone) | The title filled with the art, with an optional treatment  |
| Ticket    | `ticket`   | kicker, date, sticker                 | A white ticket with a perforation and the stub             |
| Labels    | `labels`   | label, date, sticker                  | Each title line on its own label, every other one indented |
| Collage   | `collage`  | label, tape, date, sticker            | Three taped photos, each the main art unless replaced      |
| Badge     | `badge`    | strap, kicker, date, sticker          | A player badge; the footer is the centred line under it    |

Each template is a component in `app/components/posters/templates/`, a fixed 794 × 1123 CSS pixel layout (A4 at 96 dpi) ported from its board, rendered by `Poster.vue`. The shared pieces (header, sticker, QR, `FitTitle`) are next to it. A poster is scaled from the outside with a transform, so the editor preview, the library thumbnails, the print page and the PNG all render the same layout.

- **Colours**: each accent element is violet or red on its own (`content.colors`), with an "all violet / all red" shortcut in the editor. The editor only shows the elements the template has (`TEMPLATE_COLORS` in `app/utils/posters.ts`). The colours are print tokens, the same in both color modes (`docs/design.md`, Posters).
- **Art title treatments**: none, duotone (navy to the tint element's light accent), dark medium or dark strong. Sharp makes the treated file on first use (`GET /api/admin/posters/art`, `eventImageService.treated`) and keeps it in the uploads storage under a name hashed from the art, the treatment and the tint. Changing a treatment's maths means bumping `TREATMENT_VERSION`.
- **Title**: line breaks are kept. `FitTitle` shrinks the title between the template's max and min sizes until its longest line fits the width and all lines fit the height. If it can't fit at the min size (an event's long name with no breaks), it also wraps at spaces. It measures in the final font, after loading it, and fits again when a font arrives late.
- **Sticker**: three short lines (big, small, big). All three empty: no sticker.
- **Schools**: the event's schools, editable. `SCHOOL_LOGOS` in `app/utils/posters.ts` maps a tenant ID to an SVG in `public/posters/schools/`. A school without one gets its name in type. The logos aren't in yet.

## Following an event

The fields that come from the event (title, kicker, date, place, schools, art) follow it live. Editing one in the editor pins it: it goes into `overrides`, the field shows "Pinned" with a "Reset to event" button, and resetting deletes the override. Without an event every field is the poster's own.

- The event picker offers events that aren't over, or ended less than 30 days ago (`GET /api/admin/posters/events`), plus the poster's own event.
- **Deleting an event** writes every linked poster's current values into its `overrides`, in the same transaction (`posterService.freezeForEvent`), so the poster freezes and becomes standalone.
- **A cancelled event** shows a warning in the editor and a badge in the library, and nothing on the poster. **A draft event** is allowed, with a warning that the QR leads to a hidden page.
- The kicker defaults to the event type's name, and the QR label to "Inscriptions par ici" / "Sign up here", in the poster's language.

## Language

Each poster has its own language, French by default. The month, weekday, time ("19h30", "7:30pm") and default labels follow it, not the UI's: `Poster.vue` loads that locale's messages before rendering, and the printed strings live under `posters.print.*`.

## QR code

The QR code is a [short link](short-links.md), made at the first save when the QR is on: named `Poster: <name>`, open to anyone, without recording who clicks. It leads to the event's page (`/events/<id>`) or any `https://` address. Changing the target in the editor updates the link. The editor shows the short URL, its click count and a link to its page in Short links.

- Deleting a poster keeps its link, so printed posters keep working. A duplicated poster reuses it.
- A poster with the QR on and nowhere to send it (no event, no address) is refused with `qrUrlNeeded`.
- If the `shortLinks` flag is off, the editor warns that printed QRs won't redirect. Posters themselves have no flag: they're admin-only, and admin routes are never gated.

## Export

- **PDF**: `/admin/posters/<id>/print` renders the poster alone, with `@page { size: A4; margin: 0 }`, waits for its fonts and images (`posterReady`), then opens the browser's print dialog. Print is disabled while the editor has unsaved changes, since the print page shows the saved poster.
- **PNG**: `modern-screenshot` draws the poster at 2480 × 3507 pixels (A4 at 300 dpi), with width and height passed explicitly so a scaled preview isn't measured. This works on a poster that isn't saved yet.

## Images

Poster art, collage photos and treated art live in the events image storage. The nightly image prune keeps every file a poster uses (`posterKeys` in `server/services/events/images.ts`), including an event's banner that a poster follows.

## Admin

- Sidebar: "Posters" under Events. The event page's menu has "Make a poster", which opens `/admin/posters/new?event=<id>`.
- The library is a grid of live thumbnails (no stored images), with search, filters (upcoming, past, standalone), and Duplicate and Delete in each card's menu.
- The editor: the preview, sized to stay fully in view, and an inspector with Template, Content, Style and QR tabs that scrolls on its own (beside the preview on wide screens, below it on narrow ones). The page itself doesn't scroll.
- Creating, changing, duplicating and deleting write `poster.create`, `.update` and `.delete` to the admin log.

## API

The routes are in the API reference under "Posters: managers". Problem codes: `posterNotFound`, `eventNotFound`, `qrUrlNeeded`.

## Tests

- `test/unit/posters.test.ts`: resolving fields against the event and overrides, the body schema, and the translations.
- `test/server/posters.test.ts` and `test/server/poster-images.test.ts` (database): the service: following an event, the short link (made at the first save, kept on delete, shared by a duplicate), Art title only treatments, freezing on event delete, the event list, pruning, and treated art.
- `test/nuxt/posters.test.ts`: `FitTitle` shrinking and wrapping.
- Checked by hand in headless Chromium: every template against its violet, red and stress boards, an English poster, the treatments, print to PDF and PNG export.
