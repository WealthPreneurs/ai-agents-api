// Static metadata for the Kingdom Capital Deal Engine screens.

export const AGENT_STAGES = [
  {
    key: 'joseph',
    name: 'Joseph',
    engine: 'Intelligence Engine',
    question: 'What is changing, and what will people need 3–10 years from now?',
  },
  {
    key: 'abraham',
    name: 'Abraham',
    engine: 'Acquisition Engine',
    question: 'What can we control?',
  },
  {
    key: 'lydia',
    name: 'Lydia',
    engine: 'Monetization Engine',
    question: 'Who values this enough to pay a premium?',
  },
  {
    key: 'solomon',
    name: 'Solomon',
    engine: 'Scale & Infrastructure Engine',
    question: 'What infrastructure makes this bigger than the founder?',
  },
  {
    key: 'steward',
    name: 'Steward',
    engine: 'Kingdom Governance Engine',
    question: 'Is this honest, productive, sustainable, and worthy of multiplication?',
  },
]

// Progress steps shown while the engine runs, in the order the API emits them.
export const PROGRESS_STEPS = [
  { key: 'thinking', label: 'Deliberation', detail: 'Agents reviewing the deal' },
  ...AGENT_STAGES.map((a) => ({ key: a.key, label: a.name, detail: a.engine })),
  { key: 'scorecard', label: 'Investment Committee', detail: 'Weighted scorecard' },
  { key: 'capital_stack', label: 'Capital Stack', detail: 'Funding structure' },
  { key: 'roadmap', label: '90-Day Roadmap', detail: 'Execution milestones' },
  { key: 'executive_summary', label: 'Executive Summary', detail: 'Final memorandum' },
]

export const SIGNALS = {
  emerging: { icon: '🔵', label: 'Emerging', meaning: 'Early opportunity' },
  growing: { icon: '🟢', label: 'Growing', meaning: 'Strong demand forming' },
  mature: { icon: '🟡', label: 'Mature', meaning: 'Established market' },
  declining: { icon: '🔴', label: 'Declining', meaning: 'Capital cautious' },
  disrupted: { icon: '⚫', label: 'Disrupted', meaning: 'Vulnerable model' },
}

export const VERDICT_CLASS = {
  GO: 'go',
  'CONDITIONAL GO': 'conditional',
  'NO-GO': 'nogo',
  'AUTOMATIC REJECTION': 'rejected',
}

export const ASSET_TEST = [
  ['asset', 'A', 'Asset'],
  ['barrier', 'B', 'Barrier'],
  ['cash_flow', 'C', 'Cash Flow'],
  ['control', 'D', 'Control'],
  ['compounding', 'E', 'Compounding'],
  ['strategic_position', 'F', 'Strategic Position'],
]

export const KINGDOM_QUESTIONS = [
  ['honesty', 'Honesty', 'Proverbs 11:1 — just weights and true reporting'],
  ['productivity', 'Productivity', 'Does it create real value?'],
  ['beneficence', 'Beneficence', 'Does it bless customers, staff, and community?'],
  ['sustainability', 'Sustainability', 'Will it endure without extraction?'],
  ['multiplicability', 'Multiplicability', 'Is it worthy of being multiplied?'],
]

export const SCALE_STAGES = [
  'Manual',
  'Documented',
  'Automated',
  'Delegated',
  'Platform',
  'Network',
  'Institution',
]

export const DEAL_TYPES = [
  'Business Acquisition',
  'Real Estate',
  'Infrastructure',
  'Technology',
  'Other',
]

export const EMPTY_DEAL = {
  dealName: '',
  dealType: 'Business Acquisition',
  location: '',
  askingPrice: '',
  revenue: '',
  earnings: '',
  description: '',
  financials: '',
  sellerSituation: '',
  operatorProfile: '',
  capitalAvailable: '',
  notes: '',
}

export const SAMPLE_DEALS = [
  {
    label: 'HVAC service company',
    deal: {
      dealName: 'Summit Comfort HVAC',
      dealType: 'Business Acquisition',
      location: 'Charlotte, NC metro',
      askingPrice: '$3,200,000',
      revenue: '$4,100,000 (TTM), up from $3.6M two years ago',
      earnings: '$780,000 SDE; ~$640,000 EBITDA after a market-rate GM salary',
      description:
        'Residential and light-commercial HVAC service, repair, and replacement company founded in 2004. 22 employees including 14 licensed technicians. 38% of revenue is recurring maintenance agreements (about 2,300 active members at $189/yr). Strong Google reviews (4.8 stars, 900+ reviews). Owns 16 service vans; leases a 6,000 sq ft shop.',
      financials:
        'Gross margin 48%. Replacement installs are 45% of revenue, service/repair 35%, maintenance plans 20%. Customer concentration: no customer above 3%. Three years of tax returns and P&Ls available.',
      sellerSituation:
        'Founder is 64 and wants to retire within 12 months. Open to 15% seller financing and a 6-month paid transition. Operations manager (10 years tenure) is willing to stay.',
      operatorProfile:
        'Buyer has 12 years of operations leadership in field services and has closed one prior acquisition. Plans to add a GM and implement ServiceTitan-style dispatch automation.',
      capitalAvailable: '$450,000 cash plus access to an SBA 7(a) lender',
      notes: 'Shop lease has 4 years remaining with two 5-year renewal options.',
    },
  },
  {
    label: '24-unit multifamily',
    deal: {
      dealName: 'Maple Court Apartments',
      dealType: 'Real Estate',
      location: 'Columbus, OH (Linden neighborhood)',
      askingPrice: '$2,450,000',
      revenue: '$312,000 gross scheduled rent; 91% occupancy',
      earnings: '$158,000 NOI (seller-reported, owner self-manages)',
      description:
        '24-unit garden-style apartment complex built in 1972, all 2-bed/1-bath units. Rents average $1,080 versus $1,275 market for renovated comparables. Roofs replaced 2019; original windows and boilers. Tenants on water/sewer bill-back since 2022.',
      financials:
        'Seller-reported expenses exclude management fees. Property taxes reassessed last year (+18%). Rent roll shows 5 units more than 60 days delinquent.',
      sellerSituation:
        'Out-of-state owner who inherited the property; wants a clean sale within 90 days. Open to a short seller carry-back.',
      operatorProfile:
        'Buyer group owns 40 doors locally with an in-house property manager and maintenance tech. Plans value-add renovation at $12k/unit on turnover and a resident services partnership with a local church.',
      capitalAvailable: '$700,000 from the buyer group plus two interested accredited investors',
      notes: '',
    },
  },
]
