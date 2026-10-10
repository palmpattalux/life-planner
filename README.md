# Life Planner

A simple white board, like Miro. Log in from any device.

- Press **b** to add a circle at the cursor.
- Drag a circle to move it anywhere.

Built with Next.js, TypeScript, Tailwind CSS and Supabase (login). Deployed on Vercel.

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
| `src/components/Board.tsx` | The white board |
| `src/app/login/` | Log in and create account |
| `src/middleware.ts` | Keeps you logged in and protects every page |
