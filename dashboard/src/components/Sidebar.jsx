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
          className={current === 'deals' ? 'active' : ''}
          onClick={() => setCurrent('deals')}
        >
          Deal Engine
        </button>
      </nav>
      <button className="logout" onClick={handleLogout} disabled={loggingOut}>
        {loggingOut ? 'Logging out...' : 'Log out'}
      </button>
    </div>
  )
}
