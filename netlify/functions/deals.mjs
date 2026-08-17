import { getStore } from '@netlify/blobs';

const SEED_DEALS = [
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

const STORE_NAME = 'mc-deals';
const KEY = 'list';

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'content-type': 'application/json', ...(init && init.headers) }
  });
}

function isAuthorized(req) {
  const configured = process.env.ADMIN_TOKEN;
  if (!configured) return false;
  const supplied = req.headers.get('x-admin-token');
  return !!supplied && supplied === configured;
}

export default async (req) => {
  const store = getStore(STORE_NAME);

  if (req.method === 'GET') {
    const list = await store.get(KEY, { type: 'json' });
    return json(list || SEED_DEALS);
  }

  // Every write requires a matching ADMIN_TOKEN — deals are now shared across
  // all visitors, so without this check anyone who finds /admin.html could
  // edit the live raise terms shown to real investors.
  if (!process.env.ADMIN_TOKEN) {
    return json({ error: 'Admin panel is not configured. Set ADMIN_TOKEN in the site’s environment variables.' }, { status: 500 });
  }
  if (!isAuthorized(req)) {
    return json({ error: 'Invalid or missing admin token.' }, { status: 401 });
  }

  if (req.method === 'POST') {
    let body;
    try {
      body = await req.json();
    } catch (e) {
      return json({ error: 'Invalid JSON body.' }, { status: 400 });
    }
    const d = body && body.deal;
    if (!d || !d.title || !d.amount || !d.targetRate || !d.termMin || !d.termMax) {
      return json({ error: 'Missing required deal fields.' }, { status: 400 });
    }
    const newDeal = {
      id: 'deal-' + Date.now(),
      title: String(d.title),
      type: d.type === 'fund' ? 'fund' : 'lien',
      typeLabel: d.type === 'fund' ? 'Fund Tranche' : '1st Lien Note',
      amount: Number(d.amount),
      targetRate: Number(d.targetRate),
      termMin: Number(d.termMin),
      termMax: Number(d.termMax),
      summary: d.summary ? String(d.summary) : 'Details available once terms are confirmed.',
      details: d.details ? String(d.details) : 'Full terms available on request.'
    };
    const current = (await store.get(KEY, { type: 'json' })) || SEED_DEALS;
    const updated = [...current, newDeal];
    await store.setJSON(KEY, updated);
    return json(updated);
  }

  if (req.method === 'DELETE') {
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return json({ error: 'Missing id.' }, { status: 400 });
    const current = (await store.get(KEY, { type: 'json' })) || SEED_DEALS;
    const updated = current.filter(d => d.id !== id);
    await store.setJSON(KEY, updated);
    return json(updated);
  }

  return json({ error: 'Method not allowed.' }, { status: 405 });
};

export const config = { path: '/api/deals' };
