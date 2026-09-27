import { useEffect, useState } from 'react'
import { supabase } from './lib/supabaseClient'
import Login from './pages/Login'
import DealEngine from './pages/DealEngine'
import Sidebar from './components/Sidebar'

// Only the Deal Engine is offered right now. The Approval Queue, Memory
// Settings and Your Team pages are still in src/pages; add them back here
// and in Sidebar.jsx to re-enable them.
const PAGE_TITLES = {
  deals: 'Deal Engine',
}

export default function App() {
  const [session, setSession] = useState(null)
  const [checking, setChecking] = useState(true)
  const [page, setPage] = useState('deals')
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

        <div className={`main ${page === 'deals' ? 'main-wide' : ''}`}>
          {page === 'deals' && <DealEngine userId={userId} />}
        </div>
      </div>
    </div>
  )
}
