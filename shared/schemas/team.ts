import { z } from 'zod';

// Team page contracts, shared by the routes and the pages. See docs/team.md.

export const TEAM_PROBLEMS = [
  'poleNotFound',
  'memberNotFound',
  'userNotFound',
  'alreadyMember',
  'hasMembers',
] as const;
export type TeamProblem = (typeof TEAM_PROBLEMS)[number];

/** The icons a pole can wear, as full class names so Tailwind and the icon bundle find them. */
export const TEAM_ICONS = [
  'i-lucide-landmark',
  'i-lucide-calendar',
  'i-lucide-pickaxe',
  'i-lucide-megaphone',
  'i-lucide-code',
  'i-lucide-gamepad-2',
  'i-lucide-trophy',
  'i-lucide-palette',
  'i-lucide-camera',
  'i-lucide-users',
] as const;

export const teamIdParams = z.object({ id: z.uuid() });
export const teamUserParams = z.object({ userId: z.string().min(1).max(64) });

/** The same text in both languages. A French text left empty falls back to English. */
const localized = z.object({ en: z.string(), fr: z.string() });
export const teamText = localized;
export type TeamText = z.infer<typeof teamText>;

const requiredText = (max: number) =>
  z.object({ en: z.string().trim().min(1).max(max), fr: z.string().trim().min(1).max(max) });
const optionalText = (max: number) =>
  z.object({ en: z.string().trim().max(max), fr: z.string().trim().max(max) });

// Public page

export const teamPublicMember = z.object({
  id: z.string().describe('The account ID: it picks the avatar tint, as everywhere on the site.'),
  name: z.string(),
  school: z.string().nullable(),
  image: z.string().nullable().describe('A photo URL served without sign-in, or null.'),
  role: localized,
  bio: localized,
});
export type TeamPublicMember = z.infer<typeof teamPublicMember>;

export const teamPublicPole = z.object({
  id: z.uuid(),
  icon: z.string(),
  featured: z.boolean(),
  name: localized,
  description: localized,
  members: z.array(teamPublicMember),
});
export type TeamPublicPole = z.infer<typeof teamPublicPole>;

/** GET /api/team */
export const teamPublicView = z.object({
  poles: z.array(teamPublicPole).describe('Poles with at least one visible member, in order.'),
  joinUrl: z
    .string()
    .nullable()
    .describe('Null while the team.join flag is off or no link is set.'),
});
export type TeamPublicView = z.infer<typeof teamPublicView>;

export const teamPhotoParams = z.object({ key: z.string().regex(/^[0-9a-f]{64}$/) });

// Your own place on the page

/** GET /api/team/me */
export const teamMeView = z.object({
  member: z.boolean().describe('Whether managers put this account on the team page.'),
  showSelf: z.boolean().describe('The member’s own switch. Off hides them from the page.'),
});
export type TeamMeView = z.infer<typeof teamMeView>;

/** PATCH /api/team/me */
export const teamMePatch = z.object({ showSelf: z.boolean() });

// Admin

export const teamAdminMember = z.object({
  userId: z.string(),
  name: z.string(),
  email: z.string(),
  school: z.string().nullable(),
  image: z.string().nullable(),
  role: localized,
  bio: localized,
  visible: z.boolean(),
  showSelf: z.boolean(),
  banned: z.boolean().describe('A site ban is in force: the public page hides them.'),
});
export type TeamAdminMember = z.infer<typeof teamAdminMember>;

export const teamAdminPole = z.object({
  id: z.uuid(),
  icon: z.string(),
  featured: z.boolean(),
  name: localized,
  description: localized,
  members: z.array(teamAdminMember),
});
export type TeamAdminPole = z.infer<typeof teamAdminPole>;

/** GET /api/admin/team */
export const teamAdminView = z.object({
  poles: z.array(teamAdminPole),
  joinUrl: z.string().nullable(),
});
export type TeamAdminView = z.infer<typeof teamAdminView>;

/** POST /api/admin/team/poles */
export const teamPoleBody = z.object({
  name: requiredText(60),
  description: optionalText(200),
  icon: z.enum(TEAM_ICONS),
  featured: z.boolean(),
});
export type TeamPoleBody = z.input<typeof teamPoleBody>;

/** PATCH /api/admin/team/poles/:id */
export const teamPolePatchBody = teamPoleBody
  .partial()
  .refine((patch) => Object.keys(patch).length > 0);
export type TeamPolePatchBody = z.input<typeof teamPolePatchBody>;

/** POST /api/admin/team/members */
export const teamMemberBody = z.object({
  userId: z.string().min(1).max(64),
  poleId: z.uuid(),
  role: requiredText(60),
  bio: optionalText(300),
  visible: z.boolean(),
});
export type TeamMemberBody = z.input<typeof teamMemberBody>;

/** PATCH /api/admin/team/members/:userId */
export const teamMemberPatchBody = teamMemberBody
  .omit({ userId: true })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0);
export type TeamMemberPatchBody = z.input<typeof teamMemberPatchBody>;

/** POST .../move: one step up or down among its siblings. */
export const teamMoveBody = z.object({ direction: z.enum(['up', 'down']) });
export type TeamMoveBody = z.infer<typeof teamMoveBody>;

/** PATCH /api/admin/team/settings */
export const teamSettingsBody = z.object({
  joinUrl: z
    .string()
    .trim()
    .max(500)
    .refine((value) => value === '' || /^https:\/\/[^\s/]+\.[^\s/]+/.test(value))
    .nullable()
    .transform((value) => value || null),
});
export type TeamSettingsBody = z.input<typeof teamSettingsBody>;
export const teamSettingsView = z.object({ joinUrl: z.string().nullable() });

/** GET /api/admin/team/users */
export const teamUserQuery = z.object({ q: z.string().trim().min(1).max(80) });
export const teamUserOptions = z.object({
  items: z.array(
    z.object({
      userId: z.string(),
      name: z.string(),
      email: z.string(),
      school: z.string().nullable(),
      image: z.string().nullable(),
    }),
  ),
});
export type TeamUserOption = z.infer<typeof teamUserOptions>['items'][number];
