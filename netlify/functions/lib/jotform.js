// Shared helper: map our field keys to a Jotform form's actual question IDs
// by matching visible labels, then submit answers to Jotform's API.
//
// Jotform assigns each field an internal numeric "qid" that isn't known
// until the form exists, so instead of hardcoding it we fetch the form's
// question list at request time (cheap, cached per cold start) and match
// each of our fields to a question by label text.

const fetch = require('node-fetch');

const JOTFORM_API = 'https://api.jotform.com';
const cache = new Map(); // formId -> { questions, fetchedAt }
const CACHE_MS = 5 * 60 * 1000;

function normalize(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

async function getQuestions(formId, apiKey) {
  const cached = cache.get(formId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_MS) return cached.questions;

  const res = await fetch(`${JOTFORM_API}/form/${formId}/questions?apiKey=${encodeURIComponent(apiKey)}`);
  if (!res.ok) throw new Error(`Jotform getQuestions failed: ${res.status}`);
  const data = await res.json();
  const questions = Object.values(data.content || {});
  cache.set(formId, { questions, fetchedAt: Date.now() });
  return questions;
}

// fields: ordered [ourKey, [labelAliases...]] pairs, most specific first.
function matchQuestions(questions, fields) {
  const available = questions.slice();
  const map = {}; // ourKey -> question

  fields.forEach(([key, aliases]) => {
    let bestIdx = -1, bestScore = 0;
    available.forEach((q, idx) => {
      const label = normalize(q.text);
      aliases.forEach((alias) => {
        const a = normalize(alias);
        if (label === a && a.length > bestScore) { bestScore = a.length + 1000; bestIdx = idx; }
        else if (label.includes(a) && a.length > bestScore) { bestScore = a.length; bestIdx = idx; }
      });
    });
    if (bestIdx >= 0) {
      map[key] = available[bestIdx];
      available.splice(bestIdx, 1);
    }
  });

  return map;
}

function buildSubmissionBody(map, values) {
  const params = new URLSearchParams();
  Object.entries(map).forEach(([key, q]) => {
    const value = values[key];
    if (value === undefined || value === null || value === '') return;
    if (q.type === 'control_fullname') {
      params.append(`submission[${q.qid}][first]`, String(value));
    } else if (q.type === 'control_address') {
      params.append(`submission[${q.qid}][addr_line1]`, String(value));
    } else {
      params.append(`submission[${q.qid}]`, String(value));
    }
  });
  return params;
}

async function submitToJotform({ formId, apiKey, fields, values }) {
  const questions = await getQuestions(formId, apiKey);
  const map = matchQuestions(questions, fields);
  const body = buildSubmissionBody(map, values);

  const res = await fetch(`${JOTFORM_API}/form/${formId}/submissions?apiKey=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.responseCode >= 300) {
    throw new Error(`Jotform submit failed: ${res.status} ${JSON.stringify(data)}`);
  }
  return data;
}

module.exports = { submitToJotform };
