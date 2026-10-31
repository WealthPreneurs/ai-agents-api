import type { McpServer, ServerContext } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { ApiError, apiFetch, apiRequest, EVALUATION_TIMEOUT_MS, getSession, supabaseRest } from "../client.js";
import { CHARACTER_LIMIT, type DealResult, formatMemo, ResponseFormat } from "../format.js";

const VERDICTS = ["GO", "CONDITIONAL GO", "NO-GO", "AUTOMATIC REJECTION"] as const;

// Progress stages the API streams, in order: "thinking", then each top-level memo key.
const STAGES = [
  "thinking",
  "deal_name",
  "joseph",
  "abraham",
  "lydia",
  "solomon",
  "steward",
  "scorecard",
  "capital_stack",
  "roadmap",
  "data_gaps",
  "executive_summary"
];
const STAGE_LABELS: Record<string, string> = {
  thinking: "Reading the deal",
  deal_name: "Starting the memorandum",
  joseph: "Joseph: market intelligence",
  abraham: "Abraham: acquisition and control",
  lydia: "Lydia: monetization",
  solomon: "Solomon: scale and infrastructure",
  steward: "Steward: kingdom governance",
  scorecard: "Investment committee scorecard",
  capital_stack: "Capital stack",
  roadmap: "90-day roadmap",
  data_gaps: "Data gaps",
  executive_summary: "Executive summary"
};

// MCP argument name -> API field name (see INPUT_FIELDS in ../../dealEngine.js).
const DEAL_FIELDS = {
  description: "description",
  deal_name: "dealName",
  deal_type: "dealType",
  location: "location",
  asking_price: "askingPrice",
  revenue: "revenue",
  earnings: "earnings",
  financials: "financials",
  seller_situation: "sellerSituation",
  operator_profile: "operatorProfile",
  capital_available: "capitalAvailable",
  notes: "notes"
} as const;

const optionalText = (description: string) => z.string().max(10_000).optional().describe(description);

const responseFormat = z
  .enum(ResponseFormat)
  .default(ResponseFormat.MARKDOWN)
  .describe("'markdown' for a readable memo, 'json' for the complete structured result");

const detail = z
  .enum(["summary", "full"])
  .default("summary")
  .describe("Markdown only: 'summary' gives the verdict, scorecard, executive summary and data gaps; 'full' adds every agent section, the capital stack and the roadmap");

const SavedDealSummarySchema = z.object({
  id: z.string(),
  deal_name: z.string(),
  deal_type: z.string().nullable(),
  verdict: z.string(),
  weighted_score: z.coerce.number(),
  created_at: z.string()
});
type SavedDealSummary = z.infer<typeof SavedDealSummarySchema>;

const SavedDealSchema = z.object({
  id: z.string(),
  created_at: z.string(),
  input: z.record(z.string(), z.unknown()),
  result: z.looseObject({
    memo: z.record(z.string(), z.unknown()),
    evaluation: z.looseObject({
      rows: z.array(z.looseObject({ key: z.string(), label: z.string(), weight: z.number(), score: z.number(), weighted: z.number(), rationale: z.string().default("") })),
      weightedScore: z.number(),
      verdict: z.string(),
      gate: z.object({ passed: z.boolean(), reasons: z.array(z.string()) })
    }),
    model: z.string().optional(),
    generatedAt: z.string().optional()
  })
});

const BillingSchema = z.object({
  plan: z.string(),
  status: z.string().optional(),
  can_run: z.boolean(),
  used: z.number().optional(),
  limit: z.number().nullable().optional(),
  period_end: z.string().nullable().optional(),
  cancel_at_period_end: z.boolean().nullable().optional(),
  message: z.string().nullable().optional(),
  price: z.object({ amount: z.number().nullable(), currency: z.string(), interval: z.string() }).nullable().optional(),
  checkout_available: z.boolean().optional()
});

const ReadOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };

async function reportProgress(ctx: ServerContext, progress: number, message: string): Promise<void> {
  const progressToken = ctx.mcpReq._meta?.progressToken;
  if (progressToken === undefined) return;
  await ctx.mcpReq
    .notify({ method: "notifications/progress", params: { progressToken, progress, total: STAGES.length, message } })
    .catch(() => {});
}

