# AI Worker Dashboard

Client-facing dashboard for the WealthPreneurs AI worker product. Business
owners log in to review, edit, and approve AI-generated drafts before they
go live. See `CLAUDE.md` in this folder for the full project brief.

## Setup

```bash
cd dashboard
npm install
cp .env.example .env   # fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
```

Run `supabase/schema.sql` in your Supabase project's SQL editor before
starting the app.

## Development

```bash
npm run dev
```

## Build

```bash
npm run build
```
