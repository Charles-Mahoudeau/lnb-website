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
  - icons in small tinted tiles: activities, menu items, admin overview items (the `IconTile` component, `bg-secondary/15 text-secondary`);
  - the scattered activity icons on an event hero without banner art (see Imagery);
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
- A hero that should fill the first screen uses `min-h-hero` (the viewport height minus the header). Use it for the home hero (when the event has banner art), the sign-in page and `/link` only, and let other sections size to their content.
- In the header, signed-out visitors get a soft neutral "Sign in" button with the log-in icon (`size="lg"`), so it stands out from the nav without competing with the page's main action. Signed-in people get their avatar and first name (the name is hidden on phones), which opens the account menu (`AccountMenu`): the profile (avatar, name, email, school) on the menu background with a divider under it, shortcuts on icon tiles with a description, like the Minecraft menu, and sign out as an outline button.
- The admin area (`/admin`) uses Nuxt UI's dashboard components instead of the site header: the sidebar is a surface (`bg-elevated`) beside the page, with no border, and the navbar shows where you are (Warden, then Players). The current page in the sidebar is marked with the second accent, like the header and tabs, because it's state, not an action. Every admin page renders an `AdminPage`.
- Don't chop content into grids of identical cards by reflex. Pick the form that fits the content: dated rows for event lists, cards when the image matters, a table for tabular data.

## Imagery

- The home hero is a full-width game banner (SteamGridDB hero art, 1920 × 620) behind the next event, with a dark scrim from the text side so text stays readable. The hero stays dark in light mode too: it's a `dark` scope, so Nuxt UI components and tokens inside it take their dark values (`EventsHero`).
- Without banner art, the hero sits on `bg-banner-fallback` with activity icons scattered over its right half (a strip above the text on phones): different sizes, angles and strengths, one per cell of a loose grid so they never overlap, seeded so the layout never changes (`EventsIconScatter`). This is the only decorative graphic allowed, and only there. Without art the hero doesn't fill the first screen: it takes the room its text needs. On phones, an agenda row without art drops its empty thumbnail.
- Once an event has registrations, the hero shows "Who's going" on its right, with or without art: the first avatars in their tints, a few first names and the spots left, on a raised surface (`EventsAttendees`). Without art, a band of the fallback color keeps the icons off its edges.
- Below the hero, the later events are an agenda grouped by month: one row per event with its banner as a thumbnail (or the flat fallback), the date and the room (`EventsAgenda`).
- The sign-in page shows the next event's banner beside the form, with the same scrim, so the page isn't empty. On phones the banner sits above the form.
- Text on a banner uses `text-on-banner` and `text-on-banner-muted`, and the scrim uses `bg-banner` (night-900). These stay the same in light mode.
- Banners are downloaded by the server and stored in object storage, never hotlinked.
- Events without a banner fall back to `bg-banner-fallback`: a flat night navy tinted with dusk violet, the same in both modes. No scrim on it, no gradient and no placeholder graphic, except the scattered icons on the home hero.
- The logo is a black fox on a grey moon: `public/logo.svg`. On dark backgrounds use `public/logo-dark.svg`: the same drawing with a night-100 fox on a night-600 moon (night-700 shadow and craters) and night-950 details. When the night palette changes, update these fills too. A pure white fox on the light moon lacked contrast, and pure white glared, so keep these colors. Show them with `dark:hidden` and `hidden dark:block`, as in the header. Don't recolor the logo red.
- Minecraft skin heads come from `/api/warden/heads/:uuid` (the server fetches and caches them, never hotlinked). Show them with the `pixelated` utility so the 8-pixel faces stay sharp, at 28, 40 or 56 px, with `rounded-sm`.

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
