import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { openAPI } from 'better-auth/plugins';
import { createAccessControl } from 'better-auth/plugins/access';
import { admin } from 'better-auth/plugins/admin';
import { adminAc, defaultStatements, userAc } from 'better-auth/plugins/admin/access';
import { deviceAuthorization } from 'better-auth/plugins/device-authorization';
import { sql } from 'drizzle-orm';

import { readAuthEnv } from './auth-env';
import { saveProfilePhoto } from './avatars';
import { isFlagOn } from './flag-gate';
import { generateLinkCode } from './link-codes';
import { isAllowedTenant, SCHOOL_SIGN_IN_FLAGS } from './tenants';
import { SIGN_IN_DISABLED, TENANT_NOT_ALLOWED } from '../../shared/utils/auth-errors';
import { getLinkApp, LINK_CODE_LENGTH } from '../../shared/utils/link-apps';
import {
  ADMIN_ROLE,
  EVENTS_MANAGER_ROLE,
  hasRole,
  WARDEN_ADMIN_ROLE,
} from '../../shared/utils/roles';
import { db } from '../db';
import * as schema from '../db/schema';

// No Nuxt imports here: the Better Auth CLI loads this file to generate the schema.
// See docs/authentication.md for the Entra app registration and the tenant allowlist.
const env = readAuthEnv();

/** Whether an account with this email already exists and is a site admin. */
async function isExistingAdmin(email: unknown): Promise<boolean> {
  if (typeof email !== 'string') return false;
  const [row] = await db
    .select({ role: schema.user.role })
    .from(schema.user)
    .where(sql`lower(${schema.user.email}) = ${email.toLowerCase()}`);
  return hasRole(row?.role, ADMIN_ROLE);
}

// Warden admins and events managers get no Better Auth admin rights: their powers are our own
// routes, checked with requireWardenAdmin and requireEventsManager. See shared/utils/roles.ts.
const ac = createAccessControl(defaultStatements);
const roles = {
  user: userAc,
  [ADMIN_ROLE]: adminAc,
  [WARDEN_ADMIN_ROLE]: ac.newRole({ user: [], session: [] }),
  [EVENTS_MANAGER_ROLE]: ac.newRole({ user: [], session: [] }),
};

// The admin plugin stays for its role and ban columns and for refusing banned sign-ins, but its
// own routes are off: admins go through /api/admin (server/services/users.ts), which checks our
// rules and writes admin_audit. Read from the plugin, so routes added by an upgrade are off too.
// This also turns off impersonation.
const adminPlugin = admin({ ac, roles, adminRoles: [ADMIN_ROLE] });
const adminPluginPaths = Object.values(adminPlugin.endpoints).map((endpoint) => endpoint.path);

export const auth = betterAuth({
  appName: 'La Nuit Blanche',
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  telemetry: { enabled: false },

  socialProviders: {
    microsoft: {
      clientId: env.MICROSOFT_CLIENT_ID,
      clientSecret: env.MICROSOFT_CLIENT_SECRET,
      // Work and school accounts only: Microsoft refuses personal accounts itself.
      tenantId: 'organizations',
      prompt: 'select_account',
      // The ID token has the profile. User.Read is only for the photo, fetched from Microsoft
      // Graph during the callback. No refresh token, and the access token isn't kept.
      disableDefaultScope: true,
      scope: ['openid', 'profile', 'email', 'User.Read'],
      // 96 px covers the largest avatar (40 px) on 2x screens.
      profilePhotoSize: 96,
      // Refresh name, email, photo and tenant from Microsoft on every sign-in.
      overrideUserInfoOnSignIn: true,
      // The photo arrives as a data URL. It's moved to Nitro storage (server/lib/avatars.ts), and
      // user.image gets its URL on this site. `picture` is typed as always set, but is missing
      // when the user has no photo or Graph fails: the stored photo is then left as it is.
      mapProfileToUser: async (profile) => ({
        tenantId: profile.tid,
        image: await saveProfilePhoto(profile.picture as string | undefined),
      }),
    },
  },

  user: {
    additionalFields: {
      // Set from the Microsoft profile only: /update-user is disabled below.
      tenantId: { type: 'string', required: true },
      lastSignInAt: { type: 'date', required: false, input: false },
    },
    // Runs on account creation and on every Microsoft sign-in, with the fresh ID token claims.
    // The Microsoft provider has already checked that `tid` matches the token's issuer.
    validateUserInfo: async ({ source }) => {
      const tid = source.oauth?.providerId === 'microsoft' ? source.oauth.profile?.tid : undefined;
      if (!isAllowedTenant(tid, env.AUTH_ALLOWED_TENANTS)) {
        return { error: TENANT_NOT_ALLOWED };
      }
      // The signIn feature flags (shared/flags.ts) refuse everyone, or one school. Admins stay
      // able to sign in, so a flag can't lock them out of the page that switches it back on.
      const schoolFlag = SCHOOL_SIGN_IN_FLAGS[tid.toLowerCase()];
      const open = (await isFlagOn('signIn')) && (!schoolFlag || (await isFlagOn(schoolFlag)));
      if (!open && !(await isExistingAdmin(source.oauth?.profile?.email))) {
        return { error: SIGN_IN_DISABLED };
      }
    },
  },

  account: {
    // One Microsoft account, one user.
    accountLinking: { enabled: false },
    // Tokens aren't kept (see databaseHooks), so there is nothing to refresh on sign-in.
    updateAccountOnSignIn: false,
  },

  // Profiles come from Microsoft. Users can't edit them, and especially not tenantId.
  // Link codes are approved by POST /api/link/approve and denied by POST /api/link/deny instead:
  // the first checks the app's schools, and both write the audit log of Warden devices.
  // Better Auth's OpenAPI schema is merged into ours (server/openapi/), so it isn't served here.
  disabledPaths: [
    '/update-user',
    '/device/approve',
    '/device/deny',
    '/open-api/generate-schema',
    ...adminPluginPaths,
  ],

  databaseHooks: {
    account: {
      create: {
        // We never call Microsoft after sign-in, so we don't store its tokens.
        before: (account) =>
          Promise.resolve({
            data: { ...account, accessToken: null, refreshToken: null, idToken: null },
          }),
      },
    },
    session: {
      create: {
        // The app stores no IP addresses or user agents (see the privacy section of the plan).
        before: (session) =>
          Promise.resolve({ data: { ...session, ipAddress: null, userAgent: null } }),
        // Used by the inactive-account cleanup task. Impersonation doesn't count as a sign-in.
        after: async (session, ctx) => {
          if (ctx && !session.impersonatedBy) {
            await ctx.context.internalAdapter.updateUser(session.userId, {
              lastSignInAt: new Date(),
            });
          }
        },
      },
    },
  },

  plugins: [
    adminPlugin,
    // Apps such as the Warden Minecraft mod link to an account with a 6-digit code
    // entered on /link. See docs/authentication.md.
    deviceAuthorization({
      verificationUri: '/link',
      expiresIn: '10m',
      userCodeLength: LINK_CODE_LENGTH,
      generateUserCode: generateLinkCode,
      // Apps whose codes come from their own server (Warden) can't ask for codes or tokens here.
      validateClient: (clientId) => {
        const app = getLinkApp(clientId);
        return app !== undefined && !app.issuedByServer;
      },
    }),
    // For auth.api.generateOpenAPISchema() only. The API reference is /api/docs.
    openAPI({ disableDefaultReference: true }),
  ],
});

export type AuthSession = typeof auth.$Infer.Session;
