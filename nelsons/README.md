# Nelsons Property Group Toolkit

*Transforming Real Estate into Opportunity.*

Schemas, import templates, scripts, and SOPs for acquisitions, CRM, bookkeeping, and
corporate partnerships. Files are grouped by the 5-phase roadmap.

| Phase | Files |
|---|---|
| 1. Foundations | `schemas/bookkeeping-categories.json`: income and expense categories |
| 2. Deal Systems | `schemas/leads.schema.json`, `schemas/deals.schema.json`, `scripts/underwrite.js`, `sops/acquisition-underwriting.md` |
| 3. Outreach | `templates/leads-import.csv`: bulk import for Direct Mail, Driving for Dollars, and FB Ad lists |
| 4. SOPs | `sops/` |
| 5. Impact | `sops/partnership-frameworks.md` |

## CRM import templates

`templates/leads-import.csv` and `templates/deals-import.csv` use the exact Podio / Airtable
field names from the JSON schemas, so columns map 1:1. Each has one example row; delete it
before importing.

## Underwriting

```bash
node nelsons/scripts/underwrite.js --asking 45000 --repairs 12000 --arv 85000 \
  --type "Mobile Home on Land" --motivation Hot --demand 7 --risk 4 --creative 8
```

Flags: `--asking`, `--repairs`, `--arv` (required), `--holding`, `--closing`, `--type`,
`--motivation` (Hot/Warm/Cold or 1–10), `--demand`, `--risk`, `--creative` (1–10).
Prints net profit, ROI, the Buy Box result with reasons, the Deal Confidence Score, and every
default it assumed. You can also `require('./nelsons/scripts/underwrite')` it from code.

## Underwriting API

`POST /nelsons/underwrite` runs the same script on the API server. It requires the same
dashboard login as the Deal Engine (`Authorization: Bearer <Supabase token>`; set
`DEAL_ENGINE_AUTH=off` for local development). It makes no Claude call, so it does not use
up Deal Engine memos.

```bash
curl -X POST http://localhost:3000/nelsons/underwrite \
  -H 'Content-Type: application/json' -H "Authorization: Bearer $TOKEN" \
  -d '{"askingPrice":45000,"repairEstimate":12000,"arv":85000,
       "propertyType":"Mobile Home on Land","sellerMotivation":"Hot",
       "marketDemand":7,"inspectionRisk":4,"creativeStructure":8}'
```

Body fields: `askingPrice`, `repairEstimate`, `arv` (required, numbers), `holdingCosts`,
`closingCosts` (numbers), `propertyType` (text), `sellerMotivation` (Hot/Warm/Cold or 1–10),
`marketDemand`, `inspectionRisk`, `creativeStructure` (1–10). Returns the same JSON as the CLI.
Bad input returns `400` with an `errors` list.

## Tests

```bash
npm test
```

## Defaults to confirm

The spec did not pin these down, so they are placeholders. Change them in
`scripts/underwrite.js` or the schemas:

- Closing costs default to 3% of Asking Price; holding costs default to $0.
- Confidence Score weights the four factors equally; Hot/Warm/Cold map to 9/6/3.
- Occupancy Status options: Owner Occupied, Tenant Occupied, Vacant, Unknown.
- "Light Rehab" means SFH or Multi-family with repairs ≤ $30,000.
