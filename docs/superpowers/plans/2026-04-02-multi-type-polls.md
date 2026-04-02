# Multi-Type Polls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add option polls (Google Forms-style) alongside existing date polls, with configurable voting styles (yes/maybe/no, single-choice, multi-select) and an open API for external agents.

**Architecture:** Extend the existing PollConfig with `type`, `votingStyle`, and `options` fields. All poll types share the same KV schema, auth model, and URL structure. The UI components branch on poll type and voting style. Vote storage format stays the same — interpretation changes per voting style.

**Tech Stack:** Next.js 16, TypeScript, Vercel KV, React 19, CSS (synthwave theme)

**Spec:** `docs/superpowers/specs/2026-04-02-multi-type-polls-design.md`

---

## File Structure

### New files
- `src/app/components/PollTypeSelector.tsx` — two-button toggle: Date Poll / Option Poll
- `src/app/components/VotingStyleSelector.tsx` — three-option radio: yes-maybe-no / single-choice / multi-select
- `src/app/components/OptionEditor.tsx` — rich option list editor (title + description, add/delete)
- `src/app/components/BarChart.tsx` — horizontal bar chart for single-choice/multi-select results
- `src/lib/summary.ts` — result summary computation (shared by API and admin)

### Modified files
- `src/lib/types.ts` — new types: PollType, VotingStyle, PollOption; updated PollConfig, PollSummary
- `src/app/api/polls/route.ts` — POST: accept new fields, return voterUrl/adminUrl. GET: include type in summary
- `src/app/api/polls/[slug]/config/route.ts` — PUT: type-branched validation, type immutability
- `src/app/api/polls/[slug]/vote/route.ts` — POST: validate by voting style (single-choice constraint, value restrictions)
- `src/app/api/polls/[slug]/votes/route.ts` — GET: include pre-computed summary
- `src/app/create/page.tsx` — type selector, voting style selector, conditional date/option editor
- `src/app/p/[slug]/page.tsx` — voting UI branching by type + votingStyle
- `src/app/p/[slug]/admin/AdminPanel.tsx` — config editor branching, bar chart results, type badge
- `src/app/admin/GlobalAdmin.tsx` — type badge in listing, type/voting style in create form
- `src/app/globals.css` — styles for new components (type selector, voting style, option editor, bar chart, option cards)

---

### Task 1: Update Types

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Update type definitions**

Replace the entire contents of `src/lib/types.ts`:

```typescript
export type PollType = "date" | "option";
export type VotingStyle = "yes-maybe-no" | "single-choice" | "multi-select";
export type VoteValue = "yes" | "maybe" | "no";

export interface PollOption {
  id: string;
  title: string;
  description?: string;
}

export interface PollConfig {
  type: PollType;
  votingStyle: VotingStyle;
  title: string;
  description: string;
  dates: string[];
  options: PollOption[];
  adminToken: string;
  createdAt: string;
}

export interface Vote {
  name: string;
  votes: Record<string, VoteValue>;
}

export interface PollSummary {
  slug: string;
  title: string;
  description: string;
  type: PollType;
  votingStyle: VotingStyle;
  itemCount: number;
  voteCount: number;
  createdAt: string;
}

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/;

export function isValidSlug(slug: string): boolean {
  return SLUG_REGEX.test(slug);
}

export function getIsoWeek(iso: string): number {
  const d = new Date(iso + "T12:00:00");
  const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  utc.setUTCDate(utc.getUTCDate() + 4 - (utc.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  return Math.ceil(((utc.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export function formatDate(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    weekday: "short",
  });
}

export function getValidKeys(config: PollConfig): Set<string> {
  if (config.type === "date") return new Set(config.dates);
  return new Set(config.options.map((o) => o.id));
}

export function generateOptionId(): string {
  return Math.random().toString(36).slice(2, 10);
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -30`

Expected: Type errors in files that reference the old PollConfig shape (this is expected — we'll fix them in subsequent tasks).

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add poll type, voting style, and option types"
```

---

### Task 2: Create Summary Helper

**Files:**
- Create: `src/lib/summary.ts`

- [ ] **Step 1: Create the summary computation module**

```typescript
import type { PollConfig, Vote, VoteValue } from "./types";

export interface RankedItem {
  id: string;
  title: string;
  voteCount: number;
  yesCount?: number;
  maybeCount?: number;
  noCount?: number;
  score?: number;
}

export function computeSummary(
  config: PollConfig,
  votes: Vote[]
): { ranked: RankedItem[] } {
  const items =
    config.type === "date"
      ? config.dates.map((d) => ({ id: d, title: d }))
      : config.options.map((o) => ({ id: o.id, title: o.title }));

  if (config.votingStyle === "yes-maybe-no") {
    const ranked = items
      .map((item) => {
        const yesCount = votes.filter((v) => v.votes[item.id] === "yes").length;
        const maybeCount = votes.filter((v) => v.votes[item.id] === "maybe").length;
        const noCount = votes.filter((v) => v.votes[item.id] === "no").length;
        const score = yesCount + maybeCount * 0.5;
        return { ...item, voteCount: yesCount, yesCount, maybeCount, noCount, score };
      })
      .sort((a, b) => b.score! - a.score! || b.yesCount! - a.yesCount!);
    return { ranked };
  }

  // single-choice and multi-select: count "yes" votes per item
  const ranked = items
    .map((item) => {
      const voteCount = votes.filter((v) => v.votes[item.id] === "yes").length;
      return { ...item, voteCount };
    })
    .sort((a, b) => b.voteCount - a.voteCount);
  return { ranked };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/summary.ts
git commit -m "feat: add result summary computation helper"
```

---

### Task 3: Update API — Create Poll

**Files:**
- Modify: `src/app/api/polls/route.ts`

- [ ] **Step 1: Rewrite the POST handler**

Replace the entire `POST` function in `src/app/api/polls/route.ts`:

```typescript
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { slug, title, description, type, votingStyle, dates, options } = body as {
    slug?: string;
    title?: string;
    description?: string;
    type?: string;
    votingStyle?: string;
    dates?: string[];
    options?: { title?: string; description?: string }[];
  };

  if (!slug || typeof slug !== "string" || !isValidSlug(slug)) {
    return NextResponse.json(
      { error: "slug required, 3-50 chars, lowercase alphanumeric + hyphens, no leading/trailing hyphens" },
      { status: 400 }
    );
  }

  if (!title || typeof title !== "string" || title.trim().length === 0 || title.length > 100) {
    return NextResponse.json({ error: "title required, max 100 chars" }, { status: 400 });
  }

  if (description && (typeof description !== "string" || description.length > 500)) {
    return NextResponse.json({ error: "description max 500 chars" }, { status: 400 });
  }

  if (type !== "date" && type !== "option") {
    return NextResponse.json({ error: "type must be 'date' or 'option'" }, { status: 400 });
  }

  const validStyles: VotingStyle[] = ["yes-maybe-no", "single-choice", "multi-select"];
  if (!votingStyle || !validStyles.includes(votingStyle as VotingStyle)) {
    return NextResponse.json(
      { error: "votingStyle must be 'yes-maybe-no', 'single-choice', or 'multi-select'" },
      { status: 400 }
    );
  }

  let validatedDates: string[] = [];
  let validatedOptions: PollOption[] = [];

  if (type === "date") {
    if (!Array.isArray(dates) || dates.length === 0 || dates.length > 30) {
      return NextResponse.json({ error: "dates required for date polls, 1-30 items" }, { status: 400 });
    }
    const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dates.every((d) => typeof d === "string" && isoDateRegex.test(d))) {
      return NextResponse.json({ error: "dates must be ISO date strings (YYYY-MM-DD)" }, { status: 400 });
    }
    validatedDates = [...dates].sort();
  } else {
    if (!Array.isArray(options) || options.length < 2 || options.length > 30) {
      return NextResponse.json({ error: "options required for option polls, 2-30 items" }, { status: 400 });
    }
    for (const opt of options) {
      if (!opt.title || typeof opt.title !== "string" || opt.title.trim().length === 0 || opt.title.length > 200) {
        return NextResponse.json({ error: "each option needs a title, max 200 chars" }, { status: 400 });
      }
      if (opt.description && (typeof opt.description !== "string" || opt.description.length > 500)) {
        return NextResponse.json({ error: "option description max 500 chars" }, { status: 400 });
      }
    }
    validatedOptions = options.map((opt) => ({
      id: generateOptionId(),
      title: opt.title!.trim(),
      ...(opt.description?.trim() ? { description: opt.description.trim() } : {}),
    }));
  }

  if (await isPollSlugTaken(slug)) {
    return NextResponse.json({ error: "slug already taken" }, { status: 409 });
  }

  const adminToken = generateAdminToken();
  const config: PollConfig = {
    type: type as PollType,
    votingStyle: votingStyle as VotingStyle,
    title: title.trim(),
    description: (description || "").trim(),
    dates: validatedDates,
    options: validatedOptions,
    adminToken,
    createdAt: new Date().toISOString(),
  };

  await setConfig(slug, config);
  await addPollToIndex(slug);

  return NextResponse.json(
    {
      slug,
      adminToken,
      voterUrl: `/p/${slug}`,
      adminUrl: `/p/${slug}/admin?token=${adminToken}`,
    },
    { status: 201 }
  );
}
```

- [ ] **Step 2: Update the imports at the top of the file**

The imports should be:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getConfig, setConfig, addPollToIndex, isPollSlugTaken, getAllPollSlugs, getAllVotes } from "@/lib/kv";
import { validateGlobalToken, generateAdminToken } from "@/lib/auth";
import { isValidSlug, generateOptionId } from "@/lib/types";
import type { PollConfig, PollSummary, PollOption, PollType, VotingStyle } from "@/lib/types";
```

