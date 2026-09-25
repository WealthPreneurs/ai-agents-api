// Kingdom Capital AI Deal Engine
// Runs a deal through the five archetypal agents (Joseph, Abraham, Lydia,
// Solomon, Steward) in a single structured-output Claude call, then computes
// the weighted scorecard and Go/No-Go verdict deterministically on the server.

const AnthropicModule = require('@anthropic-ai/sdk');
const Anthropic = AnthropicModule.default || AnthropicModule;

const DEAL_ENGINE_MODEL = process.env.DEAL_ENGINE_MODEL || 'claude-opus-5';
const DEAL_ENGINE_EFFORT = process.env.DEAL_ENGINE_EFFORT || 'high';

// ---------------------------------------------------------------------------
// Scoring configuration
// ---------------------------------------------------------------------------

const SCORE_CATEGORIES = [
  { key: 'market_opportunity', label: 'Market Opportunity', weight: 0.15 },
  { key: 'timing', label: 'Timing', weight: 0.10 },
  { key: 'cash_flow', label: 'Cash Flow', weight: 0.15 },
  { key: 'asset_control', label: 'Asset Control', weight: 0.10 },
  { key: 'competitive_moat', label: 'Competitive Moat', weight: 0.10 },
  { key: 'scalability', label: 'Scalability', weight: 0.10 },
  { key: 'capital_efficiency', label: 'Capital Efficiency', weight: 0.10 },
  { key: 'technology_leverage', label: 'Technology Leverage', weight: 0.05 },
  { key: 'kingdom_alignment', label: 'Kingdom Alignment', weight: 0.10 },
  { key: 'founder_operator_fit', label: 'Founder/Operator Fit', weight: 0.05 },
];

const REJECTION_CRITERIA = [
  'deception',
  'fraudulent_reporting',
  'predatory_behavior',
  'illegal_activity',
  'exploiting_vulnerable_people',
  'hidden_assumption_economics',
];

// Kingdom Alignment below this score fails the Steward gate outright.
const KINGDOM_ALIGNMENT_MIN = 5;
const GO_THRESHOLD = 7.5;
const CONDITIONAL_THRESHOLD = 6.0;

const SIGNALS = ['emerging', 'growing', 'mature', 'declining', 'disrupted'];
const CONTROL_STRATEGIES = ['Buy', 'Control', 'Partner', 'Lease', 'Contract', 'License'];
const LADDER_RUNGS = [
  'Transaction',
  'Subscription',
  'Membership',
  'Premium Service',
  'Licensing',
  'Partnership',
  'Ecosystem',
];
const SCALE_STAGES = [
  'Manual',
  'Documented',
  'Automated',
  'Delegated',
  'Platform',
  'Network',
  'Institution',
];
const CAPITAL_SOURCES = [
  'Seller Capital',
  'Debt',
  'Strategic Partners',
  'Private Capital',
  'Institutional',
  'Retained Earnings',
];

// ---------------------------------------------------------------------------
// JSON schema for structured output
// ---------------------------------------------------------------------------

const str = { type: 'string' };
const strArr = { type: 'array', items: str };
const int = { type: 'integer' };

