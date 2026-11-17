# Playtime limits: to-do for the Warden mod and the server

Contract for the mod developers. **The site side is built and matches this document**: the field names below are the real ones (also in `docs/warden.md` and the OpenAPI reference at `/api/docs`). The site decides everything. The mod and the server only **show** and **obey**: they never compute a limit, a window or a week themselves. Tell us what doesn't fit and we'll change the site side.

**Rollout.** The site starts in `observe`: it counts and shows time on the website, but denies nobody, kicks nobody and sends none of the events below. Every `playtime` object then carries `"enforced": false`, and **the mod and the server must show nothing and do nothing with it**. Once the mod handles everything here, an admin switches the site to `enforce`. Build against a test site in `enforce`.

## What the feature does (for context)

- Each LNB account has a weekly allowance (for example 10 hours). Time only counts while it is played **inside the restricted windows** (for example Monday to Friday, 9:00 to 17:00, Europe/Paris). Time outside the windows is shown, but not counted.
- The week starts Monday 00:00 (Europe/Paris) and the allowance resets then.
- The site can switch the limit off for a whole account, for one Minecraft account of it, for a school, for a day or for a whole week (holidays, "skip this week"), and admins can grant extra time. All of this is worked out on the site. The mod sees only the result below.
- When the allowance runs out inside a window, the player is kicked at once. They can't join again until the window ends or the week resets. Outside the windows they can always play.
- **Grace period.** When the allowance runs out in the last hour before the window ends (or before the weekly reset), the player isn't kicked: they enter a grace period and can keep playing until the window ends. The time played in grace isn't counted against anything. It's shown on the site. Joining during the last hour with no allowance left is allowed the same way. The length (1 hour by default) is set in the admin.

## 1. Login: a new denial reason

`POST /api/warden/server/login` gets a new denied `reason`, checked after the ban check:

```json
{
  "result": "denied",
  "reason": "playtimeLimitReached",
  "playtime": { "windowEndsAt": "2026-11-20T15:00:00.000Z", "resetsAt": "2026-11-22T23:00:00.000Z" }
}
```

All dates are ISO 8601 in UTC (`Z`). Show them in the player's time zone, or in Paris time.

- `windowEndsAt`: when the player can join again (the end of the current window). Null when the next join is only possible after the reset.
- `resetsAt`: the next Monday 00:00 in Paris, when the allowance comes back.
- The check only happens when the site is in `enforce`, and a player in grace (section 2) is allowed.
- **To do:** show a clear disconnect screen. Suggested text: "You used your weekly Minecraft time. You can play again at {windowEndsAt}." in the player's language (the mod already has the locale on the client). The strings are yours to write; the site only sends the dates.

## 2. Login: the allowed answer carries the state

The `allowed` answer gets a `playtime` object for the account that is joining:

```json
{
  "playtime": {
    "enforced": true,
    "limited": true,
    "counting": true,
    "remainingSeconds": 7260,
    "limitSeconds": 36000,
    "windowEndsAt": "2026-11-20T15:00:00.000Z",
    "nextWindowStartsAt": null,
    "grace": false,
    "graceEndsAt": null
  }
}
```

- `enforced`: false in `observe` (see Rollout): ignore everything else.
- `grace`: true when the allowance is used up but the player may stay until `graceEndsAt` (the end of the window). `remainingSeconds` is then 0, and the mod should show "Grace period until 17:00" instead of a countdown. No kick is sent at 0 in this case: the kick comes at `graceEndsAt`, or never if counting simply stops with the window.

