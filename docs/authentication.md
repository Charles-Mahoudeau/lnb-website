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

A user's `role` is a comma-separated list. Besides `admin`, there is `warden-admin`, for Minecraft staff: it opens the Warden admin panel and in-game moderation, and gives no other admin rights. Site admins are Warden admins too, and give or remove the role from the Warden admin panel. The helpers are in `shared/utils/roles.ts`, and routes check them with `requireAdmin` and `requireWardenAdmin`.

## Linking apps

Apps link to an account with a 6-digit code, through Better Auth's device authorization plugin ([RFC 8628](https://datatracker.ietf.org/doc/html/rfc8628)). Warden, the Minecraft link, works differently: its server creates the codes, and linking gives no token. See `docs/warden.md`. For other apps:

1. The app calls `POST /api/auth/device/code` with its `client_id`. It gets a `device_code`, a 6-digit `user_code` that lasts 10 minutes, and `verification_uri_complete` (`/link?user_code=…`).
2. The person enters the code on `/link`, signed in. Checking it (`GET /api/auth/device`) claims it for them. The page then shows the app, the code and what the app receives, and they choose Link or Cancel.
3. Link calls `POST /api/link/approve` (`server/services/links.ts`). Better Auth's own `/device/approve` is disabled, so the school and redirect rules below can't be skipped.
4. The app gets its access token in one of two ways:
   - It polls `POST /api/auth/device/token` every 5 seconds until the code is approved.
   - Or it opens `/link?user_code=…&redirect_uri=…&state=…`. Once linked, the browser goes to `redirect_uri` with `access_token`, `token_type`, `expires_in` and `state` in the query. The code is used up there, so an app that takes this path must not poll.
   - Or the app has a `redirectAfterLink` (see below), and the browser always goes there once linked, with the same query, even when the code was typed on a plain `/link`.

Apps are listed in `shared/utils/link-apps.ts`. To add one, add its ID and name there and its description under `link.apps.<id>` in both locale files. Each app can also have:

- `schools`: the tenant IDs of the schools whose students can link it. Students from other schools see a page that says so, and their code is refused, so the app gets `access_denied`.
- `redirectAfterLink`: where to send people once linked when the link has no `redirect_uri`. A path on this site (Warden uses `/warden`) or a full URL. It's set in code, so it isn't checked against `redirectUris`.
- `redirectUris`: the only addresses `redirect_uri` may use, matched on origin and path. Loopback addresses (`127.0.0.1`, `[::1]`, `localhost`) match on any port, for apps that listen on the person's own device ([RFC 8252](https://datatracker.ietf.org/doc/html/rfc8252#section-7.3)). Apps should send a random `state` and check it comes back, so that no other page can hand them a token.
- `issuedByServer`: the app's own server creates its codes and decides what linking does, as Warden does (see `docs/warden.md`). Better Auth's `/device/code` and `/device/token` refuse the app, and linking gives no token: `/api/link/approve` runs the app's linking, then sends the person to `redirectAfterLink`.

`GET /api/auth/device` is limited to 5 tries per 10 minutes per IP, since there are only a million codes. Better Auth applies its rate limits in production only.

The access token is a regular session token for the person's account. The bearer plugin isn't on, so apps can't call the API with it yet. Decide what an app may read before turning it on.

## Changing the auth schema

`server/db/schema/auth.ts` is generated. After changing user fields or plugins in `server/lib/auth.ts`, regenerate it and create a migration:

```sh
pnpm dlx auth@<better-auth version> generate --config server/lib/auth.ts --output server/db/schema/auth.ts
pnpm format
pnpm db:generate --name <change>
```

The CLI loads `server/lib/auth.ts`, so the auth variables must be set in the environment. Keep that file and what it imports free of Nuxt imports. Mirror new user fields in `inferAdditionalFields` in `app/utils/auth-client.ts`.
