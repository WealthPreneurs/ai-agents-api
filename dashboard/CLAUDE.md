# Project: WealthPreneurs AI Worker Dashboard (Phase 1)

## What this is
Client-facing dashboard for a subscription product. Business owners and content
creators log in and manage AI-generated drafts (social posts, etc.) that are
produced by a separate automation layer (Make.com + Claude API) and require
human approval before anything goes live.

This app does NOT call the Claude API and does NOT post to social platforms.
It only reads and writes to Supabase tables that Make.com also reads/writes.
Think of it as the control panel sitting on top of a shared database.

## Stack
- Vite + React (kept intentionally simple — no Next.js needed, this is a
  client-rendered dashboard, not a marketing site)
- Supabase (auth + Postgres + RLS) — schema is in `supabase/schema.sql`,
  already written, run it in the Supabase SQL editor before starting the app
- @supabase/supabase-js for all data access
- Plain CSS, no component library — keep it clean and minimal, this is a
  business tool

## Data model (already defined in supabase/schema.sql — do not redesign)
- `clients` — one row per business, id = the Supabase auth user id directly
  (a trigger auto-creates this row on signup)
- `client_memory` — key/value brand context (brand_voice, offers, audience,
  banned_claims) scoped to client_id
- `worker_runs` — every AI-generated draft, with a status field:
  pending_approval / approved / edited / rejected / executed / failed

RLS is already enabled in the schema — every table scopes to the logged-in
user's own client_id. Do not weaken or bypass this.

## Screens (built)
1. **Login** — Supabase auth (email/password + signup). On signup, the
   database trigger creates the client row automatically. Handles email
   confirmation flow, loading and error states.
2. **Approval Queue** — the core screen. Lists `worker_runs` rows where
   `status = 'pending_approval'` for the logged-in client. Renders each as a
   card showing the platform and drafted content (from `raw_output`).
   Three actions per card:
   - Approve → set status = 'approved', approved_at = now()
   - Edit → open the content in an editable textarea, save changes into
     raw_output, set status = 'edited', approved_at = now()
   - Reject → set status = 'rejected'
3. **Memory Settings** — form listing/editing `client_memory` rows for
   this client (brand_voice, offers, audience, banned_claims as separate
   entries). Add/edit/delete of entries, with per-entry saving state.

## What's done
- Polish/styling pass — spinner on initial auth check, saving/working states
  on all Supabase-writing actions, disabled buttons mid-request
- Empty states for both the approval queue and memory settings
- Loading/error states (with retry) on all Supabase reads
- Logout button in the sidebar with an in-flight "Logging out..." state
- Responsive layout: sidebar collapses into a slide-out drawer behind a
  hamburger button below 720px, cards stack their actions vertically

## Not built yet (later phases — do not build)
- History log screen, Stripe billing, multiple workers beyond
  social_media_manager, tier gating

## Environment variables needed
Copy `.env.example` to `.env` and fill in:
- VITE_SUPABASE_URL
- VITE_SUPABASE_ANON_KEY
(Get both from Supabase project settings → API)

## Ground rules
- Don't add a backend/API server — Supabase's client SDK + RLS is the entire
  backend for this phase.
- Don't touch the schema without checking with the business owner first — the
  Make.com automation depends on this exact table/column structure.
- Keep it to these two screens for now — resist scope creep into the other 15
  workers or the billing system until this is tested and working.
