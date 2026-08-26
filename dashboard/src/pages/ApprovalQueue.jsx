import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function ApprovalQueue({ userId }) {
  const [runs, setRuns] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [editText, setEditText] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [actionError, setActionError] = useState(null)

  useEffect(() => {
    fetchQueue()
  }, [])

  async function fetchQueue() {
    setLoading(true)
    setError(null)
    const { data, error } = await supabase
      .from('worker_runs')
      .select('*')
      .eq('client_id', userId)
      .eq('status', 'pending_approval')
      .order('triggered_at', { ascending: false })

    if (error) {
      setError(error.message)
    } else {
      setRuns(data || [])
    }
    setLoading(false)
  }

  async function approve(run) {
    setBusyId(run.id)
    setActionError(null)
    const { error } = await supabase
      .from('worker_runs')
      .update({ status: 'approved', approved_at: new Date().toISOString() })
      .eq('id', run.id)

    if (error) {
      setActionError(error.message)
      setBusyId(null)
      return
    }
    setRuns((prev) => prev.filter((r) => r.id !== run.id))
    setBusyId(null)
  }

  async function reject(run) {
    setBusyId(run.id)
    setActionError(null)
    const { error } = await supabase
      .from('worker_runs')
      .update({ status: 'rejected' })
      .eq('id', run.id)

    if (error) {
      setActionError(error.message)
      setBusyId(null)
      return
    }
    setRuns((prev) => prev.filter((r) => r.id !== run.id))
    setBusyId(null)
  }

  function startEdit(run) {
    setEditingId(run.id)
    setEditText(run.raw_output?.body || '')
    setActionError(null)
  }

  async function saveEdit(run) {
    setBusyId(run.id)
    setActionError(null)
    const updatedOutput = { ...run.raw_output, body: editText }
    const { error } = await supabase
      .from('worker_runs')
      .update({
        raw_output: updatedOutput,
        status: 'edited',
        approved_at: new Date().toISOString(),
      })
      .eq('id', run.id)

    if (error) {
      setActionError(error.message)
      setBusyId(null)
      return
    }
    setEditingId(null)
    setRuns((prev) => prev.filter((r) => r.id !== run.id))
    setBusyId(null)
  }

  if (loading) {
    return (
      <div>
        <h2>Approval Queue</h2>
        <p className="loading-text">Loading queue...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div>
        <h2>Approval Queue</h2>
        <div className="error-text">Couldn't load your queue: {error}</div>
        <button className="secondary" onClick={fetchQueue} style={{ marginTop: 12 }}>
          Try again
        </button>
      </div>
    )
  }

  if (runs.length === 0) {
    return (
      <div>
        <h2>Approval Queue</h2>
        <div className="empty-state">
          <p>Nothing waiting on you right now.</p>
          <p className="empty-sub">New drafts from your AI worker will show up here for review.</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <h2>Approval Queue</h2>
      {actionError && <div className="error-text" style={{ marginBottom: 12 }}>{actionError}</div>}
      {runs.map((run) => (
        <div className="card" key={run.id}>
          <div className="meta">
            {run.worker_key} · {run.raw_output?.platform || 'draft'} ·{' '}
            {new Date(run.triggered_at).toLocaleString()}
          </div>

          {editingId === run.id ? (
            <>
              <div className="field">
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  disabled={busyId === run.id}
                />
              </div>
              <div className="actions">
                <button
                  className="primary"
                  onClick={() => saveEdit(run)}
                  disabled={busyId === run.id}
                >
                  {busyId === run.id ? 'Saving...' : 'Save & Approve'}
                </button>
                <button
                  className="secondary"
                  onClick={() => setEditingId(null)}
                  disabled={busyId === run.id}
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="body-text">{run.raw_output?.body}</div>
              <div className="actions">
                <button
                  className="primary"
                  onClick={() => approve(run)}
                  disabled={busyId === run.id}
                >
                  {busyId === run.id ? 'Working...' : 'Approve'}
                </button>
                <button
                  className="secondary"
                  onClick={() => startEdit(run)}
                  disabled={busyId === run.id}
                >
                  Edit
                </button>
                <button
                  className="danger"
                  onClick={() => reject(run)}
                  disabled={busyId === run.id}
                >
                  Reject
                </button>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  )
}
