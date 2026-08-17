const fetch = require('node-fetch');

const PLACES_BASE = 'https://maps.googleapis.com/maps/api/place';

function humanizeType(type) {
  return String(type || 'business')
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// Types Places API returns that are too generic to use as the business category.
const GENERIC_TYPES = new Set([
  'point_of_interest', 'establishment', 'store', 'food', 'health'
]);

function primaryCategory(types) {
  const t = (types || []).find(t => !GENERIC_TYPES.has(t));
  return humanizeType(t || (types && types[0]) || 'business');
}

async function findPlace(apiKey, name, city) {
  const url = new URL(`${PLACES_BASE}/findplacefromtext/json`);
  url.searchParams.set('input', `${name} ${city}`);
  url.searchParams.set('inputtype', 'textquery');
  url.searchParams.set('fields', 'place_id,name,formatted_address,geometry,types');
  url.searchParams.set('key', apiKey);
  const res = await fetch(url.toString());
  const data = await res.json();
  if (data.status !== 'OK' || !data.candidates || !data.candidates.length) {
    return null;
  }
  return data.candidates[0];
}

const DETAILS_FIELDS = [
  'name', 'formatted_address', 'formatted_phone_number', 'international_phone_number',
  'website', 'rating', 'user_ratings_total', 'reviews', 'photos', 'opening_hours',
  'types', 'editorial_summary', 'url', 'business_status', 'wheelchair_accessible_entrance',
  'geometry'
].join(',');

async function getPlaceDetails(apiKey, placeId) {
  const url = new URL(`${PLACES_BASE}/details/json`);
  url.searchParams.set('place_id', placeId);
  url.searchParams.set('fields', DETAILS_FIELDS);
  url.searchParams.set('reviews_sort', 'newest');
  url.searchParams.set('key', apiKey);
  const res = await fetch(url.toString());
  const data = await res.json();
  if (data.status !== 'OK' || !data.result) {
    throw new Error(`Places Details API error: ${data.status}${data.error_message ? ' — ' + data.error_message : ''}`);
  }
  return data.result;
}

async function nearbyCompetitors(apiKey, lat, lng, category, excludePlaceId) {
  const url = new URL(`${PLACES_BASE}/nearbysearch/json`);
  url.searchParams.set('location', `${lat},${lng}`);
  url.searchParams.set('radius', '8000');
  url.searchParams.set('keyword', category);
  url.searchParams.set('key', apiKey);
  const res = await fetch(url.toString());
  const data = await res.json();
  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    return [];
  }
  return (data.results || [])
    .filter(r => r.place_id !== excludePlaceId && r.business_status !== 'CLOSED_PERMANENTLY')
    .slice(0, 5)
    .map(r => ({
      placeId: r.place_id,
      name: r.name,
      rating: r.rating || 0,
      userRatingsTotal: r.user_ratings_total || 0
    }));
}

function daysAgo(unixSeconds) {
  if (!unixSeconds) return null;
  return Math.floor((Date.now() / 1000 - unixSeconds) / 86400);
}

module.exports = { findPlace, getPlaceDetails, nearbyCompetitors, primaryCategory, daysAgo };
