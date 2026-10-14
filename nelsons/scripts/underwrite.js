#!/usr/bin/env node
// Nelsons Property Group — acquisition underwriting.
// Applies the Buy Box, the core profit/ROI formulas, and the 1–10 Deal
// Confidence Score. Usable as a module or from the command line:
//
//   node nelsons/scripts/underwrite.js --asking 45000 --repairs 12000 --arv 85000 \
//     --type "Mobile Home on Land" --motivation Hot --demand 7 --risk 4 --creative 8

// ---------------------------------------------------------------------------
// Buy Box
// ---------------------------------------------------------------------------

const BUY_BOX = {
  minRoiPercent: 25,
  maxRepairCost: 30000,
  // Mobile Homes on Land and Vacant Land are core targets. Any other property
  // type only fits as a Light Rehab, i.e. repairs within maxRepairCost.
  coreTypes: ['Mobile Home on Land', 'Vacant Land'],
  lightRehabTypes: ['SFH', 'Multi-family'],
};

// Used when holding or closing costs are not supplied. Reported back in
// `assumptions` so nobody mistakes them for real numbers.
const DEFAULTS = {
  closingCostRate: 0.03, // 3% of asking price
  holdingCosts: 0,
};

const MOTIVATION_SCORES = { Hot: 9, Warm: 6, Cold: 3 };

// ---------------------------------------------------------------------------
// Formulas
// ---------------------------------------------------------------------------

// Net Profit = ARV − (Asking Price + Estimated Repairs + Holding Costs + Closing Costs)
function netProfit({ arv, askingPrice, repairEstimate, holdingCosts, closingCosts }) {
  return arv - (askingPrice + repairEstimate + holdingCosts + closingCosts);
}

// ROI = ((ARV − (Asking Price + Repair Estimate)) / (Asking Price + Repair Estimate)) × 100
function roiPercent({ arv, askingPrice, repairEstimate }) {
  const basis = askingPrice + repairEstimate;
  if (basis <= 0) return null;
  return ((arv - basis) / basis) * 100;
}

// Deal Confidence Score: equal-weight average of four 1–10 factors, rounded
// to an integer. Inspection Risk is inverted (10 = riskiest → contributes 1).
// Seller Motivation accepts Hot/Warm/Cold or a 1–10 number.
function confidenceScore({ sellerMotivation, marketDemand, inspectionRisk, creativeStructure }) {
  const motivation =
    typeof sellerMotivation === 'string' ? MOTIVATION_SCORES[sellerMotivation] : sellerMotivation;
  const factors = {
    sellerMotivation: motivation,
    marketDemand,
    inspectionRisk: isScore(inspectionRisk) ? 11 - inspectionRisk : undefined,
    creativeStructure,
  };
  const missing = Object.keys(factors).filter((k) => !isScore(factors[k]));
  if (missing.length) return { score: null, factors, missing };
  const avg = Object.values(factors).reduce((a, b) => a + b, 0) / 4;
  return { score: Math.min(10, Math.max(1, Math.round(avg))), factors, missing };
}

function isScore(n) {
  return typeof n === 'number' && Number.isFinite(n) && n >= 1 && n <= 10;
}

// ---------------------------------------------------------------------------
// Underwriting
// ---------------------------------------------------------------------------

const MONEY_FIELDS = {
  askingPrice: { label: 'Asking Price', required: true },
  repairEstimate: { label: 'Repair Estimate', required: true },
  arv: { label: 'ARV', required: true },
  holdingCosts: { label: 'Holding Costs', required: false },
  closingCosts: { label: 'Closing Costs', required: false },
};

const SCORE_FIELDS = {
  marketDemand: 'Market Demand',
  inspectionRisk: 'Inspection Risk',
  creativeStructure: 'Creative Deal Structure Potential',
};

