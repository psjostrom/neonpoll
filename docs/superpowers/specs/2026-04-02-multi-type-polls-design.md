# NeonPoll: Multi-Type Polls

## Overview

Extend NeonPoll to support two poll types — date polls (existing Doodle-style) and option polls (Google Forms-style with rich text options) — with configurable voting styles per poll.

## Data Model

### Types

```typescript
type PollType = "date" | "option";
type VotingStyle = "yes-maybe-no" | "single-choice" | "multi-select";
type VoteValue = "yes" | "maybe" | "no";

interface PollOption {
  id: string;           // nanoid or index-based key
  title: string;        // required, max 200 chars
  description?: string; // optional, max 500 chars
}

interface PollConfig {
  type: PollType;
  votingStyle: VotingStyle;
  title: string;          // required, max 100 chars
  description: string;    // optional, max 500 chars
  dates: string[];        // ISO dates, sorted. Used when type === "date". Empty array when type === "option".
  options: PollOption[];  // Used when type === "option". Empty array when type === "date".
  adminToken: string;     // base64url(randomBytes(24))
  createdAt: string;      // ISO timestamp
}
```

No backward compatibility needed — no active polls exist. All fields are required on new polls.

### Vote Storage

Votes remain `Record<string, VoteValue>` keyed by date (for date polls) or option ID (for option polls).

- **yes-maybe-no:** Keys map to `"yes" | "maybe" | "no"` as today.
- **single-choice:** One key with value `"yes"`. All others absent.
- **multi-select:** Selected keys have value `"yes"`. Unselected are absent.

KV key schema unchanged: `neonpoll:poll:{slug}:votes:{name}`.

## Creation Flow

### UI

1. **Type selector** — two toggle buttons at top: "Date Poll" / "Option Poll". Controls which editor section is shown.
2. **Shared fields** — title, slug (with availability check), description. Unchanged from current.
3. **Voting style selector** — three radio-style buttons: "Yes / Maybe / No", "Single Choice", "Multi-Select". Shown for both poll types. Default: yes-maybe-no.
4. **Type-specific editor:**
   - **Date:** Existing `CalendarPicker` component, unchanged.
   - **Option:** Rich option editor:
     - Text input for title (required, max 200 chars)
     - Optional description textarea (max 500 chars)
     - "Add" button
     - Options listed below with delete buttons
     - Min 2, max 30 options

### API Changes

`POST /api/polls` request body adds `type`, `votingStyle`, and `options` fields.

Validation:
- `type` must be `"date"` or `"option"`
- `votingStyle` must be `"yes-maybe-no"`, `"single-choice"`, or `"multi-select"`
- If `type === "date"`: `dates` required (1-30 items), `options` must be empty or absent
- If `type === "option"`: `options` required (2-30 items, each with valid title), `dates` must be empty or absent

`GET /api/polls/[slug]/config` response includes all new fields (except adminToken, as before).

`PUT /api/polls/[slug]/config` accepts updated options/dates and votingStyle. Type is immutable after creation.

## Voter Experience

### URL & Page

Voter page stays at `/p/[slug]`. The page reads `type` and `votingStyle` from the poll config and adapts the UI.

### Vote UI by Voting Style

**Yes / Maybe / No (any type):**
- Current three-button UX per item (YES green, MEH yellow, NO red)
- Date polls: items are formatted dates grouped by ISO week
- Option polls: items show option title + description (if present)

**Single Choice (any type):**
- Radio-button style — selecting one deselects any previous selection
- Visual: styled radio buttons matching the synthwave theme
- Submit sends one key with `"yes"`

**Multi-Select (any type):**
- Checkbox style — toggle each item on/off independently
- Visual: styled checkboxes matching the synthwave theme
- Submit sends selected keys with `"yes"`

### Vote Submission

`POST /api/polls/[slug]/vote` unchanged in shape (`{ name, votes }`). Server validates:
- Keys must match poll's dates (date polls) or option IDs (option polls)
- For single-choice: at most one key allowed
- Values must be valid for the voting style (yes/maybe/no for three-state, only "yes" for single/multi)

## Results Display

### Summary Visualization (top of results section)

**Yes-maybe-no:** Ranked scoreboard as today — items sorted by score (yes count + 0.5 * maybe count). Top scorer highlighted.