- `limitSeconds`: the week's allowance, with any extra time an admin granted.
- `limited`: false when the limit doesn't apply to this player or this Minecraft account (exemption, holiday, skipped week, admin account). Then nothing below matters and the mod shows nothing.
- `counting`: true when the time played right now counts (we're inside a window). False outside the windows: the player has no countdown, and `nextWindowStartsAt` says when counting starts.
- `remainingSeconds`: what is left of the allowance, worked out on the site at login.
- **To do:** keep this in the session. Show it in a small, optional HUD or in a command (`/playtime`: "7h 12m left this week, counting until 17:00").

## 3. Server-sent events: new events on `GET /api/warden/server/events`

| Event             | Data                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `playtimeWarning` | `{ "uuids": [...], "remainingSeconds": 600, "kind": "allowance" }`: sent at 30, 10, 5 and 1 minutes left (the site chooses the moments, per school or player). A player who joins with 3 minutes left gets one warning with `remainingSeconds: 180`. `kind` is `allowance` (time is running out) or `windowStart` (a player with no allowance left is online and counting starts soon: `remainingSeconds` is the time until the window opens, sent 5 and 1 minutes before, then a kick when it opens, with no grace). The mod shows a title or chat message. |
| `playtimeGrace`   | `{ "uuids": [...], "graceEndsAt": "..." }`: the allowance ran out inside the grace period. Tell the player ("You used your time, but you can finish until 17:00"). Replaces the kick.                                                                                                                                                                                                                                                                                                                                                                        |
| `playtimeUpdate`  | `{ "uuids": [...], "playtime": { ... same object as login } }`: the state changed while online: a window started or ended, an admin granted time, the limit was switched off.                                                                                                                                                                                                                                                                                                                                                                                |
| `kick` (existing) | A new `reason`: `playtimeLimit`, with `playtime: { windowEndsAt, resetsAt }` (the same object as in section 1). The mod disconnects with the same screen. Sent once per session.                                                                                                                                                                                                                                                                                                                                                                             |

- **To do:** handle the three events. `playtimeUpdate` must also be able to **cancel** a countdown (admin gave time or the window ended: the HUD goes away, no kick).
- The site sends an event once and keeps the stream, `Last-Event-ID` and the replay like the other events. A warning can also come right after a login (the marks already crossed), and `playtimeGrace` is sent again right after a player joins in grace.
- Warnings arrive per Minecraft UUID, because a player can have two accounts online.
- The kick is sent by the site within about 6 seconds of the allowance reaching zero (a 5-second timer plus the stream). The mod must not add its own delay, and the local timer in section 4 is a backup only: an event from the site always replaces it.
- Exemption is per Minecraft account: one UUID can be exempt while another of the same player is limited, so always act per UUID.

## 4. Fallback when the event stream is down

The stream can drop. A player must not play for free during that time, and must not be kicked unfairly after it.

- Every `playtimeWarning` and `playtimeUpdate` carries `remainingSeconds`. When the mod receives one while `counting` is true, it **may** keep a local timer that kicks the player at zero (with the reason `playtimeLimit`), measured from the time the mod received it (don't compare clocks with the site).
- A new event cancels the local timer. On reconnect, the mod sends `Last-Event-ID` as usual and gets what it missed.
- If you prefer not to, say so. The heartbeat (next section) also covers this, a bit later.

## 5. Heartbeat

`POST /api/warden/server/sessions/heartbeat` already runs. The site counts the time of a session up to its **last heartbeat**, never beyond. So a server crash costs the player at most one heartbeat interval, never hours.

- **To do:** keep sending it **every 60 seconds at most** (the shorter, the fairer). Tell us the real interval.
- The answer also carries the state of **every open session in the request**: `{ "unknown": [...], "playtime": { "<sessionId>": { ... } } }`, the same object as in section 2. It is the safety net for missed events. **To do:** treat it like a `playtimeUpdate` (it can show, change or cancel the HUD and any local timer, and when `enforced` is false it clears them).
- **To do:** on server shutdown or crash recovery, call `POST /api/warden/server/sessions/end` for the sessions that were open, so the site doesn't wait for the heartbeat timeout.

## 5b. Staff commands

`GET /api/warden/server/players/:uuid` gets a `playtime` field: the same object as in section 2 plus `state` (`unlimited`, `free`, `counting`, `grace` or `blocked`) and `usedSeconds` (counted this week). Handy for a `/warden info` style command.

## 6. Things the server must NOT do

- Don't count, store or compute playtime on the server side. Even a simple "player was online N hours" would drift from the site.
- Don't kick on a timer the site didn't announce (see the fallback above).
- Don't show the schedule or reasons for an exemption. A player can see their own state on the site (`/minecraft/account`), and that's enough.

## 7. Test cases we'd like to run together

0. Allowance runs out 30 minutes before the window ends: `playtimeGrace`, no kick, HUD shows the grace end. The same player joining again inside that hour: allowed with `grace: true`.
1. A player with 2 minutes left, inside a window: warnings at 1 minute, kick at 0, screen shows `windowEndsAt`.
2. (Outside the last hour.) The same player tries to join again: denied with `playtimeLimitReached`.
3. A window ends while the player is online with no time left: no kick (counting stops). Check that `playtimeUpdate` clears the HUD.
4. A window starts while the player is online and has no time left: kick at the start, with `windowEndsAt`.
5. An admin gives 30 minutes during the countdown: the countdown disappears.
6. A player with two Minecraft accounts, one exempt: only the other one gets warnings, and only its time counts.
7. Kill the server process: restart, check the site didn't count the offline hours.
8. Cut the events stream for 5 minutes during a countdown: the local timer kicks at zero (or the heartbeat does).