function obj(properties) {
  return {
    type: 'object',
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}

const scoredItem = obj({ score: int, analysis: str });
const kingdomQuestion = obj({ pass: { type: 'boolean' }, analysis: str });

// Property order matters: the model writes the agents in sequence, and the
// executive summary last so it can draw on every agent's findings. The
// streaming progress events below rely on this order too.
const MEMO_SCHEMA = obj({
  deal_name: str,
  joseph: obj({
    signal: { type: 'string', enum: SIGNALS },
    signal_rationale: str,
    macro_trends: strArr,
    local_dynamics: str,
    technology_shifts: str,
    unmet_future_need: str,
    horizon_outlook: obj({ year_3: str, year_5: str, year_10: str }),
  }),
  abraham: obj({
    asset_test: obj({
      asset: scoredItem,
      barrier: scoredItem,
      cash_flow: scoredItem,
      control: scoredItem,
      compounding: scoredItem,
      strategic_position: scoredItem,
    }),
    control_strategy: { type: 'string', enum: CONTROL_STRATEGIES },
    control_strategy_rationale: str,
    control_points: strArr,
  }),
  lydia: obj({
    customer_segments: {
      type: 'array',
      items: obj({
        segment: str,
        pain_point: str,
        willingness_to_pay: { type: 'string', enum: ['high', 'medium', 'low'] },
      }),
    },
    pricing_power: { type: 'string', enum: ['strong', 'moderate', 'weak'] },
    pricing_power_rationale: str,
    monetization_ladder: {
      type: 'array',
      items: obj({
        rung: { type: 'string', enum: LADDER_RUNGS },
        offer: str,
        revenue_impact: str,
      }),
    },
    revenue_expansion_plan: strArr,
  }),
  solomon: obj({
    current_stage: { type: 'string', enum: SCALE_STAGES },
    target_stage: { type: 'string', enum: SCALE_STAGES },
    scale_stack: {
      type: 'array',
      items: obj({ stage: { type: 'string', enum: SCALE_STAGES }, actions: strArr }),
    },
    bottlenecks: strArr,
    systems_required: strArr,
    ai_automation_opportunities: strArr,
  }),
  steward: obj({
    honesty: kingdomQuestion,
    productivity: kingdomQuestion,
    beneficence: kingdomQuestion,
    sustainability: kingdomQuestion,
    multiplicability: kingdomQuestion,
    rejection_checks: {
      type: 'array',
      items: obj({
        criterion: { type: 'string', enum: REJECTION_CRITERIA },
        triggered: { type: 'boolean' },
        note: str,
      }),
    },
    overall_assessment: str,
    conditions: strArr,
  }),
  scorecard: obj(
    Object.fromEntries(
      SCORE_CATEGORIES.map((c) => [c.key, obj({ score: int, rationale: str })])
    )
  ),
  capital_stack: obj({
    total_capital_required: str,
    layers: {
      type: 'array',
      items: obj({
        source: { type: 'string', enum: CAPITAL_SOURCES },
        percent: { type: 'number' },
        amount: str,
        terms: str,
      }),
    },
    structure_notes: str,
  }),
  roadmap: {
    type: 'array',
    items: obj({ window: str, focus: str, milestones: strArr }),
  },
  data_gaps: strArr,
  executive_summary: obj({
    headline: str,
    summary: str,
    key_strengths: strArr,
    key_risks: strArr,
  }),
});

// Top-level memo keys in schema order, used for streaming progress.
const STAGE_KEYS = Object.keys(MEMO_SCHEMA.properties);

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are the KINGDOM CAPITAL AI DEAL ENGINE, a multi-agent executive operating system that evaluates businesses, real estate, infrastructure, and technology opportunities through biblical archetypes and institutional-grade financial rigor.

Core formula: Wisdom → Intelligence → Opportunity → Acquisition → Optimization → Cash Flow → Reinvestment → Kingdom Impact.

Run every deal through five agents, in order, and produce an institutional-grade Kingdom Capital Investment Memorandum as structured JSON.

AGENT 1 — JOSEPH (Intelligence Engine). Core question: "What is changing, and what will people need 3–10 years from now that they aren't adequately preparing for today?" Analyze macroeconomic trends, local dynamics, and technology shifts relevant to the deal. Assign one market signal: emerging (early opportunity), growing (strong demand forming), mature (established market), declining (capital cautious), disrupted (vulnerable model). Give a 3-, 5-, and 10-year outlook.

AGENT 2 — ABRAHAM (Acquisition Engine). Core question: "What can we control?" Run the Abraham Asset Test, scoring each element 1–10 with analysis: Asset (the precise asset or productive capacity acquired), Barrier (the moat), Cash Flow (how it produces predictable money), Control (how much of the economics and operations we control), Compounding (does ownership become more valuable over time), Strategic Position (access to wider control points). Choose a control strategy: Buy, Control, Partner, Lease, Contract, or License, and list the specific control points.

AGENT 3 — LYDIA (Monetization Engine). Core question: "Who values this enough to pay a premium, and how do we scale customer LTV?" Map customer segments with pain points and willingness to pay, judge pricing power, and build a Monetization Ladder using the rungs Transaction → Subscription → Membership → Premium Service → Licensing → Partnership → Ecosystem. Include only rungs that are realistic for this deal, in ladder order.

AGENT 4 — SOLOMON (Scale & Infrastructure Engine). Core question: "What infrastructure makes this bigger than the founder?" Place the operation on Solomon's Scale Stack (Manual → Documented → Automated → Delegated → Platform → Network → Institution), set a realistic target stage, give concrete actions for each stage between current and target, and name bottlenecks, required systems, and AI/automation opportunities.

AGENT 5 — STEWARD (Kingdom Governance Engine). Core question: "Are we building something honest, productive, sustainable, and worthy of multiplication?" Answer the Five Kingdom Questions with pass/fail and analysis: Honesty (Proverbs 11:1 — "A false balance is an abomination to the LORD, but a just weight is His delight"), Productivity, Beneficence, Sustainability, Multiplicability. Then check every Automatic Rejection Criterion — deception, fraudulent_reporting, predatory_behavior, illegal_activity, exploiting_vulnerable_people, hidden_assumption_economics — returning exactly one entry per criterion. Mark a criterion triggered only when the deal as described genuinely involves it; missing information alone is a data gap, not a trigger, unless the economics only work because of an undisclosed or unverifiable assumption.

INVESTMENT COMMITTEE SCORECARD. Score each category as an integer 1–10 with a rationale: market_opportunity, timing, cash_flow, asset_control, competitive_moat, scalability, capital_efficiency, technology_leverage, kingdom_alignment, founder_operator_fit. The weighted score and verdict are computed from your scores by the system, so score each category honestly and independently. Reference thresholds: 7.5+ is GO, 6.0–7.49 is CONDITIONAL GO, below 6.0 is NO-GO, and kingdom_alignment below ${KINGDOM_ALIGNMENT_MIN} or any triggered rejection criterion is an AUTOMATIC REJECTION.

OPTIMIZED CAPITAL STACK. Structure the acquisition across Seller Capital, Debt, Strategic Partners, Private Capital, Institutional, and Retained Earnings. Use only the layers that fit; percents must sum to 100. Give dollar amounts where the inputs allow, with terms (rate, amortization, earn-out, equity split, etc.). If the deal fails the Steward gate, return an empty layers array and explain in structure_notes that capital is not structured for rejected deals.

90-DAY EXECUTION ROADMAP. Three windows — "Days 1–30", "Days 31–60", "Days 61–90" — each with a focus and concrete milestones. For a rejected deal, make the roadmap about walking away cleanly or what would have to change for reconsideration.

RIGOR RULES
- Use the numbers the user gives. Show the arithmetic behind any derived metric (cap rate, DSCR, multiple, payback, cash-on-cash) inside the relevant analysis text.
- Never invent figures and present them as facts. When you must assume, label it "Assumption:" and keep it conservative.
- List every material missing input in data_gaps (e.g., "Trailing 3 years of tax returns", "Rent roll with lease expirations").
- Be direct and specific to this deal; avoid generic filler.
- The executive summary is written last and must reflect the analysis above it.`;

// ---------------------------------------------------------------------------
// Deal input formatting
// ---------------------------------------------------------------------------

const INPUT_FIELDS = [
  ['dealName', 'Deal name'],
  ['dealType', 'Deal type'],
  ['location', 'Location / market'],
  ['askingPrice', 'Asking price'],
  ['revenue', 'Annual revenue / gross income'],
  ['earnings', 'EBITDA / SDE / NOI'],
  ['description', 'Description'],
  ['financials', 'Additional financials'],
  ['sellerSituation', 'Seller situation'],
  ['operatorProfile', 'Buyer / operator profile'],
  ['capitalAvailable', 'Capital available to deploy'],
  ['notes', 'Other notes'],
];

function formatDeal(deal) {
  const lines = [];
  for (const [key, label] of INPUT_FIELDS) {
    const value = typeof deal[key] === 'string' ? deal[key].trim() : '';
    if (value) lines.push(`## ${label}\n${value}`);
  }
  return `Evaluate the following opportunity and produce the full Kingdom Capital Investment Memorandum.\n\n${lines.join('\n\n')}`;
}

