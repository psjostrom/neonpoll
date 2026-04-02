# Multi-Poll Support for NeonPoll

## Overview

Transform NeonPoll from a single-poll system to support multiple simultaneous polls, each with its own slug-based URL, admin token, and independent lifecycle.

## Data Model

### KV Key Structure

All keys are namespaced under `neonpoll:poll:{slug}:*`:

- **Poll config:** `neonpoll:poll:{slug}:config`
  ```ts
  {
    title: string          // 1-100 chars
    description: string    // 0-500 chars, supports markdown URLs
    dates: string[]        // 1-30 ISO date strings, sorted
    adminToken: string     // Generated at creation, random string
    createdAt: string      // ISO timestamp
  }
  ```

- **Votes:** `neonpoll:poll:{slug}:votes:{voter_name_lowercase}`
  ```ts
  {
    name: string                              // Original case, 1-50 chars
    votes: Record<string, "yes"|"maybe"|"no"> // date ISO -> vote value
  }
  ```

- **Poll index:** `neonpoll:polls` — KV set of all active slugs (for global admin listing)

### Slug Validation

- Lowercase alphanumeric + hyphens
- 3-50 characters
- Must be unique (checked against index)
- No leading/trailing hyphens

### Auth

Two tiers:

1. **Global admin:** `ADMIN_TOKEN` env var. Full access to all polls.
2. **Poll admin:** `adminToken` stored in poll config. Generated at creation. Access to that poll only.

Both tokens are accepted anywhere poll-level auth is required.

## Routing

### Pages

| Route | Auth | Purpose |
|-------|------|---------|
| `/` | None | Branding splash + "Create a poll" button |
| `/create` | None | Poll creation form |
| `/p/[slug]` | None | Voter page for a specific poll |
| `/p/[slug]/admin?token=...` | Poll or global token | Poll admin panel |
| `/admin?token=...` | Global token | All-polls overview + create new |

### API Routes

| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `POST /api/polls` | POST | None | Create a poll, returns admin token |
| `GET /api/polls` | GET | Global | List all polls |
| `GET /api/polls/[slug]/config` | GET | None | Fetch poll config (token not exposed) |
| `PUT /api/polls/[slug]/config` | PUT | Poll/global | Update poll config |
| `GET /api/polls/[slug]/vote` | GET | None | Fetch one voter's votes |
| `POST /api/polls/[slug]/vote` | POST | None | Submit votes |
| `GET /api/polls/[slug]/votes` | GET | Poll/global | All votes (admin) |
| `DELETE /api/polls/[slug]` | DELETE | Poll/global | Delete poll + all votes |

## User Flows

### Creating a Poll (Public)

1. User lands on `/`, clicks "Create a poll"
2. `/create` form: title (required), slug (required, live availability check), dates (required, calendar picker), description (optional)
3. Submit -> `POST /api/polls` -> generates admin token, stores config, adds slug to poll index
4. Redirect to `/p/{slug}/admin?token={adminToken}`
5. Creator shares `/p/{slug}` with their group

### Creating a Poll (Global Admin)

Same form embedded in `/admin` panel. Same API call. Admin sees the new poll appear in the overview.

### Voting

Same flow as current, scoped to `/p/{slug}`:
- Voter name saved to localStorage keyed by slug: `neonpoll-name-{slug}`
- Previous votes loaded on return
- Dates grouped by ISO week

### Poll Admin

Same as current admin panel but scoped to one poll:
- Config form (title, description, dates)
- Results scoreboard (ranked by yes + 0.5 * maybe)
- Vote matrix grouped by week
- Delete poll (2-step confirm)

### Global Admin (`/admin?token=...`)

- Lists all polls: title, slug, date count, vote count, created date
- Links to each poll's admin page (using global token)
- Create new poll (same form as `/create`)
- Can delete any poll

### Deletion

Poll admin or global admin deletes a poll:
1. Remove all `neonpoll:poll:{slug}:votes:*` keys
2. Remove `neonpoll:poll:{slug}:config`
3. Remove slug from `neonpoll:polls` index

## Migration

Wipe all existing `neonpoll:*` keys on deploy (scan + delete). The old single-poll data uses a different key pattern and there's nothing worth preserving. This gives a clean slate for the new multi-poll system.

## Out of Scope

- Poll archiving/expiry
- Rate limiting on poll creation
- Voter authentication
- Poll templates
