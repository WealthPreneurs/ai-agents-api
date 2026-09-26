# ai-agents-api
Ai consulting agents automation API

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Status, API key presence, Deal Engine model |
| POST | `/agent` | Chat with one of the consulting agents (`{ agent, message }`) |
| POST | `/deal-engine/evaluate` | Kingdom Capital Deal Engine — runs a deal through Joseph, Abraham, Lydia, Solomon, and Steward and returns an Investment Memorandum |

## Kingdom Capital Deal Engine

`POST /deal-engine/evaluate` takes a deal as JSON (`description` is required;
optional `dealName`, `dealType`, `location`, `askingPrice`, `revenue`,
`earnings`, `financials`, `sellerSituation`, `operatorProfile`,
`capitalAvailable`, `notes`) and streams newline-delimited JSON:

- `{"type":"stage","stage":"joseph"}` … progress as each agent section is written
- `{"type":"result","memo":{…},"evaluation":{…}}` — the full memorandum
- `{"type":"error","error":"…"}` on failure

Claude writes the agent analysis and the 1–10 category scores using structured
outputs (see `dealEngine.js`). The weighted score, the Steward gate, and the
GO / CONDITIONAL GO / NO-GO / AUTOMATIC REJECTION verdict are computed on the
server from those scores, so the arithmetic is always exact.

The dashboard's **Deal Engine** page (`dashboard/`) is the UI for this endpoint.

**Login and limits.** The endpoint only runs for logged-in dashboard users: the
dashboard sends the user's Supabase session token as `Authorization: Bearer
<token>`, and the API checks it with Supabase before calling Claude. Each user
gets `DEAL_ENGINE_DAILY_LIMIT` evaluations per day (UTC) and one at a time.
Counts are kept in memory, so they reset when the server restarts.

**Saved deals.** The dashboard stores each memorandum in the Supabase `deals`
table (row-level security scopes rows to their owner). Create it by running
`dashboard/supabase/deals.sql` in the Supabase SQL editor.

## Environment variables

| Variable | Default | Notes |
|---|---|---|
| `CLAUDE_API_KEY` | — | Required (falls back to `ANTHROPIC_API_KEY`) |
| `PORT` | `3000` | |
| `DEAL_ENGINE_MODEL` | `claude-opus-5` | Model used for deal evaluations |
| `DEAL_ENGINE_EFFORT` | `high` | `low` / `medium` / `high` / `xhigh` / `max` |
| `ALLOWED_ORIGINS` | `*` | Comma-separated origins allowed to call the API from a browser |
| `SUPABASE_URL` | — | Required for the Deal Engine login check (same project as the dashboard) |
| `SUPABASE_ANON_KEY` | — | Required for the Deal Engine login check |
| `DEAL_ENGINE_DAILY_LIMIT` | `20` | Evaluations per user per day |
| `DEAL_ENGINE_AUTH` | — | Set to `off` to skip the login check. Local development only |

## Run locally

```bash
npm install
CLAUDE_API_KEY=sk-ant-... SUPABASE_URL=https://xyz.supabase.co SUPABASE_ANON_KEY=... npm start   # API on :3000
cd dashboard && npm install && npm run dev   # dashboard on :5173, proxies to :3000
```
