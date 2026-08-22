const { submitToJotform } = require('./lib/jotform');

const FORM_ID = process.env.JOTFORM_SELLER_FORM_ID || '262336769048063';

const FIELDS = [
  ['firstName', ['first name']],
  ['lastName', ['last name']],
  ['phone', ['phone']],
  ['email', ['email']],
  ['address', ['street address', 'park lot', 'park & lot']],
  ['city', ['city']],
  ['state', ['state']],
  ['zip', ['zip']],
  ['year', ['year built']],
  ['sqft', ['square footage', 'square feet']],
  ['beds', ['bedrooms']],
  ['baths', ['bathrooms']],
  ['landType', ['land type']],
  ['lotRent', ['lot rent', 'monthly lot rent']],
  ['park', ['park name']],
  ['condition', ['condition']],
  ['conditionNotes', ['condition notes', 'buyer should know']],
  ['liens', ['liens', 'loans', 'back taxes']],
  ['owed', ['amount owed', 'approximate amount owed']],
  ['timeline', ['timeline']],
  ['price', ['asking price', 'desired asking price']],
  ['motivation', ['motivation', 'reason for selling']],
  ['motivationNotes', ['motivation notes', 'like to add']],
  ['photos', ['photos attached', 'photos']]
];

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const apiKey = (process.env.JOTFORM_API_KEY || '').trim();
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'JOTFORM_API_KEY is not configured' }) };
  }

  let values;
  try {
    values = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  try {
    await submitToJotform({ formId: FORM_ID, apiKey, fields: FIELDS, values });
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    return { statusCode: 502, body: JSON.stringify({ error: String(err.message || err) }) };
  }
};
