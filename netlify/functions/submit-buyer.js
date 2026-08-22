const { submitToJotform } = require('./lib/jotform');

const FORM_ID = process.env.JOTFORM_BUYER_FORM_ID || '262337135500044';

const FIELDS = [
  ['firstName', ['first name']],
  ['lastName', ['last name']],
  ['email', ['email']],
  ['phone', ['phone']],
  ['buyerType', ['buying as']],
  ['company', ['company']],
  ['budgetMin', ['budget low', 'budget, low end']],
  ['budgetMax', ['budget high', 'budget, high end']],
  ['payment', ['cash or financing', 'payment']],
  ['proof', ['proof of funds']],
  ['areas', ['counties', 'cities you cover', 'counties or cities']],
  ['beds', ['bedrooms']],
  ['baths', ['bathrooms']],
  ['landPref', ['land or park lot', 'land preference']],
  ['condition', ['condition you']],
  ['timeline', ['how soon can you close', 'timeline to close']],
  ['volume', ['homes per month', 'volume']],
  ['notes', ['won', 'notes']]
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