**Single-choice / Multi-select:** Horizontal bar chart per item, sorted by vote count descending. Bar width proportional to max votes. Count label on each bar.

### Detailed Table (below summary)

Same structure as today: rows = voter names, columns = items (dates or options).

- **Yes-maybe-no:** Cells show checkmark / question mark / x / dash
- **Single-choice / Multi-select:** Cells show checkmark / dash

Summary row at bottom shows totals. Best item highlighted.

## Admin Panel

### Config Editor

Adapts to poll type:
- **Date poll:** Shows calendar picker (existing)
- **Option poll:** Shows rich option editor (add/remove/edit options)
- **Voting style:** Editable dropdown/selector. Changing mid-poll shows a warning ("Existing votes may not match the new style").
- **Type:** Displayed but not editable (immutable after creation)

### Results Section

Uses the new summary visualization + detailed table layout described above.

### Poll Listing (Global Admin)

Poll cards show type badge ("Date" / "Option") and voting style alongside existing info (title, date/option count, vote count, created date).

## Components

### New Components

- `OptionEditor` — rich option list editor (add title + description, list with delete)
- `VotingStyleSelector` — three-option radio group for voting style
- `PollTypeSelector` — two-option toggle for date vs option
- `BarChart` — horizontal bar chart for single-choice/multi-select results

### Modified Components

- `CalendarPicker` — no changes needed
- Create page — type selector, conditional rendering of date/option editors, voting style selector
- Voter page — conditional rendering based on type + votingStyle
- Admin panel — conditional config editor, new results visualization
- Global admin — type badge in poll listing

## Open API

The API is designed for programmatic use by external agents and scripts. No API key needed for creation — the returned `adminToken` serves as the credential for managing the poll.

### Endpoints

**Create a poll:**
```
POST /api/polls
Content-Type: application/json

{
  "type": "option",
  "votingStyle": "single-choice",
  "title": "Team Activity Vote",
  "slug": "team-activity-q2",
  "description": "Pick your preferred activity",
  "options": [
    { "title": "Bowling", "description": "At Kungsholmen lanes" },
    { "title": "Escape Room", "description": "Mystery Manor, 60 min" },
    { "title": "Cooking Class" }
  ]
}

→ 201 { "slug": "team-activity-q2", "adminToken": "abc123...", "voterUrl": "/p/team-activity-q2", "adminUrl": "/p/team-activity-q2/admin?token=abc123..." }
```

Response includes `voterUrl` and `adminUrl` so the calling agent can immediately share the poll link or manage it.

**Read poll config (public):**
```
GET /api/polls/{slug}/config
→ 200 { type, votingStyle, title, description, dates, options, createdAt }
```

**Read results (requires admin token):**
```
GET /api/polls/{slug}/votes?token={adminToken}
→ 200 { votes: [...], summary: { ... } }
```

The `summary` field is new — it returns pre-computed results so the calling agent doesn't need to calculate scores:
- **yes-maybe-no:** `{ ranked: [{ id, title, yesCount, maybeCount, noCount, score }] }`
- **single-choice / multi-select:** `{ ranked: [{ id, title, voteCount }] }`

Sorted by score/count descending.

**Submit a vote (public):**
```
POST /api/polls/{slug}/vote
Content-Type: application/json

{ "name": "Alice", "votes": { "option-id-1": "yes" } }
→ 200 { "ok": true }
```

**Delete a poll:**
```
DELETE /api/polls/{slug}?token={adminToken}
→ 200 { "ok": true }
```

### Error Responses

All errors return JSON: `{ "error": "message" }` with appropriate HTTP status codes (400 validation, 404 not found, 401 unauthorized, 409 conflict).

### Design Principles

- No API keys or registration. Create is open; manage via the returned adminToken.
- All endpoints accept and return JSON.
- The voter URL and admin URL in the create response are relative paths — the calling agent prepends the host.
- The summary endpoint saves agents from having to reimplement scoring logic.

## Unchanged

- Auth model (global admin token + per-poll admin tokens)
- KV key schema (poll index, config, votes)
- URL structure (`/p/[slug]`, `/p/[slug]/admin`)
- localStorage voter name caching
- Slug validation rules
- Synthwave theme and visual identity
