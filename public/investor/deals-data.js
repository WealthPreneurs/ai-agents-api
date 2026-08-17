// Deals are shared across all visitors via a Netlify Function backed by
// Netlify Blobs (netlify/functions/deals.mjs). This local list is only a
// fallback for when that endpoint can't be reached (e.g. offline).
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

const API = '/api/deals';

export async function loadDeals() {
  try {
    const res = await fetch(API);
    if (res.ok) return await res.json();
  } catch (e) {}
  return SAMPLE_DEALS;
}

async function readError(res) {
  try {
    const body = await res.json();
    return body.error || ('Request failed: ' + res.status);
  } catch (e) {
    return 'Request failed: ' + res.status;
  }
}

export async function addDeal(deal, adminToken) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-admin-token': adminToken || '' },
    body: JSON.stringify({ deal })
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function removeDeal(id, adminToken) {
  const res = await fetch(API + '?id=' + encodeURIComponent(id), {
    method: 'DELETE',
    headers: { 'x-admin-token': adminToken || '' }
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}
