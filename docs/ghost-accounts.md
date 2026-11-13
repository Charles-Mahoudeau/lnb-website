# Ghost accounts

A ghost is an account an admin or events manager makes for someone who has never signed in, so that person can be registered for an event, put in a tournament team or shown on the team page. When they sign in with Microsoft later, they take over that same account: no second account is created, and everything attached to it (registrations, team seats, roles, bans) is theirs.

A ghost is a normal `user` row with `ghost = true`. It has the person's school email, a name, a school (`tenantId`, picked by the admin), no photo, no `account` and no `session`, so it can't sign in or act. `emailVerified` is `true`: the admin vouches for the email, and Better Auth requires it to link an account (`requireLocalEmailVerified`).

Status: the `ghost` column, the takeover and its tests are built. Creating and managing ghosts (service, routes, admin screens, flag) and the places that count or list accounts are still to come.

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

`test/server/ghost-claim.test.ts` runs Better Auth's real `handleOAuthUserInfo` against a database: same row kept with its seat and settings, audit row, case-insensitive email, wrong school refused, second `oid` refused, real accounts (unverified or verified, or without an `oid`) refused, and sign-in and sign-up unchanged. A real Microsoft sign-in from the three schools isn't tested.
