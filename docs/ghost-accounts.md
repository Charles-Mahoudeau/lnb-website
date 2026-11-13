# Ghost accounts

A ghost is an account an admin or events manager makes for someone who has never signed in, so that person can be registered for an event, put in a tournament team or shown on the team page. When they sign in with Microsoft later, they take over that same account: no second account is created, and everything attached to it (registrations, team seats, roles, bans) is theirs.

A ghost is a normal `user` row with `ghost = true`. It has the person's school email, a name, a school (`tenantId`, picked by the admin), no photo, no `account` and no `session`, so it can't sign in or act. `emailVerified` is `true`: the admin vouches for the email, and Better Auth requires it to link an account (`requireLocalEmailVerified`).

Status: the `ghost` column, the takeover, the service, the routes, the flag and the admin screens are built. The places that count or list accounts (push, the Overview) are still to come.

## Admin screens

- Users: a "Create ghost" button opens a modal (`AdminGhostModal`, with `AdminGhostForm`), a "Not signed in yet" status filter, a dashed avatar ring and badge on ghost rows, and "Never signed in" in the last sign-in column. A ghost's menu has no roles or sign-out.
- Pickers: the events registration modal and the team member modal have an "Existing account | New ghost" switch. Making a ghost there picks it, and the usual Add button then registers it or puts it on the team. Events managers go through `POST /api/admin/events/users/ghost`, admins through the admin route.
- The marker also shows in the event Registrations list, the Team admin and the picker results. The events and team search results and the registrations rows carry `ghost`. The student-facing player search and the public team page don't.
- The form warns that an email other than the one Microsoft sends gives the person a second account, and leaves the ghost empty.

## Making and changing ghosts

`ghostService` (`server/services/ghosts.ts`) makes a ghost from a name, an email and a school, and changes them while the account is still a ghost. The email is lowercased and must not belong to any account, ghost or not (`emailTaken`, 409). The school is one of `SCHOOLS`, and only that school's students can take it over. Making and changing are logged in `admin_audit` (`user.ghostCreate`, `user.ghostUpdate`).

| Route                                  | Who             | Does                                                            |
| -------------------------------------- | --------------- | --------------------------------------------------------------- |
| `POST /api/admin/users/ghost`          | site admins     | Makes a ghost.                                                  |
| `POST /api/admin/events/users/ghost`   | events managers | The same, for the event and team screens.                       |
| `PATCH /api/admin/users/:userId/ghost` | site admins     | Changes its name, email or school (`notGhost` once taken over). |

A ghost has no roles: `setRoles` refuses it (`isGhost`, 409), and so does the bulk role action. It can be banned, deleted (with everything attached to it) and filtered in the Users list (`status=ghost`, and `ghost` on each row).

The `ghostAccounts` flag switches both making ghosts (503 `disabled`) and taking them over off. With it off, a person signing in with a ghost's email sees `account_claim_refused` until it is switched back on. Existing ghosts stay.

## Taking over a ghost

Better Auth finds a sign-in's account by the Microsoft `oid`, then by email. Before ghosts, an email match with no linked `oid` was refused, so a ghost with the person's email would have blocked their first sign-in. Account linking is now on (`accountLinking` in `server/lib/auth.ts`, with `microsoft` as a trusted provider), and `user.validateUserInfo` decides what may be linked. It runs with `source.action === 'link-account'` when Better Auth is about to link a new `oid` to an existing account, and refuses with `account_claim_refused` unless both hold (`mayClaimGhost`, `server/lib/ghosts.ts`):

- The account is a ghost.
- Its school is the sign-in's `tid`, so a person from another school can't take it with the same email.

So a school that reuses an address can't hand a real account to a new person. Better Auth already refuses the link while the real account's email is unverified, which is the usual case, and `validateUserInfo` refuses it when it is verified. `/link-social` is disabled, so a signed-in person can't link a second Microsoft account either.

When the account is created, the `account.create.after` hook calls `claimGhost`: it sets `ghost = false` and writes a `user.ghostClaim` audit row (no actor). The same sign-in then refreshes the name, email, photo and tenant from Microsoft and opens a session, like any other.

The match is the lowercased Microsoft `email` claim, which can differ from the address the admin typed (an alias, a changed name). Then no ghost matches and a second account is created. An admin can delete the stray one and fix the ghost's email. A merge tool isn't built.

Two sign-ins at the same time for one ghost: the first one claims it, and the second is refused.

## Retention

Ghosts follow the 24-month inactive-account cleanup like any account: `coalesce(lastSignInAt, createdAt)` makes a ghost's age count from its creation (`server/services/users.ts`).

## Tests

`test/server/ghosts.test.ts` covers the service, the list and the roles. `test/server/ghost-claim.test.ts` runs Better Auth's real `handleOAuthUserInfo` against a database: same row kept with its seat and settings, audit row, case-insensitive email, wrong school refused, second `oid` refused, real accounts (unverified or verified, or without an `oid`) refused, and sign-in and sign-up unchanged. It also makes a ghost with the service and takes it over, with the flag off and on. A real Microsoft sign-in from the three schools isn't tested.
