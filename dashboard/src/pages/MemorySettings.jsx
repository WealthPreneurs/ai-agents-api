import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

const SUGGESTED_KEYS = ['brand_voice', 'offers', 'audience', 'banned_claims']

export default function MemorySettings({ userId }) {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')
  const [adding, setAdding] = useState(false)
  const [savingId, setSavingId] = useState(null)
  const [actionError, setActionError] = useState(null)

  useEffect(() => {
    fetchMemory()
  }, [])

  async function fetchMemory() {
    setLoading(true)
    setError(null)
    const { data, error } = await supabase
      .from('client_memory')
      .select('*')
      .eq('client_id', userId)
      .order('updated_at', { ascending: false })

    if (error) {
      setError(error.message)
    } else {
      setEntries(data || [])
    }
    setLoading(false)
  }

  async function addEntry(e) {
    e.preventDefault()
    if (!newKey || !newValue) return

    setAdding(true)
    setActionError(null)
    const { error } = await supabase.from('client_memory').insert({
      client_id: userId,
      memory_key: newKey,
      memory_value: { text: newValue },
    })

    if (error) {
      setActionError(error.message)
      setAdding(false)
      return
    }

    setNewKey('')
    setNewValue('')
    setAdding(false)
    fetchMemory()
  }

  async function updateEntry(entry, text) {
    if (text === (entry.memory_value?.text || '')) return
    setSavingId(entry.id)
    setActionError(null)
    const { error } = await supabase
      .from('client_memory')
      .update({ memory_value: { text }, updated_at: new Date().toISOString() })
      .eq('id', entry.id)

    if (error) {
      setActionError(error.message)
    }
    setSavingId(null)
    fetchMemory()
  }

  async function deleteEntry(entry) {
    setSavingId(entry.id)
    setActionError(null)
    const { error } = await supabase.from('client_memory').delete().eq('id', entry.id)
    if (error) {
      setActionError(error.message)
      setSavingId(null)
      return
    }
    setEntries((prev) => prev.filter((e) => e.id !== entry.id))
    setSavingId(null)
  }

  if (loading) {
    return (
      <div>
        <h2>Memory Settings</h2>
        <p className="loading-text">Loading memory...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div>
        <h2>Memory Settings</h2>
        <div className="error-text">Couldn't load memory: {error}</div>
        <button className="secondary" onClick={fetchMemory} style={{ marginTop: 12 }}>
          Try again
        </button>
      </div>
    )
  }

  return (
    <div>
      <h2>Memory Settings</h2>
      <p className="page-subtitle">
        This is the brand context every worker uses — the more complete this
        is, the better the drafts.
      </p>

      {actionError && <div className="error-text" style={{ marginBottom: 12 }}>{actionError}</div>}

      {entries.length === 0 && (
        <div className="empty-state">
          <p>No memory entries yet — add your first one below.</p>
          <p className="empty-sub">
            Try brand_voice, offers, audience, or banned_claims to get started.
          </p>
        </div>
      )}

      {entries.map((entry) => (
        <div className="card memory-item" key={entry.id}>
          <div className="memory-body">
            <div className="meta">
              {entry.memory_key}
              {savingId === entry.id && <span className="saving-badge"> · saving...</span>}
            </div>
            <textarea
              defaultValue={entry.memory_value?.text || ''}
              onBlur={(e) => updateEntry(entry, e.target.value)}
              disabled={savingId === entry.id}
            />
          </div>
          <button
            className="danger"
            onClick={() => deleteEntry(entry)}
            disabled={savingId === entry.id}
          >
            Delete
          </button>
        </div>
      ))}

      <div className="card">
        <div className="meta">Add new entry</div>
        <form onSubmit={addEntry}>
          <div className="field">
            <label>Key (e.g. brand_voice, offers, audience, banned_claims)</label>
            <input
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              list="suggested-keys"
              placeholder="brand_voice"
            />
            <datalist id="suggested-keys">
              {SUGGESTED_KEYS.map((k) => (
                <option value={k} key={k} />
              ))}
            </datalist>
          </div>
          <div className="field">
            <label>Value</label>
            <textarea
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              placeholder="Describe it here..."
            />
          </div>
          <button className="primary" type="submit" disabled={adding}>
            {adding ? 'Adding...' : 'Add entry'}
          </button>
        </form>
      </div>
    </div>
  )
}
