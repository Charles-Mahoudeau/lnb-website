import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { createAccessControl } from 'better-auth/plugins/access';
import { admin } from 'better-auth/plugins/admin';
import { adminAc, defaultStatements, userAc } from 'better-auth/plugins/admin/access';
import { deviceAuthorization } from 'better-auth/plugins/device-authorization';

import { readAuthEnv } from './auth-env';
import { generateLinkCode } from './link-codes';
import { isAllowedTenant } from './tenants';
import { TENANT_NOT_ALLOWED } from '../../shared/utils/auth-errors';
import { getLinkApp, LINK_CODE_LENGTH } from '../../shared/utils/link-apps';
import { ADMIN_ROLE, WARDEN_ADMIN_ROLE } from '../../shared/utils/roles';
import { db } from '../db';
import * as schema from '../db/schema';

// No Nuxt imports here: the Better Auth CLI loads this file to generate the schema.
// See docs/authentication.md for the Entra app registration and the tenant allowlist.
const env = readAuthEnv();

// Warden admins get no Better Auth admin rights: their powers are Warden's own routes,
// checked with requireWardenAdmin. See shared/utils/roles.ts.
const ac = createAccessControl(defaultStatements);
const roles = {
  user: userAc,
  [ADMIN_ROLE]: adminAc,
  [WARDEN_ADMIN_ROLE]: ac.newRole({ user: [], session: [] }),
};

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
      // The ID token has everything we need. No Graph access (photo) and no refresh token.
      disableDefaultScope: true,
      scope: ['openid', 'profile', 'email'],
      disableProfilePhoto: true,
      // Refresh name, email and tenant from Microsoft on every sign-in.
      overrideUserInfoOnSignIn: true,
      mapProfileToUser: (profile) => ({ tenantId: profile.tid }),
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
    validateUserInfo: ({ source }) => {
      const tid = source.oauth?.providerId === 'microsoft' ? source.oauth.profile?.tid : undefined;
      if (!isAllowedTenant(tid, env.AUTH_ALLOWED_TENANTS)) {
        return { error: TENANT_NOT_ALLOWED };
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
  // Link codes are approved by POST /api/link/approve instead, which checks the app's schools.
  disabledPaths: ['/update-user', '/device/approve'],

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
    admin({ ac, roles, adminRoles: [ADMIN_ROLE] }),
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
  ],
});

export type AuthSession = typeof auth.$Infer.Session;
