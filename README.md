# Life Planner

A visual, vertical timeline of the phases of your life, with the goals and
events that belong to each one. It answers one question fast:
**"In this phase of my life, what should I be doing?"**

Plan once, then come back for a quick look and get back on track.

- **Now**: opens on the phase you're in today, what it's about, your top goals and what's coming up.
- **Timeline**: every phase on one vertical line, past at the top, future at the bottom. Add, edit and tick off goals and events.
- Log in from any device. Your data is private to your account.

Built with Next.js, TypeScript, Tailwind CSS and Supabase. Deployed on Vercel.

## Setup

### 1. Supabase (login and database)

1. Create a free project at [supabase.com](https://supabase.com).
2. Open **SQL Editor → New query**, paste everything in [`supabase/schema.sql`](supabase/schema.sql) and click **Run**.
3. Open **Project Settings → API** (or the **Connect** button) and copy the **Project URL** and the **anon / publishable key**.

### 2. Run it on your computer (optional)

```bash
npm install
cp .env.example .env.local   # then paste your two Supabase values in
npm run dev
```

Open http://localhost:3000.

### 3. Put it online with Vercel

1. Sign in at [vercel.com](https://vercel.com) with GitHub and import this repo.
2. Add the two environment variables from `.env.example` with your Supabase values.
3. Click **Deploy**.
4. Back in Supabase, open **Authentication → URL Configuration** and set **Site URL** to your Vercel address (for example `https://life-planner.vercel.app`) so confirmation emails link back to the app.

### 4. Make confirmation links work on any device (recommended)

By default the "Confirm your email" link only logs you in if you open it in
the same browser you signed up in. To make it work everywhere (for example,
signing up on a laptop and tapping the link in the Gmail app on your phone):

1. In Supabase open **Authentication → Emails → Templates → Confirm signup**.
2. Replace the link in the message body with:

   ```html
   <a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email">Confirm your email</a>
   ```

3. Click **Save**.

## How it's organised

| Path | What it does |
| --- | --- |
| `src/app/page.tsx` | The **Now** screen |
| `src/app/timeline/page.tsx` | The vertical timeline board |
| `src/app/login/` | Log in and sign up |
| `src/app/actions.ts` | Saving, editing and deleting phases and items |
| `src/middleware.ts` | Keeps you logged in and protects every page |
| `supabase/schema.sql` | Database tables and privacy rules |
