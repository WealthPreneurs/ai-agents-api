# ai-agents-api
Ai consulting agents automation API

## Endpoints

### `POST /agent`
Body: `{ "agent": "victoria" | "marcus" | "amara" | "nia" | "xavier", "message": "..." }`
Routes the message to one of five consulting-agent personas via Claude.

### `POST /visibility-report`
Body: `{ "name": "Business Name", "city": "City, ST", "website": "https://example.com" }` (`website` is optional)

Builds a real AI Visibility & Local Ranking Report for a business, using only free data sources — no Google Places billing:
- Looks up the business via the **Yelp Fusion API** (free tier, no billing) for rating, review count, photos, phone, address, and categories.
- If a `website` is provided, fetches it live and checks for LocalBusiness schema markup, HTTPS, and mobile-friendliness. Yelp doesn't expose a business's own website, so without one the report treats the business as having no website on file.
- Queries Claude live with two prompts (a category-recommendation query and a business-lookup query) and checks whether the business is actually mentioned — this is the "AI answer engine visibility" signal.
- Looks up nearby competitors in the same category via Yelp for comparison.
- Scores GBP-style completeness, AI visibility, and website/schema readiness, and returns prioritized recommendations.

Requires `YELP_API_KEY` and `CLAUDE_API_KEY`.

## Environment variables

| Variable | Required for | Notes |
| --- | --- | --- |
| `CLAUDE_API_KEY` | `/agent`, `/visibility-report` | Anthropic API key |
| `YELP_API_KEY` | `/visibility-report` | Yelp Fusion API key — free tier, sign up at yelp.com/developers, no billing required |
| `PORT` | — | Defaults to `3000`, only used when running standalone (`node index.js`) |

## Running on Netlify

The Express app is wrapped as a single Netlify Function (`netlify/functions/api.js`, via `serverless-http`), and `netlify.toml` redirects every request to it — so `/agent`, `/visibility-report`, `/health`, etc. all work the same as running `node index.js` locally.

Setup:
1. Connect this repo to a Netlify site (or run `netlify deploy` from a Netlify CLI you've logged in with).
2. In the Netlify dashboard: **Site configuration → Environment variables**, add `CLAUDE_API_KEY` and `YELP_API_KEY`.
3. Deploy (or trigger a redeploy after adding env vars — they don't apply retroactively to a running deploy).
4. Test with `curl https://<your-site>.netlify.app/health`.

Note: Netlify Functions have an execution timeout (10s on the free tier). `/visibility-report` makes several external calls (Yelp lookup, a website fetch, two Claude queries, and a competitors lookup) — these run concurrently where possible to stay under that limit, but a slow website fetch or slow Claude response can still push close to it. If you see timeouts in practice, consider Netlify's paid-tier longer function timeout or trimming the competitors lookup.

`node index.js` still works standalone (e.g. for local dev, or non-Netlify hosts) — `index.js` only calls `app.listen()` when run directly, and exports the Express app for the function wrapper to use otherwise.
