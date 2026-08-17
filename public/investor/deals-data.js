export const SAMPLE_DEALS = [
  {
    id: 'refi-2_5m',
    title: 'Performing Asset Cashout Refi',
    type: 'lien',
    typeLabel: '1st Lien Note',
    amount: 2500000,
    targetRate: 12,
    termMin: 18,
    termMax: 36,
    summary: 'Cashout refinance secured by first lien position on existing, performing real estate assets already in the portfolio.',
    details: 'This raise refinances a set of performing assets Michael already owns and operates. Capital sits in first lien position, meaning investors are repaid ahead of any other claim on the property. Term runs 18 months to 3 years, targeting a 12% return.'
  },
  {
    id: 'fund-900k',
    title: 'Debt Fund — Next Tranche',
    type: 'fund',
    typeLabel: 'Fund Tranche',
    amount: 900000,
    targetRate: 18,
    termMin: 18,
    termMax: 60,
    summary: 'Next tranche of the debt fund. Fund-level position across the same real estate-backed lending strategy.',
    details: 'Rather than a single first-lien note, this capital sits at the fund level — spread across the same real estate-backed lending strategy behind every deal in the portfolio. Term runs 18 months to 5 years, targeting an 18% return.'
  },
  {
    id: 'bridge-sample',
    title: 'Bridge Loan — Value-Add Multifamily',
    type: 'lien',
    typeLabel: '1st Lien Note',
    amount: 1200000,
    targetRate: 13,
    termMin: 12,
    termMax: 24,
    summary: 'Sample listing — bridge financing on a value-add multifamily acquisition, first lien position.',
    details: 'Placeholder deal shown to illustrate variety across the portfolio. Replace with real terms from the admin panel.'
  }
];

const KEY = 'mc_deals_v1';

export function loadDeals() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return SAMPLE_DEALS;
}

export function saveDeals(deals) {
  try { localStorage.setItem(KEY, JSON.stringify(deals)); } catch (e) {}
}