- [ ] **Step 3: Update the GET handler**

Replace the GET function to include type info in summaries:

```typescript
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!validateGlobalToken(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const slugs = await getAllPollSlugs();
  const polls: PollSummary[] = [];

  for (const slug of slugs) {
    const config = await getConfig(slug);
    if (!config) continue;
    const votes = await getAllVotes(slug);
    polls.push({
      slug,
      title: config.title,
      description: config.description,
      type: config.type,
      votingStyle: config.votingStyle,
      itemCount: config.type === "date" ? config.dates.length : config.options.length,
      voteCount: votes.length,
      createdAt: config.createdAt,
    });
  }

  polls.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return NextResponse.json({ polls });
}
```

- [ ] **Step 4: Verify the file compiles**

Run: `npx tsc --noEmit src/app/api/polls/route.ts 2>&1 | head -20`

- [ ] **Step 5: Commit**

```bash
git add src/app/api/polls/route.ts
git commit -m "feat: update create poll API for multi-type polls with open API response"
```

---

### Task 4: Update API — Config PUT

**Files:**
- Modify: `src/app/api/polls/[slug]/config/route.ts`

- [ ] **Step 1: Rewrite the PUT handler**

Replace the `PUT` function:

```typescript
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const token = request.nextUrl.searchParams.get("token");

  const existing = await getConfig(slug);
  if (!existing) {
    return NextResponse.json({ error: "Poll not found" }, { status: 404 });
  }

  if (!validatePollToken(token, existing.adminToken)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const update = body as Record<string, unknown>;

  if (!update.title || typeof update.title !== "string" || (update.title as string).length > 100) {
    return NextResponse.json({ error: "title required, max 100 chars" }, { status: 400 });
  }

  if (update.description && (typeof update.description !== "string" || (update.description as string).length > 500)) {
    return NextResponse.json({ error: "description max 500 chars" }, { status: 400 });
  }

  // votingStyle can be changed
  const validStyles = ["yes-maybe-no", "single-choice", "multi-select"];
  const votingStyle = update.votingStyle && validStyles.includes(update.votingStyle as string)
    ? (update.votingStyle as VotingStyle)
    : existing.votingStyle;

  // type is immutable
  let validatedDates = existing.dates;
  let validatedOptions = existing.options;

  if (existing.type === "date") {
    const dates = update.dates as string[] | undefined;
    if (!Array.isArray(dates) || dates.length === 0 || dates.length > 30) {
      return NextResponse.json({ error: "dates required, 1-30 items" }, { status: 400 });
    }
    const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dates.every((d) => typeof d === "string" && isoDateRegex.test(d))) {
      return NextResponse.json({ error: "dates must be ISO date strings (YYYY-MM-DD)" }, { status: 400 });
    }
    validatedDates = [...dates].sort();
  } else {
    const options = update.options as { id?: string; title?: string; description?: string }[] | undefined;
    if (!Array.isArray(options) || options.length < 2 || options.length > 30) {
      return NextResponse.json({ error: "options required, 2-30 items" }, { status: 400 });
    }
    for (const opt of options) {
      if (!opt.title || typeof opt.title !== "string" || opt.title.trim().length === 0 || opt.title.length > 200) {
        return NextResponse.json({ error: "each option needs a title, max 200 chars" }, { status: 400 });
      }
      if (opt.description && (typeof opt.description !== "string" || opt.description.length > 500)) {
        return NextResponse.json({ error: "option description max 500 chars" }, { status: 400 });
      }
    }
    validatedOptions = options.map((opt) => ({
      id: opt.id || generateOptionId(),
      title: opt.title!.trim(),
      ...(opt.description?.trim() ? { description: opt.description.trim() } : {}),
    }));
  }

  const validated: PollConfig = {
    type: existing.type,
    votingStyle,
    title: (update.title as string).trim(),
    description: ((update.description as string) || "").trim(),
    dates: validatedDates,
    options: validatedOptions,
    adminToken: existing.adminToken,
    createdAt: existing.createdAt,
  };

  await setConfig(slug, validated);
  const { adminToken: _, ...publicConfig } = validated;
  return NextResponse.json(publicConfig);
}
```

