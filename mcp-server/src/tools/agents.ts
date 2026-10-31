import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { API_BASE_URL, apiRequest } from "../client.js";

// Roles of the agents defined in ../../index.js (AGENT_SYSTEM_PROMPTS). The API
// lists names only; agents added there later still show up, just without a role.
const AGENT_ROLES: Record<string, string> = {
  victoria: "Victoria Chen — Chief Revenue Officer: B2B SaaS revenue, enterprise sales, deal structuring, RevOps",
  marcus: "Marcus Whitmore — Chief Marketing Officer: AI/tech marketing, demand gen, content, marketing analytics",
  amara: "Amara Okonkwo — Chief Strategy Officer: business models, market analysis, positioning, growth economics",
  nia: "Nia Rodriguez — Director of Sales Coaching: closing techniques, consultations, onboarding, performance coaching",
  xavier: "Xavier Blake — Director of Social Media Strategy: viral content, social growth, community, platform strategy"
};

const AgentListSchema = z.object({
  agents: z.array(z.object({ name: z.string(), role: z.string().optional() }))
});

const AskResultSchema = z.object({ agent: z.string(), response: z.string(), timestamp: z.string().optional() });

const HealthSchema = z.object({
  api_url: z.string(),
  status: z.string(),
  agents: z.array(z.string()),
  claude_api_key_present: z.boolean(),
  deal_engine: z
    .object({
      model: z.string().optional(),
      auth: z.string().optional(),
      daily_limit: z.number().optional(),
      billing: z.string().optional()
    })
    .optional(),
  timestamp: z.string().optional()
});

const ReadOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };

export function registerAgentTools(server: McpServer): void {
  server.registerTool(
    "aiagents_list_agents",
    {
      title: "List Consulting Agents",
      description: `List the AI consulting agents available to aiagents_ask_agent, with each agent's name and specialty.

Use this to pick the right agent before asking a question, e.g. revenue questions -> victoria, marketing -> marcus, strategy -> amara, sales coaching -> nia, social media -> xavier.`,
      outputSchema: AgentListSchema,
      annotations: ReadOnly
    },
    async (ctx) => {
      const data = await apiRequest<{ availableAgents?: string[] }>("/", ctx.mcpReq.signal);
      const result = AgentListSchema.parse({
        agents: (data.availableAgents ?? []).map((name) => ({ name, ...(AGENT_ROLES[name] ? { role: AGENT_ROLES[name] } : {}) }))
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], structuredContent: result };
    }
  );

  server.registerTool(
    "aiagents_ask_agent",
    {
      title: "Ask a Consulting Agent",
      description: `Ask one of the AI consulting agents a business question and get their short (2-3 sentence) expert answer.

Each call is a fresh, single-turn conversation: the agent does not remember earlier calls, so include any context it needs in the message.

Agents: victoria (revenue/sales leadership), marcus (marketing), amara (strategy), nia (sales coaching), xavier (social media). Call aiagents_list_agents for the current list.

Examples:
  - "How should I price a B2B SaaS add-on?" -> agent="victoria"
  - "Give me three TikTok hooks for a bookkeeping firm" -> agent="xavier"
For evaluating an acquisition or investment, use dealengine_evaluate_deal instead.`,
      inputSchema: z.strictObject({
        agent: z
          .string()
          .min(1)
          .describe("Agent name, lowercase, e.g. 'victoria'. See aiagents_list_agents."),
        message: z.string().min(1).max(20_000).describe("The question or request for the agent, with any context it needs")
      }),
      outputSchema: AskResultSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true }
    },
    async ({ agent, message }, ctx) => {
      const data = await apiRequest<{ agent: string; response: string; timestamp?: string }>("/agent", ctx.mcpReq.signal, {
        method: "POST",
        body: { agent: agent.trim().toLowerCase(), message },
        timeoutMs: 90_000
      });
      const result = AskResultSchema.parse(data);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], structuredContent: result };
    }
  );

  server.registerTool(
    "aiagents_get_health",
    {
      title: "Check API Health",
      description: `Check that the AI Agents API is up and configured: whether its Claude API key is set, which agents it serves, the Deal Engine model, and whether login and billing are configured on the server.

Use this first when another tool fails with a connection or configuration error.`,
      outputSchema: HealthSchema,
      annotations: ReadOnly
    },
    async (ctx) => {
      const data = await apiRequest<{
        status: string;
        agents?: string[];
        apiKeyPresent?: boolean;
        dealEngine?: { model?: string; auth?: string; dailyLimit?: number; billing?: string };
        timestamp?: string;
      }>("/health", ctx.mcpReq.signal);
      const result = HealthSchema.parse({
        api_url: API_BASE_URL,
        status: data.status,
        agents: data.agents ?? [],
        claude_api_key_present: Boolean(data.apiKeyPresent),
        ...(data.dealEngine
          ? {
              deal_engine: {
                model: data.dealEngine.model,
                auth: data.dealEngine.auth,
                daily_limit: data.dealEngine.dailyLimit,
                billing: data.dealEngine.billing
              }
            }
          : {}),
        timestamp: data.timestamp
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], structuredContent: result };
    }
  );
}