// Returns a list of problems with the input; empty when it can be underwritten.
function validateInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return ['Send the deal as a JSON object.'];
  }
  const errors = [];
  for (const [key, { label, required }] of Object.entries(MONEY_FIELDS)) {
    const value = input[key];
    if (value == null) {
      if (required) errors.push(`${label} is required and must be a non-negative number.`);
    } else if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      errors.push(`${label} must be a non-negative number.`);
    }
  }
  if (input.propertyType != null && typeof input.propertyType !== 'string') {
    errors.push('Property Type must be text.');
  }
  const motivation = input.sellerMotivation;
  if (motivation != null && !Object.hasOwn(MOTIVATION_SCORES, motivation) && !isScore(motivation)) {
    errors.push('Seller Motivation must be Hot, Warm, Cold, or a number from 1 to 10.');
  }
  for (const [key, label] of Object.entries(SCORE_FIELDS)) {
    if (input[key] != null && !isScore(input[key])) {
      errors.push(`${label} must be a number from 1 to 10.`);
    }
  }
  return errors;
}

function underwrite(input) {
  const errors = validateInput(input);
  if (errors.length) return { ok: false, errors };
  const assumptions = [];

  const { askingPrice, repairEstimate, arv, propertyType } = input;
  let { holdingCosts, closingCosts } = input;
  if (holdingCosts == null) {
    holdingCosts = DEFAULTS.holdingCosts;
    assumptions.push(`Holding Costs not provided; assumed $${holdingCosts}.`);
  }
  if (closingCosts == null) {
    closingCosts = Math.round(askingPrice * DEFAULTS.closingCostRate);
    assumptions.push(
      `Closing Costs not provided; assumed ${DEFAULTS.closingCostRate * 100}% of Asking Price ($${closingCosts}).`
    );
  }

  const numbers = { arv, askingPrice, repairEstimate, holdingCosts, closingCosts };
  const roi = roiPercent(numbers);
  const profit = netProfit(numbers);
  const confidence = confidenceScore(input);
  if (confidence.missing.length) {
    assumptions.push(`Confidence Score not computed; missing or invalid: ${confidence.missing.join(', ')}.`);
  }

  const buyBox = checkBuyBox({ propertyType, repairEstimate, roi });

  return {
    ok: true,
    netProfit: profit,
    roiPercent: roi == null ? null : round2(roi),
    confidenceScore: confidence.score,
    confidenceFactors: confidence.factors,
    buyBox,
    assumptions,
  };
}

function checkBuyBox({ propertyType, repairEstimate, roi }) {
  const reasons = [];
  if (!propertyType) {
    reasons.push('Property Type not provided.');
  } else if (
    !BUY_BOX.coreTypes.includes(propertyType) &&
    !BUY_BOX.lightRehabTypes.includes(propertyType)
  ) {
    reasons.push(`Property Type "${propertyType}" is outside the Buy Box.`);
  }
  if (repairEstimate > BUY_BOX.maxRepairCost) {
    reasons.push(`Repairs $${repairEstimate} exceed the $${BUY_BOX.maxRepairCost} max.`);
  }
  if (roi == null || roi < BUY_BOX.minRoiPercent) {
    reasons.push(`ROI ${roi == null ? 'n/a' : round2(roi) + '%'} is below the ${BUY_BOX.minRoiPercent}% minimum.`);
  }
  return { pass: reasons.length === 0, reasons };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const FLAGS = {
  '--asking': ['askingPrice', Number],
  '--repairs': ['repairEstimate', Number],
  '--arv': ['arv', Number],
  '--holding': ['holdingCosts', Number],
  '--closing': ['closingCosts', Number],
  '--type': ['propertyType', String],
  '--motivation': ['sellerMotivation', (v) => (v in MOTIVATION_SCORES ? v : Number(v))],
  '--demand': ['marketDemand', Number],
  '--risk': ['inspectionRisk', Number],
  '--creative': ['creativeStructure', Number],
};

function parseArgs(argv) {
  const input = {};
  for (let i = 0; i < argv.length; i += 2) {
    const flag = FLAGS[argv[i]];
    if (!flag) throw new Error(`Unknown flag: ${argv[i]}`);
    input[flag[0]] = flag[1](argv[i + 1]);
  }
  return input;
}

if (require.main === module) {
  try {
    const result = underwrite(parseArgs(process.argv.slice(2)));
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.ok ? 0 : 1;
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  }
}

module.exports = {
  BUY_BOX,
  DEFAULTS,
  netProfit,
  roiPercent,
  confidenceScore,
  checkBuyBox,
  validateInput,
  underwrite,
  parseArgs,
};
