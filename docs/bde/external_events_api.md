# External Events API (v1)

This API lets a partner association's website (LNB) publish its events on
the BDE website (Épinard). Each event gets its own page on the BDE site,
and its **S'inscrire** (Register) button sends students to the event page
on **your** website. Registration itself stays on your side.

You decide the registration URL for every event, so you can change your own
URL scheme (for example add a quick-register link) at any time without asking
for a change on the BDE website. Just push the event again with the new `url`.

- Base URL: `https://bde-teknantes.fr/api/v1`
- Format: JSON in, JSON out (`Content-Type: application/json`)
- Encoding: UTF-8
- Times: ISO 8601. Send an offset or `Z`, for example
  `2026-11-20T19:00:00+01:00`. Responses are always in UTC (`Z`).

## Authentication

Every request carries the token the BDE gives you:

```
Authorization: Bearer <LNB_API_TOKEN>
```

- The token identifies your association. Every event you create is an LNB
  event; you cannot create or see BDE events, nor events added by hand
  from the admin panel.
- Keep it server-side only (environment variable / secret). Never put it in
  front-end code or in a public repository.
- If it leaks, ask the BDE to rotate it: the old one stops working
  immediately.

A missing or wrong token returns `401 Unauthorized`.

## Identifying events: `external_id`

You address events with **your own id** (for example the UUID in
`lnb.bde-teknantes.fr/events/<uuid>`), in the path:

```
/api/v1/events/{external_id}
```

- 1 to 255 characters. Stick to URL-safe characters: letters, digits,
  `-`, `_`, `.`. A UUID or a slug is perfect.
- Unique per association. The same `external_id` always means the same
  event.

## The event object

| Field         | Type              | Required | Rules / notes                                                                                                                              |
| ------------- | ----------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `name`        | string            | yes      | 3 to 100 characters. Printed very large on the site: short is better.                                                                      |
| `description` | string            | yes      | At least 10 characters. Plain text, line breaks are kept.                                                                                  |
| `location`    | string            | yes      | At least 3 characters, e.g. `"Foyer du campus"`.                                                                                           |
| `starts_at`   | string (ISO 8601) | yes      | Start date and time.                                                                                                                       |
| `ends_at`     | string (ISO 8601) | yes      | Must be after `starts_at`.                                                                                                                 |
| `url`         | string            | yes      | Where **S'inscrire** sends students. See [Allowed URLs](#allowed-urls).                                                                    |
| `images`      | array of strings  | no       | Absolute image URLs, same domain rules as `url`. First one is the poster. Default `[]`: the site then generates a poster in its own style. |
| `paid`        | boolean           | no       | Default `false`.                                                                                                                           |
| `price`       | integer           | no       | Whole euros, `>= 0`. Shown when `paid` is `true`. Default `null`.                                                                          |
| `hidden`      | boolean           | no       | `true` keeps the event off the members' site (draft). Default `false`.                                                                     |

Read-only fields returned in responses:

| Field         | Description                                                  |
| ------------- | ------------------------------------------------------------ |
| `external_id` | Your id.                                                     |
| `page_url`    | The event's page on the BDE website. Link to it if you like. |
| `inserted_at` | Creation time on the BDE side (UTC).                         |
| `updated_at`  | Last change on the BDE side (UTC).                           |

Unknown fields are ignored.

### Allowed URLs

`url` and every entry of `images` must:

- use `https://`;
- point to `bde-teknantes.fr` or any of its subdomains
  (`lnb.bde-teknantes.fr`, `a.b.bde-teknantes.fr`, ...).

The BDE can change the allowed domain list on its side if you ever move.
Anything else (`http://`, another domain, `bde-teknantes.fr.example.com`)
is rejected with `422`.

## Endpoints

### Create or update an event: `PUT /events/{external_id}`

Creates the event the first time, replaces it afterwards. It is
**idempotent**: sending the same request twice is safe, so you can simply
retry after a network error or a timeout.

`PUT` replaces the **whole** event: always send every field. An optional
field you leave out goes back to its default (for example, omitting
`images` removes the images).

```http
PUT /api/v1/events/0b6f3c1e-2a4d-4c1b-9b7e-5f1c2d3e4a5b HTTP/1.1
Host: bde-teknantes.fr
Authorization: Bearer <LNB_API_TOKEN>
Content-Type: application/json

{
  "name": "Werewolves",
  "description": "Une soirée loups-garous au foyer, ouverte à tous.",
  "location": "Foyer du campus",
  "starts_at": "2026-11-20T19:00:00+01:00",
  "ends_at": "2026-11-20T23:30:00+01:00",
  "url": "https://lnb.bde-teknantes.fr/events/0b6f3c1e-2a4d-4c1b-9b7e-5f1c2d3e4a5b",
  "images": ["https://lnb.bde-teknantes.fr/media/werewolves.png"],
  "paid": false,
  "price": null,
  "hidden": false
}
```

Responses:

- `201 Created`: the event was created. A `Location` header points to it.
- `200 OK`: the event already existed and was replaced.
- `422 Unprocessable Entity`: validation failed, nothing was saved.

