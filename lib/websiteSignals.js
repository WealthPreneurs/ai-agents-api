const fetch = require('node-fetch');

const FETCH_TIMEOUT_MS = 8000;

async function fetchWithTimeout(url, opts = {}) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

function normalizeWebsiteUrl(raw) {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return u.toString();
  } catch {
    return null;
  }
}

async function getWebsiteSignals(rawUrl) {
  const url = normalizeWebsiteUrl(rawUrl);
  if (!url) {
    return { reachable: false, hasSchema: false, mobileFriendly: false, isHttps: false, hasMenuMention: false, hasServicesMention: false };
  }

  const isHttps = url.startsWith('https://');

  let html = '';
  let reachable = false;
  try {
    const res = await fetchWithTimeout(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AIVisibilityBot/1.0)' } });
    reachable = res.ok;
    if (res.ok) html = await res.text();
  } catch {
    reachable = false;
  }

  const lower = html.toLowerCase();
  const hasViewportMeta = /<meta[^>]+name=["']viewport["']/i.test(html);
  const hasSchema = /application\/ld\+json/i.test(html) && /(localbusiness|"@type"\s*:\s*"(restaurant|dentist|autorepair|store|attorney|hairsalon))/i.test(lower);
  const hasMenuMention = /\bmenu\b/.test(lower);
  const hasServicesMention = /\bservices\b/.test(lower);

  return {
    reachable,
    hasSchema,
    mobileFriendly: reachable && hasViewportMeta,
    isHttps,
    hasMenuMention,
    hasServicesMention
  };
}

module.exports = { getWebsiteSignals, normalizeWebsiteUrl };
