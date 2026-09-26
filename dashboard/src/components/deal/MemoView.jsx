import {
  SIGNALS,
  VERDICT_CLASS,
  ASSET_TEST,
  KINGDOM_QUESTIONS,
  SCALE_STAGES,
} from '../../data/dealEngine'

const SECTIONS = [
  ['summary', 'Verdict'],
  ['joseph', 'Joseph'],
  ['abraham', 'Abraham'],
  ['lydia', 'Lydia'],
  ['solomon', 'Solomon'],
  ['steward', 'Steward'],
  ['scorecard', 'Scorecard'],
  ['capital', 'Capital Stack'],
  ['roadmap', '90 Days'],
]

// Shared palette for capital stack layers so the bar and legend agree.
const LAYER_COLORS = {
  'Seller Capital': '#8a6d1f',
  Debt: '#2f4b7c',
  'Strategic Partners': '#3d7a5a',
  'Private Capital': '#7a4b8c',
  Institutional: '#4a5568',
  'Retained Earnings': '#b0703a',
}

function scoreTone(score) {
  if (score >= 8) return 'high'
  if (score >= 6) return 'mid'
  return 'low'
}

function List({ items }) {
  if (!items?.length) return <p className="muted">None identified.</p>
  return (
    <ul className="memo-list">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  )
}

function Section({ id, number, title, subtitle, children }) {
  return (
    <section className="memo-section card" id={`memo-${id}`}>
      <header className="memo-section-head">
        <span className="memo-num">{number}</span>
        <div>
          <h3>{title}</h3>
          {subtitle && <p className="memo-section-sub">{subtitle}</p>}
        </div>
      </header>
      {children}
    </section>
  )
}

function ScoreRing({ score }) {
  const pct = Math.max(0, Math.min(1, score / 10))
  const r = 44
  const c = 2 * Math.PI * r
  return (
    <svg className="score-ring" viewBox="0 0 110 110" role="img" aria-label={`Score ${score} out of 10`}>
      <circle cx="55" cy="55" r={r} className="score-ring-track" />
      <circle
        cx="55"
        cy="55"
        r={r}
        className="score-ring-fill"
        strokeDasharray={`${c * pct} ${c}`}
        transform="rotate(-90 55 55)"
      />
      <text x="55" y="53" textAnchor="middle" className="score-ring-value">
        {score.toFixed(2)}
      </text>
      <text x="55" y="72" textAnchor="middle" className="score-ring-label">
        / 10
      </text>
    </svg>
  )
}