- [ ] **Step 2: Update imports**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getConfig, setConfig } from "@/lib/kv";
import { validatePollToken } from "@/lib/auth";
import { generateOptionId } from "@/lib/types";
import type { PollConfig, VotingStyle } from "@/lib/types";
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/polls/[slug]/config/route.ts
git commit -m "feat: config PUT supports option polls and voting style changes"
```

---

### Task 5: Update API — Vote Submission

**Files:**
- Modify: `src/app/api/polls/[slug]/vote/route.ts`

- [ ] **Step 1: Rewrite the POST handler**

Replace the `POST` function:

```typescript
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { name, votes } = body as { name?: string; votes?: Record<string, string> };

  if (!name || typeof name !== "string" || name.trim().length === 0 || name.trim().length > 50) {
    return NextResponse.json({ error: "name required, max 50 chars" }, { status: 400 });
  }

  if (!votes || typeof votes !== "object") {
    return NextResponse.json({ error: "votes required" }, { status: 400 });
  }

  const config = await getConfig(slug);
  if (!config) {
    return NextResponse.json({ error: "Poll not found" }, { status: 404 });
  }

  const validKeys = getValidKeys(config);
  const filteredVotes: Record<string, VoteValue> = {};

  if (config.votingStyle === "yes-maybe-no") {
    for (const [key, value] of Object.entries(votes)) {
      if (validKeys.has(key) && VALID_VALUES.includes(value as VoteValue)) {
        filteredVotes[key] = value as VoteValue;
      }
    }
  } else if (config.votingStyle === "single-choice") {
    // Only allow one "yes" vote
    let picked = false;
    for (const [key, value] of Object.entries(votes)) {
      if (validKeys.has(key) && value === "yes" && !picked) {
        filteredVotes[key] = "yes";
        picked = true;
      }
    }
  } else {
    // multi-select: only "yes" values allowed
    for (const [key, value] of Object.entries(votes)) {
      if (validKeys.has(key) && value === "yes") {
        filteredVotes[key] = "yes";
      }
    }
  }

  const vote: Vote = {
    name: name.trim(),
    votes: filteredVotes,
  };

  await setVote(slug, vote);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Update imports**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getConfig, getVote, setVote } from "@/lib/kv";
import { getValidKeys } from "@/lib/types";
import type { Vote, VoteValue } from "@/lib/types";

const VALID_VALUES: VoteValue[] = ["yes", "maybe", "no"];
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/polls/[slug]/vote/route.ts
git commit -m "feat: vote submission validates by voting style"
```

---

### Task 6: Update API — Votes (Results with Summary)

**Files:**
- Modify: `src/app/api/polls/[slug]/votes/route.ts`

- [ ] **Step 1: Add summary to the response**

Replace the entire file:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getConfig, getAllVotes } from "@/lib/kv";
import { validatePollToken } from "@/lib/auth";
import { computeSummary } from "@/lib/summary";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const token = request.nextUrl.searchParams.get("token");

  const config = await getConfig(slug);
  if (!config) {
    return NextResponse.json({ error: "Poll not found" }, { status: 404 });
  }

  if (!validatePollToken(token, config.adminToken)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const votes = await getAllVotes(slug);
  const summary = computeSummary(config, votes);

  return NextResponse.json({ votes, summary });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/polls/[slug]/votes/route.ts
git commit -m "feat: votes endpoint returns pre-computed summary"
```

---

### Task 7: Verify All APIs Compile

- [ ] **Step 1: Run TypeScript check**

Run: `npx tsc --noEmit 2>&1 | head -40`

Expected: Errors only in the UI files (create page, voter page, admin panel, global admin) which still use the old PollConfig shape. All API routes and lib files should be clean.

- [ ] **Step 2: Fix any API compilation errors before proceeding**

---

### Task 8: New Components — PollTypeSelector

**Files:**
- Create: `src/app/components/PollTypeSelector.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import type { PollType } from "@/lib/types";

export function PollTypeSelector({
  value,
  onChange,
}: {
  value: PollType;
  onChange: (type: PollType) => void;
}) {
  return (
    <div className="type-selector">
      <button
        className={`type-btn${value === "date" ? " type-active" : ""}`}
        onClick={() => onChange("date")}
        type="button"
      >
        DATE POLL
      </button>
      <button
        className={`type-btn${value === "option" ? " type-active" : ""}`}
        onClick={() => onChange("option")}
        type="button"
      >
        OPTION POLL
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Add CSS to globals.css**

Append to `src/app/globals.css`:

```css
/* Poll type selector */
.type-selector {
  display: flex;
  gap: 0;
  margin-bottom: 20px;
  border: 1px solid var(--neon-purple);
  border-radius: 4px;
  overflow: hidden;
}

.type-btn {
  flex: 1;
  background: transparent;
  border: none;
  color: #9090a0;
  padding: 12px 16px;
  font-family: inherit;
  font-size: 0.85rem;
  letter-spacing: 3px;
  cursor: pointer;
  transition: all 0.15s;
  text-transform: uppercase;
}

.type-btn:not(:last-child) {
  border-right: 1px solid var(--neon-purple);
}

.type-btn:hover {
  color: #fff;
  background: rgba(155, 93, 229, 0.15);
}

