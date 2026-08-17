# ai-agents-api
Ai consulting agents automation API

## Endpoints

### `POST /agent`
Body: `{ "agent": "victoria" | "marcus" | "amara" | "nia" | "xavier", "message": "..." }`
Routes the message to one of five consulting-agent personas via Claude.

### `POST /visibility-report`
Body: `{ "name": "Business Name", "city": "City, ST" }`

Builds a real AI Visibility & Local Ranking Report for a business:
- Looks up the business on Google (Places API) for its Google Business Profile data — address, phone, website, rating, review count, photos, etc.
- Fetches the business's website and checks it for LocalBusiness schema markup, HTTPS, and mobile-friendliness.
- Queries Claude live with two prompts (a category-recommendation query and a business-lookup query) and checks whether the business is actually mentioned — this is the "AI answer engine visibility" signal.
- Looks up nearby competitors in the same category via Places API for comparison.
- Scores GBP completeness, AI visibility, and website/schema readiness, and returns prioritized recommendations.

Requires `GOOGLE_PLACES_API_KEY` and `CLAUDE_API_KEY`.

## Environment variables

| Variable | Required for | Notes |
| --- | --- | --- |
| `CLAUDE_API_KEY` | `/agent`, `/visibility-report` | Anthropic API key |
| `GOOGLE_PLACES_API_KEY` | `/visibility-report` | Google Cloud API key with the Places API enabled |
| `PORT` | — | Defaults to `3000` |