// Reads the API's newline-delimited JSON stream until the result or error line.
async function runEvaluation(deal: Record<string, string>, ctx: ServerContext): Promise<DealResult> {
  const response = await apiFetch("/deal-engine/evaluate", ctx.mcpReq.signal, {
    method: "POST",
    body: deal,
    auth: true,
    timeoutMs: EVALUATION_TIMEOUT_MS
  });
  if (!response.body) throw new Error("The AI Agents API returned an empty response. Try again.");

  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });
    let newline;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      const event = JSON.parse(line) as { type: string; stage?: string; error?: string } & Partial<DealResult>;
      if (event.type === "stage" && event.stage) {
        const index = STAGES.indexOf(event.stage);
        await reportProgress(ctx, index + 1, STAGE_LABELS[event.stage] ?? event.stage);
      } else if (event.type === "error") {
        throw new Error(`The Deal Engine could not finish: ${event.error ?? "unknown error"}. This attempt did not use a memo from the plan; you can retry.`);
      } else if (event.type === "result" && event.memo && event.evaluation) {
        return { memo: event.memo, evaluation: event.evaluation, model: event.model, generatedAt: event.generatedAt };
      }
    }
  }
  throw new Error("The connection to the AI Agents API closed before the memorandum finished. Try again.");
}

function formatInput(input: Record<string, unknown>): string {
  const entries = Object.entries(DEAL_FIELDS)
    .map(([arg, field]) => [arg, input[field]] as const)
    .filter(([, value]) => typeof value === "string" && value.trim());
  return entries.map(([arg, value]) => `- **${arg.replace(/_/g, " ")}:** ${String(value).trim()}`).join("\n");
}

function savedDealLine(d: SavedDealSummary): string {
  const date = new Date(d.created_at).toISOString().slice(0, 10);
  return `- **${d.deal_name}** (${d.id}) — ${d.verdict}, ${d.weighted_score.toFixed(2)}/10${d.deal_type ? `, ${d.deal_type}` : ""}, saved ${date}`;
}

