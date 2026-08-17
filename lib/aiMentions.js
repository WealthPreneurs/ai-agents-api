const fetch = require('node-fetch');

const SYSTEM_PROMPT = `You are an AI answer engine responding to a local-search style question. Answer as you actually would to a user asking this in a chat assistant: name specific real businesses you have reliable knowledge of. If you do not have reliable, specific knowledge of real local businesses for this query, say so plainly instead of inventing names. Keep the answer under 120 words.`;

async function askClaude(apiKey, prompt) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      temperature: 0,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || `Claude API error (${response.status})`);
  }
  return data.content?.[0]?.text || '';
}

function mentionsBusiness(answer, businessName) {
  const norm = s => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const name = norm(businessName);
  const text = norm(answer);
  if (!name) return false;
  return text.includes(name);
}

async function checkAiVisibility(apiKey, businessName, category, city) {
  const queries = [
    `What's the best ${category.toLowerCase()} in ${city}?`,
    `What do you know about ${businessName} in ${city}? Any reviews or reputation info?`
  ];

  const results = [];
  for (const query of queries) {
    let answer = '';
    let mentioned = false;
    let note;
    try {
      answer = await askClaude(apiKey, query);
      mentioned = mentionsBusiness(answer, businessName);
      note = mentioned
        ? 'Mentioned by name in the AI response.'
        : 'Not mentioned by name in the AI response.';
    } catch (e) {
      note = `Could not query AI engine: ${e.message}`;
    }
    results.push({ query, mentioned, note, rawAnswer: answer });
  }
  return results;
}

module.exports = { checkAiVisibility, mentionsBusiness };
