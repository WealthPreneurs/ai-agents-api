import { useEffect, useRef, useState } from 'react'
import { checkEngineHealth, evaluateDeal, getBillingStatus } from '../lib/dealEngineApi'
import { supabase } from '../lib/supabaseClient'
import { memoToMarkdown } from '../lib/memoMarkdown'
import MemoView from '../components/deal/MemoView'
import PlanBar from '../components/deal/PlanBar'
import {
  AGENT_STAGES,
  PROGRESS_STEPS,
  DEAL_TYPES,
  EMPTY_DEAL,
  SAMPLE_DEALS,
  VERDICT_CLASS,
} from '../data/dealEngine'

// Earlier builds kept the pipeline in localStorage; those deals are moved
// into the `deals` table (supabase/deals.sql) the first time the page loads.
const LEGACY_STORAGE_KEY = 'kingdom-capital:deals'

function readLegacyDeals() {
  try {
    return JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY)) || []
  } catch {
    return []
  }
}

function clearLegacyDeals() {
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY)
  } catch {
    // storage unavailable; nothing to clear
  }
}

function restoreLegacyDeals(deals) {
  try {
    localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(deals))
  } catch {
    // storage unavailable; nothing to restore
  }
}

function toRow(userId, input, result, createdAt) {
  return {
    client_id: userId,
    deal_name: result.memo.deal_name,
    deal_type: input.dealType || null,
    verdict: result.evaluation.verdict,
    weighted_score: result.evaluation.weightedScore,
    input,
    result,
    ...(createdAt ? { created_at: createdAt } : {}),
  }
}

function fromRow(row) {
  return { id: row.id, savedAt: row.created_at, input: row.input, result: row.result }
}