Body for `201` / `200`:

```json
{
  "data": {
    "external_id": "0b6f3c1e-2a4d-4c1b-9b7e-5f1c2d3e4a5b",
    "name": "Werewolves",
    "description": "Une soirée loups-garous au foyer, ouverte à tous.",
    "location": "Foyer du campus",
    "starts_at": "2026-11-20T18:00:00Z",
    "ends_at": "2026-11-20T22:30:00Z",
    "url": "https://lnb.bde-teknantes.fr/events/0b6f3c1e-2a4d-4c1b-9b7e-5f1c2d3e4a5b",
    "images": ["https://lnb.bde-teknantes.fr/media/werewolves.png"],
    "paid": false,
    "price": null,
    "hidden": false,
    "page_url": "https://bde-teknantes.fr/home/event/42",
    "inserted_at": "2026-10-16T09:12:03Z",
    "updated_at": "2026-10-16T09:12:03Z"
  }
}
```

### Get one event: `GET /events/{external_id}`

`200` with `{"data": {...}}`, or `404` if you never created it (or it was
deleted).

### List your events: `GET /events`

`200` with `{"data": [ ... ]}`: every event your association pushed, latest
start date first. Use it to check what the BDE site currently holds, for
example in a periodic sync.

### Delete an event: `DELETE /events/{external_id}`

`204 No Content` on success, `404` if it does not exist. Use it when an
event is cancelled. If you only want to take it offline temporarily, push
it again with `"hidden": true` instead.

## Errors

All errors are JSON.

| Status | When                    | Body                                                     |
| ------ | ----------------------- | -------------------------------------------------------- |
| `401`  | Missing or wrong token  | `{"errors": {"detail": "Missing or invalid API token"}}` |
| `403`  | The event is not yours  | `{"errors": {"detail": "Forbidden"}}`                    |
| `404`  | Unknown `external_id`   | `{"errors": {"detail": "Not Found"}}`                    |
| `400`  | Body is not valid JSON  | `{"errors": {"detail": "Bad Request"}}`                  |
| `422`  | Validation failed       | Field name → list of messages, see below                 |
| `5xx`  | Problem on the BDE side | Retry later (with backoff)                               |

Validation errors use the field names of this document:

```json
{
  "errors": {
    "url": ["must be an https link on an allowed domain"],
    "ends_at": ["must be after the start date"],
    "description": ["should be at least 10 character(s)"]
  }
}
```

Fix the payload before retrying a `422`; retrying it unchanged will fail
the same way.

## Recommended integration

1. When an event is created or edited on your website, send
   `PUT /events/{your id}` with the full event.
2. When an event is cancelled, send `DELETE /events/{your id}`.
3. On a network error, a timeout or a `5xx`, retry with a backoff (for
   example after 1 min, 5 min, 30 min). `PUT` and `DELETE` are safe to
   repeat.
4. If the API stays unreachable, a member of the LNB office with the
   editor role can create the event by hand in the BDE admin panel
   (_Events → Créer un event_, field **Lien d'inscription externe**).
   Note that this manual event is not linked to your `external_id`:
   if the API comes back, delete the manual one before pushing, or you
   will get a duplicate.

Edits made by hand in the admin panel on an event that came from the API
are overwritten by your next `PUT` for that event.

## Quick test with curl

```bash
TOKEN=...   # your LNB_API_TOKEN
BASE=https://bde-teknantes.fr/api/v1

curl -X PUT "$BASE/events/test-123" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test API",
    "description": "Event de test, à supprimer.",
    "location": "Foyer",
    "starts_at": "2026-12-01T19:00:00+01:00",
    "ends_at": "2026-12-01T22:00:00+01:00",
    "url": "https://lnb.bde-teknantes.fr/events/test-123",
    "hidden": true
  }'

curl "$BASE/events/test-123" -H "Authorization: Bearer $TOKEN"

curl -X DELETE "$BASE/events/test-123" -H "Authorization: Bearer $TOKEN"
```

`"hidden": true` keeps the test event off the members' site.

## Example in JavaScript (Node 18+)

```js
const BASE = 'https://bde-teknantes.fr/api/v1';

export async function pushEvent(event) {
  const res = await fetch(`${BASE}/events/${encodeURIComponent(event.id)}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${process.env.LNB_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: event.title,
      description: event.description,
      location: event.place,
      starts_at: event.start.toISOString(),
      ends_at: event.end.toISOString(),
      url: `https://lnb.bde-teknantes.fr/events/${event.id}`,
      images: event.cover ? [event.cover] : [],
      paid: event.price > 0,
      price: event.price > 0 ? event.price : null,
      hidden: !event.published,
    }),
  });

  if (res.status === 422) {
    throw new Error(`Rejected by BDE: ${JSON.stringify((await res.json()).errors)}`);
  }
  if (!res.ok) throw new Error(`BDE API error ${res.status}`); // retry later
  return (await res.json()).data; // data.page_url = page on the BDE site
}
```

## Contact

Token, allowed domains, questions: the BDE office (bde.epitech44@gmail.com).
