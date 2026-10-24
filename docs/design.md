# Design

The LNB visual language, "Soft night": a dark, confident showcase for a student association (evenings, tournaments, video games, IRL games and other events). The energy comes from event art and type. In copy, describe what the association runs instead of calling it "gaming", which doesn't cover everything it does and doesn't land well with everyone. The layout stays clean, simple and obvious. It should read as a polished event brand, never as a design experiment.

These rules apply to every page and component. They override any design skill or generic aesthetic advice. If something here doesn't fit a new case, ask before inventing a new style.

The tokens live in `app/assets/css/main.css` and `app/app.config.ts`. Build with them and with Nuxt UI components, and don't restyle components page by page.

The living reference is the style guide at `/styleguide` (`app/pages/styleguide.vue`, dev only): every component below, rendered with the real theme. When you add a reusable component or pattern, add it there too.

Original mocks (not code to port): [style direction](https://claude.ai/artifact/XemXuxrMwzsGBMr9yYUmp6), [design language specimen](https://claude.ai/artifact/XcAANpQ7ykYBp7xhCtC13m), option A. The color additions (richer navy, dusk violet, avatar tints, tinted banner fallback) came from the [color proposals](https://claude.ai/artifact/LyvUm2CfgpoiGAZr929QR4), "Recommended" preset.

## Color

Dark first. Light mode is supported but secondary: design in dark, then check light.

Three custom palettes, wired into Nuxt UI as `neutral: 'night'`, `primary: 'crimson'` and `secondary: 'dusk'`. The night navy leans toward indigo, so every surface carries some color:

| Role                        | Dark                  | Light                 |
| --------------------------- | --------------------- | --------------------- |
| Page background             | night-950 `#0B0E27`   | night-50 `#EFF1FB`    |
| Surface (cards, rows)       | night-900 `#13173A`   | white                 |
| Raised (hover, neutral btn) | night-800 `#1C2150`   | night-200 `#D6DAF0`   |
| Border                      | night-700 `#282F66`   | night-200 `#D6DAF0`   |
| Text                        | night-100 `#E9EBF8`   | night-950 `#0B0E27`   |
| Muted text                  | night-400 `#A0A6D0`   | night-500 `#565C8C`   |
| Action fill (`bg-action`)   | crimson-600 `#B82238` | crimson-700 `#A51F33` |
| Red text, links, focus      | crimson-400 `#F25C70` | crimson-700 `#A51F33` |
| Second accent               | dusk-400 `#A99BFF`    | dusk-700 `#5B49C9`    |

- **Deep crimson only marks actions**: the main button, links, focus rings, errors and destructive actions. Never use red on large surfaces, backgrounds, banners, cards or decoration.
- **Dusk violet is the second accent, and it never marks an action.** It brings color to these places only:
  - the big date numbers in event lists (`text-secondary`, the month stays muted);
  - icons in small tinted tiles: activities, menu items, admin overview items, team poles (the `IconTile` component, `bg-secondary/15 text-secondary`);
  - the scattered activity icons on an event hero or the sign-in banner without banner art (see Imagery);
  - the current page in navigation menus (header and admin sidebar) and the selected tab (Nuxt UI's `secondary` color, set globally in `app.config.ts`).

  Nowhere else: no violet buttons, links, headings, large surfaces or decoration. Status colors and your own vote on a mod stay as they are.

- One solid red button per view or per item: the main action. Secondary actions use `color="neutral"` (`variant="soft"` or `"outline"`), and tertiary ones use `variant="ghost"`.
- Destructive actions use `color="error" variant="outline"`, never solid, so they don't look like the main action.
- Status colors (`success`, `warning`, `error`) are for state only: registered, waitlist, full. They're never decoration, and they don't count as accents.
- No activity or category colors. Video games, IRL games and events are told apart by text, not by color.
- Avatars without a photo get a soft tint picked from a fixed set (`avatarTint` in `app/utils/avatar.ts`) by a hash of the user's ID, so a person keeps the same color everywhere. The set has five hues (violet, blue, teal, gold, orchid) and no red, so it can't read as an action or an error.
- No gradients as decoration. The only gradient allowed is the dark scrim that keeps text readable over a banner image.
- Use semantic classes only: `bg-default`, `bg-elevated`, `bg-accented`, `text-default`, `text-muted`, `text-highlighted`, `border-default`, `text-primary`, `text-secondary`, `bg-action`. Raw palette classes (`bg-red-500`, `text-white`, `bg-night-900`), hex values and arbitrary values (`bg-[#…]`, `p-[13px]`) are blocked by ESLint.

## Type

- **Unbounded** (500, 700) for headings: `h1` to `h3` get it by default. Use the `font-display` class for other display text, such as big date numbers.
- **Figtree** (400 to 700) for everything else: body, controls, labels, `h4` and smaller.
- Scale ratio about 1.25. Page titles 2.5rem, section titles 1.6rem, subsections 1.2rem. Body 1rem.
- Headings are sentence case, never all caps, and they use `text-wrap: balance`. Don't accent single words in a heading with a different color, weight or italic.
- Keep running text under about 70 characters wide.
- Use tabular numbers (`tabular-nums`) wherever digits line up: dates, times, counts.
- **Monocraft** is for Minecraft nametag previews only, through the `nametag` utility (and `nametag-muted` for the second line): white pixel type on a translucent black plate, as in-game, so it looks the same in both color modes. It's a third typeface on purpose, to show players exactly what others see in-game. Don't use it for anything else, and don't use another pixel or monospace face anywhere.

## Shape and density

- `--ui-radius: 0.375rem`. Small parts are 6 px (`rounded-sm`), controls 9 px (`rounded-md`), and cards and dialogs 12 px (`rounded-lg`). Badges are pills.
- Separate surfaces with background steps (page, surface, raised), not borders. Borders go on form fields, outline buttons, dividers and floating layers only.
- Shadows only on floating layers: dialogs, menus, popovers, toasts. Never on cards in the page flow.
- Controls default to size `xl` (40 px tall, 16 px text, so phones don't zoom into inputs) through `app.config.ts`. Use `md` (32 px) in dense lists and tables.
- Spacing on the 4 px Tailwind scale. Lay out siblings with `gap`, not margins.
- A hero that should fill the first screen uses `min-h-hero` (the viewport height minus the header). Use it for the sign-in page and `/link` only, and let other sections size to their content.
- In the header, signed-out visitors get a neutral outline "Sign in" button with the person icon (`size="lg"`), the same icon family as the signed-in avatar. It avoids the log-in icon, which looks like the mirror of log out, and it is a secondary action, so it doesn't compete with the page's main solid red action. Signed-in people get their avatar and first name (the name is hidden on phones), which opens the account menu (`AccountMenu`): the profile (avatar, name, email, school) on the menu background with a divider under it, shortcuts on icon tiles with a description, like the Minecraft menu, and sign out as an outline button.
- The footer (`SiteFooter`) is a surface (`bg-elevated`) with no border: the logo, one line on what the association runs and the school badges, then a column of links per group (the site, Minecraft, the project) and the legal line. A column drops out when every link in it is off through a feature flag. The language and theme pickers stay on `/account`, not in the footer.
- The admin area (`/admin`) uses Nuxt UI's dashboard components instead of the site header: the sidebar is a surface (`bg-elevated`) beside the page, with no border, and the navbar shows where you are (Warden, then Players). The current page in the sidebar is marked with the second accent, like the header and tabs, because it's state, not an action. Every admin page renders an `AdminPage`.
- Don't chop content into grids of identical cards by reflex. Pick the form that fits the content: dated rows for event lists, cards when the image matters, a table for tabular data.

## Imagery

- The home hero is a full-width game banner (SteamGridDB hero art, 1920 × 620) behind the next event, with a dark scrim from the text side so text stays readable. On large screens it is only as tall as the art's ratio (`aspect-banner`, at least 24 rem), so the agenda starts in the first screen and the art is never cropped; on phones it takes the room its text needs under a strip of art. The hero stays dark in light mode too: it's a `dark` scope, so Nuxt UI components and tokens inside it take their dark values (`EventsHero`).
- Without banner art, the hero sits on `bg-banner-fallback` with activity icons scattered over its right half (a strip above the text on phones): different sizes, angles and strengths, one per cell of a loose grid so they never overlap, seeded so the layout never changes (`EventsIconScatter`). This and the corner mark on thumbnails (below) are the only decorative graphics allowed. Without art the hero doesn't fill the first screen: it takes the room its text needs.
- With no event planned, the home hero is an introduction (`HomeIntro`): a headline, one line on what the association runs, a sign-in button (signed out only) and the same fallback and scattered icons. The page then shows an empty state for "Coming up" and the last three events ("Recent events"), then the LNB, Student office and Minecraft cards. The notification prompt (see Notifications) isn't shown here: it only follows a registration.
- Once an event has registrations, the hero shows "Who's going" on its right, with or without art: the first avatars in their tints, a few first names and the spots left, on a raised surface (`EventsAttendees`). Without art, a band of the fallback color keeps the icons off its edges.
- On `/events`, the next event opens its month as a larger card: its art beside a "Next event, in N days" badge, the big date, the places taken and a way in (`EventsNextCard`). Without art it keeps its image column, filled with the corner mark (below), so it matches the card that has art.
- Below the hero, the later events are an agenda grouped by month: one row per event with its banner as a thumbnail (or the fallback with the corner mark), the date and the room (`EventsAgenda`). Every row keeps its thumbnail, at every width, so rows with and without art stay the same shape.
- The sign-in page shows the next event's banner beside the form, with the same scrim, so the page isn't empty. On phones the banner sits above the form.
- Text on a banner uses `text-on-banner` and `text-on-banner-muted`, and the scrim uses `bg-banner` (night-900). These stay the same in light mode.
- Banners are downloaded by the server and stored on our side, never hotlinked. Event images use the `aspect-banner` (1920 / 620) and `aspect-embed` (1200 / 630) tokens; thumbnails use `aspect-video`.
- Events without a banner fall back to `bg-banner-fallback`: a flat night navy tinted with dusk violet, the same in both modes. No scrim on it and no gradient. On the agenda thumbnails and the next-event card it carries the corner mark (`EventsArtFallback`): the event type's icon, large, faint (`text-secondary`, 25% strength), tilted and cropped by the bottom right corner. It's one icon, never a pattern or a grid, and it stays decorative. The other fallback graphic is the scattered icons on the home hero and the sign-in banner.
- The logo is a black fox on a grey moon: `public/logo.svg`. On dark backgrounds use `public/logo-dark.svg`: the same drawing with a night-100 fox on a night-600 moon (night-700 shadow and craters) and night-950 details. When the night palette changes, update these fills too. A pure white fox on the light moon lacked contrast, and pure white glared, so keep these colors. Show them with `dark:hidden` and `hidden dark:block`, as in the header. Don't recolor the logo red. `public/favicon.ico` (16, 32 and 48 px) and the notification icons (`public/notification-icon.png`, `notification-badge.png`) are rendered from `logo.svg`: regenerate them when the logo changes.
- Minecraft skin heads come from `/api/warden/heads/:uuid` (the server fetches and caches them, never hotlinked). Show them with the `pixelated` utility so the 8-pixel faces stay sharp, at 28, 40 or 56 px, with `rounded-sm`.

## Team page

Original mock (not code to port): [team page mocks](https://claude.ai/artifact/PnX6ZUX1qHQimSQajeSXcb), proposal B, "Bureau first". The role under a name stays muted: the second accent isn't for text.

- The featured pole (the bureau) is a raised band (`bg-elevated`, 12 px) with one column per person: a 64 px photo, the name in the display font, the role, a short bio and the school badge. Photos are 96 px, so don't show them larger.
- The other poles are columns on the page background: the pole's `IconTile` and name, one line on what it does, then people as 36 px avatar, name and role. No cards around them.
- Every photo is the account's profile photo, and an account without one gets its tinted initials like everywhere else.
- "Join the team" is a raised band at the end with the one solid red button of the page. It shows only with a link set and its flag on.

## Partners page

Original mock (not code to port): [partners page mocks](https://claude.ai/artifact/7cxvy5vCbmQsW8FL7UzpFT), proposal G, "Kind, E style". The page lists the companies and studios that help LNB, in three fixed kinds: sponsors, game partners (studios and publishers who give game keys) and prize partners (brands that give gifts for winners).

- One section per kind, in a fixed order, and a kind with nothing to show is left out. Each section is two columns: the kind on the left (its `IconTile`, its name as an `h3` and one line on what it means), the partners on the right. On phones the columns stack.
- A partner is a row: its logo on a plate, then its name, its description (always shown) and its link as plain text. Rows are separated by dividers, with no cards around them. The text stays muted, and the link is the only red.
- **Logos sit on a plate** (`bg-plate`, white in light mode and night-100 in dark mode), in both color modes, so one upload works everywhere. The plate is 9 px (`rounded-md`), the logo is contained inside it with some padding and never stretched or cropped. Logos are SVG, PNG or WebP.
- A logo with a link makes the whole plate the link. Nothing else on the row moves on hover.
- The end of the page is a raised band like the team page's: "Want to support LNB?" with the one solid red button, shown only with a contact link set and its flag on.
- Admin: one raised section per kind, a row per partner with its logo on the plate, the name, the description cut to one line, a "Hidden" badge, the up and down arrows, an edit button and a switch. Order is set with arrows, as on the team page, never by dragging.

## Short links

Original mock (not code to port): [short links admin mock](https://claude.ai/artifact/1ovR7Yb7L5igxsFFQ8DNS1), layout A, "Table and drawer".

- Admin list: a table on one raised section (`bg-elevated`), a search field, then rows separated by dividers: the short URL in semibold with its name muted below, who can open it with a globe (anyone) or lock icon in muted text, clicks and people as tabular numbers, a switch and a ghost copy button. A row opens the link's page. "New link" is the one solid red button of the page.
- The form is a side drawer (`USlideover`), never a page, so the table keeps its place. The choice of who can open a link is three cards, selected with the second accent (dusk tint and border, `color="secondary"`), and schools are toggle chips like the push reminders.
- The link page shows its numbers as four count tiles, a stacked bar chart with a faint grid (signed in in the highlight color, not signed in in the dimmed one, one scale, no color beyond text tokens), then school bars and the people who clicked as rows with tinted avatars. The delete button is the outline destructive one.
- The page a visitor sees when a link can't be followed (`/short-link`) is one short standalone moment, so it is centered: an `IconTile`, a title, one line and one button. Sign-in is the solid red one, anything else is outline.

## Posters

Original designs (not code to port): the [LNB posters canvas](https://claude.ai/artifact/Uv7NWsmRjuuxvtMisDxHR2), "Posters" page for the printed posters, "Editor" page for the admin (proposition B and the poster grid). See `docs/posters.md`.

- **Posters are print, not the site.** They keep one light palette in both color modes, so they aren't built from the site's tokens or Tailwind classes. The colours are scoped CSS custom properties on `.poster` (`app/components/posters/Poster.vue`) and inline styles from `POSTER_ACCENT_COLORS` (`app/utils/posters.ts`); the ESLint rule's raw-palette ban doesn't apply to them, so don't move them into `main.css`.
- Print palette: paper `#eff1fb`, ink `#0b0e27`, muted `#565c8c`, rule `#bcc2e2`, cards `#ffffff`. Accents: violet `#5b49c9` and red `#a51f33` for text, labels and straps; the sticker is `#5b49c9` or `#b82238`; collage tape is `rgba(169, 155, 255, 0.6)` or `rgba(242, 92, 112, 0.55)`; duotone maps the ink to `#a99bff` or `#f25c70`.
- Every accent element picks violet or red on its own. Red on a poster is an accent like violet, not the site's "action" crimson: the action rule is for the site's interface.
- Type: Unbounded 500, 700 and 900 for the header, kicker, title, date and sticker; Figtree for the rest. Titles are 900, tight (line height 0.86 to 0.95, letter spacing −0.04em), with their size fitted, never set by hand.
- Editor: the preview comes first, scaled to fit, with a shadow like a sheet held up; the inspector on the right is a raised section (`bg-elevated`) with Content, Style and QR tabs; the template strip with live thumbnails sits on top. Fields that follow the event show a "From event" badge, and pinned ones a "Pinned" badge (primary) with a ghost "Reset to event". Colour rows are violet/red pairs with an "all violet / all red" button group. Save is the page's one solid red button.
- Library: a grid of live poster thumbnails on raised cards, with the name, the date and template muted below, status badges (draft, cancelled, standalone) and a menu for Duplicate and Delete.

## Bulk actions on accounts

Original mock (not code to port): [bulk user actions mock](https://claude.ai/artifact/5q2dgNm9pWCd9eLTHxrb3L), proposal A, "Floating bar".

- The Users table has a checkbox column. The header checkbox ticks the page (indeterminate when only some rows are ticked), and shift-click ticks a range. Ticked rows take a faint second-accent tint (`bg-secondary/10`), because selection is state, not an action.
- Once the whole page is ticked and more accounts match, a line in the second-accent tint on top of the table offers "Select all N matching the filters", and then "Select only this page". Changing a filter clears the selection.
- A bar rises at the bottom of the screen, centered, as soon as one account is ticked (`AdminUsersBulkBar`). It is a floating layer, so it gets the shadow, and the table and its filters never move. It holds the count, Sign out, Ban (outline destructive), Unban, a More menu (Change roles, Delete accounts in the destructive color) and a ghost clear button. Below `sm` the labels drop and only icons stay. No solid red button: nothing in it is the main action.
- Every action asks first (`AdminBulkModal`). The dialog asks the server who the action applies to, says "Applies to N of M selected", and lists who is skipped and why. Ban asks one reason and length for the group, roles asks add or remove and the role, delete asks to type the count. Ban and delete confirm with the outline destructive button, the others with the solid one.
- The result is one toast, such as "Banned 3 accounts" with "2 were left as they are".

## Notifications

Original mock (not code to port): [push notifications mock](https://claude.ai/artifact/B9QVfPJbgPRYARQ1hjmN6A), bottom sheet (phones) and one-card settings. The desktop dialog came after, from the same content.

- **Never ask cold.** Our own prompt comes first and only its "Notify me" button triggers the browser's prompt. It shows right after a successful registration, never on a first visit, on a timer or over the home page. "Not now" silences it on that device for the duration the admin chose (7 days, 30 days or never).
- **The prompt is a bottom sheet on phones and a centered dialog on desktop** (from the `sm` breakpoint), over the event page with a scrim. Both hold the same content: a title, one line (events only, no ads), the three things people get on rows with a bell on an `IconTile`, a solid "Notify me" and a ghost "Not now". The sheet has a grabber and full-width stacked buttons; the dialog has no close button and right-aligned buttons, "Notify me" last. The bell tiles use the second accent. The only solid red is "Notify me".
- **Settings** sit on `/account` as one card: title and one line, the master switch for the device, the four category switches with a description each, the device list with a ghost "Remove", the count received in the last 7 days (display font, tabular numbers), and a line saying admins can see who turned notifications on. States: not asked, on, blocked, iPhone not installed (a hint, no install promo) and unsupported. A blocked or unsupported browser gets a note and a disabled switch.
- **Switches** are on `bg-action` when on: they are controls, so red is allowed.
- **A manager action that sends a notification asks first** in a dialog: the title says what happens, one line gives the exact number of people, a note says how many already received the weekly limit (a warning note, or a check when nobody is over), and a preview shows the notification as people will see it. Cancelling an event uses the outline destructive button, other actions the solid one. Nothing is ever blocked by the limit.
- **Per-event reminders** are toggle chips (selected: dusk tint with a dusk border), 1 hour before pre-selected.
- **Admin Push** reuses the admin patterns: three count tiles, the warning note when someone is over the limit, a by-type breakdown, a subscriber table (admins only) and a settings card: the weekly limit, the silence after "Not now", and the quiet hours (a switch, with a from and an until hour). Events-managers see the counts only.

## Motion

- Motion answers user actions only: opening, expanding, confirming. Use Nuxt UI's built-in transitions.
- No entrance animations on scroll, no hover lifts on cards, no ambient effects.
- Respect `prefers-reduced-motion` (use the `motion-safe:` variant for anything custom).

## Copy

- English and French, both sentence case, plain and friendly. Students talking to students, without slang. Write each string in both languages, in `i18n/locales/`, and keep their meaning the same.
- In French, use the typographic apostrophe (’) and the usual French terms ("BDE", "salle"). Dates and times come from `Intl` with the active locale, in the Europe/Paris time zone, never hand-written.
- Buttons say exactly what happens: "Register", "Join waitlist", "Cancel registration". The resulting toast reuses the verb: "Registered".
- Errors say what went wrong and how to fix it: "Use your school email, for example name@epitech.eu." No apologies, no vague "Something went wrong".
- Empty states tell people what to do next.

## Avoid

These are the usual tells of generated design. Don't use them unless this document is changed to allow them:

- A small all-caps label (eyebrow) above headings, and all-caps labels in general.
- Meta strings joined with middle dots (`Fri · 20:00 · Room 2.04`). Use separate elements, or commas.
- Numbered markers (01, 02, 03) on content that isn't a real sequence.
- Emoji as icons or section markers. Icons come from Lucide (`i-lucide-*`).
- An arrow appended to link or button text ("See details →").
- Monospace fonts for small labels or data.
- Decorative glows, blurred blobs, glassmorphism and gradient washes.
- Neon, glitch or "gamer RGB" effects, and angled or cut corners.
- Everything centered. Content is left-aligned. Center only short, standalone moments such as an empty state, or a page with a single short task such as entering a code on `/link`.
- The same rounded card with the same shadow repeated for every block.
