/**
 * Markdown rendering for Deal Engine results. The memo shape is MEMO_SCHEMA in
 * ../../dealEngine.js; fields are read defensively so older saved memos still render.
 */

export const CHARACTER_LIMIT = 25_000;

export enum ResponseFormat {
  MARKDOWN = "markdown",
  JSON = "json"
}

export interface ScoreRow {
  key: string;
  label: string;
  weight: number;
  score: number;
  weighted: number;
  rationale: string;
}

export interface Evaluation {
  rows: ScoreRow[];
  weightedScore: number;
  verdict: string;
  gate: { passed: boolean; reasons: string[] };
}

// The memo is model output validated by the API's JSON schema; keep it loosely typed here.
type Json = Record<string, unknown>;

export interface DealResult {
  memo: Json;
  evaluation: Evaluation;
  model?: string;
  generatedAt?: string;
}

const asObj = (v: unknown): Json => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});
const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const asStr = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));

function bullets(items: unknown, indent = ""): string[] {
  return asArr(items).map((item) => `${indent}- ${asStr(item)}`);
}

function section(title: string, lines: string[]): string[] {
  const body = lines.filter((l) => l !== "");
  return body.length ? ["", `## ${title}`, ...body] : [];
}

export function formatVerdictLine(evaluation: Evaluation): string {
  return `**Verdict: ${evaluation.verdict}** — weighted score ${evaluation.weightedScore.toFixed(2)} / 10`;
}

