/**
 * Self-check: starts a mock of the AI Agents API and Supabase, runs the built
 * server over stdio against it, calls every tool, and exits non-zero on failure.
 * Run with: npm run build && npm run smoke
 */
import { strict as assert } from "node:assert";
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/client";
import { getDefaultEnvironment, StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const USER_ID = "11111111-2222-4333-8444-555555555555";
const TOKEN = `x.${Buffer.from(JSON.stringify({ sub: USER_ID })).toString("base64url")}.y`;

const evaluation = {
  rows: [
    { key: "market_opportunity", label: "Market Opportunity", weight: 0.15, score: 8, weighted: 1.2, rationale: "Steady demand" },
    { key: "kingdom_alignment", label: "Kingdom Alignment", weight: 0.1, score: 9, weighted: 0.9, rationale: "Honest operator" }
  ],
  weightedScore: 7.8,
  verdict: "GO",
  gate: { passed: true, reasons: [] }
};
const memo = {
  deal_name: "Main St Laundromat",
  joseph: { signal: "mature", signal_rationale: "Stable", macro_trends: ["Renters need laundry"] },
  executive_summary: { headline: "Buy it", summary: "Solid cash flow.", key_strengths: ["Cash flow"], key_risks: ["Equipment age"] },
  data_gaps: ["Three years of tax returns"]
};

const deals: Record<string, unknown>[] = [];
let evaluateBody: Record<string, unknown> | null = null;

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
}

const mock = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://mock");
  const json = (status: number, body: unknown, headers: Record<string, string> = {}) => {
    res.writeHead(status, { "Content-Type": "application/json", ...headers });
    res.end(JSON.stringify(body));
  };
  const authed = req.headers.authorization === `Bearer ${TOKEN}`;

  if (req.method === "GET" && url.pathname === "/") return json(200, { availableAgents: ["victoria", "marcus", "amara", "nia", "xavier"] });
  if (req.method === "GET" && url.pathname === "/health") {
    return json(200, { status: "ok", agents: ["victoria"], apiKeyPresent: true, dealEngine: { model: "claude-opus-5", auth: "configured", dailyLimit: 20, billing: "configured" }, timestamp: "2026-10-31T00:00:00Z" });
  }
  if (req.method === "POST" && url.pathname === "/agent") {
    const body = await readJson(req);
    if (body.agent !== "victoria") return json(400, { error: `Invalid agent: ${body.agent}. Valid agents are: victoria` });
    return json(200, { success: true, agent: "victoria", response: `Answer to: ${body.message}`, timestamp: "2026-10-31T00:00:00Z" });
  }
  if (req.method === "POST" && url.pathname === "/deal-engine/evaluate") {
    if (!authed) return json(401, { error: "Log in to the dashboard to run the Deal Engine." });
    evaluateBody = await readJson(req);
    res.writeHead(200, { "Content-Type": "application/x-ndjson" });
    for (const stage of ["thinking", "deal_name", "joseph", "executive_summary"]) res.write(JSON.stringify({ type: "stage", stage }) + "\n");
    res.write(JSON.stringify({ type: "heartbeat" }) + "\n");
    res.end(JSON.stringify({ type: "result", memo, evaluation, model: "claude-opus-5", generatedAt: "2026-10-31T00:00:00Z" }) + "\n");
    return;
  }
  if (req.method === "GET" && url.pathname === "/billing/status") {
    if (!authed) return json(401, { error: "Log in" });
    return json(200, { plan: "free", status: "none", canRun: true, used: 1, limit: 3, message: null, price: null, checkoutAvailable: true });
  }
  if (req.method === "POST" && url.pathname === "/auth/v1/token") {
    const body = await readJson(req);
    if (body.password !== "secret") return json(400, { error: "invalid_grant", error_description: "Invalid login credentials" });
    return json(200, { access_token: TOKEN, refresh_token: "r", expires_in: 3600, user: { id: USER_ID } });
  }
  if (url.pathname === "/rest/v1/deals") {
    if (!authed || req.headers.apikey !== "anon") return json(401, { message: "JWT invalid" });
    const id = url.searchParams.get("id")?.replace(/^eq\./, "");
    if (req.method === "POST") {
      const row = { id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", created_at: "2026-10-31T00:00:00Z", ...(await readJson(req)) };
      deals.push(row);
      return json(201, [{ id: row.id }]);
    }
    if (req.method === "DELETE") {
      const index = deals.findIndex((d) => d.id === id);
      const removed = index >= 0 ? deals.splice(index, 1) : [];
      return json(200, removed.map((d) => ({ id: d.id, deal_name: d.deal_name })));
    }
    let rows = id ? deals.filter((d) => d.id === id) : deals;
    const verdict = url.searchParams.get("verdict")?.replace(/^eq\./, "");
    if (verdict) rows = rows.filter((d) => d.verdict === verdict);
    return json(200, rows, { "Content-Range": `0-${Math.max(rows.length - 1, 0)}/${rows.length}` });
  }
  json(404, { error: "not found" });
});

