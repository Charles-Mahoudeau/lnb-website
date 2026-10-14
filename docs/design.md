# Design

The LNB visual language, "Soft night": a dark, confident showcase for a gaming association (video games, IRL games, events). The energy comes from game art and type. The layout stays clean, simple and obvious. It should read as a polished event brand, never as a design experiment.

These rules apply to every page and component. They override any design skill or generic aesthetic advice. If something here doesn't fit a new case, ask before inventing a new style.

The tokens live in `app/assets/css/main.css` and `app/app.config.ts`. Build with them and with Nuxt UI components, and don't restyle components page by page.

The living reference is the style guide at `/styleguide` (`app/pages/styleguide.vue`, dev only): every component below, rendered with the real theme. When you add a reusable component or pattern, add it there too.

Original mocks (not code to port): [style direction](https://claude.ai/artifact/XemXuxrMwzsGBMr9yYUmp6), [design language specimen](https://claude.ai/artifact/XcAANpQ7ykYBp7xhCtC13m), option A.

## Color

Dark first. Light mode is supported but secondary: design in dark, then check light.

Two custom palettes, wired into Nuxt UI as `neutral: 'night'` and `primary: 'crimson'`:

| Role                        | Dark                  | Light                 |
| --------------------------- | --------------------- | --------------------- |
| Page background             | night-950 `#0E1122`   | night-50 `#F4F5FA`    |
| Surface (cards, rows)       | night-900 `#161A30`   | white                 |
| Raised (hover, neutral btn) | night-800 `#1F2441`   | night-200 `#DADDEB`   |
| Border                      | night-700 `#2A3052`   | night-200 `#DADDEB`   |
| Text                        | night-100 `#ECEDF5`   | night-950 `#0E1122`   |
| Muted text                  | night-400 `#9CA1BE`   | night-500 `#5F6485`   |
| Action fill (`bg-action`)   | crimson-600 `#B82238` | crimson-700 `#A51F33` |
| Red text, links, focus      | crimson-400 `#F25C70` | crimson-700 `#A51F33` |

- **Deep crimson is the only accent, and it only marks actions**: the main button, links, focus rings, errors and destructive actions. Never use red on large surfaces, backgrounds, banners, cards or decoration.
- One solid red button per view or per item: the main action. Secondary actions use `color="neutral"` (`variant="soft"` or `"outline"`), and tertiary ones use `variant="ghost"`.
- Destructive actions use `color="error" variant="outline"`, never solid, so they don't look like the main action.
- Status colors (`success`, `warning`, `error`) are for state only: registered, waitlist, full. They're never decoration, and they don't count as accents.
- No activity or category colors. Video games, IRL games and events are told apart by text, not by color.
- No gradients as decoration. The only gradient allowed is the dark scrim that keeps text readable over a banner image.
- Use semantic classes only: `bg-default`, `bg-elevated`, `bg-accented`, `text-default`, `text-muted`, `text-highlighted`, `border-default`, `text-primary`, `bg-action`. Raw palette classes (`bg-red-500`, `text-white`, `bg-night-900`), hex values and arbitrary values (`bg-[#…]`, `p-[13px]`) are blocked by ESLint.

## Type

- **Unbounded** (500, 700) for headings: `h1` to `h3` get it by default. Use the `font-display` class for other display text, such as big date numbers.
- **Figtree** (400 to 700) for everything else: body, controls, labels, `h4` and smaller.
- Scale ratio about 1.25. Page titles 2.5rem, section titles 1.6rem, subsections 1.2rem. Body 1rem.
- Headings are sentence case, never all caps, and they use `text-wrap: balance`. Don't accent single words in a heading with a different color, weight or italic.
- Keep running text under about 70 characters wide.
- Use tabular numbers (`tabular-nums`) wherever digits line up: dates, times, counts.

## Shape and density

- `--ui-radius: 0.375rem`. Small parts are 6 px (`rounded-sm`), controls 9 px (`rounded-md`), and cards and dialogs 12 px (`rounded-lg`). Badges are pills.
- Separate surfaces with background steps (page, surface, raised), not borders. Borders go on form fields, outline buttons, dividers and floating layers only.
- Shadows only on floating layers: dialogs, menus, popovers, toasts. Never on cards in the page flow.
- Controls default to size `xl` (40 px tall, 16 px text, so phones don't zoom into inputs) through `app.config.ts`. Use `md` (32 px) in dense lists and tables.
- Spacing on the 4 px Tailwind scale. Lay out siblings with `gap`, not margins.
- A hero that should fill the first screen uses `min-h-hero` (the viewport height minus the header). Use it for the home hero only, and let other sections size to their content.
- Don't chop content into grids of identical cards by reflex. Pick the form that fits the content: dated rows for event lists, cards when the image matters, a table for tabular data.

## Imagery

- The home hero is a full-width game banner (SteamGridDB hero art, 1920 × 620) behind the next event, with a dark scrim from the text side so text stays readable. The hero stays dark in light mode too.
- Banners are downloaded by the server and stored in object storage, never hotlinked.
- Events without a banner fall back to plain night navy, never to a placeholder graphic.
- The logo is a black fox on a grey moon. On dark backgrounds use the white-fox variant (to be made as an SVG). Don't recolor the logo red.

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
- Everything centered. Content is left-aligned. Center only short, standalone moments such as an empty state.
- The same rounded card with the same shadow repeated for every block.
