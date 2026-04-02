# Multi-Poll Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform NeonPoll from a single-poll system to support multiple simultaneous polls with slug-based URLs and two-tier admin auth.

**Architecture:** Each poll is identified by a slug and stored in KV with keys prefixed `neonpoll:poll:{slug}:`. A poll index (`neonpoll:polls` set) tracks all active slugs. Two auth tiers: global admin (env var) and per-poll admin (generated token stored in config). Public creation flow at `/create`, voting at `/p/{slug}`, admin at `/p/{slug}/admin` and `/admin`.

**Tech Stack:** Next.js 16 (App Router), Vercel KV, TypeScript

---

## File Structure

```
src/
├── lib/
│   ├── types.ts          — MODIFY: add adminToken, createdAt to PollConfig; add slug validation
│   ├── kv.ts             — REWRITE: all functions slug-scoped, poll index management
│   └── auth.ts           — REWRITE: two-tier auth (global + poll token)
├── app/
│   ├── page.tsx           — REWRITE: landing splash with "Create a poll" button
│   ├── layout.tsx         — KEEP as-is
│   ├── globals.css        — MODIFY: add landing page + global admin styles
│   ├── create/
│   │   └── page.tsx       — CREATE: poll creation form
│   ├── p/
│   │   └── [slug]/
│   │       ├── page.tsx           — CREATE: voter page (adapted from old page.tsx)
│   │       └── admin/
│   │           ├── page.tsx       — CREATE: server component, auth gate
│   │           └── AdminPanel.tsx — CREATE: poll admin (adapted from old AdminPanel.tsx)
│   ├── admin/
│   │   ├── page.tsx       — REWRITE: global admin with poll list + create form
│   │   ├── AdminPanel.tsx — DELETE (replaced by global admin + per-poll admin)
│   │   └── CalendarPicker.tsx — MOVE to src/app/components/CalendarPicker.tsx (shared)
│   ├── components/
│   │   └── CalendarPicker.tsx — CREATE (moved from admin/)
│   └── api/
│       ├── config/route.ts  — DELETE
│       ├── vote/route.ts    — DELETE
│       ├── votes/route.ts   — DELETE
│       └── polls/
│           ├── route.ts              — CREATE: POST (create poll), GET (list all)
│           └── [slug]/
│               ├── route.ts          — CREATE: DELETE (delete poll)
│               ├── config/route.ts   — CREATE: GET/PUT poll config
│               ├── vote/route.ts     — CREATE: GET/POST voter actions
│               └── votes/route.ts    — CREATE: GET all votes (admin)
```

---

### Task 1: Types and Slug Validation

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Update PollConfig interface and add slug validation**

```typescript
export type VoteValue = "yes" | "maybe" | "no";

export interface PollConfig {
  title: string;
  description: string;
  dates: string[];
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
  dateCount: number;
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
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add PollSummary type, adminToken/createdAt to PollConfig, slug validation"
```

---

### Task 2: KV Layer — Slug-Scoped Operations

**Files:**
- Rewrite: `src/lib/kv.ts`

- [ ] **Step 1: Rewrite kv.ts with slug-scoped functions**