await new Promise<void>((resolve) => mock.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${(mock.address() as AddressInfo).port}`;

const client = new Client({ name: "smoke-test", version: "1.0.0" });
await client.connect(
  new StdioClientTransport({
    command: "node",
    args: ["dist/index.js"],
    env: {
      ...getDefaultEnvironment(),
      AI_AGENTS_API_URL: base,
      SUPABASE_URL: base,
      SUPABASE_ANON_KEY: "anon",
      DEAL_ENGINE_EMAIL: "owner@example.com",
      DEAL_ENGINE_PASSWORD: "secret"
    }
  })
);

const text = (result: { content?: unknown }) =>
  ((result.content as { type: string; text?: string }[]) ?? []).map((c) => c.text ?? "").join("\n");

const { tools } = await client.listTools();
assert.deepEqual(tools.map((t) => t.name).sort(), [
  "aiagents_ask_agent",
  "aiagents_get_health",
  "aiagents_list_agents",
  "dealengine_delete_saved_deal",
  "dealengine_evaluate_deal",
  "dealengine_get_billing_status",
  "dealengine_get_saved_deal",
  "dealengine_list_saved_deals"
]);

const agents = await client.callTool({ name: "aiagents_list_agents", arguments: {} });
assert.ok(!agents.isError, text(agents));
assert.equal((agents.structuredContent as { agents: { name: string; role?: string }[] }).agents[0].role?.startsWith("Victoria Chen"), true);

const ask = await client.callTool({ name: "aiagents_ask_agent", arguments: { agent: " Victoria ", message: "How do I price?" } });
assert.ok(!ask.isError, text(ask));
assert.equal((ask.structuredContent as { response: string }).response, "Answer to: How do I price?");

const badAgent = await client.callTool({ name: "aiagents_ask_agent", arguments: { agent: "bob", message: "hi" } });
assert.equal(badAgent.isError, true);
assert.match(text(badAgent), /Valid agents are/);

const health = await client.callTool({ name: "aiagents_get_health", arguments: {} });
assert.ok(!health.isError, text(health));

const billing = await client.callTool({ name: "dealengine_get_billing_status", arguments: {} });
assert.ok(!billing.isError, text(billing));
assert.equal((billing.structuredContent as { can_run: boolean }).can_run, true);

const progress: string[] = [];
const evaluated = await client.callTool(
  {
    name: "dealengine_evaluate_deal",
    arguments: { description: "A laundromat on Main St with 40 machines and steady walk-in trade.", deal_name: "Main St Laundromat", asking_price: "$450,000", deal_type: "Small business" }
  },
  { onprogress: (p: { message?: string }) => void progress.push(p.message ?? "") }
);
assert.ok(!evaluated.isError, text(evaluated));
assert.match(text(evaluated), /Verdict: GO/);
assert.match(text(evaluated), /Saved to the dashboard as deal aaaaaaaa-/);
assert.deepEqual(evaluateBody, { description: "A laundromat on Main St with 40 machines and steady walk-in trade.", dealName: "Main St Laundromat", dealType: "Small business", askingPrice: "$450,000" });
assert.ok(progress.includes("Joseph: market intelligence"), `progress: ${JSON.stringify(progress)}`);
assert.equal(deals.length, 1);
assert.equal(deals[0].client_id, USER_ID);

const shortDeal = await client.callTool({ name: "dealengine_evaluate_deal", arguments: { description: "too short" } });
assert.equal(shortDeal.isError, true, "a description under 20 characters should be rejected");

const list = await client.callTool({ name: "dealengine_list_saved_deals", arguments: { verdict: "GO", response_format: "json" } });
assert.ok(!list.isError, text(list));
const page = list.structuredContent as { total: number; deals: { id: string; weighted_score: number }[]; has_more: boolean };
assert.equal(page.total, 1);
assert.equal(page.deals[0].weighted_score, 7.8);
assert.equal(page.has_more, false);

const listMd = await client.callTool({ name: "dealengine_list_saved_deals", arguments: {} });
assert.match(text(listMd), /Main St Laundromat/);

const full = await client.callTool({ name: "dealengine_get_saved_deal", arguments: { deal_id: page.deals[0].id, detail: "full" } });
assert.ok(!full.isError, text(full));
assert.match(text(full), /Joseph — market intelligence/);
assert.match(text(full), /asking price:\*\* \$450,000/);

const missing = await client.callTool({ name: "dealengine_get_saved_deal", arguments: { deal_id: "00000000-0000-4000-8000-000000000000" } });
assert.equal(missing.isError, true);

const deleted = await client.callTool({ name: "dealengine_delete_saved_deal", arguments: { deal_id: page.deals[0].id } });
assert.ok(!deleted.isError, text(deleted));
assert.equal(deals.length, 0);

const empty = await client.callTool({ name: "dealengine_list_saved_deals", arguments: {} });
assert.match(text(empty), /No saved deals yet/);

await client.close();

// Without login settings, Deal Engine tools explain how to configure them.
const anon = new Client({ name: "smoke-test-anon", version: "1.0.0" });
await anon.connect(
  new StdioClientTransport({ command: "node", args: ["dist/index.js"], env: { ...getDefaultEnvironment(), AI_AGENTS_API_URL: base } })
);
const noLogin = await anon.callTool({ name: "dealengine_get_billing_status", arguments: {} });
assert.equal(noLogin.isError, true);
assert.match(text(noLogin), /DEAL_ENGINE_EMAIL/);
await anon.close();

mock.close();
console.error("Smoke test passed");
