import { useEffect, useState } from 'react'
import { supabase } from './lib/supabaseClient'
import Login from './pages/Login'
import ApprovalQueue from './pages/ApprovalQueue'
import MemorySettings from './pages/MemorySettings'
import Sidebar from './components/Sidebar'

const PAGE_TITLES = {
  queue: 'Approval Queue',
  memory: 'Memory Settings',
}

export default function App() {
  const [session, setSession] = useState(null)
  const [checking, setChecking] = useState(true)
  const [page, setPage] = useState('queue')
  const [navOpen, setNavOpen] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setChecking(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  if (checking) {
    return (
      <div className="app-loading">
        <div className="spinner" />
      </div>
    )
  }

  if (!session) return <Login />

  const userId = session.user.id

  function goTo(nextPage) {
    setPage(nextPage)
    setNavOpen(false)
  }

  return (
    <div className={`app-shell ${navOpen ? 'nav-open' : ''}`}>
      <Sidebar current={page} setCurrent={goTo} />
      {navOpen && <div className="nav-scrim" onClick={() => setNavOpen(false)} />}

      <div className="main-col">
        <header className="topbar">
          <button
            className="hamburger"
            aria-label="Toggle navigation"
            onClick={() => setNavOpen((v) => !v)}
          >
            <span />
            <span />
            <span />
          </button>
          <h2 className="topbar-title">{PAGE_TITLES[page]}</h2>
        </header>

        <div className="main">
          {page === 'queue' && <ApprovalQueue userId={userId} />}
          {page === 'memory' && <MemorySettings userId={userId} />}
        </div>
      </div>
    </div>
  )
}