```typescript
import { kv } from "@vercel/kv";
import type { PollConfig, Vote } from "./types";

const POLL_INDEX_KEY = "neonpoll:polls";

function configKey(slug: string) {
  return `neonpoll:poll:${slug}:config`;
}

function voteKey(slug: string, name: string) {
  return `neonpoll:poll:${slug}:votes:${name.toLowerCase().trim()}`;
}

function votePrefix(slug: string) {
  return `neonpoll:poll:${slug}:votes:`;
}

// --- Poll index ---

export async function addPollToIndex(slug: string): Promise<void> {
  await kv.sadd(POLL_INDEX_KEY, slug);
}

export async function removePollFromIndex(slug: string): Promise<void> {
  await kv.srem(POLL_INDEX_KEY, slug);
}

export async function getAllPollSlugs(): Promise<string[]> {
  return kv.smembers(POLL_INDEX_KEY);
}

export async function isPollSlugTaken(slug: string): Promise<boolean> {
  return kv.sismember(POLL_INDEX_KEY, slug).then((r) => r === 1);
}

// --- Config ---

export async function getConfig(slug: string): Promise<PollConfig | null> {
  return kv.get<PollConfig>(configKey(slug));
}

export async function setConfig(slug: string, config: PollConfig): Promise<void> {
  await kv.set(configKey(slug), config);
}

// --- Votes ---

export async function getVote(slug: string, name: string): Promise<Vote | null> {
  return kv.get<Vote>(voteKey(slug, name));
}

export async function setVote(slug: string, vote: Vote): Promise<void> {
  await kv.set(voteKey(slug, vote.name), vote);
}

export async function getAllVotes(slug: string): Promise<Vote[]> {
  const prefix = votePrefix(slug);
  const keys = await scanKeys(prefix + "*");
  if (keys.length === 0) return [];
  const values = await kv.mget<Vote[]>(...keys);
  return values.filter((v): v is Vote => v !== null);
}

// --- Delete ---

export async function deletePoll(slug: string): Promise<void> {
  const prefix = votePrefix(slug);
  const voteKeys = await scanKeys(prefix + "*");
  const allKeys = [configKey(slug), ...voteKeys];
  if (allKeys.length > 0) {
    await kv.del(...allKeys);
  }
  await removePollFromIndex(slug);
}

export async function wipeAllLegacyData(): Promise<void> {
  const keys = await scanKeys("neonpoll:*");
  if (keys.length > 0) {
    await kv.del(...keys);
  }
}

// --- Helpers ---

async function scanKeys(pattern: string): Promise<string[]> {
  const keys: string[] = [];
  let cursor = 0;
  do {
    const [next, batch] = await kv.scan(cursor, { match: pattern, count: 100 });
    cursor = Number(next);
    keys.push(...batch);
  } while (cursor !== 0);
  return keys;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/kv.ts
git commit -m "feat: rewrite KV layer with slug-scoped operations and poll index"
```

---

### Task 3: Auth — Two-Tier Token Validation

**Files:**
- Rewrite: `src/lib/auth.ts`

- [ ] **Step 1: Rewrite auth.ts with two-tier validation**

```typescript
import { randomBytes } from "crypto";

export function validateGlobalToken(token: string | null): boolean {
  const adminToken = process.env.ADMIN_TOKEN;
  if (!adminToken) return false;
  return token === adminToken;
}

export function validatePollToken(token: string | null, pollAdminToken: string): boolean {
  if (!token) return false;
  if (token === pollAdminToken) return true;
  return validateGlobalToken(token);
}

export function generateAdminToken(): string {
  return randomBytes(24).toString("base64url");
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/auth.ts
git commit -m "feat: two-tier auth with global and per-poll tokens"
```

---

### Task 4: Move CalendarPicker to Shared Components

**Files:**
- Create: `src/app/components/CalendarPicker.tsx` (copy from `src/app/admin/CalendarPicker.tsx`)
- Delete later: `src/app/admin/CalendarPicker.tsx` (in Task 11 cleanup)

- [ ] **Step 1: Copy CalendarPicker to shared location**

Copy the file `src/app/admin/CalendarPicker.tsx` to `src/app/components/CalendarPicker.tsx` — the content is identical, no changes needed.

- [ ] **Step 2: Commit**

```bash
git add src/app/components/CalendarPicker.tsx
git commit -m "refactor: move CalendarPicker to shared components"
```

---

### Task 5: API — Create and List Polls

**Files:**
- Create: `src/app/api/polls/route.ts`

- [ ] **Step 1: Create POST (create poll) and GET (list all) route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getConfig, setConfig, addPollToIndex, isPollSlugTaken, getAllPollSlugs, getAllVotes } from "@/lib/kv";
import { validateGlobalToken, generateAdminToken } from "@/lib/auth";
import { isValidSlug } from "@/lib/types";
import type { PollConfig, PollSummary } from "@/lib/types";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { slug, title, description, dates } = body as {
    slug?: string;
    title?: string;
    description?: string;
    dates?: string[];
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

  if (!Array.isArray(dates) || dates.length === 0 || dates.length > 30) {
    return NextResponse.json({ error: "dates required, 1-30 items" }, { status: 400 });
  }

  const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dates.every((d) => typeof d === "string" && isoDateRegex.test(d))) {
    return NextResponse.json({ error: "dates must be ISO date strings (YYYY-MM-DD)" }, { status: 400 });
  }

  if (await isPollSlugTaken(slug)) {
    return NextResponse.json({ error: "slug already taken" }, { status: 409 });
  }

  const adminToken = generateAdminToken();
  const config: PollConfig = {
    title: title.trim(),
    description: (description || "").trim(),
    dates: [...dates].sort(),
    adminToken,
    createdAt: new Date().toISOString(),
  };

  await setConfig(slug, config);
  await addPollToIndex(slug);

  return NextResponse.json({ slug, adminToken }, { status: 201 });
}

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
      dateCount: config.dates.length,
      voteCount: votes.length,
      createdAt: config.createdAt,
    });
  }

  polls.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return NextResponse.json({ polls });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/polls/route.ts
