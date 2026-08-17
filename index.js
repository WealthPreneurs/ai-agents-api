const express = require('express');
const fetch = require('node-fetch');
const app = express();

const places = require('./lib/places');
const { getWebsiteSignals } = require('./lib/websiteSignals');
const { checkAiVisibility } = require('./lib/aiMentions');
const scoring = require('./lib/scoring');

app.use(express.json());

// Get API keys from environment
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;

console.log('[STARTUP] Initializing AI Agents API...');
console.log('[STARTUP] CLAUDE_API_KEY present:', !!CLAUDE_API_KEY);
console.log('[STARTUP] GOOGLE_PLACES_API_KEY present:', !!GOOGLE_PLACES_API_KEY);
console.log('[STARTUP] NODE_ENV:', process.env.NODE_ENV);

const AGENT_SYSTEM_PROMPTS = {
  victoria: `You are Victoria Chen, Chief Revenue Officer with 22 years of experience in B2B SaaS sales and revenue scaling.
EXPERTISE: B2B SaaS Revenue Architecture, Enterprise Sales Scaling, Deal Structuring, Sales Team Leadership, Revenue Operations
STYLE: Strategic, data-driven, bold, results-focused
COMMUNICATION: Confident, direct, pragmatic. Focus on actionable revenue strategies and measurable outcomes.
RESPOND: 2-3 sentences. Offer specific revenue-focused advice or next steps.`,

  marcus: `You are Marcus Whitmore, Chief Marketing Officer with 20 years of experience in AI/tech industry marketing.
EXPERTISE: AI Industry Marketing, Digital Strategy, Content Marketing, Demand Generation, Marketing Analytics
STYLE: Innovation pioneer, creative strategist, analytically rigorous, technology savvy
COMMUNICATION: Visionary and creative, yet grounded in data and metrics.
RESPOND: 2-3 sentences. Offer creative ideas or specific campaign recommendations backed by market logic.`,

  amara: `You are Amara Okonkwo, Chief Strategy Officer with 23 years of experience in business strategy and scalability.
EXPERTISE: Business Model Innovation, Market Analysis, Competitive Positioning, Scalability Architecture, Growth Economics
STYLE: Visionary strategist, systems thinker, innovation catalyst, data-informed, decisive leader
COMMUNICATION: Analytical yet forward-thinking. Connect dots across markets and business models.
RESPOND: 2-3 sentences. Offer specific business model or strategic insights backed by financial thinking.`,

  nia: `You are Nia Rodriguez, Director of Sales Coaching with 19 years of experience in sales coaching and client success.
EXPERTISE: Executive Sales Coaching, Closing Techniques, Consultation Methodology, Client Onboarding, Performance Coaching
STYLE: Master coach, persuasion expert, emotionally intelligent, results-focused, empathetic leader
COMMUNICATION: Warm, encouraging, insightful, grounded in psychology. Understand that sales is about relationships.
RESPOND: 2-3 sentences. Offer specific coaching techniques or frameworks that drive results.`,

  xavier: `You are Xavier Blake, Director of Social Media Strategy with 18 years of experience in viral content and growth.
EXPERTISE: Viral Content Creation, Social Media Growth, Community Building, Content Strategy, Platform-Native Execution
STYLE: Content visionary, platform native, trend forecaster, community builder, bold and creative
COMMUNICATION: Bold, creative, energetic, trend-forward. Live on social media and understand platform dynamics.
RESPOND: 2-3 sentences. Offer specific content or growth strategies backed by platform dynamics.`
};

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    agents: Object.keys(AGENT_SYSTEM_PROMPTS),
    apiKeyPresent: !!CLAUDE_API_KEY,
    placesApiKeyPresent: !!GOOGLE_PLACES_API_KEY,
    timestamp: new Date().toISOString()
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'AI Agents API is running',
    availableAgents: Object.keys(AGENT_SYSTEM_PROMPTS),
    endpoint: '/agent',
    method: 'POST',
    visibilityReportEndpoint: '/visibility-report',
    visibilityReportMethod: 'POST',
    visibilityReportBody: { name: 'string', city: 'string' },
    healthCheck: '/health'
  });
});

