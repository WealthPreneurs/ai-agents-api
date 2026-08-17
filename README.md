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
| `PORT` | — | Defaults to `3000` |