.type-btn.type-active {
  background: linear-gradient(90deg, var(--neon-pink), var(--neon-purple));
  color: #fff;
  text-shadow: 0 0 8px rgba(255, 110, 199, 0.5);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/components/PollTypeSelector.tsx src/app/globals.css
git commit -m "feat: add PollTypeSelector component"
```

---

### Task 9: New Components — VotingStyleSelector

**Files:**
- Create: `src/app/components/VotingStyleSelector.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import type { VotingStyle } from "@/lib/types";

const STYLES: { value: VotingStyle; label: string; desc: string }[] = [
  { value: "yes-maybe-no", label: "YES / MAYBE / NO", desc: "Three-state per option" },
  { value: "single-choice", label: "SINGLE CHOICE", desc: "Pick exactly one" },
  { value: "multi-select", label: "MULTI-SELECT", desc: "Check all that apply" },
];

export function VotingStyleSelector({
  value,
  onChange,
}: {
  value: VotingStyle;
  onChange: (style: VotingStyle) => void;
}) {
  return (
    <div className="style-selector">
      {STYLES.map((s) => (
        <button
          key={s.value}
          className={`style-btn${value === s.value ? " style-active" : ""}`}
          onClick={() => onChange(s.value)}
          type="button"
        >
          <span className="style-label">{s.label}</span>
          <span className="style-desc">{s.desc}</span>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Add CSS to globals.css**

Append to `src/app/globals.css`:

```css
/* Voting style selector */
.style-selector {
  display: flex;
  gap: 10px;
  margin-bottom: 14px;
}

.style-btn {
  flex: 1;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(155, 93, 229, 0.4);
  border-radius: 6px;
  padding: 12px 10px;
  cursor: pointer;
  transition: all 0.15s;
  text-align: center;
}

.style-btn:hover {
  border-color: var(--neon-cyan);
}

.style-btn.style-active {
  border-color: var(--neon-cyan);
  background: rgba(92, 255, 250, 0.08);
  box-shadow: 0 0 12px rgba(92, 255, 250, 0.15);
}

.style-label {
  display: block;
  color: var(--neon-cyan);
  font-family: inherit;
  font-size: 0.75rem;
  letter-spacing: 2px;
  margin-bottom: 4px;
}

.style-active .style-label {
  text-shadow: 0 0 8px rgba(92, 255, 250, 0.4);
}

.style-desc {
  display: block;
  color: #9090a0;
  font-family: inherit;
  font-size: 0.7rem;
  letter-spacing: 1px;
}

@media (max-width: 600px) {
  .style-selector {
    flex-direction: column;
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/components/VotingStyleSelector.tsx src/app/globals.css
git commit -m "feat: add VotingStyleSelector component"
```

---

### Task 10: New Components — OptionEditor

**Files:**
- Create: `src/app/components/OptionEditor.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useState } from "react";
import type { PollOption } from "@/lib/types";
import { generateOptionId } from "@/lib/types";

export function OptionEditor({
  options,
  onChange,
}: {
  options: PollOption[];
  onChange: (options: PollOption[]) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  function handleAdd() {
    if (!title.trim() || options.length >= 30) return;
    onChange([
      ...options,
      {
        id: generateOptionId(),
        title: title.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
      },
    ]);
    setTitle("");
    setDescription("");
  }

  function handleRemove(id: string) {
    onChange(options.filter((o) => o.id !== id));
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd();
    }
  }

  return (
    <div>
      <div className="option-add-form">
        <input
          type="text"
          placeholder="Option title..."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={200}
        />
        <textarea
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={500}
          rows={1}
        />
        <button
          className="btn-primary btn-small"
          onClick={handleAdd}
          disabled={!title.trim() || options.length >= 30}
          type="button"
        >
          ADD
        </button>
      </div>

      {options.length > 0 && (
        <div className="option-list">
          {options.map((opt, i) => (
            <div key={opt.id} className="option-item">
              <span className="option-num">{i + 1}</span>
              <div className="option-info">
                <span className="option-title">{opt.title}</span>
                {opt.description && (
                  <span className="option-desc">{opt.description}</span>
                )}
              </div>
              <button
                className="option-remove"
                onClick={() => handleRemove(opt.id)}
                type="button"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add CSS to globals.css**

Append to `src/app/globals.css`:

```css
/* Option editor */
.option-add-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}

.option-add-form textarea {
  resize: vertical;
  min-height: 36px;
}

.option-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.option-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(155, 93, 229, 0.3);
  border-radius: 6px;
}

.option-num {
  color: var(--neon-pink);
  font-size: 0.8rem;
  font-weight: bold;
  width: 20px;
  text-align: center;
  flex-shrink: 0;
}

.option-info {
  flex: 1;
  min-width: 0;
}

.option-title {
  display: block;
  color: var(--neon-cyan);
  font-size: 0.9rem;
  letter-spacing: 1px;
}

.option-desc {
  display: block;
  color: #9090a0;
  font-size: 0.75rem;
  margin-top: 2px;
}

.option-remove {
  background: none;
  border: none;
  color: var(--vote-no);
  font-size: 1.2rem;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
  transition: text-shadow 0.15s;
  flex-shrink: 0;
}

.option-remove:hover {
  text-shadow: 0 0 8px rgba(255, 0, 64, 0.5);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/components/OptionEditor.tsx src/app/globals.css
git commit -m "feat: add OptionEditor component"
```

---

### Task 11: New Components — BarChart

**Files:**
- Create: `src/app/components/BarChart.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

export function BarChart({
  items,
}: {
  items: { label: string; count: number }[];
}) {
  const maxCount = Math.max(...items.map((i) => i.count), 1);
  const topCount = items[0]?.count ?? 0;

  return (
    <div className="bar-chart">
      {items.map((item, i) => (
        <div
          key={i}
          className={`bar-row${item.count === topCount && topCount > 0 ? " bar-top" : ""}`}
        >
          <span className="bar-rank">{i + 1}</span>
          <span className="bar-label">{item.label}</span>
          <span className="bar-track">
            <span
              className="bar-fill"
              style={{ width: `${(item.count / maxCount) * 100}%` }}
            />
          </span>
          <span className="bar-count">{item.count}</span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Add CSS to globals.css**

Append to `src/app/globals.css`:

```css
/* Bar chart (results) */
.bar-chart {
  margin-bottom: 24px;
}

.bar-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid rgba(155, 93, 229, 0.15);
}

.bar-top .bar-label {
  color: var(--vote-yes);
  text-shadow: 0 0 8px rgba(57, 255, 112, 0.4);
}

.bar-rank {
  color: var(--neon-pink);
  font-size: 0.8rem;
  font-weight: bold;
  width: 24px;
  text-align: center;
  flex-shrink: 0;
}

.bar-label {
  color: var(--neon-cyan);
  font-size: 0.9rem;
  width: 160px;
  flex-shrink: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bar-track {
  flex: 1;
  min-width: 0;
  height: 6px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 3px;
  overflow: hidden;
}

.bar-fill {
  display: block;
  height: 100%;
  background: var(--neon-cyan);
  border-radius: 3px;
  transition: width 0.3s;
}

.bar-top .bar-fill {
  background: var(--vote-yes);
}

.bar-count {
  color: #e0e0e0;
  font-size: 0.8rem;
  width: 40px;
  text-align: right;
  flex-shrink: 0;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/components/BarChart.tsx src/app/globals.css
git commit -m "feat: add BarChart component for poll results"
```

---

### Task 12: Update Create Page

**Files:**
- Modify: `src/app/create/page.tsx`

- [ ] **Step 1: Rewrite the create page**

Replace the entire file:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPicker } from "@/app/components/CalendarPicker";
import { PollTypeSelector } from "@/app/components/PollTypeSelector";
import { VotingStyleSelector } from "@/app/components/VotingStyleSelector";
import { OptionEditor } from "@/app/components/OptionEditor";
import { formatDate } from "@/lib/types";
import type { PollType, VotingStyle, PollOption } from "@/lib/types";

export default function CreatePollPage() {
  const router = useRouter();
  const [pollType, setPollType] = useState<PollType>("date");
  const [votingStyle, setVotingStyle] = useState<VotingStyle>("yes-maybe-no");
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [dates, setDates] = useState<string[]>([]);
  const [options, setOptions] = useState<PollOption[]>([]);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [slugStatus, setSlugStatus] = useState<"idle" | "checking" | "available" | "taken">("idle");

  function handleSlugChange(value: string) {
    const cleaned = value.toLowerCase().replace(/[^a-z0-9-]/g, "").replace(/--+/g, "-");
    setSlug(cleaned);
    setSlugStatus("idle");
  }

  async function checkSlug() {
    if (slug.length < 3) return;
    setSlugStatus("checking");
    try {
      const res = await fetch(`/api/polls/${encodeURIComponent(slug)}/config`);
      setSlugStatus(res.status === 404 ? "available" : "taken");
    } catch {
      setSlugStatus("idle");
    }
  }

  const canCreate =
    title.trim() &&
    slug.length >= 3 &&
    (pollType === "date" ? dates.length > 0 : options.length >= 2);

  async function handleCreate() {
    setError("");
    setCreating(true);
    try {
      const body: Record<string, unknown> = {
        type: pollType,
        votingStyle,
        slug,
        title,
        description,
      };
      if (pollType === "date") {
        body.dates = dates;
        body.options = [];
      } else {
        body.options = options.map((o) => ({
          title: o.title,
          ...(o.description ? { description: o.description } : {}),
        }));
        body.dates = [];
      }

      const res = await fetch("/api/polls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Something went wrong");
        setCreating(false);
        return;
      }
      const data = await res.json();
      router.push(data.adminUrl);
    } catch {
      setError("Network error. Try again.");
      setCreating(false);
    }
  }

  return (
    <div className="container">
      <div className="sun" />
      <h1 className="title">NEONPOLL</h1>
      <p className="subtitle">CREATE A NEW POLL</p>

      <div className="admin-section" style={{ marginTop: 20 }}>
        <div className="form-group">
          <label>Poll Type</label>
          <PollTypeSelector value={pollType} onChange={setPollType} />
        </div>

        <div className="form-group">
          <label>Event Title</label>
          <input
            type="text"
            placeholder={pollType === "date" ? "Friday dinner?" : "Best team activity?"}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={100}
          />
        </div>

        <div className="form-group">
          <label>Poll URL Slug</label>
          <input
            type="text"
            placeholder={pollType === "date" ? "friday-dinner" : "team-activity"}
            value={slug}
            onChange={(e) => handleSlugChange(e.target.value)}
            onBlur={checkSlug}
            maxLength={50}
          />
          {slugStatus === "checking" && (
            <span className="slug-status" style={{ color: "#9090a0" }}>Checking...</span>
          )}
          {slugStatus === "available" && (
            <span className="slug-status success">Available</span>
          )}
          {slugStatus === "taken" && (
            <span className="slug-status error">Already taken</span>
          )}
          {slug && (
            <span className="slug-preview">
              neonpoll.vercel.app/p/{slug}
            </span>
          )}
        </div>

        <div className="form-group">
          <label>Description (optional)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
            rows={2}
          />
        </div>

        <div className="form-group">
          <label>Voting Style</label>
          <VotingStyleSelector value={votingStyle} onChange={setVotingStyle} />
        </div>

        {pollType === "date" ? (
          <>
            <div className="form-group">
              <label>Select Dates</label>
              <CalendarPicker selected={dates} onChange={setDates} />
            </div>
            {dates.length > 0 && (
              <div className="date-chips">
                {dates.map((date) => (
                  <span key={date} className="date-chip">
                    {formatDate(date)}
                    <button onClick={() => setDates(dates.filter((d) => d !== date))}>&times;</button>
                  </span>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="form-group">
            <label>Options ({options.length}/30)</label>
            <OptionEditor options={options} onChange={setOptions} />
          </div>
        )}

        <div style={{ marginTop: 16 }}>
          <button
            className="btn-primary"
            onClick={handleCreate}
            disabled={creating || !canCreate}
          >
            {creating ? "CREATING..." : "CREATE POLL"}
          </button>
          {error && <p className="error">{error}</p>}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/create/page.tsx
git commit -m "feat: create page supports date and option polls with voting style"
```

---

### Task 13: Update Voter Page

**Files:**
- Modify: `src/app/p/[slug]/page.tsx`

- [ ] **Step 1: Rewrite the voter page**

Replace the entire file:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { formatDate, getIsoWeek } from "@/lib/types";
import type { PollConfig, Vote, VoteValue } from "@/lib/types";

export default function VotingPage() {
  const { slug } = useParams<{ slug: string }>();
  const [config, setConfig] = useState<PollConfig | null>(null);
  const [name, setName] = useState("");
  const [votes, setVotes] = useState<Record<string, VoteValue>>({});
  const [loading, setLoading] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/polls/${encodeURIComponent(slug)}/config`);
        if (res.status === 404) {
          setNotFound(true);
          return;
        }
        const data = await res.json();
        setConfig(data);

        const savedName = localStorage.getItem(`neonpoll-name-${slug}`);
        if (savedName) {
          setName(savedName);
          const voteRes = await fetch(
            `/api/polls/${encodeURIComponent(slug)}/vote?name=${encodeURIComponent(savedName)}`
          );
          if (voteRes.ok) {
            const prev: Vote = await voteRes.json();
            setVotes(prev.votes);
          }
        }
      } catch {
        // config fetch failed
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [slug]);

  async function handleSubmit() {
    setError("");
    try {
      const res = await fetch(`/api/polls/${encodeURIComponent(slug)}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), votes }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Something went wrong");
        return;
      }
      localStorage.setItem(`neonpoll-name-${slug}`, name.trim());
      setSubmitted(true);
    } catch {
      setError("Network error. Try again.");
    }
  }

  function toggleYesMaybeNo(key: string, value: VoteValue) {
    setVotes((prev) => {
      if (prev[key] === value) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: value };
    });
  }

  function toggleSingleChoice(key: string) {
    setVotes((prev) => {
      if (prev[key] === "yes") {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { [key]: "yes" as VoteValue };
    });
  }

  function toggleMultiSelect(key: string) {
    setVotes((prev) => {
      if (prev[key] === "yes") {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: "yes" as VoteValue };
    });
  }

  if (loading) {
    return (
      <div className="container" style={{ paddingTop: "40vh" }}>
        <p className="loading">LOADING...</p>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="container" style={{ paddingTop: "30vh" }}>
        <div className="sun" />
        <h1 className="title">NEONPOLL</h1>
        <p className="subtitle" style={{ marginTop: 20 }}>POLL NOT FOUND</p>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="container" style={{ paddingTop: "30vh" }}>
        <div className="sun" />
        <h1 className="title">NEONPOLL</h1>
        <p className="subtitle" style={{ marginTop: 20 }}>POLL NOT SET UP YET</p>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="container" style={{ paddingTop: "25vh" }}>
        <div className="sun" />
        <h1 className="thanks-heading">THANKS!</h1>
        <p className="subtitle">YOUR RESPONSE HAS BEEN RECORDED</p>
        <div className="submit-row" style={{ marginTop: 30 }}>
          <button className="btn-primary" onClick={() => setSubmitted(false)}>
            UPDATE RESPONSE
          </button>
        </div>
      </div>
    );
  }

  // Build items list
  const items =
    config.type === "date"
      ? config.dates.map((d) => ({ key: d, label: formatDate(d), desc: undefined as string | undefined, week: getIsoWeek(d) }))
      : config.options.map((o) => ({ key: o.id, label: o.title, desc: o.description, week: 0 }));

  // Group by week for date polls
  const grouped =
    config.type === "date"
      ? Object.entries(
          items.reduce<Record<number, typeof items>>((g, item) => {
            (g[item.week] ??= []).push(item);
            return g;
          }, {})
        )
      : [["0", items] as const];

  function renderVoteControls(key: string) {
    if (config!.votingStyle === "yes-maybe-no") {
      return (
        <div className="vote-group">
          {(["yes", "maybe", "no"] as VoteValue[]).map((v) => (
            <button
              key={v}
              className={`vote-btn ${v}${votes[key] === v ? " active" : ""}`}
              onClick={() => toggleYesMaybeNo(key, v)}
            >
              {v === "yes" ? "YES" : v === "maybe" ? "MEH" : "NO"}
            </button>
          ))}
        </div>
      );
    }
    if (config!.votingStyle === "single-choice") {
      return (
        <button
          className={`vote-toggle${votes[key] === "yes" ? " vote-toggle-active" : ""}`}
          onClick={() => toggleSingleChoice(key)}
        >
          {votes[key] === "yes" ? "SELECTED" : "SELECT"}
        </button>
      );
    }
    // multi-select
    return (
      <button
        className={`vote-toggle vote-toggle-multi${votes[key] === "yes" ? " vote-toggle-active" : ""}`}
        onClick={() => toggleMultiSelect(key)}
      >
        {votes[key] === "yes" ? "SELECTED" : "SELECT"}
      </button>
    );
  }

  return (
    <div className="container">
      <div className="sun" />
      <h1 className="title">NEONPOLL</h1>
      <p className="subtitle">{config.title}</p>
      {config.description && (
        <p className="description">
          {config.description.split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
            /^https?:\/\//.test(part) ? (
              <a key={i} href={part} target="_blank" rel="noopener noreferrer">{part}</a>
            ) : (
              part
            )
          )}
        </p>
      )}

      <div className="name-input">
        <input
          type="text"
          placeholder="Enter your name..."
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={50}
        />
      </div>

      {grouped.map(([week, weekItems]) => (
        <div key={week} className="week-group">
          {config.type === "date" && <div className="week-label">W{week}</div>}
          <div className="date-grid">
            {weekItems.map((item) => (
              <div key={item.key} className="date-card">
                <div className="date-label">{item.label}</div>
                {item.desc && <div className="option-card-desc">{item.desc}</div>}
                {renderVoteControls(item.key)}
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="submit-row">
        <button
          className="btn-primary"
          disabled={!name.trim()}
          onClick={handleSubmit}
        >
          SUBMIT
        </button>
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add CSS for the new vote toggle buttons and option card descriptions**

Append to `src/app/globals.css`:

```css
/* Vote toggle (single-choice / multi-select) */
.vote-toggle {
  background: transparent;
  border: 1px solid var(--neon-cyan);
  color: var(--neon-cyan);
  padding: 8px 0;
  width: 100%;
  font-size: 0.8rem;
  font-family: inherit;
  letter-spacing: 2px;
  cursor: pointer;
  border-radius: 3px;
  transition: all 0.15s;
  text-transform: uppercase;
}

.vote-toggle:hover {
  background: rgba(92, 255, 250, 0.08);
}

.vote-toggle-active {
  background: var(--neon-cyan);
  color: #000;
  box-shadow: 0 0 14px rgba(92, 255, 250, 0.6);
}

.vote-toggle-multi {
  border-color: var(--vote-yes);
  color: var(--vote-yes);
}

.vote-toggle-multi:hover {
  background: rgba(57, 255, 112, 0.08);
}

.vote-toggle-multi.vote-toggle-active {
  background: var(--vote-yes);
  color: #000;
  box-shadow: 0 0 14px rgba(57, 255, 112, 0.6);
}

/* Option card description */
.option-card-desc {
  color: #9090a0;
  font-size: 0.75rem;
  margin-bottom: 8px;
  letter-spacing: 0.5px;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/p/[slug]/page.tsx src/app/globals.css
git commit -m "feat: voter page supports all poll types and voting styles"
```

---

### Task 14: Update Admin Panel

**Files:**
- Modify: `src/app/p/[slug]/admin/AdminPanel.tsx`

- [ ] **Step 1: Rewrite the admin panel**

Replace the entire file:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDate, getIsoWeek } from "@/lib/types";
import type { PollConfig, Vote, VoteValue, VotingStyle, PollOption } from "@/lib/types";
import { CalendarPicker } from "@/app/components/CalendarPicker";
import { VotingStyleSelector } from "@/app/components/VotingStyleSelector";
import { OptionEditor } from "@/app/components/OptionEditor";
import { BarChart } from "@/app/components/BarChart";
import type { RankedItem } from "@/lib/summary";

export function AdminPanel({ slug, token }: { slug: string; token: string }) {
  const router = useRouter();
  const [pollType, setPollType] = useState<"date" | "option">("date");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [votingStyle, setVotingStyle] = useState<VotingStyle>("yes-maybe-no");
  const [dates, setDates] = useState<string[]>([]);
  const [options, setOptions] = useState<PollOption[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [ranked, setRanked] = useState<RankedItem[]>([]);
  const [configStatus, setConfigStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const pollUrl = typeof window !== "undefined"
    ? `${window.location.origin}/p/${slug}`
    : `/p/${slug}`;

  useEffect(() => {
    async function load() {
      try {
        const [configRes, votesRes] = await Promise.all([
          fetch(`/api/polls/${encodeURIComponent(slug)}/config`),
          fetch(`/api/polls/${encodeURIComponent(slug)}/votes?token=${encodeURIComponent(token)}`),
        ]);

        if (configRes.ok) {
          const data: PollConfig = await configRes.json();
          setPollType(data.type);
          setTitle(data.title || "");
          setDescription(data.description || "");
          setVotingStyle(data.votingStyle);
          setDates(data.dates || []);
          setOptions(data.options || []);
        }

        if (votesRes.ok) {
          const data = await votesRes.json();
          setVotes(data.votes || []);
          setRanked(data.summary?.ranked || []);
        }
      } catch {
        // initial load failed
      }
    }
    load();
  }, [slug, token]);

  async function refreshVotes() {
    try {
      const res = await fetch(
        `/api/polls/${encodeURIComponent(slug)}/votes?token=${encodeURIComponent(token)}`
      );
      if (res.ok) {
        const data = await res.json();
        setVotes(data.votes || []);
        setRanked(data.summary?.ranked || []);
      }
    } catch {
      // fetch failed
    }
  }

  async function saveConfig() {
    setConfigStatus("saving");
    setErrorMsg("");
    try {
      const body: Record<string, unknown> = { title, description, votingStyle };
      if (pollType === "date") {
        body.dates = dates;
      } else {
        body.options = options;
      }

      const res = await fetch(
        `/api/polls/${encodeURIComponent(slug)}/config?token=${encodeURIComponent(token)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      if (res.ok) {
        setConfigStatus("saved");
        setTimeout(() => setConfigStatus("idle"), 2000);
      } else {
        const data = await res.json().catch(() => null);
        setErrorMsg(data?.error || `${res.status} ${res.statusText}`);
        setConfigStatus("error");
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Network error");
      setConfigStatus("error");
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/polls/${encodeURIComponent(slug)}?token=${encodeURIComponent(token)}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        router.push("/");
      }
    } catch {
      // delete failed
    } finally {
      setDeleting(false);
    }
  }

  function cellIcon(value: VoteValue | undefined) {
    if (value === "yes") return { text: "\u2713", cls: "cell-yes" };
    if (value === "maybe") return { text: "?", cls: "cell-maybe" };
    if (value === "no") return { text: "\u2717", cls: "cell-no" };
    return { text: "\u2013", cls: "cell-none" };
  }

  // Items for the results table
  const itemKeys = pollType === "date" ? dates : options.map((o) => o.id);
  const itemLabels = pollType === "date"
    ? dates.map((d) => formatDate(d))
    : options.map((o) => o.title);

  // Group for date polls
  const weekGroups =
    pollType === "date"
      ? dates.reduce<Record<number, { keys: string[]; labels: string[] }>>((groups, date, i) => {
          const week = getIsoWeek(date);
          if (!groups[week]) groups[week] = { keys: [], labels: [] };
          groups[week].keys.push(date);
          groups[week].labels.push(itemLabels[i]);
          return groups;
        }, {})
      : { 0: { keys: itemKeys, labels: itemLabels } };

  return (
    <div className="container">
      <div className="sun" />
      <h1 className="title">NEONPOLL</h1>
      <p className="subtitle">ADMIN — {title || slug}</p>

      <div className="admin-section">
        <h2>SHARE LINK</h2>
        <div className="share-link">
          <code>{pollUrl}</code>
          <button
            className="btn-primary btn-small"
            onClick={() => navigator.clipboard.writeText(pollUrl)}
          >
            COPY
          </button>
        </div>
      </div>

      <div className="admin-section">
        <h2>CONFIGURATION</h2>

        <div className="form-group">
          <label>Poll Type</label>
          <div className="type-badge">{pollType === "date" ? "DATE POLL" : "OPTION POLL"}</div>
        </div>

        <div className="form-group">
          <label>Event Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={100}
          />
        </div>

        <div className="form-group">
          <label>Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
            rows={2}
          />
        </div>

        <div className="form-group">
          <label>Voting Style</label>
          <VotingStyleSelector value={votingStyle} onChange={setVotingStyle} />
        </div>

        {pollType === "date" ? (
          <>
            <div className="form-group">
              <label>Select Dates</label>
              <CalendarPicker selected={dates} onChange={setDates} />
            </div>
            {dates.length > 0 && (
              <div className="date-chips">
                {dates.map((date) => (
                  <span key={date} className="date-chip">
                    {formatDate(date)}
                    <button onClick={() => setDates(dates.filter((d) => d !== date))}>&times;</button>
                  </span>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="form-group">
            <label>Options ({options.length}/30)</label>
            <OptionEditor options={options} onChange={setOptions} />
          </div>
        )}

        <div style={{ marginTop: 16 }}>
          <button
            className="btn-primary"
            onClick={saveConfig}
            disabled={configStatus === "saving"}
          >
            {configStatus === "saving" ? "SAVING..." : "SAVE CONFIG"}
          </button>
          {configStatus === "saved" && (
            <span className="success" style={{ marginLeft: 12 }}>SAVED</span>
          )}
          {configStatus === "error" && (
            <span className="error" style={{ marginLeft: 12 }}>{errorMsg || "SAVE FAILED"}</span>
          )}
        </div>
      </div>

      <div className="admin-section">
        <h2>RESULTS</h2>

        <div className="refresh-row">
          <span className="response-count">
            {votes.length} {votes.length === 1 ? "RESPONSE" : "RESPONSES"}
          </span>
          <button className="btn-primary btn-small" onClick={refreshVotes}>REFRESH</button>
        </div>

        {votes.length > 0 && ranked.length > 0 && (
          votingStyle === "yes-maybe-no" ? (
            <div className="scoreboard">
              {ranked.map((entry, i) => {
                const total = votes.length;
                const score = entry.score ?? 0;
                const barPct = total > 0 ? (score / total) * 100 : 0;
                const yesPct = total > 0 ? ((entry.yesCount ?? 0) / total) * 100 : 0;
                const topScore = ranked[0]?.yesCount ?? 0;
                return (
                  <div
                    key={entry.id}
                    className={`scoreboard-row${(entry.yesCount ?? 0) === topScore && topScore > 0 ? " scoreboard-top" : ""}`}
                  >
                    <span className="scoreboard-rank">{i + 1}</span>
                    <span className="scoreboard-date">
                      {pollType === "date" ? formatDate(entry.id) : entry.title}
                    </span>
                    <span className="scoreboard-bar-track">
                      <span className="scoreboard-bar-yes" style={{ width: `${yesPct}%` }} />
                      {barPct > yesPct && (
                        <span className="scoreboard-bar-meh" style={{ width: `${barPct - yesPct}%` }} />
                      )}
                    </span>
                    <span className="scoreboard-count">
                      {entry.yesCount} YES
                      {(entry.maybeCount ?? 0) > 0 && (
                        <span className="scoreboard-maybe"> / {entry.maybeCount} MEH</span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <BarChart
              items={ranked.map((r) => ({
                label: pollType === "date" ? formatDate(r.id) : r.title,
                count: r.voteCount,
              }))}
            />
          )
        )}

        {votes.length === 0 ? (
          <p style={{ color: "#9090a0", letterSpacing: 2 }}>No responses yet</p>
        ) : (
          Object.entries(weekGroups).map(([week, group]) => {
            const counts = group.keys.map(
              (key) => votes.filter((v) => v.votes[key] === "yes").length
            );
            const maxCount = Math.max(...counts, 0);
            return (
              <div key={week} style={{ marginBottom: 20 }}>
                {pollType === "date" && <div className="week-label">W{week}</div>}
                <div className="results-table-wrap">
                  <table className="results-table">
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left" }}>NAME</th>
                        {group.labels.map((label, i) => (
                          <th key={group.keys[i]}>{label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {votes.map((vote) => (
                        <tr key={vote.name}>
                          <td>{vote.name}</td>
                          {group.keys.map((key) => {
                            if (votingStyle === "yes-maybe-no") {
                              const { text, cls } = cellIcon(vote.votes[key]);
                              return <td key={key} className={cls}>{text}</td>;
                            }
                            const selected = vote.votes[key] === "yes";
                            return (
                              <td key={key} className={selected ? "cell-yes" : "cell-none"}>
                                {selected ? "\u2713" : "\u2013"}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                      <tr className="summary-row">
                        <td>TOTAL</td>
                        {group.keys.map((key, i) => (
                          <td
                            key={key}
                            className={maxCount > 0 && counts[i] === maxCount ? "best-date" : ""}
                          >
                            {counts[i]}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="admin-section">
        <h2>DANGER ZONE</h2>
        <p style={{ color: "#9090a0", letterSpacing: 1, marginBottom: 12, fontSize: 14 }}>
          Delete this poll and all its votes permanently.
        </p>
        {!deleteConfirm ? (
          <button
            className="btn-primary btn-danger"
            onClick={() => setDeleteConfirm(true)}
            disabled={deleting}
          >
            DELETE POLL
          </button>
        ) : (
          <div className="wipe-confirm">
            <span style={{ color: "#ff4466", letterSpacing: 1 }}>ARE YOU SURE?</span>
            <button
              className="btn-primary btn-danger"
              disabled={deleting}
              onClick={handleDelete}
            >
              {deleting ? "DELETING..." : "YES, DELETE"}
            </button>
            <button className="btn-primary btn-small" onClick={() => setDeleteConfirm(false)}>
              CANCEL
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add CSS for the type badge**

Append to `src/app/globals.css`:

```css
/* Type badge (admin) */
.type-badge {
  display: inline-block;
  background: rgba(155, 93, 229, 0.2);
  border: 1px solid var(--neon-purple);
  color: var(--neon-cyan);
  padding: 6px 14px;
  border-radius: 4px;
  font-size: 0.8rem;
  letter-spacing: 3px;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/p/[slug]/admin/AdminPanel.tsx src/app/globals.css
git commit -m "feat: admin panel supports all poll types, voting styles, and bar chart results"
```

---

### Task 15: Update Global Admin

**Files:**
- Modify: `src/app/admin/GlobalAdmin.tsx`

- [ ] **Step 1: Rewrite the global admin**

Replace the entire file:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { PollSummary, PollType, VotingStyle, PollOption } from "@/lib/types";
import { CalendarPicker } from "@/app/components/CalendarPicker";
import { PollTypeSelector } from "@/app/components/PollTypeSelector";
import { VotingStyleSelector } from "@/app/components/VotingStyleSelector";
import { OptionEditor } from "@/app/components/OptionEditor";
import { formatDate } from "@/lib/types";

export function GlobalAdmin({ token }: { token: string }) {
  const router = useRouter();
  const [polls, setPolls] = useState<PollSummary[]>([]);
  const [loading, setLoading] = useState(true);

  // Create form state
  const [showCreate, setShowCreate] = useState(false);
  const [pollType, setPollType] = useState<PollType>("date");
  const [votingStyle, setVotingStyle] = useState<VotingStyle>("yes-maybe-no");
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [dates, setDates] = useState<string[]>([]);
  const [options, setOptions] = useState<PollOption[]>([]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  useEffect(() => {
    loadPolls();
  }, [token]);

  async function loadPolls() {
    try {
      const res = await fetch(`/api/polls?token=${encodeURIComponent(token)}`);
      if (res.ok) {
        const data = await res.json();
        setPolls(data.polls || []);
      }
    } catch {
      // fetch failed
    } finally {
      setLoading(false);
    }
  }

  function handleSlugChange(value: string) {
    setSlug(value.toLowerCase().replace(/[^a-z0-9-]/g, "").replace(/--+/g, "-"));
  }

  const canCreate =
    title.trim() &&
    slug.length >= 3 &&
    (pollType === "date" ? dates.length > 0 : options.length >= 2);

  async function handleCreate() {
    setCreateError("");
    setCreating(true);
    try {
      const body: Record<string, unknown> = {
        type: pollType,
        votingStyle,
        slug,
        title,
        description,
      };
      if (pollType === "date") {
        body.dates = dates;
        body.options = [];
      } else {
        body.options = options.map((o) => ({
          title: o.title,
          ...(o.description ? { description: o.description } : {}),
        }));
        body.dates = [];
      }

      const res = await fetch("/api/polls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        setCreateError(data.error || "Something went wrong");
        setCreating(false);
        return;
      }
      const data = await res.json();
      router.push(data.adminUrl);
    } catch {
      setCreateError("Network error. Try again.");
      setCreating(false);
    }
  }

  async function handleDelete(pollSlug: string) {
    if (!confirm(`Delete poll "${pollSlug}" and all its votes?`)) return;
    try {
      const res = await fetch(
        `/api/polls/${encodeURIComponent(pollSlug)}?token=${encodeURIComponent(token)}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        setPolls((prev) => prev.filter((p) => p.slug !== pollSlug));
      }
    } catch {
      // delete failed
    }
  }

  function typeBadge(type: PollType) {
    return type === "date" ? "DATE" : "OPTION";
  }

  return (
    <div className="container">
      <div className="sun" />
      <h1 className="title">NEONPOLL</h1>
      <p className="subtitle">GLOBAL ADMIN</p>

      <div className="admin-section">
        <h2>ALL POLLS</h2>
        {loading ? (
          <p className="loading">LOADING...</p>
        ) : polls.length === 0 ? (
          <p style={{ color: "#9090a0", letterSpacing: 2 }}>No polls yet</p>
        ) : (
          <div className="poll-list">
            {polls.map((poll) => (
              <div key={poll.slug} className="poll-list-item">
                <div className="poll-list-info">
                  <Link
                    href={`/p/${poll.slug}/admin?token=${encodeURIComponent(token)}`}
                    className="poll-list-title"
                  >
                    <span className="poll-type-tag">{typeBadge(poll.type)}</span>
                    {poll.title}
                  </Link>
                  <span className="poll-list-meta">
                    /p/{poll.slug} — {poll.itemCount} {poll.type === "date" ? "dates" : "options"} — {poll.voteCount} votes
                  </span>
                </div>
                <button
                  className="btn-primary btn-small btn-danger"
                  onClick={() => handleDelete(poll.slug)}
                >
                  DELETE
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="admin-section">
        {!showCreate ? (
          <button className="btn-primary" onClick={() => setShowCreate(true)}>
            CREATE NEW POLL
          </button>
        ) : (
          <>
            <h2>CREATE NEW POLL</h2>

            <div className="form-group">
              <label>Poll Type</label>
              <PollTypeSelector value={pollType} onChange={setPollType} />
            </div>

            <div className="form-group">
              <label>Event Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={100}
              />
            </div>

            <div className="form-group">
              <label>Slug</label>
              <input
                type="text"
                placeholder={pollType === "date" ? "friday-dinner" : "team-activity"}
                value={slug}
                onChange={(e) => handleSlugChange(e.target.value)}
                maxLength={50}
              />
              {slug && <span className="slug-preview">/p/{slug}</span>}
            </div>

            <div className="form-group">
              <label>Description (optional)</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={500}
                rows={2}
              />
            </div>

            <div className="form-group">
              <label>Voting Style</label>
              <VotingStyleSelector value={votingStyle} onChange={setVotingStyle} />
            </div>

            {pollType === "date" ? (
              <>
                <div className="form-group">
                  <label>Select Dates</label>
                  <CalendarPicker selected={dates} onChange={setDates} />
                </div>
                {dates.length > 0 && (
                  <div className="date-chips">
                    {dates.map((date) => (
                      <span key={date} className="date-chip">
                        {formatDate(date)}
                        <button onClick={() => setDates(dates.filter((d) => d !== date))}>&times;</button>
                      </span>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="form-group">
                <label>Options ({options.length}/30)</label>
                <OptionEditor options={options} onChange={setOptions} />
              </div>
            )}

            <div style={{ marginTop: 16, display: "flex", gap: 12 }}>
              <button
                className="btn-primary"
                onClick={handleCreate}
                disabled={creating || !canCreate}
              >
                {creating ? "CREATING..." : "CREATE"}
              </button>
              <button
                className="btn-primary btn-small"
                onClick={() => setShowCreate(false)}
              >
                CANCEL
              </button>
            </div>
            {createError && <p className="error">{createError}</p>}
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add CSS for type tag in poll listing**

Append to `src/app/globals.css`:

```css
/* Poll type tag in listing */
.poll-type-tag {
  display: inline-block;
  background: rgba(155, 93, 229, 0.3);
  border: 1px solid var(--neon-purple);
  color: var(--neon-pink);
  padding: 2px 8px;
  border-radius: 3px;
  font-size: 0.65rem;
  letter-spacing: 2px;
  margin-right: 8px;
  vertical-align: middle;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/GlobalAdmin.tsx src/app/globals.css
git commit -m "feat: global admin supports multi-type poll creation and type badges"
```

---

### Task 16: Full Build and Smoke Test

- [ ] **Step 1: Run TypeScript check**

Run: `npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 2: Run ESLint**

Run: `npx eslint src/`

Expected: No blocking errors (warnings are ok).

- [ ] **Step 3: Run the build**

Run: `npm run build`

Expected: Build succeeds.

- [ ] **Step 4: Start dev server and test manually**

Run: `npm run dev`

Test these flows:
1. Go to `/create` — verify type selector, voting style selector, date and option creation flows
2. Create a date poll with yes-maybe-no — verify voting and results work
3. Create an option poll with single-choice — verify voting allows only one selection
4. Create an option poll with multi-select — verify voting allows multiple selections
5. Check admin panel for each poll — verify config editor, results, and bar chart
6. Check global admin — verify type badges and create form
7. Test the API directly with curl:
   ```bash
   curl -X POST http://localhost:3000/api/polls \
     -H 'Content-Type: application/json' \
     -d '{"type":"option","votingStyle":"single-choice","title":"Test","slug":"api-test","description":"","options":[{"title":"A"},{"title":"B"}]}'
   ```
   Verify response includes `voterUrl` and `adminUrl`.

- [ ] **Step 5: Fix any issues found during testing**

- [ ] **Step 6: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: address issues from smoke testing"
```
