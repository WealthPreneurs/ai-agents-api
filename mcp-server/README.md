# ai-agents-mcp-server

MCP server for the AI Agents API in this repo. It lets Claude (Claude Desktop,
Claude Code, or any MCP client) ask the consulting agents, run the Kingdom
Capital Deal Engine, and manage saved memos, all through the API with the same
login, billing, and limits as the dashboard.

## Tools

| Tool | What it does |
|---|---|
| `aiagents_list_agents` | Lists the consulting agents and their specialties |
| `aiagents_ask_agent` | Asks one agent a question (single turn) |
| `aiagents_get_health` | API status: Claude key, Deal Engine model, login/billing config |
| `dealengine_evaluate_deal` | Runs a deal through the Deal Engine and returns the memorandum. Reports progress for each agent stage and saves the memo to the dashboard (`save=false` to skip) |
| `dealengine_list_saved_deals` | Lists saved memos, newest first. Filter by verdict or name, with pagination |
| `dealengine_get_saved_deal` | One saved memo: summary or full detail, as Markdown or JSON |
| `dealengine_delete_saved_deal` | Deletes a saved memo (destructive) |
| `dealengine_get_billing_status` | Plan, memos used and remaining, reset date |

An evaluation takes a few minutes and uses one memo from the user's plan,
exactly as it does in the dashboard.

## Setup

```bash
cd mcp-server
npm install
npm run build
```

### Environment

| Variable | Needed for | Notes |
|---|---|---|
| `AI_AGENTS_API_URL` | all tools | Default `http://localhost:3000` |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Deal Engine, saved deals, billing | Same values as the dashboard's `VITE_SUPABASE_*` |
| `DEAL_ENGINE_EMAIL`, `DEAL_ENGINE_PASSWORD` | Deal Engine, saved deals, billing | A dashboard login. The server signs in and refreshes the session itself |
| `AI_AGENTS_ACCESS_TOKEN` | alternative to email/password | A Supabase session token. These expire after about an hour |
| `DEAL_ENGINE_TIMEOUT_MS` | optional | Evaluation timeout, default 15 minutes |

The consulting-agent tools need only `AI_AGENTS_API_URL`.

### Claude Desktop / Claude Code

```json
{
  "mcpServers": {
    "ai-agents": {
      "command": "node",
      "args": ["/absolute/path/to/ai-agents-api/mcp-server/dist/index.js"],
      "env": {
        "AI_AGENTS_API_URL": "https://your-api.example.com",
        "SUPABASE_URL": "https://xxxx.supabase.co",
        "SUPABASE_ANON_KEY": "…",
        "DEAL_ENGINE_EMAIL": "you@example.com",
        "DEAL_ENGINE_PASSWORD": "…"
      }
    }
  }
}
```

With Claude Code you can also run:

```bash
claude mcp add ai-agents -e AI_AGENTS_API_URL=http://localhost:3000 -- node mcp-server/dist/index.js
```

## Verify

```bash
npm run build && npm run smoke
```

`npm run smoke` starts a mock of the API and Supabase, runs the built server
over stdio, and calls every tool. It uses no network access and no Claude
credits. For manual testing, run
`npx @modelcontextprotocol/inspector node dist/index.js`.
