import {
  adminClient,
  deviceAuthorizationClient,
  inferAdditionalFields,
} from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/vue';

function createClient() {
  return createAuthClient({
    plugins: [
      adminClient(),
      deviceAuthorizationClient(),
      // Mirrors user.additionalFields in server/lib/auth.ts.
      inferAdditionalFields({
        user: {
          tenantId: { type: 'string' },
          lastSignInAt: { type: 'date', required: false },
        },
      }),
    ],
  });
}

export type AuthSession = ReturnType<typeof createClient>['$Infer']['Session'];

// Created on first use, in the browser only: it takes the API origin from the page.
let client: ReturnType<typeof createClient> | undefined;
export function authClient() {
  return (client ??= createClient());
}
