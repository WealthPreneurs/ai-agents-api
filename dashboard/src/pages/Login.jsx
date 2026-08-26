import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function Login() {
  const [mode, setMode] = useState('login') // 'login' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setNotice(null)
    setLoading(true)

    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) setError(error.message)
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) {
          setError(error.message)
        } else {
          if (data.user && businessName) {
            // fill in business_name on the auto-created clients row
            const { error: updateError } = await supabase
              .from('clients')
              .update({ business_name: businessName })
              .eq('id', data.user.id)
            if (updateError) setError(updateError.message)
          }
          if (!data.session) {
            setNotice('Check your inbox to confirm your email, then log in.')
            setMode('login')
          }
        }
      }
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-wrap">
      <h2>{mode === 'login' ? 'Log in' : 'Create your account'}</h2>
      <form onSubmit={handleSubmit}>
        {mode === 'signup' && (
          <div className="field">
            <label>Business name</label>
            <input
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="Your business name"
            />
          </div>
        )}
        <div className="field">
          <label>Email</label>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Password</label>
          <input
            type="password"
            required
            minLength={6}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <button className="primary" type="submit" disabled={loading}>
          {loading ? 'Please wait...' : mode === 'login' ? 'Log in' : 'Sign up'}
        </button>
        {error && <div className="error-text">{error}</div>}
        {notice && <div className="notice-text">{notice}</div>}
      </form>
      <p className="switch-mode">
        {mode === 'login' ? (
          <>
            No account?{' '}
            <a href="#" onClick={(e) => { e.preventDefault(); setMode('signup'); setError(null); setNotice(null) }}>
              Sign up
            </a>
          </>
        ) : (
          <>
            Already have an account?{' '}
            <a href="#" onClick={(e) => { e.preventDefault(); setMode('login'); setError(null); setNotice(null) }}>
              Log in
            </a>
          </>
        )}
      </p>
    </div>
  )
}