// detail="summary" keeps the verdict, scorecard, summary and gaps; "full" adds every agent section.
export function formatMemo(result: DealResult, detail: "summary" | "full"): string {
  const memo = asObj(result.memo);
  const ev = result.evaluation;
  const exec = asObj(memo.executive_summary);
  const lines: string[] = [`# ${asStr(memo.deal_name) || "Untitled deal"}`, "", formatVerdictLine(ev)];

  if (!ev.gate.passed) {
    lines.push("", "Steward gate failed:", ...ev.gate.reasons.map((r) => `- ${r}`));
  }

  lines.push(
    ...section("Executive summary", [
      exec.headline ? `**${asStr(exec.headline)}**` : "",
      asStr(exec.summary),
      asArr(exec.key_strengths).length ? "\nKey strengths:" : "",
      ...bullets(exec.key_strengths),
      asArr(exec.key_risks).length ? "\nKey risks:" : "",
      ...bullets(exec.key_risks)
    ])
  );

  lines.push(
    "",
    "## Investment committee scorecard",
    "| Category | Weight | Score | Weighted |",
    "|---|---|---|---|",
    ...ev.rows.map((r) => `| ${r.label} | ${Math.round(r.weight * 100)}% | ${r.score} | ${r.weighted.toFixed(2)} |`),
    `| **Total** | 100% | | **${ev.weightedScore.toFixed(2)}** |`
  );

  if (detail === "full") {
    lines.push(...ev.rows.filter((r) => r.rationale).map((r) => `- **${r.label}:** ${r.rationale}`));

    const joseph = asObj(memo.joseph);
    const horizon = asObj(joseph.horizon_outlook);
    lines.push(
      ...section("Joseph — market intelligence", [
        joseph.signal ? `Signal: **${asStr(joseph.signal)}** — ${asStr(joseph.signal_rationale)}` : "",
        ...bullets(joseph.macro_trends),
        joseph.local_dynamics ? `Local dynamics: ${asStr(joseph.local_dynamics)}` : "",
        joseph.technology_shifts ? `Technology shifts: ${asStr(joseph.technology_shifts)}` : "",
        joseph.unmet_future_need ? `Unmet future need: ${asStr(joseph.unmet_future_need)}` : "",
        horizon.year_3 ? `3 / 5 / 10 years: ${asStr(horizon.year_3)} / ${asStr(horizon.year_5)} / ${asStr(horizon.year_10)}` : ""
      ])
    );

    const abraham = asObj(memo.abraham);
    lines.push(
      ...section("Abraham — acquisition and control", [
        ...Object.entries(asObj(abraham.asset_test)).map(([k, v]) => {
          const item = asObj(v);
          return `- ${k.replace(/_/g, " ")}: ${asStr(item.score)}/10 — ${asStr(item.analysis)}`;
        }),
        abraham.control_strategy ? `Control strategy: **${asStr(abraham.control_strategy)}** — ${asStr(abraham.control_strategy_rationale)}` : "",
        ...bullets(abraham.control_points)
      ])
    );

    const lydia = asObj(memo.lydia);
    lines.push(
      ...section("Lydia — monetization", [
        ...asArr(lydia.customer_segments).map((s) => {
          const seg = asObj(s);
          return `- ${asStr(seg.segment)} (${asStr(seg.willingness_to_pay)} willingness to pay): ${asStr(seg.pain_point)}`;
        }),
        lydia.pricing_power ? `Pricing power: **${asStr(lydia.pricing_power)}** — ${asStr(lydia.pricing_power_rationale)}` : "",
        ...asArr(lydia.monetization_ladder).map((r) => {
          const rung = asObj(r);
          return `- ${asStr(rung.rung)}: ${asStr(rung.offer)} (${asStr(rung.revenue_impact)})`;
        }),
        ...bullets(lydia.revenue_expansion_plan)
      ])
    );

    const solomon = asObj(memo.solomon);
    lines.push(
      ...section("Solomon — scale and infrastructure", [
        solomon.current_stage ? `Stage: ${asStr(solomon.current_stage)} → ${asStr(solomon.target_stage)}` : "",
        ...asArr(solomon.scale_stack).flatMap((s) => {
          const stage = asObj(s);
          return [`- ${asStr(stage.stage)}`, ...bullets(stage.actions, "  ")];
        }),
        asArr(solomon.bottlenecks).length ? "Bottlenecks:" : "",
        ...bullets(solomon.bottlenecks),
        asArr(solomon.ai_automation_opportunities).length ? "AI / automation opportunities:" : "",
        ...bullets(solomon.ai_automation_opportunities)
      ])
    );

    const steward = asObj(memo.steward);
    const questions = ["honesty", "productivity", "beneficence", "sustainability", "multiplicability"];
    lines.push(
      ...section("Steward — kingdom governance", [
        ...questions
          .filter((q) => steward[q])
          .map((q) => {
            const answer = asObj(steward[q]);
            return `- ${q}: ${answer.pass ? "pass" : "FAIL"} — ${asStr(answer.analysis)}`;
          }),
        ...asArr(steward.rejection_checks)
          .map(asObj)
          .filter((c) => c.triggered)
          .map((c) => `- REJECTION TRIGGERED — ${asStr(c.criterion).replace(/_/g, " ")}: ${asStr(c.note)}`),
        asStr(steward.overall_assessment),
        asArr(steward.conditions).length ? "Conditions:" : "",
        ...bullets(steward.conditions)
      ])
    );

    const capital = asObj(memo.capital_stack);
    lines.push(
      ...section("Capital stack", [
        capital.total_capital_required ? `Total required: ${asStr(capital.total_capital_required)}` : "",
        ...asArr(capital.layers).map((l) => {
          const layer = asObj(l);
          return `- ${asStr(layer.source)} — ${asStr(layer.percent)}% (${asStr(layer.amount)}): ${asStr(layer.terms)}`;
        }),
        asStr(capital.structure_notes)
      ])
    );

    lines.push(
      ...section(
        "90-day roadmap",
        asArr(memo.roadmap).flatMap((w) => {
          const win = asObj(w);
          return [`- **${asStr(win.window)}** — ${asStr(win.focus)}`, ...bullets(win.milestones, "  ")];
        })
      )
    );
  }

  lines.push(...section("Data gaps", bullets(memo.data_gaps)));
  if (result.model || result.generatedAt) {
    lines.push("", `_Generated${result.generatedAt ? ` ${result.generatedAt}` : ""}${result.model ? ` by ${result.model}` : ""}._`);
  }
  return lines.join("\n");
}
