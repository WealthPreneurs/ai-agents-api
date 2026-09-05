const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const app = express();

app.use(express.json());
app.use('/investor', express.static(path.join(__dirname, 'public', 'investor')));

// Get API key from environment
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;

console.log('[STARTUP] Initializing AI Agents API...');
console.log('[STARTUP] CLAUDE_API_KEY present:', !!CLAUDE_API_KEY);
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
    healthCheck: '/health',
    investorLandingPage: '/investor'
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
