import { loadDeals, addDeal, removeDeal } from './deals-data.js';

const state = {
  deals: [],
  formType: 'lien'
};

const TOKEN_KEY = 'mc_admin_token';

function fmtMoney(n) {
  return '$' + Math.round(n).toLocaleString('en-US');
}

const segBase = 'flex:1;padding:10px 16px;border:2px solid var(--color-divider);background:var(--color-bg);font-size:13px;font-weight:600;cursor:pointer;';
const segActive = segBase + 'background:var(--color-accent);color:white;border-color:var(--color-accent);';

function dealRowHtml(d) {
  return `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:16px 0;border-bottom:2px solid var(--color-divider);gap:16px;">
      <div>
        <div style="font-weight:600;font-size:15px;">${d.title}</div>
        <div style="font-size:13px;color:var(--color-neutral-700);">${d.typeLabel} · ${fmtMoney(d.amount)} · ${d.targetRate}%</div>
      </div>
      <button class="btn btn-ghost remove-deal" data-deal-id="${d.id}">Remove</button>
    </div>
  `;
}

function render() {
  document.getElementById('seg-lien').setAttribute('style', state.formType === 'lien' ? segActive : segBase);
  document.getElementById('seg-fund').setAttribute('style', state.formType === 'fund' ? segActive : segBase);

  document.getElementById('deals-list').innerHTML = state.deals.map(dealRowHtml).join('');
  document.getElementById('no-deals').hidden = state.deals.length > 0;
}

function clearForm() {
  document.getElementById('f-title').value = '';
  document.getElementById('f-amount').value = '';
  document.getElementById('f-rate').value = '';
  document.getElementById('f-term-min').value = '';
  document.getElementById('f-term-max').value = '';
  document.getElementById('f-summary').value = '';
  document.getElementById('f-details').value = '';
}

function showFormError(msg) {
  const el = document.getElementById('form-error');
  el.textContent = msg;
  el.hidden = false;
}

function hideFormError() {
  document.getElementById('form-error').hidden = true;
}

function getToken() {
  return document.getElementById('f-token').value.trim();
}

async function init() {
  const tokenInput = document.getElementById('f-token');
  try {
    const saved = sessionStorage.getItem(TOKEN_KEY);
    if (saved) tokenInput.value = saved;
  } catch (e) {}
  tokenInput.addEventListener('input', () => {
    try { sessionStorage.setItem(TOKEN_KEY, tokenInput.value); } catch (e) {}
  });

  state.deals = await loadDeals();
  render();

  document.getElementById('seg-lien').addEventListener('click', () => {
    state.formType = 'lien';
    render();
  });
  document.getElementById('seg-fund').addEventListener('click', () => {
    state.formType = 'fund';
    render();
  });

  document.getElementById('add-deal-btn').addEventListener('click', async () => {
    const title = document.getElementById('f-title').value;
    const amount = document.getElementById('f-amount').value;
    const targetRate = document.getElementById('f-rate').value;
    const termMin = document.getElementById('f-term-min').value;
    const termMax = document.getElementById('f-term-max').value;
    const summary = document.getElementById('f-summary').value;
    const details = document.getElementById('f-details').value;

    if (!title || !amount || !targetRate || !termMin || !termMax) {
      showFormError('Fill in title, amount, target rate, and term range.');
      return;
    }

    try {
      state.deals = await addDeal({
        title, type: state.formType, amount, targetRate, termMin, termMax, summary, details
      }, getToken());
      clearForm();
      hideFormError();
      render();
    } catch (e) {
      showFormError(e.message);
    }
  });

  document.getElementById('deals-list').addEventListener('click', async e => {
    const btn = e.target.closest('.remove-deal');
    if (!btn) return;
    try {
      state.deals = await removeDeal(btn.dataset.dealId, getToken());
      hideFormError();
      render();
    } catch (e) {
      showFormError(e.message);
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
