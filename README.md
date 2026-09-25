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

## Environment variables

| Variable | Default | Notes |
|---|---|---|
| `CLAUDE_API_KEY` | — | Required (falls back to `ANTHROPIC_API_KEY`) |
| `PORT` | `3000` | |
| `DEAL_ENGINE_MODEL` | `claude-opus-5` | Model used for deal evaluations |
| `DEAL_ENGINE_EFFORT` | `high` | `low` / `medium` / `high` / `xhigh` / `max` |
| `ALLOWED_ORIGINS` | `*` | Comma-separated origins allowed to call the API from a browser |

## Run locally

```bash
npm install
CLAUDE_API_KEY=sk-ant-... npm start      # API on :3000
cd dashboard && npm install && npm run dev   # dashboard on :5173, proxies to :3000
```