export function registerDealEngineTools(server: McpServer): void {
  server.registerTool(
    "dealengine_evaluate_deal",
    {
      title: "Evaluate a Deal",
      description: `Run an acquisition or investment opportunity through the Kingdom Capital Deal Engine and get an Investment Memorandum.

Five agents analyse the deal — Joseph (market timing), Abraham (asset control), Lydia (monetization), Solomon (scale), Steward (ethics gate) — and score ten weighted categories 1-10. The server computes the weighted score and the verdict: GO (>= 7.5), CONDITIONAL GO (>= 6.0), NO-GO, or AUTOMATIC REJECTION (Steward gate failed).

Slow and metered: one evaluation takes a few minutes and uses one memo from the user's Deal Engine plan (check dealengine_get_billing_status first if unsure). Only one evaluation per user can run at a time. Give as many real figures as you have; the engine lists missing inputs as data gaps rather than inventing numbers.

The memo is saved to the user's dashboard (Deal Engine page) unless save=false; the result includes the saved deal id for dealengine_get_saved_deal.

Example: "Evaluate this laundromat: asking $450k, $310k revenue, $120k SDE, owner retiring" -> description="Laundromat...", asking_price="$450,000", revenue="$310,000", earnings="$120,000 SDE", seller_situation="Owner retiring".`,
      inputSchema: z.strictObject({
        description: z.string().min(20).max(20_000).describe("What the deal is: the business or asset, how it makes money, and anything notable (at least 20 characters)"),
        deal_name: optionalText("Short name for the deal, e.g. 'Main St Laundromat'"),
        deal_type: optionalText("e.g. 'Small business acquisition', 'Multifamily real estate', 'SaaS', 'Franchise'"),
        location: optionalText("City, region, or market"),
        asking_price: optionalText("Asking price, e.g. '$450,000'"),
        revenue: optionalText("Annual revenue or gross income"),
        earnings: optionalText("EBITDA, SDE, or NOI — say which"),
        financials: optionalText("Any other figures: margins, debt, rent roll, growth, capex"),
        seller_situation: optionalText("Why the seller is selling, terms they'll accept, seller financing"),
        operator_profile: optionalText("The buyer/operator's experience and role"),
        capital_available: optionalText("Capital the buyer can deploy"),
        notes: optionalText("Anything else"),
        save: z.boolean().default(true).describe("Save the memo to the user's dashboard (default true)"),
        detail,
        response_format: responseFormat
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
    },
    async (args, ctx) => {
      const deal: Record<string, string> = {};
      for (const [arg, field] of Object.entries(DEAL_FIELDS)) {
        const value = args[arg as keyof typeof DEAL_FIELDS];
        if (typeof value === "string" && value.trim()) deal[field] = value.trim();
      }

      const result = await runEvaluation(deal, ctx);

      // Save like the dashboard does (DealEngine.jsx toRow), so the memo shows up there.
      let savedId: string | null = null;
      let saveError: string | null = null;
      if (args.save) {
        try {
          const { userId } = await getSession(ctx.mcpReq.signal);
          const response = await supabaseRest("deals", ctx.mcpReq.signal, {
            method: "POST",
            query: { select: "id" },
            prefer: "return=representation",
            body: {
              client_id: userId,
              deal_name: (result.memo.deal_name as string) || deal.dealName || "Untitled deal",
              deal_type: deal.dealType ?? null,
              verdict: result.evaluation.verdict,
              weighted_score: result.evaluation.weightedScore,
              input: deal,
              result
            }
          });
          const rows = (await response.json()) as { id: string }[];
          savedId = rows[0]?.id ?? null;
        } catch (error) {
          saveError = (error as Error).message;
        }
      }

      if (args.response_format === ResponseFormat.JSON) {
        const structured = { saved_deal_id: savedId, ...(saveError ? { save_error: saveError } : {}), ...result };
        return { content: [{ type: "text", text: JSON.stringify(structured, null, 2) }], structuredContent: structured };
      }

      let text = formatMemo(result, args.detail);
      if (text.length > CHARACTER_LIMIT) text = formatMemo(result, "summary");
      const footer = savedId
        ? `Saved to the dashboard as deal ${savedId}. Use dealengine_get_saved_deal with detail='full' for every section.`
        : saveError
          ? `The memo was NOT saved: ${saveError} Ask for response_format='json' next time if you need to keep the full result.`
          : "Not saved (save=false).";
      return { content: [{ type: "text", text: `${text}\n\n${footer}` }] };
    }
  );

  server.registerTool(
    "dealengine_list_saved_deals",
    {
      title: "List Saved Deals",
      description: `List the user's saved Deal Engine memoranda, newest first: name, id, verdict, weighted score, deal type and date.

Filter by verdict or by a word in the deal name. Returns one page; when has_more is true call again with next_offset. Use dealengine_get_saved_deal with an id for the full memo.

Examples:
  - "Which deals got a GO?" -> verdict="GO"
  - "Find my laundromat deal" -> name_contains="laundromat"`,
      inputSchema: z.strictObject({
        verdict: z.enum(VERDICTS).optional().describe("Only deals with this verdict"),
        name_contains: z.string().min(1).max(100).optional().describe("Case-insensitive text to match in the deal name"),
        limit: z.number().int().min(1).max(100).default(20).describe("Maximum number of deals to return"),
        offset: z.number().int().min(0).default(0).describe("Number of deals to skip, for pagination"),
        response_format: z.enum(ResponseFormat).default(ResponseFormat.MARKDOWN).describe("'markdown' for readable text, 'json' for structured data")
      }),
      annotations: ReadOnly
    },
    async ({ verdict, name_contains, limit, offset, response_format }, ctx) => {
      const query: Record<string, string> = {
        select: "id,deal_name,deal_type,verdict,weighted_score,created_at",
        order: "created_at.desc",
        limit: String(limit),
        offset: String(offset)
      };
      if (verdict) query.verdict = `eq.${verdict}`;
      // PostgREST ilike pattern; strip its wildcard and grouping characters from the user's text.
      if (name_contains) query.deal_name = `ilike.*${name_contains.replace(/[*%,()]/g, " ")}*`;

      const response = await supabaseRest("deals", ctx.mcpReq.signal, { query, prefer: "count=exact" });
      const deals = z.array(SavedDealSummarySchema).parse(await response.json());
      const total = Number(response.headers.get("content-range")?.split("/")[1]) || offset + deals.length;

      const render = (items: SavedDealSummary[]) => {
        const nextOffset = offset + items.length;
        const hasMore = total > nextOffset;
        const page = { total, count: items.length, offset, deals: items, has_more: hasMore, ...(hasMore ? { next_offset: nextOffset } : {}) };
        if (response_format === ResponseFormat.JSON) return { page, text: JSON.stringify(page, null, 2) };
        const lines = [`# Saved deals`, `Showing ${items.length} of ${total}.`, "", ...items.map(savedDealLine)];
        if (hasMore) lines.push("", `More results: call again with offset=${nextOffset}.`);
        return { page, text: lines.join("\n") };
      };

      let items = deals;
      let result = render(items);
      while (items.length > 1 && result.text.length > CHARACTER_LIMIT) {
        items = items.slice(0, Math.ceil(items.length / 2));
        result = render(items);
      }

      if (response_format === ResponseFormat.JSON) {
        return { content: [{ type: "text", text: result.text }], structuredContent: result.page };
      }
      if (items.length === 0) {
        const filtered = verdict || name_contains;
        return {
          content: [
            {
              type: "text",
              text: filtered
                ? "No saved deals match those filters. Try without verdict or name_contains."
                : offset > 0
                  ? `No saved deals at offset ${offset}; there are ${total} in total.`
                  : "No saved deals yet. Evaluate one with dealengine_evaluate_deal."
            }
          ]
        };
      }
      return { content: [{ type: "text", text: result.text }] };
    }
  );

  server.registerTool(
    "dealengine_get_saved_deal",
    {
      title: "Get Saved Deal",
      description: `Get one saved Deal Engine memorandum by id: the deal inputs, verdict, scorecard, and (with detail='full') every agent section, capital stack and 90-day roadmap.

Use dealengine_list_saved_deals to find ids.`,
      inputSchema: z.strictObject({
        deal_id: z.uuid().describe("Saved deal id, e.g. '3f2b8c1e-...' from dealengine_list_saved_deals"),
        detail,
        response_format: responseFormat
      }),
      annotations: ReadOnly
    },
    async ({ deal_id, detail, response_format }, ctx) => {
      const response = await supabaseRest("deals", ctx.mcpReq.signal, {
        query: { select: "id,created_at,input,result", id: `eq.${deal_id}` }
      });
      const rows = (await response.json()) as unknown[];
      if (rows.length === 0) {
        throw new ApiError(404, `No saved deal with id ${deal_id} for this user. Call dealengine_list_saved_deals for valid ids.`);
      }
      const deal = SavedDealSchema.parse(rows[0]);

      if (response_format === ResponseFormat.JSON) {
        return { content: [{ type: "text", text: JSON.stringify(deal, null, 2) }], structuredContent: deal };
      }
      const input = formatInput(deal.input);
      let memo = formatMemo(deal.result, detail);
      if (memo.length + input.length > CHARACTER_LIMIT) memo = formatMemo(deal.result, "summary");
      const text = [memo, "", "## Deal inputs", input || "_None recorded._", "", `Saved deal ${deal.id}, ${deal.created_at}.`].join("\n");
      return { content: [{ type: "text", text }] };
    }
  );

  server.registerTool(
    "dealengine_delete_saved_deal",
    {
      title: "Delete Saved Deal",
      description: `Permanently delete one saved Deal Engine memorandum from the user's dashboard. This cannot be undone, and it does not refund the memo it used.

Confirm with the user before calling. Use dealengine_list_saved_deals to find the id.`,
      inputSchema: z.strictObject({
        deal_id: z.uuid().describe("Saved deal id to delete")
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true }
    },
    async ({ deal_id }, ctx) => {
      const response = await supabaseRest("deals", ctx.mcpReq.signal, {
        method: "DELETE",
        query: { id: `eq.${deal_id}`, select: "id,deal_name" },
        prefer: "return=representation"
      });
      const deleted = (await response.json()) as { id: string; deal_name: string }[];
      if (deleted.length === 0) {
        throw new ApiError(404, `No saved deal with id ${deal_id} for this user, so nothing was deleted. Call dealengine_list_saved_deals for valid ids.`);
      }
      return { content: [{ type: "text", text: `Deleted saved deal "${deleted[0].deal_name}" (${deleted[0].id}).` }] };
    }
  );

  server.registerTool(
    "dealengine_get_billing_status",
    {
      title: "Get Deal Engine Plan and Usage",
      description: `Get the user's Deal Engine plan: free or pro, memos used and the limit, whether they can run an evaluation now, and when the allowance resets.

Call before dealengine_evaluate_deal when the user may be out of memos. Subscribing and cancelling happen in the dashboard (Deal Engine page), not through this server.`,
      outputSchema: BillingSchema,
      annotations: ReadOnly
    },
    async (ctx) => {
      const data = await apiRequest<{
        plan: string;
        status?: string;
        canRun: boolean;
        used?: number;
        limit?: number | null;
        periodEnd?: string | null;
        cancelAtPeriodEnd?: boolean | null;
        message?: string | null;
        price?: { amount: number | null; currency: string; interval: string } | null;
        checkoutAvailable?: boolean;
      }>("/billing/status", ctx.mcpReq.signal, { auth: true });
      const result = BillingSchema.parse({
        plan: data.plan,
        status: data.status,
        can_run: data.canRun,
        used: data.used,
        limit: data.limit,
        period_end: data.periodEnd,
        cancel_at_period_end: data.cancelAtPeriodEnd,
        message: data.message,
        price: data.price,
        checkout_available: data.checkoutAvailable
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], structuredContent: result };
    }
  );
}
