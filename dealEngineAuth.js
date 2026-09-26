// Login check and usage limits for the Deal Engine endpoint.
// Every evaluation costs Claude API tokens, so the endpoint only serves
// requests carrying a valid Supabase session from the dashboard.

const fetch = require('node-fetch');

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
// Local development only: DEAL_ENGINE_AUTH=off skips the login check.
const AUTH_DISABLED = process.env.DEAL_ENGINE_AUTH === 'off';
const DAILY_LIMIT = Number(process.env.DEAL_ENGINE_DAILY_LIMIT) || 20;

function authStatus() {
  if (AUTH_DISABLED) return 'disabled';
  return SUPABASE_URL && SUPABASE_ANON_KEY ? 'configured' : 'missing';
}

// Asks Supabase who the token belongs to. Returns the user, or null when the
// token is invalid or expired.
async function getSupabaseUser(token) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY },
  });
  if (res.status === 401 || res.status === 403) return null;
  if (!res.ok) throw new Error(`Supabase auth check failed (${res.status})`);
  const user = await res.json();
  return user && user.id ? user : null;
}

async function requireUser(req, res, next) {
  const status = authStatus();
  if (status === 'disabled') {
    req.user = { id: 'local-dev' };
    return next();
  }
  if (status === 'missing') {
    return res.status(500).json({
      error: 'Deal Engine login check is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY on the API server.',
    });
  }

  const match = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
  if (!match) {
    return res.status(401).json({ error: 'Log in to the dashboard to run the Deal Engine.' });
  }

  try {
    const user = await getSupabaseUser(match[1]);
    if (!user) {
      return res.status(401).json({ error: 'Your session has expired. Log out and log back in.' });
    }
    req.user = { id: user.id, email: user.email };
    next();
  } catch (error) {
    console.log(`[DEAL_ENGINE_AUTH] ${error.message}`);
    res.status(503).json({ error: 'Could not verify your login right now. Try again in a minute.' });
  }
}

// Per-user daily cap and one evaluation at a time. Kept in memory: counts
// reset when the server restarts, which is acceptable for a spend guard.
const usage = new Map(); // userId -> { day, count }
const running = new Set();

function today() {
  return new Date().toISOString().slice(0, 10);
}

// Reserves a slot for this user. Returns an error message when the user is
// over the limit, otherwise null; call release() when the evaluation ends.
function acquireSlot(userId) {
  if (running.has(userId)) {
    return 'You already have an evaluation running. Wait for it to finish.';
  }
  const entry = usage.get(userId);
  const count = entry && entry.day === today() ? entry.count : 0;
  if (count >= DAILY_LIMIT) {
    return `Daily limit reached (${DAILY_LIMIT} evaluations). It resets at midnight UTC.`;
  }
  usage.set(userId, { day: today(), count: count + 1 });
  running.add(userId);
  return null;
}

function releaseSlot(userId) {
  running.delete(userId);
}

module.exports = { requireUser, acquireSlot, releaseSlot, authStatus, DAILY_LIMIT };
