# SOP: Acquisition Underwriting

Phase 2 (Deal Systems). Run every lead through this before an offer goes out.

## Buy Box

| Rule | Value |
|---|---|
| Target property types | Mobile Home on Land, Vacant Land, Light Rehabs (SFH / Multi-family) |
| Minimum ROI | 25% |
| Max repair cost | $30,000 |

## Formulas

- **Net Profit** = ARV − (Asking Price + Estimated Repairs + Holding Costs + Closing Costs)
- **ROI / Profit Estimate** = ((ARV − (Asking Price + Repair Estimate)) / (Asking Price + Repair Estimate)) × 100
- **Deal Confidence Score (1–10)**: equal-weight average, rounded, of
  Seller Motivation (Hot 9 / Warm 6 / Cold 3, or a 1–10 rating), Market Demand (1–10),
  Inspection Risk (1–10, inverted so higher risk lowers the score), and
  Creative Deal Structure Potential (1–10).

## Steps

1. Pull Asking Price, Repair Estimate, and ARV from the Lead / Deal record. All three are
   required; the script refuses to run without them.
2. Add Holding and Closing Costs if known. If not, the script assumes $0 holding and 3% of
   Asking Price for closing, and lists both under `assumptions`. Replace them with real
   numbers before you commit to an offer.
3. Run:
   ```bash
   node nelsons/scripts/underwrite.js --asking 45000 --repairs 12000 --arv 85000 \
     --type "Mobile Home on Land" --motivation Hot --demand 7 --risk 4 --creative 8
   ```
4. Copy `roiPercent` into the Deal's **ROI / Profit Estimate** field.
5. If `buyBox.pass` is false, log the `reasons` in **Notes** and move on, or escalate for a
   creative structure (seller finance, RTO, JV).