function validateDeal(deal) {
  if (!deal || typeof deal !== 'object') return 'Request body must be a JSON object.';
  const description = typeof deal.description === 'string' ? deal.description.trim() : '';
  if (description.length < 20) {
    return 'Please include a deal description of at least 20 characters.';
  }
  const total = INPUT_FIELDS.reduce(
    (n, [key]) => n + (typeof deal[key] === 'string' ? deal[key].length : 0),
    0
  );
  if (total > 40000) return 'Deal input is too long (40,000 character limit).';
  return null;
}

// ---------------------------------------------------------------------------
// Deterministic scoring
// ---------------------------------------------------------------------------

function clampScore(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return 1;
  return Math.min(10, Math.max(1, v));
}

function evaluateScorecard(memo) {
  const rows = SCORE_CATEGORIES.map((c) => {
    const entry = memo.scorecard?.[c.key] || {};
    const score = clampScore(entry.score);
    return {
      key: c.key,
      label: c.label,
      weight: c.weight,
      score,
      weighted: Math.round(score * c.weight * 100) / 100,
      rationale: entry.rationale || '',
    };
  });
  const weightedScore =
    Math.round(rows.reduce((sum, r) => sum + r.score * r.weight, 0) * 100) / 100;

  const triggered = (memo.steward?.rejection_checks || []).filter((r) => r.triggered);
  const kingdomScore = rows.find((r) => r.key === 'kingdom_alignment').score;
  const kingdomFailed = kingdomScore < KINGDOM_ALIGNMENT_MIN;

  let verdict;
  const reasons = [];
  if (triggered.length > 0 || kingdomFailed) {
    verdict = 'AUTOMATIC REJECTION';
    for (const t of triggered) reasons.push(`Rejection criterion triggered: ${t.criterion.replace(/_/g, ' ')}`);
    if (kingdomFailed) {
      reasons.push(`Kingdom Alignment scored ${kingdomScore}/10 (minimum ${KINGDOM_ALIGNMENT_MIN})`);
    }
  } else if (weightedScore >= GO_THRESHOLD) {
    verdict = 'GO';
  } else if (weightedScore >= CONDITIONAL_THRESHOLD) {
    verdict = 'CONDITIONAL GO';
  } else {
    verdict = 'NO-GO';
  }

  return { rows, weightedScore, verdict, gate: { passed: reasons.length === 0, reasons } };
}

