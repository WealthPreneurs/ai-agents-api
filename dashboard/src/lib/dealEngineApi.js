// Client for the Kingdom Capital Deal Engine endpoint on the AI Agents API
// (index.js at the repo root). In dev, Vite proxies these paths to
// localhost:3000; in production set VITE_AGENTS_API_URL.
const API_BASE = (import.meta.env.VITE_AGENTS_API_URL || '').replace(/\/$/, '')

export async function checkEngineHealth() {
  const res = await fetch(`${API_BASE}/health`)
  if (!res.ok) throw new Error(`Health check failed (${res.status})`)
  return res.json()
}

// Streams newline-delimited JSON events. Calls onEvent for each progress
// event and resolves with the final result payload.
export async function evaluateDeal(deal, { onEvent, signal } = {}) {
  const res = await fetch(`${API_BASE}/deal-engine/evaluate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(deal),
    signal,
  })

  if (!res.ok) {
    let message = `Request failed (${res.status})`
    try {
      const data = await res.json()
      if (data.error) message = data.error
    } catch {
      // non-JSON error body
    }
    throw new Error(message)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let result = null

  function handleLine(line) {
    if (!line.trim()) return
    const event = JSON.parse(line)
    if (event.type === 'error') throw new Error(event.error)
    if (event.type === 'result') result = event
    else if (event.type !== 'heartbeat') onEvent?.(event)
  }

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop()
    lines.forEach(handleLine)
  }
  handleLine(buffer)

  if (!result) throw new Error('The engine closed the connection before finishing.')
  return result
}
