(function () {
  'use strict';

  var SF = ['firstName','lastName','phone','email','address','city','state','zip','year','sqft','beds','baths','landType','lotRent','park','condition','conditionNotes','liens','owed','timeline','price','motivation','motivationNotes'];
  var BF = ['firstName','lastName','email','phone','buyerType','company','budgetMin','budgetMax','payment','proof','areas','beds','baths','landPref','condition','timeline','volume','notes'];
  var BREQ = ['firstName','lastName','email','phone','buyerType','budgetMin','budgetMax','payment','proof','areas','condition','timeline'];
  var STEPS = [
    { id: 'name', label: 'Your name', req: ['firstName','lastName'], msg: 'We just need a first and last name to get started.' },
    { id: 'contact', label: 'Contact', req: ['phone','email'], msg: 'A phone number and an email, so we can reach you either way.' },
    { id: 'address', label: 'Address', req: ['address','city','state'], msg: 'Address, city and state, please.' },
    { id: 'year', label: 'Year and size', req: ['year','sqft','beds','baths'], msg: 'Year, square footage, bedrooms and bathrooms. Estimates are fine.' },
    { id: 'lot', label: 'Land or lot', req: ['landType'], msg: 'Let us know whether the land is owned or leased.' },
    { id: 'condition', label: 'Condition', req: ['condition'], msg: 'Pick the condition that comes closest.' },
    { id: 'liens', label: 'Liens and taxes', req: ['liens'], msg: 'Choose an option. "Not sure" is a perfectly good answer.' },
    { id: 'timeline', label: 'Timeline', req: ['timeline'], msg: 'Tell us roughly when you would like to sell.' },
    { id: 'price', label: 'Asking price', req: ['price'], msg: 'Give us a number, even a rough one.' },
    { id: 'motivation', label: 'Motivation', req: ['motivation'], msg: 'Choose the reason that fits best.' },
    { id: 'photos', label: 'Photos', req: [], msg: '' },
    { id: 'review', label: 'Review', req: [], msg: '' }
  ];

  function num(v) {
    var n = parseFloat(String(v || '').replace(/[^0-9.]/g, ''));
    return isNaN(n) ? 0 : n;
  }

  function makeRef(p) {
    return p + '-' + String(Math.floor(1000 + Math.random() * 8999));
  }

  var state = {
    route: 'home',
    step: 0,
    photoNames: [],
    f: SF.reduce(function (a, k) { a[k] = ''; return a; }, {}),
    b: BF.reduce(function (a, k) { a[k] = ''; return a; }, {}),
    thanks: 'seller',
    ref: ''
  };

  function estimate() {
    var f = state.f, ask = num(f.price);
    if (!ask) return null;
    var condRanges = {
      'Move-in ready': [0.9, 1.0],
      'Good, minor work': [0.84, 0.95],
      'Needs work': [0.72, 0.88],
      'Major rehab': [0.6, 0.78]
    };
    var cond = condRanges[f.condition] || [0.78, 0.93];
    var yr = num(f.year);
    var age = yr && yr < 1976 ? -0.08 : 0;
    var lot = f.landType === 'Owned land' ? 0.04 : 0;
    var low = ask * (cond[0] + age + lot), high = ask * (cond[1] + age + lot);
    function r(n) { return '$' + (Math.round(n / 500) * 500).toLocaleString(); }
    var note = 'Based on your asking price, the year and the condition you described. Not an offer. A real number comes from the buyer after they see the home.';
    if (f.landType === 'Owned land') note = 'Owned land pulls this range up; buyers pay more when the dirt comes with it. Not an offer. A real number comes after a walkthrough.';
    if (f.condition === 'Major rehab') note = 'Heavy-rehab homes still move in our network, they just draw a wider range. Not an offer. A real number comes after a walkthrough.';
    return { range: r(low) + ' – ' + r(high), note: note };
  }

  function dash(v) {
    var s = String(v || '').trim();
    return s || 'Not given';
  }

  function buildSummary() {
    var f = state.f;
    return [
      { k: 'Name', v: dash(f.firstName + ' ' + f.lastName) },
      { k: 'Contact', v: dash(f.phone) + ' · ' + dash(f.email) },
      { k: 'Address', v: dash([f.address, f.city, f.state, f.zip].filter(Boolean).join(', ')) },
      { k: 'Year built', v: dash(f.year) },
      { k: 'Size', v: dash(f.sqft) + ' sq ft · ' + dash(f.beds) + ' bd / ' + dash(f.baths) + ' ba' },
      { k: 'Land', v: dash(f.landType) + (f.lotRent ? ' · lot rent ' + f.lotRent : '') },
      { k: 'Condition', v: dash(f.condition) + (f.conditionNotes ? ', ' + f.conditionNotes : '') },
      { k: 'Liens / taxes', v: dash(f.liens) + (f.owed ? ' · about ' + f.owed : '') },
      { k: 'Timeline', v: dash(f.timeline) },
      { k: 'Asking price', v: dash(f.price) },
      { k: 'Motivation', v: dash(f.motivation) + (f.motivationNotes ? ', ' + f.motivationNotes : '') },
      { k: 'Photos', v: state.photoNames.length ? state.photoNames.length + ' attached' : 'None' }
    ];
  }

  var routes = document.querySelectorAll('[data-route]');
  function go(route) {
    state.route = route;
    state.err = '';
    state.buyerErr = '';
    render();
    window.scrollTo(0, 0);
  }

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-go]');
    if (el) go(el.getAttribute('data-go'));
  });

  // Seller wizard field bindings
  document.querySelectorAll('[data-field]').forEach(function (el) {
    el.addEventListener('input', function () {
      state.f[el.getAttribute('data-field')] = el.value;
      state.err = '';
      renderSell();
    });
  });

  // Buyer form field bindings
  document.querySelectorAll('[data-bfield]').forEach(function (el) {
    el.addEventListener('input', function () {
      state.b[el.getAttribute('data-bfield')] = el.value;
      state.buyerErr = '';
    });
  });

  document.getElementById('ph2').addEventListener('change', function (e) {
    var names = Array.prototype.slice.call(e.target.files || []).slice(0, 12).map(function (f) { return f.name; });
    state.photoNames = names;
    renderSell();
  });

  document.getElementById('sellNext').addEventListener('click', function () {
    var st = STEPS[state.step], f = state.f;
    var missing = st.req.filter(function (k) { return !String(f[k]).trim(); });
    if (missing.length) {
      state.err = st.msg;
      renderSell();
      return;
    }
    state.step = Math.min(STEPS.length - 1, state.step + 1);
    state.err = '';
    renderSell();
    window.scrollTo(0, 0);
  });

  document.getElementById('sellBack').addEventListener('click', function () {
    if (state.step === 0) { go('home'); return; }
    state.step -= 1;
    state.err = '';
    renderSell();
    window.scrollTo(0, 0);
  });

  document.getElementById('sellSubmit').addEventListener('click', function () {
    state.thanks = 'seller';
    state.ref = makeRef('MH');
    go('thanks');
  });

  document.getElementById('buySubmit').addEventListener('click', function () {
    var b = state.b;
    var missing = BREQ.filter(function (k) { return !String(b[k]).trim(); });
    if (missing.length) {
      state.buyerErr = 'A few required fields are still empty: name, contact, budget, payment, areas, condition and timeline.';
      renderBuy();
      return;
    }
    state.thanks = 'buyer';
    state.ref = makeRef('BP');
    go('thanks');
  });

  function renderSell() {
    var st = STEPS[state.step];
    document.getElementById('stepNum').textContent = state.step + 1;
    document.getElementById('stepLabel').textContent = st.label;
    var pct = Math.round(((state.step + 1) / STEPS.length) * 100) + '%';
    document.getElementById('pctLabel').textContent = pct;
    document.getElementById('pctWidth').style.width = pct;

    document.querySelectorAll('[data-step]').forEach(function (el) {
      el.style.display = el.getAttribute('data-step') === st.id ? '' : 'none';
    });

    var firstNameOrYou = state.f.firstName.trim() || 'friend';
    document.getElementById('firstNameOrYou').textContent = firstNameOrYou;

    document.getElementById('lotRentRow').style.display = state.f.landType.indexOf('Leased') === 0 ? 'grid' : 'none';

    var est = estimate();
    var priceBox = document.getElementById('estimateBoxPrice');
    if (est) {
      priceBox.style.display = '';
      document.getElementById('estimateRangePrice').textContent = est.range;
      document.getElementById('estimateNotePrice').textContent = est.note;
    } else {
      priceBox.style.display = 'none';
    }

    var photoList = document.getElementById('photoList');
    photoList.innerHTML = '';
    state.photoNames.forEach(function (name) {
      var li = document.createElement('li');
      li.style.cssText = 'display: flex; justify-content: space-between; gap: var(--space-4); font-size: 14px; padding: var(--space-2) 0; border-bottom: 1px solid var(--color-divider); color: var(--color-neutral-800);';
      var span1 = document.createElement('span');
      span1.textContent = name;
      var span2 = document.createElement('span');
      span2.style.cssText = 'color: var(--color-accent-700); font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase;';
      span2.textContent = 'Attached';
      li.appendChild(span1);
      li.appendChild(span2);
      photoList.appendChild(li);
    });

    var summaryTable = document.getElementById('summaryTable');
    summaryTable.innerHTML = '';
    buildSummary().forEach(function (row) {
      var tr = document.createElement('tr');
      var th = document.createElement('th');
      th.textContent = row.k;
      var td = document.createElement('td');
      td.textContent = row.v;
      tr.appendChild(th);
      tr.appendChild(td);
      summaryTable.appendChild(tr);
    });

    var reviewBox = document.getElementById('estimateBoxReview');
    if (st.id === 'review' && est) {
      reviewBox.style.display = '';
      document.getElementById('estimateRangeReview').textContent = est.range;
    } else {
      reviewBox.style.display = 'none';
    }

    var errEl = document.getElementById('sellErr');
    if (state.err) { errEl.style.display = ''; errEl.textContent = state.err; }
    else { errEl.style.display = 'none'; }

    document.getElementById('sellNext').style.display = st.id !== 'review' ? '' : 'none';
    document.getElementById('sellSubmit').style.display = st.id === 'review' ? '' : 'none';
  }

  function renderBuy() {
    var b = state.b;
    var filled = BREQ.filter(function (k) { return String(b[k]).trim(); }).length;
    var pct = Math.round((filled / BREQ.length) * 100) + '%';
    document.getElementById('buyerPctLabel').textContent = pct;
    document.getElementById('buyerPctWidth').style.width = pct;

    var errEl = document.getElementById('buyErr');
    if (state.buyerErr) { errEl.style.display = ''; errEl.textContent = state.buyerErr; }
    else { errEl.style.display = 'none'; }
  }

  function renderThanks() {
    var sellerThanks = state.thanks === 'seller';
    document.getElementById('thanksKicker').textContent = sellerThanks ? 'Submission received' : 'Profile saved';
    document.getElementById('thanksTitle').textContent = sellerThanks ? 'Thank you. We have your home.' : 'You’re on the list.';
    document.getElementById('thanksBody').textContent = sellerThanks
      ? 'One of us reads every submission personally, usually the same day. Expect a call or email from a matching buying partner within about 48 hours. If your home isn’t a fit for our network, we’ll still let you know rather than leave you waiting.'
      : 'We’ll send you homes that match your criteria and nothing else. When something fits, you get the full packet: photos, condition notes, lot terms and the seller’s timeline, so you can decide the same day.';
    document.getElementById('refCode').textContent = state.ref;
  }

  function render() {
    routes.forEach(function (el) {
      el.classList.toggle('is-active', el.getAttribute('data-route') === state.route);
    });
    if (state.route === 'sell') renderSell();
    if (state.route === 'buy') renderBuy();
    if (state.route === 'thanks') renderThanks();
  }

  render();
})();
