# Authentication

Sign-in is Microsoft only, through Better Auth (`server/lib/auth.ts`). Only students of an allowed school can sign in, checked by the Microsoft Entra tenant ID (`tid`) of their account. Email domains are never used for access: the Microsoft email claim can change and isn't verified.

## How a sign-in works

1. `/sign-in` calls Better Auth, which sends the visitor to Microsoft's `organizations` endpoint. Microsoft refuses personal accounts there.
2. Microsoft comes back to `/api/auth/callback/microsoft`. Better Auth checks the ID token, including that `tid` matches the token's issuer.
3. `user.validateUserInfo` refuses any `tid` that isn't in `AUTH_ALLOWED_TENANTS`. It runs for new accounts and on every sign-in, so removing a school from the list blocks its students at their next sign-in. A refusal sends the visitor back to `/sign-in?error=tenant_not_allowed`.
4. The account is keyed by the `oid` claim. Name, email and tenant are refreshed from Microsoft on every sign-in.

Signed-out visitors are sent to `/sign-in` by `app/middleware/auth.global.ts`, unless the page sets `definePageMeta({ auth: false })`. API routes use `requireUser(event)` and `requireAdmin(event)` from `server/utils/auth.ts`.

## What is stored

- `user`: name, email, tenant ID, role, ban fields and `lastSignInAt` (for the 24-month inactive-account cleanup).
- `account`: the provider and the `oid`. OAuth tokens are dropped before they're saved: the app requests only `openid profile email` and never calls Microsoft Graph.
- `session`: token and expiry. IP address and user agent are cleared before saving.

No profile photo is fetched yet. Avatars will come with object storage.

## Microsoft Entra app registration

In the Entra admin center, under App registrations, then New registration:

- Supported account types: accounts in any organizational directory (multitenant).
- Redirect URI, platform Web: `http://localhost:3000/api/auth/callback/microsoft` for development, and `https://<production host>/api/auth/callback/microsoft` for production.
- Under Certificates & secrets, create a client secret. Put the application (client) ID in `MICROSOFT_CLIENT_ID` and the secret value in `MICROSOFT_CLIENT_SECRET`. Note the secret's expiry date: sign-in stops working when it expires.

A school's tenant may require an admin to approve third-party apps. Its students then see a "Need admin approval" screen until a tenant admin consents.

## Environment

See `.env.example`. `BETTER_AUTH_SECRET` (at least 32 characters, `openssl rand -base64 32`), `BETTER_AUTH_URL` (the public origin), the two Microsoft values and `AUTH_ALLOWED_TENANTS` are required. The server fails at startup with the list of missing variables.

## Adding a school

1. Find the tenant ID: open `https://login.microsoftonline.com/<school domain>/v2.0/.well-known/openid-configuration`. The ID is the UUID in the `issuer` URL.
2. Add it with the school name to `SCHOOLS` in `shared/utils/schools.ts`, so the app can show the school.
3. Add it to `AUTH_ALLOWED_TENANTS` in each environment (comma-separated), and restart.

## Admins

Roles come from Better Auth's admin plugin. Promote the first admin by hand, after they have signed in once:

```sql
UPDATE "user" SET role = 'admin' WHERE email = 'name@epitech.eu';
```

## Changing the auth schema

`server/db/schema/auth.ts` is generated. After changing user fields or plugins in `server/lib/auth.ts`, regenerate it and create a migration:

```sh
pnpm dlx auth@<better-auth version> generate --config server/lib/auth.ts --output server/db/schema/auth.ts
pnpm format
pnpm db:generate --name <change>
```

The CLI loads `server/lib/auth.ts`, so the auth variables must be set in the environment. Keep that file and what it imports free of Nuxt imports. Mirror new user fields in `inferAdditionalFields` in `app/utils/auth-client.ts`.
