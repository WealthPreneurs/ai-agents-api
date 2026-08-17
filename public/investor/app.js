import { loadDeals } from './deals-data.js';

const state = {
  email: '',
  showEmailError: false,
  unlocked: false,
  deals: [],
  calcAmount: 500000,
  calcMonths: 24,
  calcDealType: 'lien',
  calcRate: 12,
  calcCompounding: 'simple'
};

function fmtMoney(n) {
  return '$' + Math.round(n).toLocaleString('en-US');
}

function fmtMonths(m) {
  if (m < 12) return m + ' mo';
  const y = Math.floor(m / 12), rem = m % 12;
  return rem === 0 ? y + ' yr' : y + 'y ' + rem + 'mo';
}

function computeReturn() {
  const { calcAmount, calcMonths, calcRate, calcCompounding } = state;
  const years = calcMonths / 12;
  if (calcCompounding === 'compound') {
    const monthlyRate = calcRate / 100 / 12;
    const total = calcAmount * Math.pow(1 + monthlyRate, calcMonths);
    return { profit: total - calcAmount, total };
  }
  const profit = calcAmount * (calcRate / 100) * years;
  return { profit, total: calcAmount + profit };
}

function dealCardHtml(d, unlocked) {
  const locked = !unlocked;
  return `
    <div class="card" style="border-radius:0;border-right:2px solid var(--color-divider);border-bottom:2px solid var(--color-divider);border-top:none;border-left:none;padding:28px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">
        <span class="tag tag-outline card-kicker">${d.typeLabel}</span>
        <span style="font-family:var(--font-heading);font-size:24px;font-weight:700;color:var(--color-accent-700);">${d.targetRate}%</span>
      </div>
      <div class="card-title" style="font-size:18px;font-weight:700;margin-bottom:8px;">${d.title}</div>
      <div class="card-body" style="font-size:14px;line-height:1.5;color:var(--color-neutral-700);margin-bottom:16px;">${d.summary}</div>
      <div class="card-meta" style="font-size:13px;color:var(--color-neutral-700);display:flex;justify-content:space-between;border-top:2px solid var(--color-divider);padding-top:12px;margin-bottom:16px;">
        <span>${fmtMoney(d.amount)}</span>
        <span>${fmtMonths(d.termMin)} – ${fmtMonths(d.termMax)}</span>
      </div>
      ${unlocked ? `
      <div style="font-size:13px;line-height:1.6;color:var(--color-text);padding-top:8px;">${d.details}</div>
      <button class="btn btn-secondary use-in-calc" data-deal-id="${d.id}" style="margin-top:16px;">Use in calculator →</button>
      ` : `
      <div style="font-size:13px;color:var(--color-neutral-700);padding-top:8px;filter:blur(3px);user-select:none;">First lien position secured by the underlying real estate asset, targeting the return above over the stated term.</div>
      <button class="btn btn-ghost scroll-to-email" style="margin-top:16px;">🔒 Unlock full terms</button>
      `}
    </div>
  `;
}

function heroDealHtml(d) {
  return `
    <div style="padding:20px 0;border-bottom:2px solid var(--color-divider);">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px;">
        <span class="tag tag-outline">${d.typeLabel}</span>
        <span style="font-family:var(--font-heading);font-size:28px;font-weight:700;color:var(--color-accent-700);">${d.targetRate}%</span>
      </div>
      <div style="font-weight:600;font-size:16px;margin-bottom:4px;">${d.title}</div>
      <div style="font-size:14px;color:var(--color-neutral-700);">${fmtMoney(d.amount)} · ${fmtMonths(d.termMin)} – ${fmtMonths(d.termMax)}</div>
    </div>
  `;
}

const segBase = 'flex:1;padding:10px 16px;border:2px solid var(--color-divider);background:var(--color-bg);font-size:13px;font-weight:600;cursor:pointer;text-align:left;';
const segActive = segBase + 'background:var(--color-accent);color:white;border-color:var(--color-accent);';

