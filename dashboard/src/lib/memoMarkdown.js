import { SIGNALS, ASSET_TEST, KINGDOM_QUESTIONS } from '../data/dealEngine'

const list = (items = []) => items.map((i) => `- ${i}`).join('\n')

// Renders a Deal Engine result as a Kingdom Capital Investment Memorandum in
// Markdown, following the nine-section format.
export function memoToMarkdown(result) {
  const { memo, evaluation, generatedAt } = result
  const signal = SIGNALS[memo.joseph.signal] || {}
  const lines = []

  lines.push(`# Kingdom Capital Investment Memorandum — ${memo.deal_name}`)
  lines.push(`_Generated ${new Date(generatedAt).toLocaleString()}_`)

  lines.push(`\n## 1. Executive Summary & Verdict`)
  lines.push(`**Verdict: ${evaluation.verdict}** — Weighted Opportunity Score ${evaluation.weightedScore.toFixed(2)} / 10`)
  if (evaluation.gate.reasons.length) lines.push(list(evaluation.gate.reasons))
  lines.push(`\n**${memo.executive_summary.headline}**\n\n${memo.executive_summary.summary}`)
  lines.push(`\n**Key strengths**\n${list(memo.executive_summary.key_strengths)}`)
  lines.push(`\n**Key risks**\n${list(memo.executive_summary.key_risks)}`)

  const j = memo.joseph
  lines.push(`\n## 2. Joseph Intelligence Report`)
  lines.push(`**Signal:** ${signal.icon} ${signal.label} (${signal.meaning}) — ${j.signal_rationale}`)
  lines.push(`\n**Macro trends**\n${list(j.macro_trends)}`)
  lines.push(`\n**Local dynamics:** ${j.local_dynamics}`)
  lines.push(`\n**Technology shifts:** ${j.technology_shifts}`)
  lines.push(`\n**Unmet future need:** ${j.unmet_future_need}`)
  lines.push(`\n**Horizon outlook**\n- 3 years: ${j.horizon_outlook.year_3}\n- 5 years: ${j.horizon_outlook.year_5}\n- 10 years: ${j.horizon_outlook.year_10}`)

  const a = memo.abraham
  lines.push(`\n## 3. Abraham Asset Memo`)
  lines.push(`| Test | Score | Analysis |\n|---|---|---|`)
  for (const [key, letter, label] of ASSET_TEST) {
    const t = a.asset_test[key]
    lines.push(`| ${letter} — ${label} | ${t.score}/10 | ${t.analysis.replace(/\|/g, '/')} |`)
  }
  lines.push(`\n**Control strategy: ${a.control_strategy}** — ${a.control_strategy_rationale}`)
  lines.push(`\n**Control points**\n${list(a.control_points)}`)

  const l = memo.lydia
  lines.push(`\n## 4. Lydia Monetization Blueprint`)
  lines.push(`| Segment | Pain point | Willingness to pay |\n|---|---|---|`)
  for (const s of l.customer_segments) lines.push(`| ${s.segment} | ${s.pain_point} | ${s.willingness_to_pay} |`)
  lines.push(`\n**Pricing power: ${l.pricing_power}** — ${l.pricing_power_rationale}`)
  lines.push(`\n**Monetization ladder**`)
  l.monetization_ladder.forEach((r, i) => lines.push(`${i + 1}. **${r.rung}** — ${r.offer} (${r.revenue_impact})`))
  lines.push(`\n**Revenue expansion plan**\n${list(l.revenue_expansion_plan)}`)

  const so = memo.solomon
  lines.push(`\n## 5. Solomon Scale Architecture`)
  lines.push(`**Stage:** ${so.current_stage} → ${so.target_stage}`)
  for (const s of so.scale_stack) lines.push(`\n**${s.stage}**\n${list(s.actions)}`)
  lines.push(`\n**Bottlenecks**\n${list(so.bottlenecks)}`)
  lines.push(`\n**Systems required**\n${list(so.systems_required)}`)
  lines.push(`\n**AI / automation opportunities**\n${list(so.ai_automation_opportunities)}`)

  const st = memo.steward
  lines.push(`\n## 6. Steward Governance & Ethics Review`)
  for (const [key, label] of KINGDOM_QUESTIONS) {
    lines.push(`- **${label}: ${st[key].pass ? 'PASS' : 'FAIL'}** — ${st[key].analysis}`)
  }
  lines.push(`\n**Automatic rejection checks**`)
  for (const r of st.rejection_checks) {
    lines.push(`- ${r.triggered ? '⛔ TRIGGERED' : '✓ Clear'} — ${r.criterion.replace(/_/g, ' ')}: ${r.note}`)
  }
  lines.push(`\n${st.overall_assessment}`)
  if (st.conditions.length) lines.push(`\n**Conditions**\n${list(st.conditions)}`)

  lines.push(`\n## 7. Investment Committee Scorecard`)
  lines.push(`| Category | Weight | Score | Weighted | Rationale |\n|---|---|---|---|---|`)
  for (const r of evaluation.rows) {
    lines.push(`| ${r.label} | ${Math.round(r.weight * 100)}% | ${r.score} | ${r.weighted.toFixed(2)} | ${r.rationale.replace(/\|/g, '/')} |`)
  }
  lines.push(`| **Total** | 100% | | **${evaluation.weightedScore.toFixed(2)}** | |`)

  const cs = memo.capital_stack
  lines.push(`\n## 8. Optimized Capital Stack`)
  lines.push(`**Total capital required:** ${cs.total_capital_required}`)
  if (cs.layers.length) {
    lines.push(`\n| Source | % | Amount | Terms |\n|---|---|---|---|`)
    for (const c of cs.layers) lines.push(`| ${c.source} | ${c.percent}% | ${c.amount} | ${c.terms} |`)
  }
  lines.push(`\n${cs.structure_notes}`)

  lines.push(`\n## 9. 90-Day Execution Roadmap`)
  for (const p of memo.roadmap) lines.push(`\n**${p.window} — ${p.focus}**\n${list(p.milestones)}`)

  if (memo.data_gaps.length) lines.push(`\n## Data Gaps to Close\n${list(memo.data_gaps)}`)

  lines.push('\n_AI-generated analysis. Not investment, legal, or tax advice. Verify all figures during due diligence._')

  return lines.join('\n') + '\n'
}