export default function MemoView({ result }) {
  const { memo, evaluation, generatedAt, model } = result
  const signal = SIGNALS[memo.joseph.signal] || { icon: '', label: memo.joseph.signal, meaning: '' }
  const verdictClass = VERDICT_CLASS[evaluation.verdict] || 'nogo'
  const rejected = evaluation.verdict === 'AUTOMATIC REJECTION'
  const currentIdx = SCALE_STAGES.indexOf(memo.solomon.current_stage)
  const targetIdx = SCALE_STAGES.indexOf(memo.solomon.target_stage)

  return (
    <div className="memo">
      <nav className="memo-nav no-print" aria-label="Memorandum sections">
        {SECTIONS.map(([id, label]) => (
          <a key={id} href={`#memo-${id}`}>
            {label}
          </a>
        ))}
      </nav>

      {/* 1. Executive summary & verdict */}
      <section className={`verdict-hero verdict-${verdictClass}`} id="memo-summary">
        <div className="verdict-main">
          <p className="verdict-eyebrow">Kingdom Capital Investment Memorandum</p>
          <h2 className="verdict-deal">{memo.deal_name}</h2>
          <span className={`verdict-pill verdict-pill-${verdictClass}`}>{evaluation.verdict}</span>
          <p className="verdict-headline">{memo.executive_summary.headline}</p>
          {evaluation.gate.reasons.length > 0 && (
            <ul className="gate-reasons">
              {evaluation.gate.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
          <div className="verdict-chips">
            <span className="chip">
              {signal.icon} {signal.label} market
            </span>
            <span className="chip">Strategy: {memo.abraham.control_strategy}</span>
            <span className="chip">
              Scale: {memo.solomon.current_stage} → {memo.solomon.target_stage}
            </span>
          </div>
        </div>
        <div className="verdict-score">
          <ScoreRing score={evaluation.weightedScore} />
          <p className="verdict-score-label">Weighted Opportunity Score</p>
        </div>
      </section>

      <Section id="exec" number="1" title="Executive Summary">
        <p className="memo-prose">{memo.executive_summary.summary}</p>
        <div className="two-col">
          <div>
            <h4>Key strengths</h4>
            <List items={memo.executive_summary.key_strengths} />
          </div>
          <div>
            <h4>Key risks</h4>
            <List items={memo.executive_summary.key_risks} />
          </div>
        </div>
        {memo.data_gaps.length > 0 && (
          <div className="data-gaps">
            <h4>Data gaps to close before committing capital</h4>
            <List items={memo.data_gaps} />
          </div>
        )}
      </Section>

      {/* 2. Joseph */}
      <Section
        id="joseph"
        number="2"
        title="Joseph Intelligence Report"
        subtitle="What is changing, and what will people need 3–10 years from now?"
      >
        <div className="signal-banner">
          <span className="signal-icon">{signal.icon}</span>
          <div>
            <strong>
              {signal.label} — {signal.meaning}
            </strong>
            <p>{memo.joseph.signal_rationale}</p>
          </div>
        </div>
        <h4>Macro trends</h4>
        <List items={memo.joseph.macro_trends} />
        <div className="two-col">
          <div>
            <h4>Local dynamics</h4>
            <p className="memo-prose">{memo.joseph.local_dynamics}</p>
          </div>
          <div>
            <h4>Technology shifts</h4>
            <p className="memo-prose">{memo.joseph.technology_shifts}</p>
          </div>
        </div>
        <h4>The unmet future need</h4>
        <p className="memo-prose">{memo.joseph.unmet_future_need}</p>
        <div className="horizon">
          {[
            ['3 years', memo.joseph.horizon_outlook.year_3],
            ['5 years', memo.joseph.horizon_outlook.year_5],
            ['10 years', memo.joseph.horizon_outlook.year_10],
          ].map(([label, text]) => (
            <div className="horizon-card" key={label}>
              <span className="horizon-label">{label}</span>
              <p>{text}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* 3. Abraham */}
      <Section id="abraham" number="3" title="Abraham Asset Memo" subtitle="What can we control?">
        <div className="asset-grid">
          {ASSET_TEST.map(([key, letter, label]) => {
            const t = memo.abraham.asset_test[key]
            return (
              <div className="asset-tile" key={key}>
                <div className="asset-tile-head">
                  <span className="asset-letter">{letter}</span>
                  <span className="asset-label">{label}</span>
                  <span className={`score-badge tone-${scoreTone(t.score)}`}>{t.score}</span>
                </div>
                <p>{t.analysis}</p>
              </div>
            )
          })}
        </div>
        <div className="strategy-box">
          <span className="strategy-label">Control strategy</span>
          <strong className="strategy-value">{memo.abraham.control_strategy}</strong>
          <p>{memo.abraham.control_strategy_rationale}</p>
        </div>
        <h4>Control points</h4>
        <List items={memo.abraham.control_points} />
      </Section>

      {/* 4. Lydia */}
      <Section
        id="lydia"
        number="4"
        title="Lydia Monetization Blueprint"
        subtitle="Who values this enough to pay a premium, and how do we scale LTV?"
      >
        <div className="table-wrap">
          <table className="memo-table">
            <thead>
              <tr>
                <th>Customer segment</th>
                <th>Pain point</th>
                <th>Willingness to pay</th>
              </tr>
            </thead>
            <tbody>
              {memo.lydia.customer_segments.map((s, i) => (
                <tr key={i}>
                  <td>{s.segment}</td>
                  <td>{s.pain_point}</td>
                  <td>
                    <span className={`wtp wtp-${s.willingness_to_pay}`}>{s.willingness_to_pay}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="memo-prose">
          <strong>Pricing power: {memo.lydia.pricing_power}.</strong> {memo.lydia.pricing_power_rationale}
        </p>
        <h4>Monetization ladder</h4>
        <ol className="ladder">
          {memo.lydia.monetization_ladder.map((r, i) => (
            <li key={i} style={{ marginLeft: `${i * 14}px` }}>
              <span className="ladder-rung">{r.rung}</span>
              <span className="ladder-offer">{r.offer}</span>
              <span className="ladder-impact">{r.revenue_impact}</span>
            </li>
          ))}
        </ol>
        <h4>Revenue expansion plan</h4>
        <List items={memo.lydia.revenue_expansion_plan} />
      </Section>

      {/* 5. Solomon */}
      <Section
        id="solomon"
        number="5"
        title="Solomon Scale Architecture"
        subtitle="What infrastructure makes this bigger than the founder?"
      >
        <ol className="scale-track" aria-label="Scale stack">
          {SCALE_STAGES.map((stage, i) => {
            let cls = ''
            if (i === currentIdx) cls = 'current'
            else if (i === targetIdx) cls = 'target'
            else if (i > currentIdx && i < targetIdx) cls = 'path'
            else if (i < currentIdx) cls = 'done'
            return (
              <li key={stage} className={cls}>
                <span className="scale-dot" />
                <span className="scale-name">{stage}</span>
                {i === currentIdx && <span className="scale-tag">Today</span>}
                {i === targetIdx && i !== currentIdx && <span className="scale-tag">Target</span>}
              </li>
            )
          })}
        </ol>
        <div className="stage-actions">
          {memo.solomon.scale_stack.map((s, i) => (
            <div className="stage-action" key={i}>
              <h4>{s.stage}</h4>
              <List items={s.actions} />
            </div>
          ))}
        </div>
        <div className="three-col">
          <div>
            <h4>Bottlenecks</h4>
            <List items={memo.solomon.bottlenecks} />
          </div>
          <div>
            <h4>Systems required</h4>
            <List items={memo.solomon.systems_required} />
          </div>
          <div>
            <h4>AI & automation</h4>
            <List items={memo.solomon.ai_automation_opportunities} />
          </div>
        </div>
      </Section>

      {/* 6. Steward */}
      <Section
        id="steward"
        number="6"
        title="Steward Governance & Ethics Review"
        subtitle="Are we building something honest, productive, sustainable, and worthy of multiplication?"
      >
        <div className="kq-list">
          {KINGDOM_QUESTIONS.map(([key, label, hint]) => {
            const q = memo.steward[key]
            return (
              <div className={`kq ${q.pass ? 'pass' : 'fail'}`} key={key}>
                <span className="kq-mark">{q.pass ? '✓' : '✕'}</span>
                <div>
                  <strong>{label}</strong> <span className="muted">— {hint}</span>
                  <p>{q.analysis}</p>
                </div>
              </div>
            )
          })}
        </div>
        <h4>Automatic rejection criteria</h4>
        <div className="reject-grid">
          {memo.steward.rejection_checks.map((r) => (
            <div className={`reject-check ${r.triggered ? 'triggered' : ''}`} key={r.criterion}>
              <span className="reject-status">{r.triggered ? 'Triggered' : 'Clear'}</span>
              <strong>{r.criterion.replace(/_/g, ' ')}</strong>
              <p>{r.note}</p>
            </div>
          ))}
        </div>
        <p className="memo-prose">{memo.steward.overall_assessment}</p>
        {memo.steward.conditions.length > 0 && (
          <>
            <h4>Stewardship conditions</h4>
            <List items={memo.steward.conditions} />
          </>
        )}
      </Section>

      {/* 7. Scorecard */}
      <Section id="scorecard" number="7" title="Investment Committee Scorecard">
        <div className="table-wrap">
          <table className="memo-table scorecard">
            <thead>
              <tr>
                <th>Category</th>
                <th className="num">Weight</th>
                <th>Score</th>
                <th className="num">Weighted</th>
              </tr>
            </thead>
            <tbody>
              {evaluation.rows.map((r) => (
                <tr key={r.key}>
                  <td>
                    <strong>{r.label}</strong>
                    <p className="row-rationale">{r.rationale}</p>
                  </td>
                  <td className="num">{Math.round(r.weight * 100)}%</td>
                  <td className="bar-cell">
                    <div className="bar">
                      <div className={`bar-fill tone-${scoreTone(r.score)}`} style={{ width: `${r.score * 10}%` }} />
                    </div>
                    <span className="bar-value">{r.score}</span>
                  </td>
                  <td className="num">{r.weighted.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Weighted Opportunity Score</td>
                <td className="num">100%</td>
                <td />
                <td className="num">{evaluation.weightedScore.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="muted small">
          GO ≥ 7.50 · CONDITIONAL GO 6.00–7.49 · NO-GO &lt; 6.00 · Kingdom Alignment below 5 or any
          rejection trigger = AUTOMATIC REJECTION.
        </p>
      </Section>

      {/* 8. Capital stack */}
      <Section id="capital" number="8" title="Optimized Capital Stack">
        <p className="memo-prose">
          <strong>Total capital required:</strong> {memo.capital_stack.total_capital_required}
        </p>
        {rejected || memo.capital_stack.layers.length === 0 ? (
          <div className="empty-inline">Capital is not structured for this deal.</div>
        ) : (
          <>
            <div className="stack-bar" role="img" aria-label="Capital stack composition">
              {memo.capital_stack.layers.map((c, i) => (
                <div
                  key={i}
                  className="stack-seg"
                  style={{ flexGrow: Math.max(c.percent, 0.5), background: LAYER_COLORS[c.source] }}
                  title={`${c.source}: ${c.percent}%`}
                >
                  {c.percent >= 8 && `${c.percent}%`}
                </div>
              ))}
            </div>
            <div className="table-wrap">
              <table className="memo-table">
                <thead>
                  <tr>
                    <th>Source</th>
                    <th className="num">Share</th>
                    <th>Amount</th>
                    <th>Terms</th>
                  </tr>
                </thead>
                <tbody>
                  {memo.capital_stack.layers.map((c, i) => (
                    <tr key={i}>
                      <td>
                        <span className="swatch" style={{ background: LAYER_COLORS[c.source] }} />
                        {c.source}
                      </td>
                      <td className="num">{c.percent}%</td>
                      <td>{c.amount}</td>
                      <td>{c.terms}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <p className="memo-prose">{memo.capital_stack.structure_notes}</p>
      </Section>

      {/* 9. Roadmap */}
      <Section id="roadmap" number="9" title="90-Day Execution Roadmap">
        <div className="roadmap">
          {memo.roadmap.map((p, i) => (
            <div className="roadmap-col" key={i}>
              <span className="roadmap-window">{p.window}</span>
              <h4>{p.focus}</h4>
              <List items={p.milestones} />
            </div>
          ))}
        </div>
      </Section>

      <p className="memo-footer muted small">
        Generated {new Date(generatedAt).toLocaleString()}
        {model ? ` · ${model}` : ''} · AI-generated analysis. Not investment, legal, or tax advice. Verify all figures during due diligence.
      </p>
    </div>
  )
}