// Main agent endpoint
app.post('/agent', async (req, res) => {
  const { agent, message } = req.body;
  
  console.log(`[REQUEST] Agent: ${agent}, Message length: ${message?.length || 0}`);
  
  // Validate inputs
  if (!agent || !message) {
    console.log('[ERROR] Missing agent or message');
    return res.status(400).json({ 
      error: 'Missing required fields: agent and message',
      receivedAgent: agent,
      receivedMessage: !!message
    });
  }
  
  // Validate agent name
  if (!AGENT_SYSTEM_PROMPTS[agent]) {
    console.log(`[ERROR] Invalid agent: ${agent}`);
    return res.status(400).json({ 
      error: `Invalid agent: ${agent}. Valid agents are: ${Object.keys(AGENT_SYSTEM_PROMPTS).join(', ')}`
    });
  }
  
  // Validate API key
  if (!CLAUDE_API_KEY) {
    console.log('[ERROR] CLAUDE_API_KEY not set');
    return res.status(500).json({ 
      error: 'CLAUDE_API_KEY environment variable not set'
    });
  }
  
  try {
    console.log(`[API_CALL] Calling Claude API for agent: ${agent}`);
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_API_KEY
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: AGENT_SYSTEM_PROMPTS[agent],
        messages: [
          { role: 'user', content: message }
        ]
      })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      console.log(`[ERROR] Claude API error: ${response.status}`);
      return res.status(response.status).json({ 
        error: data.error?.message || 'Claude API error'
      });
    }
    
    const agentResponse = data.content[0].text;
    console.log(`[SUCCESS] Response from ${agent}: ${agentResponse.substring(0, 50)}...`);
    
    res.json({ 
      success: true, 
      agent: agent,
      response: agentResponse,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.log(`[ERROR] ${error.message}`);
    res.status(500).json({ 
      error: error.message
    });
  }
});

// AI Visibility Report endpoint — real Google Business Profile data via Places API,
// a live website scrape for schema/mobile signals, and real Claude queries to check
// whether an AI answer engine actually mentions the business.
app.post('/visibility-report', async (req, res) => {
  const { name, city } = req.body || {};

  if (!name || !city) {
    return res.status(400).json({ error: 'Missing required fields: name and city' });
  }
  if (!GOOGLE_PLACES_API_KEY) {
    return res.status(500).json({ error: 'GOOGLE_PLACES_API_KEY environment variable not set' });
  }
  if (!CLAUDE_API_KEY) {
    return res.status(500).json({ error: 'CLAUDE_API_KEY environment variable not set' });
  }

  try {
    console.log(`[VISIBILITY] Looking up "${name}" in "${city}"`);
    const candidate = await places.findPlace(GOOGLE_PLACES_API_KEY, name, city);
    if (!candidate) {
      return res.status(404).json({ error: `No Google Business Profile found for "${name}" in "${city}"` });
    }

    const details = await places.getPlaceDetails(GOOGLE_PLACES_API_KEY, candidate.place_id);
    const category = places.primaryCategory(details.types);

    const [websiteSignals, aiQueries, competitors] = await Promise.all([
      getWebsiteSignals(details.website),
      checkAiVisibility(CLAUDE_API_KEY, details.name, category, city),
      details.geometry?.location
        ? places.nearbyCompetitors(GOOGLE_PLACES_API_KEY, details.geometry.location.lat, details.geometry.location.lng, category, candidate.place_id)
        : Promise.resolve([])
    ]);

    const reviews = details.reviews || [];
    const photoCount = (details.photos || []).length;
    const descriptionLength = (details.editorial_summary?.overview || '').length;
    const lastReviewDaysAgo = reviews.length ? places.daysAgo(reviews[0].time) : null;

    const business = {
      name: details.name,
      category,
      city,
      address: details.formatted_address || null,
      phone: details.formatted_phone_number || details.international_phone_number || null,
      website: details.website || null,
      rating: details.rating || 0,
      reviewCount: details.user_ratings_total || 0,
      lastReviewDaysAgo,
      photoCount,
      hasMenu: websiteSignals.hasMenuMention,
      hasServicesList: websiteSignals.hasServicesMention,
      hasAttributes: !!details.wheelchair_accessible_entrance,
      descriptionLength,
      hasSchema: websiteSignals.hasSchema,
      mobileFriendly: websiteSignals.mobileFriendly,
      isHttps: websiteSignals.isHttps,
      websiteReachable: websiteSignals.reachable,
      googleMapsUrl: details.url || null,
      aiQueries: aiQueries.map(({ query, mentioned, note }) => ({ query, mentioned, note }))
    };

    const scores = scoring.computeScores(business);
    const recommendations = scoring.getRecommendations(business);

    res.json({
      success: true,
      business,
      scores,
      recommendations,
      competitors,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.log(`[VISIBILITY_ERROR] ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.log('[MIDDLEWARE_ERROR]', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`\n✅ AI Agents API started successfully!`);
  console.log(`📍 Server running on port ${PORT}`);
  console.log(`🔐 CLAUDE_API_KEY: ${CLAUDE_API_KEY ? 'SET' : 'NOT SET'}`);
  console.log(`🤖 Available agents: ${Object.keys(AGENT_SYSTEM_PROMPTS).join(', ')}`);
  console.log(`\n📡 Ready to accept requests at http://localhost:${PORT}`);
  console.log(`✔️  Health check: http://localhost:${PORT}/health\n`);
});

// Handle server errors
server.on('error', (err) => {
  console.log('[SERVER_ERROR]', err.message);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[SHUTDOWN] Received SIGTERM, shutting down gracefully...');
  server.close(() => {
    console.log('[SHUTDOWN] Server closed');
    process.exit(0);
  });
});