function formatElapsed(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function EngineStatus({ health, error }) {
  let label = 'Checking engine...'
  let cls = 'checking'
  if (error) {
    label = 'Engine offline'
    cls = 'offline'
  } else if (health) {
    const loginReady = health.dealEngine?.auth !== 'missing'
    label = !health.apiKeyPresent ? 'API key missing' : !loginReady ? 'Login check not configured' : 'Engine online'
    cls = health.apiKeyPresent && loginReady ? 'online' : 'offline'
  }
  return (
    <div className="engine-status">
      <span className={`status-dot ${cls}`} />
      <span>{label}</span>
      <div className="engine-agents">
        {AGENT_STAGES.map((a) => (
          <span className="engine-agent" key={a.key} title={a.question}>
            {a.name}
          </span>
        ))}
      </div>
    </div>
  )
}

function Field({ label, name, value, onChange, disabled, textarea, placeholder, rows }) {
  return (
    <div className="field">
      <label htmlFor={`deal-${name}`}>{label}</label>
      {textarea ? (
        <textarea
          id={`deal-${name}`}
          value={value}
          onChange={(e) => onChange(name, e.target.value)}
          disabled={disabled}
          placeholder={placeholder}
          rows={rows}
        />
      ) : (
        <input
          id={`deal-${name}`}
          value={value}
          onChange={(e) => onChange(name, e.target.value)}
          disabled={disabled}
          placeholder={placeholder}
        />
      )}
    </div>
  )
}

function DealForm({ deal, setDeal, onSubmit, running, blockedReason }) {
  function update(name, value) {
    setDeal((d) => ({ ...d, [name]: value }))
  }

  const canSubmit = deal.description.trim().length >= 20 && !running && !blockedReason

  return (
    <form
      className="card deal-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (canSubmit) onSubmit()
      }}
    >
      <div className="deal-form-head">
        <h3>Submit an opportunity</h3>
        <div className="sample-buttons">
          <span className="muted small">Try a sample:</span>
          {SAMPLE_DEALS.map((s) => (
            <button
              type="button"
              className="link-button"
              key={s.label}
              disabled={running}
              onClick={() => setDeal({ ...EMPTY_DEAL, ...s.deal })}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="form-grid">
        <Field label="Deal name" name="dealName" value={deal.dealName} onChange={update} disabled={running} placeholder="e.g. Summit Comfort HVAC" />
        <div className="field">
          <label htmlFor="deal-dealType">Deal type</label>
          <select
            id="deal-dealType"
            value={deal.dealType}
            onChange={(e) => update('dealType', e.target.value)}
            disabled={running}
          >
            {DEAL_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
        <Field label="Location / market" name="location" value={deal.location} onChange={update} disabled={running} />
        <Field label="Asking price" name="askingPrice" value={deal.askingPrice} onChange={update} disabled={running} />
        <Field label="Annual revenue / gross income" name="revenue" value={deal.revenue} onChange={update} disabled={running} />
        <Field label="EBITDA / SDE / NOI" name="earnings" value={deal.earnings} onChange={update} disabled={running} />
      </div>

      <Field
        label="Description *"
        name="description"
        value={deal.description}
        onChange={update}
        disabled={running}
        textarea
        rows={5}
        placeholder="What is the asset, how does it make money, who are the customers, what's its condition?"
      />

      <details className="more-fields">
        <summary>More detail (financials, seller, operator, capital)</summary>
        <Field label="Additional financials" name="financials" value={deal.financials} onChange={update} disabled={running} textarea />
        <Field label="Seller situation" name="sellerSituation" value={deal.sellerSituation} onChange={update} disabled={running} textarea />
        <Field label="Buyer / operator profile" name="operatorProfile" value={deal.operatorProfile} onChange={update} disabled={running} textarea />
        <div className="form-grid">
          <Field label="Capital available to deploy" name="capitalAvailable" value={deal.capitalAvailable} onChange={update} disabled={running} />
          <Field label="Other notes" name="notes" value={deal.notes} onChange={update} disabled={running} />
        </div>
      </details>

      {blockedReason && <p className="error-text">{blockedReason}</p>}
      <div className="actions">
        <button className="primary" type="submit" disabled={!canSubmit}>
          {running ? 'Evaluating...' : 'Run Deal Engine'}
        </button>
        <button type="button" className="secondary" disabled={running} onClick={() => setDeal(EMPTY_DEAL)}>
          Clear
        </button>
      </div>
    </form>
  )
}

function ProgressPanel({ stage, elapsed, onCancel }) {
  const activeIdx = PROGRESS_STEPS.findIndex((s) => s.key === stage)
  return (
    <div className="card progress-panel">
      <div className="progress-head">
        <div className="spinner" />
        <div>
          <h3>Running the Kingdom Capital Deal Engine</h3>
          <p className="muted small">
            Elapsed {formatElapsed(elapsed)} · A full memorandum usually takes 1–4 minutes.
          </p>
        </div>
        <button className="secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <ol className="progress-steps">
        {PROGRESS_STEPS.map((s, i) => {
          let cls = 'pending'
          if (i < activeIdx) cls = 'done'
          else if (i === activeIdx) cls = 'active'
          return (
            <li key={s.key} className={cls}>
              <span className="step-dot">{cls === 'done' ? '✓' : i + 1}</span>
              <span className="step-label">{s.label}</span>
              <span className="step-detail">{s.detail}</span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function Pipeline({ deals, onOpen, onDelete, currentId, deletingId }) {
  if (deals.length === 0) {
    return (
      <div className="empty-state">
        <p>No deals evaluated yet.</p>
        <p className="empty-sub">Run your first opportunity through the engine to build your pipeline.</p>
      </div>
    )
  }

  const counts = deals.reduce((acc, d) => {
    acc[d.result.evaluation.verdict] = (acc[d.result.evaluation.verdict] || 0) + 1
    return acc
  }, {})

  return (
    <>
      <div className="pipeline-stats">
        <div className="stat">
          <span className="stat-value">{deals.length}</span>
          <span className="stat-label">Deals evaluated</span>
        </div>
        {['GO', 'CONDITIONAL GO', 'NO-GO', 'AUTOMATIC REJECTION'].map((v) => (
          <div className="stat" key={v}>
            <span className={`stat-value verdict-text-${VERDICT_CLASS[v]}`}>{counts[v] || 0}</span>
            <span className="stat-label">{v}</span>
          </div>
        ))}
      </div>
      <div className="pipeline-list">
        {deals.map((d) => {
          const { memo, evaluation } = d.result
          return (
            <div className={`card pipeline-item ${d.id === currentId ? 'selected' : ''}`} key={d.id}>
              <button className="pipeline-open" onClick={() => onOpen(d.id)}>
                <span className="pipeline-name">{memo.deal_name}</span>
                <span className="muted small">
                  {d.input.dealType} · {new Date(d.savedAt).toLocaleDateString()}
                </span>
                <span className="pipeline-headline">{memo.executive_summary.headline}</span>
              </button>
              <div className="pipeline-meta">
                <span className="pipeline-score">{evaluation.weightedScore.toFixed(2)}</span>
                <span className={`verdict-pill small verdict-pill-${VERDICT_CLASS[evaluation.verdict]}`}>
                  {evaluation.verdict}
                </span>
                <button className="danger" onClick={() => onDelete(d.id)} disabled={deletingId === d.id}>
                  {deletingId === d.id ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}

export default function DealEngine({ userId }) {
  const [view, setView] = useState('new')
  const [deal, setDeal] = useState(EMPTY_DEAL)
  const [deals, setDeals] = useState([])
  const [dealsLoading, setDealsLoading] = useState(true)
  const [dealsError, setDealsError] = useState(null)
  const [saveError, setSaveError] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [currentId, setCurrentId] = useState(null)
  const [running, setRunning] = useState(false)
  const [stage, setStage] = useState(null)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState(null)
  const [health, setHealth] = useState(null)
  const [healthError, setHealthError] = useState(null)
  const [plan, setPlan] = useState(null)
  const [planLoading, setPlanLoading] = useState(true)
  const [planError, setPlanError] = useState(null)
  const [activating, setActivating] = useState(false)
  const abortRef = useRef(null)

  async function refreshPlan() {
    setPlanError(null)
    try {
      const next = await getBillingStatus()
      setPlan(next)
      return next
    } catch (e) {
      setPlanError(e.message)
      return null
    } finally {
      setPlanLoading(false)
    }
  }

  useEffect(() => {
    refreshPlan()
  }, [])

  // Returning from Stripe Checkout (?billing=success|cancelled). Read once on
  // mount so re-running the effect can't lose it after the URL is cleaned.
  const [checkoutOutcome] = useState(() => new URLSearchParams(window.location.search).get('billing'))

  // The webhook may take a few seconds to activate the subscription, so poll
  // until the plan shows as Pro.
  useEffect(() => {
    if (!checkoutOutcome) return
    window.history.replaceState(null, '', window.location.pathname)
    if (checkoutOutcome !== 'success') return

    setActivating(true)
    let tries = 0
    const timer = setInterval(async () => {
      tries += 1
      const next = await refreshPlan()
      if (next?.plan === 'pro' || tries >= 15) {
        clearInterval(timer)
        setActivating(false)
      }
    }, 2000)
    return () => clearInterval(timer)
  }, [checkoutOutcome])

  useEffect(() => {
    checkEngineHealth()
      .then(setHealth)
      .catch((e) => setHealthError(e.message))
  }, [])

  useEffect(() => {
    if (!running) return
    const started = Date.now()
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000)
    return () => clearInterval(t)
  }, [running])

  useEffect(() => () => abortRef.current?.abort(), [])

  useEffect(() => {
    fetchDeals()
  }, [])

  async function fetchDeals() {
    setDealsLoading(true)
    setDealsError(null)
    await importLegacyDeals()
    const { data, error } = await supabase
      .from('deals')
      .select('id, created_at, input, result')
      .eq('client_id', userId)
      .order('created_at', { ascending: false })

    if (error) {
      setDealsError(error.message)
    } else {
      setDeals((data || []).map(fromRow))
    }
    setDealsLoading(false)
  }

  // One-time move of deals saved by the browser-only pipeline. The saved
  // copy is cleared before inserting so an overlapping load can't import the
  // same deals twice; it is put back if the insert fails.
  async function importLegacyDeals() {
    const legacy = readLegacyDeals()
    if (legacy.length === 0) return
    clearLegacyDeals()
    const rows = legacy.map((d) => toRow(userId, d.input, d.result, d.savedAt))
    const { error } = await supabase.from('deals').insert(rows)
    if (error) restoreLegacyDeals(legacy)
  }

  async function run() {
    setError(null)
    setSaveError(null)
    setRunning(true)
    setStage('thinking')
    setElapsed(0)
    const controller = new AbortController()
    abortRef.current = controller

    try {
      const result = await evaluateDeal(deal, {
        signal: controller.signal,
        onEvent: (e) => {
          if (e.type === 'stage' && PROGRESS_STEPS.some((s) => s.key === e.stage)) setStage(e.stage)
        },
      })
      const memoResult = {
        memo: result.memo,
        evaluation: result.evaluation,
        model: result.model,
        generatedAt: result.generatedAt,
      }
      const { data: row, error: insertError } = await supabase
        .from('deals')
        .insert(toRow(userId, deal, memoResult))
        .select('id, created_at, input, result')
        .single()

      // Keep the memo on screen even if saving fails, so the evaluation
      // (and its API cost) isn't lost.
      const entry = insertError
        ? { id: `unsaved-${Date.now()}`, savedAt: new Date().toISOString(), input: deal, result: memoResult }
        : fromRow(row)
      setSaveError(insertError ? insertError.message : null)
      setDeals((prev) => [entry, ...prev])
      setCurrentId(entry.id)
      setView('memo')
    } catch (e) {
      if (e.name !== 'AbortError') setError(e.message)
    } finally {
      refreshPlan()
      setRunning(false)
      setStage(null)
      abortRef.current = null
    }
  }

  function cancel() {
    abortRef.current?.abort()
  }

  function openDeal(id) {
    setCurrentId(id)
    setView('memo')
    window.scrollTo(0, 0)
  }

  async function deleteDeal(id) {
    setDeletingId(id)
    setDealsError(null)
    if (!id.startsWith('unsaved-')) {
      const { error } = await supabase.from('deals').delete().eq('id', id)
      if (error) {
        setDealsError(error.message)
        setDeletingId(null)
        return
      }
    }
    setDeals((prev) => prev.filter((d) => d.id !== id))
    setDeletingId(null)
    if (id === currentId) {
      setCurrentId(null)
      if (view === 'memo') setView('pipeline')
    }
  }

  function reEvaluate(entry) {
    setDeal({ ...EMPTY_DEAL, ...entry.input })
    setView('new')
  }

  function downloadMarkdown(entry) {
    const blob = new Blob([memoToMarkdown(entry.result)], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const slug = entry.result.memo.deal_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    a.href = url
    a.download = `${slug || 'deal'}-investment-memo.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  const current = deals.find((d) => d.id === currentId)

  return (
    <div className="deal-engine">
      <div className="deal-engine-head no-print">
        <div>
          <h2>Kingdom Capital Deal Engine</h2>
          <p className="page-subtitle">
            Wisdom → Intelligence → Opportunity → Acquisition → Optimization → Cash Flow → Reinvestment → Kingdom Impact
          </p>
        </div>
        <EngineStatus health={health} error={healthError} />
      </div>

      <div className="no-print">
        <PlanBar plan={plan} loading={planLoading} error={planError} activating={activating} onRetry={refreshPlan} />
      </div>

      <div className="tabs no-print" role="tablist">
        <button role="tab" aria-selected={view === 'new'} className={view === 'new' ? 'active' : ''} onClick={() => setView('new')}>
          New Evaluation
        </button>
        <button
          role="tab"
          aria-selected={view === 'pipeline'}
          className={view === 'pipeline' ? 'active' : ''}
          onClick={() => setView('pipeline')}
        >
          Deal Pipeline ({deals.length})
        </button>
        {current && (
          <button role="tab" aria-selected={view === 'memo'} className={view === 'memo' ? 'active' : ''} onClick={() => setView('memo')}>
            Memorandum
          </button>
        )}
      </div>

      {saveError && (
        <p className="error-text no-print">
          This memo couldn't be saved to your pipeline ({saveError}). Download it to keep a copy.
        </p>
      )}

      {view === 'new' && (
        <>
          {healthError && (
            <div className="card notice-card">
              The Deal Engine API isn't reachable ({healthError}). Start it with <code>npm start</code> in the repo
              root, or set <code>VITE_AGENTS_API_URL</code> to your deployed API.
            </div>
          )}
          {running ? (
            <ProgressPanel stage={stage} elapsed={elapsed} onCancel={cancel} />
          ) : (
            <DealForm
              deal={deal}
              setDeal={setDeal}
              onSubmit={run}
              running={running}
              blockedReason={plan && !plan.canRun ? plan.message : null}
            />
          )}
          {error && (
            <div className="card error-card">
              <strong>Evaluation failed.</strong> {error}
              <div className="actions">
                <button className="secondary" onClick={run}>
                  Retry
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {view === 'pipeline' &&
        (dealsLoading ? (
          <p className="loading-text">Loading your pipeline...</p>
        ) : (
          <>
            {dealsError && (
              <div className="card error-card">
                <strong>Couldn't load or update your deals.</strong> {dealsError}
                {/relation .*deals.* does not exist|could not find the table/i.test(dealsError) && (
                  <p>The deals table hasn't been created yet. Run <code>supabase/deals.sql</code> in the Supabase SQL editor.</p>
                )}
                <div className="actions">
                  <button className="secondary" onClick={fetchDeals}>
                    Retry
                  </button>
                </div>
              </div>
            )}
            <Pipeline
              deals={deals}
              onOpen={openDeal}
              onDelete={deleteDeal}
              currentId={currentId}
              deletingId={deletingId}
            />
          </>
        ))}

      {view === 'memo' && current && (
        <>
          <div className="memo-toolbar no-print">
            <button className="secondary" onClick={() => setView('pipeline')}>
              ← Pipeline
            </button>
            <div className="memo-toolbar-actions">
              <button className="secondary" onClick={() => reEvaluate(current)}>
                Edit & re-run
              </button>
              <button className="secondary" onClick={() => downloadMarkdown(current)}>
                Download .md
              </button>
              <button className="primary" onClick={() => window.print()}>
                Print / PDF
              </button>
            </div>
          </div>
          <MemoView result={current.result} />
        </>
      )}
    </div>
  )
}
