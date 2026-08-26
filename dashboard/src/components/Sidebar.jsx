import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function Sidebar({ current, setCurrent }) {
  const [loggingOut, setLoggingOut] = useState(false)

  async function handleLogout() {
    setLoggingOut(true)
    await supabase.auth.signOut()
    setLoggingOut(false)
  }

  return (
    <div className="sidebar">
      <h1>AI Worker HQ</h1>
      <nav className="sidebar-nav">
        <button
          className={current === 'queue' ? 'active' : ''}
          onClick={() => setCurrent('queue')}
        >
          Approval Queue
        </button>
        <button
          className={current === 'memory' ? 'active' : ''}
          onClick={() => setCurrent('memory')}
        >
          Memory Settings
        </button>
        <button
          className={current === 'team' ? 'active' : ''}
          onClick={() => setCurrent('team')}
        >
          Your Team
        </button>
      </nav>
      <button className="logout" onClick={handleLogout} disabled={loggingOut}>
        {loggingOut ? 'Logging out...' : 'Log out'}
      </button>
    </div>
  )
}