// ---------------------------------------------------------------------------
// Claude call
// ---------------------------------------------------------------------------

let client;
function getClient() {
  if (!client) {
    // CLAUDE_API_KEY matches the existing /agent endpoint; the SDK falls back
    // to ANTHROPIC_API_KEY when it's unset.
    const apiKey = process.env.CLAUDE_API_KEY;
    client = apiKey ? new Anthropic({ apiKey }) : new Anthropic();
  }
  return client;
}

// Streams the evaluation. onEvent receives {type: 'stage', stage} as each
// agent section begins, then the caller gets the finished memo back. Pass an
// AbortSignal to cancel the model call when the client goes away.
async function evaluateDeal(deal, onEvent = () => {}, signal) {
  const stream = getClient().beta.messages.stream({
    model: DEAL_ENGINE_MODEL,
    max_tokens: 64000,
    thinking: { type: 'adaptive' },
    output_config: {
      effort: DEAL_ENGINE_EFFORT,
      format: { type: 'json_schema', schema: MEMO_SCHEMA },
    },
    // Server-side refusal fallback: if the primary model declines, the API
    // re-runs the request on a fallback model within the same call.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: formatDeal(deal) }],
  }, { signal });

  onEvent({ type: 'stage', stage: 'thinking' });

  let text = '';
  let stageIndex = -1;
  stream.on('text', (delta) => {
    text += delta;
    // Advance progress as each top-level memo key appears in the output.
    for (let i = stageIndex + 1; i < STAGE_KEYS.length; i++) {
      if (text.includes(`"${STAGE_KEYS[i]}"`)) {
        stageIndex = i;
        onEvent({ type: 'stage', stage: STAGE_KEYS[i] });
      } else {
        break;
      }
    }
  });

  const message = await stream.finalMessage();

  if (message.stop_reason === 'refusal') {
    const err = new Error('The model declined to evaluate this deal.');
    err.status = 422;
    throw err;
  }
  if (message.stop_reason === 'max_tokens') {
    const err = new Error('The memorandum was cut off before completion. Try trimming the deal input.');
    err.status = 502;
    throw err;
  }

  const body = message.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');

  let memo;
  try {
    memo = JSON.parse(body);
  } catch {
    const err = new Error('The engine returned an unreadable memorandum. Please retry.');
    err.status = 502;
    throw err;
  }

  return {
    memo,
    evaluation: evaluateScorecard(memo),
    model: message.model,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = {
  evaluateDeal,
  evaluateScorecard,
  validateDeal,
  formatDeal,
  MEMO_SCHEMA,
  SCORE_CATEGORIES,
  DEAL_ENGINE_MODEL,
};