function render() {
  document.getElementById('email-input').value = state.email;
  document.getElementById('email-error').hidden = !state.showEmailError;
  document.getElementById('unlocked-msg').hidden = !state.unlocked;

  document.getElementById('hero-deals').innerHTML = state.deals.slice(0, 2).map(heroDealHtml).join('');
  document.getElementById('deals-grid').innerHTML = state.deals.map(d => dealCardHtml(d, state.unlocked)).join('');

  document.getElementById('seg-lien').setAttribute('style', state.calcDealType === 'lien' ? segActive : segBase);
  document.getElementById('seg-fund').setAttribute('style', state.calcDealType === 'fund' ? segActive : segBase);
  document.getElementById('seg-simple').setAttribute('style', state.calcCompounding === 'simple' ? segActive : segBase);
  document.getElementById('seg-compound').setAttribute('style', state.calcCompounding === 'compound' ? segActive : segBase);

  document.getElementById('calc-amount').value = state.calcAmount;
  document.getElementById('calc-amount-label').textContent = fmtMoney(state.calcAmount);
  document.getElementById('calc-months').value = state.calcMonths;
  document.getElementById('calc-months-label').textContent = fmtMonths(state.calcMonths);
  document.getElementById('calc-rate').value = state.calcRate;
  document.getElementById('calc-rate-label').textContent = state.calcRate + '%';

  document.getElementById('calc-result-unlocked').hidden = !state.unlocked;
  document.getElementById('calc-result-locked').hidden = state.unlocked;
  if (state.unlocked) {
    const { profit, total } = computeReturn();
    document.getElementById('calc-profit').textContent = fmtMoney(profit);
    document.getElementById('calc-total').textContent = 'Total return: ' + fmtMoney(total);
    const modeLabel = state.calcCompounding === 'compound' ? 'compounding monthly' : 'simple interest';
    document.getElementById('calc-summary').textContent =
      `On ${fmtMoney(state.calcAmount)} over ${fmtMonths(state.calcMonths)} at ${state.calcRate}%, ${modeLabel}.`;
  }
}

function scrollToEmail() {
  const el = document.getElementById('email-input');
  if (el) { el.scrollIntoView({ block: 'center' }); el.focus(); }
}

function unlock() {
  try { localStorage.setItem('mc_unlocked', '1'); } catch (e) {}
  state.unlocked = true;
  state.showEmailError = false;
  render();
}

function init() {
  try {
    if (localStorage.getItem('mc_unlocked') === '1') state.unlocked = true;
  } catch (e) {}

  state.deals = loadDeals();
  render();

  const emailInput = document.getElementById('email-input');
  emailInput.addEventListener('input', e => {
    state.email = e.target.value;
    state.showEmailError = false;
    document.getElementById('email-error').hidden = true;
  });

  document.getElementById('unlock-btn').addEventListener('click', () => {
    const ok = /\S+@\S+\.\S+/.test(state.email);
    if (!ok) {
      state.showEmailError = true;
      render();
      return;
    }
    unlock();
  });

  document.getElementById('seg-lien').addEventListener('click', () => {
    state.calcDealType = 'lien';
    state.calcRate = 12;
    render();
  });
  document.getElementById('seg-fund').addEventListener('click', () => {
    state.calcDealType = 'fund';
    state.calcRate = 18;
    render();
  });
  document.getElementById('seg-simple').addEventListener('click', () => {
    state.calcCompounding = 'simple';
    render();
  });
  document.getElementById('seg-compound').addEventListener('click', () => {
    state.calcCompounding = 'compound';
    render();
  });

  document.getElementById('calc-amount').addEventListener('input', e => {
    state.calcAmount = Number(e.target.value);
    render();
  });
  document.getElementById('calc-months').addEventListener('input', e => {
    state.calcMonths = Number(e.target.value);
    render();
  });
  document.getElementById('calc-rate').addEventListener('input', e => {
    state.calcRate = Number(e.target.value);
    render();
  });

  // Delegated handlers for content generated by render() (deal cards, locked CTAs).
  document.body.addEventListener('click', e => {
    const scrollBtn = e.target.closest('.scroll-to-email');
    if (scrollBtn) { scrollToEmail(); return; }

    const useBtn = e.target.closest('.use-in-calc');
    if (useBtn) {
      const d = state.deals.find(x => x.id === useBtn.dataset.dealId);
      if (d) {
        state.calcDealType = d.type;
        state.calcRate = d.targetRate;
        state.calcAmount = Math.min(1000000, d.amount);
        render();
        const el = document.getElementById('calculator');
        if (el) el.scrollIntoView({ block: 'start' });
      }
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
