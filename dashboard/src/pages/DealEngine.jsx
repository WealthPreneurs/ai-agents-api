import { useEffect, useRef, useState } from 'react'
import { checkEngineHealth, evaluateDeal } from '../lib/dealEngineApi'
import { memoToMarkdown } from '../lib/memoMarkdown'
import MemoView from '../components/deal/MemoView'
import {
  AGENT_STAGES,
  PROGRESS_STEPS,
  DEAL_TYPES,
  EMPTY_DEAL,
  SAMPLE_DEALS,
  VERDICT_CLASS,
} from '../data/dealEngine'

// Evaluated deals are kept in this browser only (no schema change needed).
const STORAGE_KEY = 'kingdom-capital:deals'

function loadDeals() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []
  } catch {
    return []
  }
}

function saveDeals(deals) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(deals))
    return true
  } catch {
    return false
  }
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
    label = health.apiKeyPresent ? 'Engine online' : 'API key missing'
    cls = health.apiKeyPresent ? 'online' : 'offline'
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

function DealForm({ deal, setDeal, onSubmit, running }) {
  function update(name, value) {
    setDeal((d) => ({ ...d, [name]: value }))
  }

  const canSubmit = deal.description.trim().length >= 20 && !running

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

function Pipeline({ deals, onOpen, onDelete, currentId }) {
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
                <button className="danger" onClick={() => onDelete(d.id)}>
                  Delete
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}

export default function DealEngine() {
  const [view, setView] = useState('new')
  const [deal, setDeal] = useState(EMPTY_DEAL)
  const [deals, setDeals] = useState(loadDeals)
  const [currentId, setCurrentId] = useState(null)
  const [running, setRunning] = useState(false)
  const [stage, setStage] = useState(null)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState(null)
  const [storageWarning, setStorageWarning] = useState(false)
  const [health, setHealth] = useState(null)
  const [healthError, setHealthError] = useState(null)
  const abortRef = useRef(null)

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

  function persist(next) {
    setDeals(next)
    setStorageWarning(!saveDeals(next))
  }

  async function run() {
    setError(null)
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
      const entry = {
        id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
        savedAt: new Date().toISOString(),
        input: deal,
        result: { memo: result.memo, evaluation: result.evaluation, model: result.model, generatedAt: result.generatedAt },
      }
      persist([entry, ...deals])
      setCurrentId(entry.id)
      setView('memo')
    } catch (e) {
      if (e.name !== 'AbortError') setError(e.message)
    } finally {
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

  function deleteDeal(id) {
    persist(deals.filter((d) => d.id !== id))
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

      {storageWarning && (
        <p className="error-text no-print">
          This browser couldn't save the deal pipeline. Download the memo to keep a copy.
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
            <DealForm deal={deal} setDeal={setDeal} onSubmit={run} running={running} />
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

      {view === 'pipeline' && (
        <Pipeline deals={deals} onOpen={openDeal} onDelete={deleteDeal} currentId={currentId} />
      )}

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