git commit -m "feat: API for creating and listing polls"
```

---

### Task 6: API — Poll Config (GET/PUT)

**Files:**
- Create: `src/app/api/polls/[slug]/config/route.ts`

- [ ] **Step 1: Create config route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getConfig, setConfig } from "@/lib/kv";
import { validatePollToken } from "@/lib/auth";
import type { PollConfig } from "@/lib/types";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const config = await getConfig(slug);
  if (!config) {
    return NextResponse.json({ error: "Poll not found" }, { status: 404 });
  }
  // Don't expose adminToken to public
  const { adminToken: _, ...publicConfig } = config;
  return NextResponse.json(publicConfig);
}

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

  const update = body as Partial<PollConfig>;

  if (!update.title || typeof update.title !== "string" || update.title.length > 100) {
    return NextResponse.json({ error: "title required, max 100 chars" }, { status: 400 });
  }

  if (update.description && (typeof update.description !== "string" || update.description.length > 500)) {
    return NextResponse.json({ error: "description max 500 chars" }, { status: 400 });
  }

  if (!Array.isArray(update.dates) || update.dates.length === 0 || update.dates.length > 30) {
    return NextResponse.json({ error: "dates required, 1-30 items" }, { status: 400 });
  }

  const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!update.dates.every((d) => typeof d === "string" && isoDateRegex.test(d))) {
    return NextResponse.json({ error: "dates must be ISO date strings (YYYY-MM-DD)" }, { status: 400 });
  }

  const validated: PollConfig = {
    title: update.title.trim(),
    description: (update.description || "").trim(),
    dates: [...update.dates].sort(),
    adminToken: existing.adminToken,
    createdAt: existing.createdAt,
  };

  await setConfig(slug, validated);
  const { adminToken: _, ...publicConfig } = validated;
  return NextResponse.json(publicConfig);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/polls/\[slug\]/config/route.ts
git commit -m "feat: API for poll config GET/PUT"
```

---

### Task 7: API — Vote (GET/POST)

**Files:**
- Create: `src/app/api/polls/[slug]/vote/route.ts`

- [ ] **Step 1: Create vote route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getConfig, getVote, setVote } from "@/lib/kv";
import type { Vote, VoteValue } from "@/lib/types";

const VALID_VALUES: VoteValue[] = ["yes", "maybe", "no"];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const name = request.nextUrl.searchParams.get("name");
  if (!name || !name.trim()) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }

  const config = await getConfig(slug);
  if (!config) {
    return NextResponse.json({ error: "Poll not found" }, { status: 404 });
  }

  const vote = await getVote(slug, name.trim());
  if (!vote) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(vote);
}

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

  const configDates = new Set(config.dates);
  const filteredVotes: Record<string, VoteValue> = {};
  for (const [date, value] of Object.entries(votes)) {
    if (configDates.has(date) && VALID_VALUES.includes(value as VoteValue)) {
      filteredVotes[date] = value as VoteValue;
    }
  }

  const vote: Vote = {
    name: name.trim(),
    votes: filteredVotes,
  };

  await setVote(slug, vote);
  return NextResponse.json(vote);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/polls/\[slug\]/vote/route.ts
git commit -m "feat: API for poll voting GET/POST"
```

---

### Task 8: API — Admin Votes + Delete Poll

**Files:**
- Create: `src/app/api/polls/[slug]/votes/route.ts`
- Create: `src/app/api/polls/[slug]/route.ts`

- [ ] **Step 1: Create admin votes route (GET all votes)**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getConfig, getAllVotes } from "@/lib/kv";
import { validatePollToken } from "@/lib/auth";

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
  return NextResponse.json({ votes });
}
```

