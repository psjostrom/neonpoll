# NeonPoll

A synthwave-themed date poll app. Think Doodle, but with neon glow and scanlines.

## Features

- **Voter page** — pick yes/maybe/no per date, name saved in localStorage for returning voters
- **Admin panel** — configure poll title, description, and dates; view results matrix with best-date highlighting
- **Token-gated admin** — access via `/admin?token=YOUR_TOKEN`

## Stack

- Next.js 16 (App Router)
- Vercel KV (Upstash Redis)
- TypeScript

## Deploy

1. Push to GitHub and connect to Vercel
2. In Vercel dashboard, add an Upstash KV store (auto-injects `KV_REST_API_URL` and `KV_REST_API_TOKEN`)
3. Add `ADMIN_TOKEN` environment variable (any secret string)
4. Deploy

## Local Development

```bash
npm install
npm run dev
```

Requires `.env.local` with:

```
KV_REST_API_URL=...
KV_REST_API_TOKEN=...
ADMIN_TOKEN=...
```
