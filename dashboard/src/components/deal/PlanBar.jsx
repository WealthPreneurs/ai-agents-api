import { useState } from 'react'
import { startCheckout, openBillingPortal } from '../../lib/dealEngineApi'

function formatPrice(price) {
  if (!price) return null
  const amount = (price.amount / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: price.currency.toUpperCase(),
    minimumFractionDigits: price.amount % 100 ? 2 : 0,
  })
  return `${amount}/${price.interval === 'year' ? 'yr' : 'mo'}`
}

// Shows the user's Deal Engine plan and usage, with subscribe / manage actions.
export default function PlanBar({ plan, loading, error, activating, onRetry }) {
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState(null)

  async function go(action) {
    setBusy(true)
    setActionError(null)
    try {
      const { url } = await action()
      window.location.assign(url)
    } catch (e) {
      setActionError(e.message)
      setBusy(false)
    }
  }

  if (loading) return <div className="plan-bar muted small">Loading your plan...</div>
  if (error) {
    return (
      <div className="plan-bar plan-bar-warn">
        <span>Couldn't load your plan ({error}).</span>
        <button className="link-button" onClick={onRetry}>
          Retry
        </button>
      </div>
    )
  }
  if (!plan || plan.plan === 'unlimited') return null

  const price = formatPrice(plan.price)
  const pct = plan.limit ? Math.min(100, Math.round((plan.used / plan.limit) * 100)) : 0

  let label
  if (plan.plan === 'pro') {
    label = (
      <>
        <strong>Deal Engine Pro</strong> · {plan.used} of {plan.limit} memos used this period
        {plan.periodEnd && (
          <span className="muted">
            {' '}
            · {plan.cancelAtPeriodEnd ? 'ends' : 'renews'} {new Date(plan.periodEnd).toLocaleDateString()}
          </span>
        )}
      </>
    )
  } else if (plan.plan === 'free') {
    label = (
      <>
        <strong>Free</strong> · {plan.used} of {plan.limit} free memos used
      </>
    )
  } else {
    label = <span>{plan.message}</span>
  }

  return (
    <div className={`plan-bar ${plan.canRun ? '' : 'plan-bar-warn'}`}>
      <div className="plan-bar-main">
        <div className="plan-bar-label">{label}</div>
        {plan.limit ? (
          <div className="bar plan-meter" aria-hidden="true">
            <div className={`bar-fill ${plan.canRun ? 'tone-high' : 'tone-low'}`} style={{ width: `${pct}%` }} />
          </div>
        ) : null}
        {activating && <div className="small notice-text">Payment received — activating your subscription...</div>}
        {actionError && <div className="error-text">{actionError}</div>}
      </div>
      <div className="plan-bar-actions">
        {plan.plan === 'pro' && (
          <button className="secondary" disabled={busy} onClick={() => go(openBillingPortal)}>
            {busy ? 'Opening...' : 'Manage billing'}
          </button>
        )}
        {plan.plan === 'free' && plan.checkoutAvailable && (
          <button className="primary" disabled={busy || activating} onClick={() => go(startCheckout)}>
            {busy ? 'Opening checkout...' : `Subscribe${price ? ` — ${price}` : ''}`}
          </button>
        )}
      </div>
    </div>
  )
}