- [ ] **Step 2: Create delete poll route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getConfig, deletePoll } from "@/lib/kv";
import { validatePollToken } from "@/lib/auth";

export async function DELETE(
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

  await deletePoll(slug);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/polls/\[slug\]/votes/route.ts src/app/api/polls/\[slug\]/route.ts
git commit -m "feat: API for admin votes listing and poll deletion"
```

---

### Task 9: Landing Page

**Files:**
- Rewrite: `src/app/page.tsx`

- [ ] **Step 1: Rewrite root page as branding splash**

```typescript
import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="container" style={{ paddingTop: "20vh" }}>
      <div className="sun" />
      <h1 className="title">NEONPOLL</h1>
      <p className="subtitle">PICK YOUR DATES. RETRO STYLE.</p>
      <div className="landing-cta">
        <Link href="/create" className="btn-primary">
          CREATE A POLL
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add landing page styles to globals.css**

Append to `src/app/globals.css`:

```css
/* Landing page */
.landing-cta {
  text-align: center;
  margin-top: 40px;
}

.landing-cta a {
  text-decoration: none;
  display: inline-block;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx src/app/globals.css
git commit -m "feat: landing page with create-a-poll CTA"
```

---

### Task 10: Create Poll Page

**Files:**
- Create: `src/app/create/page.tsx`

- [ ] **Step 1: Create the poll creation form page**

```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPicker } from "@/app/components/CalendarPicker";
import { formatDate } from "@/lib/types";

export default function CreatePollPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [dates, setDates] = useState<string[]>([]);
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

  async function handleCreate() {
    setError("");
    setCreating(true);
    try {
      const res = await fetch("/api/polls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, title, description, dates }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Something went wrong");
        setCreating(false);
        return;
      }
      const data = await res.json();
      router.push(`/p/${data.slug}/admin?token=${encodeURIComponent(data.adminToken)}`);
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
          <label>Event Title</label>
          <input
            type="text"
            placeholder="Friday dinner?"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={100}
          />
        </div>

        <div className="form-group">
          <label>Poll URL Slug</label>
          <input
            type="text"
            placeholder="friday-dinner"
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

        <div style={{ marginTop: 16 }}>
          <button
            className="btn-primary"
            onClick={handleCreate}
            disabled={creating || !title.trim() || slug.length < 3 || dates.length === 0}
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

- [ ] **Step 2: Add slug preview styles to globals.css**

Append to `src/app/globals.css`:

```css
/* Slug preview */
.slug-preview {
  display: block;
  color: #9090a0;
  font-size: 0.75rem;
  letter-spacing: 1px;
  margin-top: 4px;
}

.slug-status {
  font-size: 0.75rem;
  letter-spacing: 1px;
  margin-left: 8px;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/create/page.tsx src/app/globals.css
git commit -m "feat: public poll creation page"
```

---

### Task 11: Voter Page at /p/[slug]

**Files:**
- Create: `src/app/p/[slug]/page.tsx`

- [ ] **Step 1: Create voter page (adapted from old page.tsx)**

This is the old `src/app/page.tsx` voter page, adapted to use the slug from the URL and slug-scoped API routes.

```typescript
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
        if (data.title && data.dates?.length > 0) {
          setConfig(data);
        }

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

  function toggleVote(date: string, value: VoteValue) {
    setVotes((prev) => {
      if (prev[date] === value) {
        const next = { ...prev };
        delete next[date];
        return next;
      }
      return { ...prev, [date]: value };
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
        <p className="subtitle" style={{ marginTop: 20 }}>
          POLL NOT FOUND
        </p>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="container" style={{ paddingTop: "30vh" }}>
        <div className="sun" />
        <h1 className="title">NEONPOLL</h1>
        <p className="subtitle" style={{ marginTop: 20 }}>
          POLL NOT SET UP YET
        </p>
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
          <button
            className="btn-primary"
            onClick={() => setSubmitted(false)}
          >
            UPDATE RESPONSE
          </button>
        </div>
      </div>
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
              <a key={i} href={part} target="_blank" rel="noopener noreferrer">
                {part}
              </a>
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

      {Object.entries(
        config.dates.reduce<Record<number, string[]>>((groups, date) => {
          const week = getIsoWeek(date);
          (groups[week] ??= []).push(date);
          return groups;
        }, {})
      ).map(([week, weekDates]) => (
        <div key={week} className="week-group">
          <div className="week-label">W{week}</div>
          <div className="date-grid">
            {weekDates.map((date) => (
              <div key={date} className="date-card">
                <div className="date-label">{formatDate(date)}</div>
                <div className="vote-group">
                  {(["yes", "maybe", "no"] as VoteValue[]).map((v) => (
                    <button
                      key={v}
                      className={`vote-btn ${v}${votes[date] === v ? " active" : ""}`}
                      onClick={() => toggleVote(date, v)}
                    >
                      {v === "yes" ? "YES" : v === "maybe" ? "MEH" : "NO"}
                    </button>
                  ))}
                </div>
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

- [ ] **Step 2: Commit**

```bash
git add src/app/p/\[slug\]/page.tsx
git commit -m "feat: voter page at /p/[slug]"
```

---

### Task 12: Poll Admin Page at /p/[slug]/admin

**Files:**
- Create: `src/app/p/[slug]/admin/page.tsx`
- Create: `src/app/p/[slug]/admin/AdminPanel.tsx`

- [ ] **Step 1: Create server component auth gate**

```typescript
import { notFound } from "next/navigation";
import { getConfig } from "@/lib/kv";
import { validatePollToken } from "@/lib/auth";
import { AdminPanel } from "./AdminPanel";

export default async function PollAdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { slug } = await params;
  const { token } = await searchParams;

  const config = await getConfig(slug);
  if (!config) notFound();

  if (!token || !validatePollToken(token, config.adminToken)) {
    notFound();
  }

  return <AdminPanel slug={slug} token={token} />;
}
```

- [ ] **Step 2: Create poll admin panel (adapted from old AdminPanel.tsx)**

```typescript
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDate, getIsoWeek } from "@/lib/types";
import type { Vote, VoteValue } from "@/lib/types";
import { CalendarPicker } from "@/app/components/CalendarPicker";

export function AdminPanel({ slug, token }: { slug: string; token: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dates, setDates] = useState<string[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [configStatus, setConfigStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
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
          const data = await configRes.json();
          setTitle(data.title || "");
          setDescription(data.description || "");
          setDates(data.dates || []);
        }

        if (votesRes.ok) {
          const data = await votesRes.json();
          setVotes(data.votes || []);
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
      }
    } catch {
      // fetch failed
    }
  }

  async function saveConfig() {
    setConfigStatus("saving");
    setErrorMsg("");
    try {
      const res = await fetch(
        `/api/polls/${encodeURIComponent(slug)}/config?token=${encodeURIComponent(token)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, description, dates }),
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

  const weekGroups = dates.reduce<Record<number, string[]>>((groups, date) => {
    const week = getIsoWeek(date);
    (groups[week] ??= []).push(date);
    return groups;
  }, {});

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

        <div style={{ marginTop: 16 }}>
          <button
            className="btn-primary"
            onClick={saveConfig}
            disabled={configStatus === "saving"}
          >
            {configStatus === "saving" ? "SAVING..." : "SAVE CONFIG"}
          </button>
          {configStatus === "saved" && (
            <span className="success" style={{ marginLeft: 12 }}>
              SAVED
            </span>
          )}
          {configStatus === "error" && (
            <span className="error" style={{ marginLeft: 12 }}>
              {errorMsg || "SAVE FAILED"}
            </span>
          )}
        </div>
      </div>

      <div className="admin-section">
        <h2>RESULTS</h2>

        <div className="refresh-row">
          <span className="response-count">
            {votes.length} {votes.length === 1 ? "RESPONSE" : "RESPONSES"}
          </span>
          <button className="btn-primary btn-small" onClick={refreshVotes}>
            REFRESH
          </button>
        </div>

        {votes.length > 0 && dates.length > 0 && (() => {
          const ranked = dates
            .map((date) => ({
              date,
              yes: votes.filter((v) => v.votes[date] === "yes").length,
              maybe: votes.filter((v) => v.votes[date] === "maybe").length,
            }))
            .sort((a, b) => (b.yes + b.maybe * 0.5) - (a.yes + a.maybe * 0.5) || b.yes - a.yes);
          const total = votes.length;
          const topScore = ranked[0].yes;
          return (
            <div className="scoreboard">
              {ranked.map((entry, i) => {
                const score = entry.yes + entry.maybe * 0.5;
                const maxScore = total;
                const barPct = maxScore > 0 ? (score / maxScore) * 100 : 0;
                const yesPct = maxScore > 0 ? (entry.yes / maxScore) * 100 : 0;
                return (
                  <div
                    key={entry.date}
                    className={`scoreboard-row${entry.yes === topScore && topScore > 0 ? " scoreboard-top" : ""}`}
                  >
                    <span className="scoreboard-rank">{i + 1}</span>
                    <span className="scoreboard-date">{formatDate(entry.date)}</span>
                    <span className="scoreboard-bar-track">
                      <span className="scoreboard-bar-yes" style={{ width: `${yesPct}%` }} />
                      {barPct > yesPct && (
                        <span className="scoreboard-bar-meh" style={{ width: `${barPct - yesPct}%` }} />
                      )}
                    </span>
                    <span className="scoreboard-count">
                      {entry.yes} YES
                      {entry.maybe > 0 && <span className="scoreboard-maybe"> / {entry.maybe} MEH</span>}
                    </span>
                  </div>
                );
              })}
            </div>
          );
        })()}

        {votes.length === 0 ? (
          <p style={{ color: "#9090a0", letterSpacing: 2 }}>
            No responses yet
          </p>
        ) : (
          Object.entries(weekGroups).map(([week, weekDates]) => {
            const yesCounts = weekDates.map(
              (date) => votes.filter((v) => v.votes[date] === "yes").length
            );
            const maxYes = Math.max(...yesCounts, 0);
            return (
              <div key={week} style={{ marginBottom: 20 }}>
                <div className="week-label">W{week}</div>
                <div className="results-table-wrap">
                  <table className="results-table">
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left" }}>NAME</th>
                        {weekDates.map((date) => (
                          <th key={date}>{formatDate(date)}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {votes.map((vote) => (
                        <tr key={vote.name}>
                          <td>{vote.name}</td>
                          {weekDates.map((date) => {
                            const { text, cls } = cellIcon(vote.votes[date]);
                            return (
                              <td key={date} className={cls}>
                                {text}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                      <tr className="summary-row">
                        <td>TOTAL</td>
                        {weekDates.map((date, i) => (
                          <td
                            key={date}
                            className={
                              maxYes > 0 && yesCounts[i] === maxYes
                                ? "best-date"
                                : ""
                            }
                          >
                            {yesCounts[i]}
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
            <button
              className="btn-primary btn-small"
              onClick={() => setDeleteConfirm(false)}
            >
              CANCEL
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add share link styles to globals.css**

Append to `src/app/globals.css`:

```css
/* Share link */
.share-link {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.share-link code {
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid var(--neon-cyan);
  padding: 10px 14px;
  border-radius: 4px;
  color: var(--neon-cyan);
  font-size: 0.85rem;
  letter-spacing: 1px;
  word-break: break-all;
  flex: 1;
  min-width: 0;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/p/\[slug\]/admin/page.tsx src/app/p/\[slug\]/admin/AdminPanel.tsx src/app/globals.css
git commit -m "feat: per-poll admin page at /p/[slug]/admin"
```

---

### Task 13: Global Admin Page

**Files:**
- Rewrite: `src/app/admin/page.tsx`
- Delete: `src/app/admin/AdminPanel.tsx`
- Delete: `src/app/admin/CalendarPicker.tsx`

- [ ] **Step 1: Rewrite global admin page**

```typescript
import { notFound } from "next/navigation";
import { GlobalAdmin } from "./GlobalAdmin";

export default async function GlobalAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const adminToken = process.env.ADMIN_TOKEN;

  if (!adminToken || token !== adminToken) {
    notFound();
  }

  return <GlobalAdmin token={token} />;
}
```

- [ ] **Step 2: Create GlobalAdmin client component**

Create `src/app/admin/GlobalAdmin.tsx`:

```typescript
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { PollSummary } from "@/lib/types";
import { CalendarPicker } from "@/app/components/CalendarPicker";
import { formatDate } from "@/lib/types";

export function GlobalAdmin({ token }: { token: string }) {
  const router = useRouter();
  const [polls, setPolls] = useState<PollSummary[]>([]);
  const [loading, setLoading] = useState(true);

  // Create form state
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [dates, setDates] = useState<string[]>([]);
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

  async function handleCreate() {
    setCreateError("");
    setCreating(true);
    try {
      const res = await fetch("/api/polls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, title, description, dates }),
      });
      if (!res.ok) {
        const data = await res.json();
        setCreateError(data.error || "Something went wrong");
        setCreating(false);
        return;
      }
      const data = await res.json();
      router.push(`/p/${data.slug}/admin?token=${encodeURIComponent(data.adminToken)}`);
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
                    {poll.title}
                  </Link>
                  <span className="poll-list-meta">
                    /p/{poll.slug} — {poll.dateCount} dates — {poll.voteCount} votes
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
                placeholder="friday-dinner"
                value={slug}
                onChange={(e) => handleSlugChange(e.target.value)}
                maxLength={50}
              />
              {slug && (
                <span className="slug-preview">/p/{slug}</span>
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

            <div style={{ marginTop: 16, display: "flex", gap: 12 }}>
              <button
                className="btn-primary"
                onClick={handleCreate}
                disabled={creating || !title.trim() || slug.length < 3 || dates.length === 0}
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

- [ ] **Step 3: Add poll list styles to globals.css**

Append to `src/app/globals.css`:

```css
/* Poll list (global admin) */
.poll-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.poll-list-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(155, 93, 229, 0.3);
  border-radius: 6px;
}

.poll-list-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.poll-list-title {
  color: var(--neon-cyan);
  text-decoration: none;
  font-size: 0.95rem;
  letter-spacing: 1px;
}

.poll-list-title:hover {
  text-shadow: 0 0 8px rgba(92, 255, 250, 0.5);
}

.poll-list-meta {
  color: #9090a0;
  font-size: 0.75rem;
  letter-spacing: 1px;
}
```

- [ ] **Step 4: Delete old admin files**

```bash
rm src/app/admin/AdminPanel.tsx src/app/admin/CalendarPicker.tsx
```

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/page.tsx src/app/admin/GlobalAdmin.tsx src/app/globals.css
git add -u src/app/admin/AdminPanel.tsx src/app/admin/CalendarPicker.tsx
git commit -m "feat: global admin page with poll listing and creation"
```

---

### Task 14: Cleanup — Delete Old API Routes

**Files:**
- Delete: `src/app/api/config/route.ts`
- Delete: `src/app/api/vote/route.ts`
- Delete: `src/app/api/votes/route.ts`

- [ ] **Step 1: Delete old API routes**

```bash
rm -r src/app/api/config src/app/api/vote src/app/api/votes
```

- [ ] **Step 2: Commit**

```bash
git add -u src/app/api/config src/app/api/vote src/app/api/votes
git commit -m "chore: remove old single-poll API routes"
```

---

### Task 15: Verify Build

- [ ] **Step 1: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 2: Run lint**

```bash
npm run lint
```

Expected: no errors (or only pre-existing warnings).

- [ ] **Step 3: Run build**

```bash
npm run build
```

Expected: successful build with all new routes compiled.

- [ ] **Step 4: Fix any issues found, then commit fixes if needed**

---

### Task 16: Wipe Legacy Data

This is a one-time operation to run after deploying the new code. It uses the `wipeAllLegacyData` function from `kv.ts`.

- [ ] **Step 1: Create a one-time migration API route**

Create `src/app/api/migrate/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { validateGlobalToken } from "@/lib/auth";
import { wipeAllLegacyData } from "@/lib/kv";

export async function POST(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!validateGlobalToken(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await wipeAllLegacyData();
  return NextResponse.json({ ok: true, message: "All legacy data wiped" });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/migrate/route.ts
git commit -m "feat: one-time migration endpoint to wipe legacy data"
```

- [ ] **Step 3: After deploying, call the endpoint once**

```bash
curl -X POST "https://neonpoll.vercel.app/api/migrate?token=YOUR_ADMIN_TOKEN"
```

- [ ] **Step 4: Delete the migration route and commit**

```bash
rm -r src/app/api/migrate
git add -u src/app/api/migrate
git commit -m "chore: remove one-time migration endpoint"
```
