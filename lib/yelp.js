const fetch = require('node-fetch');

const YELP_BASE = 'https://api.yelp.com/v3';

function humanizeCategory(alias) {
  return String(alias || 'business')
    .split(/[_-]/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function primaryCategory(categories) {
  const c = (categories || [])[0];
  return c ? (c.title || humanizeCategory(c.alias)) : 'Business';
}

async function yelpFetch(apiKey, path, params) {
  const url = new URL(`${YELP_BASE}${path}`);
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${apiKey}` }
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Yelp API error: ${data.error?.description || res.status}`);
  }
  return data;
}

async function findBusiness(apiKey, name, city) {
  const data = await yelpFetch(apiKey, '/businesses/search', {
    term: name,
    location: city,
    limit: 5
  });
  const businesses = data.businesses || [];
  if (!businesses.length) return null;

  // Prefer a name match over Yelp's plain relevance ranking.
  const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const target = norm(name);
  const exact = businesses.find(b => norm(b.name) === target);
  return exact || businesses[0];
}

async function getBusinessDetails(apiKey, businessId) {
  return yelpFetch(apiKey, `/businesses/${encodeURIComponent(businessId)}`, {});
}

async function nearbyCompetitors(apiKey, lat, lng, category, excludeId) {
  const data = await yelpFetch(apiKey, '/businesses/search', {
    latitude: lat,
    longitude: lng,
    categories: undefined, // Yelp category aliases don't map cleanly from free-text; use term instead.
    term: category,
    radius: 8000,
    limit: 8,
    sort_by: 'rating'
  });
  return (data.businesses || [])
    .filter(b => b.id !== excludeId && !b.is_closed)
    .slice(0, 5)
    .map(b => ({
      placeId: b.id,
      name: b.name,
      rating: b.rating || 0,
      userRatingsTotal: b.review_count || 0
    }));
}

module.exports = { findBusiness, getBusinessDetails, nearbyCompetitors, primaryCategory };
