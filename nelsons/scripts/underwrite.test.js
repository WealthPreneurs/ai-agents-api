const test = require('node:test');
const assert = require('node:assert/strict');
const { netProfit, roiPercent, confidenceScore, underwrite, parseArgs } = require('./underwrite');

test('ROI matches the Deals app formula', () => {
  // (85000 - 57000) / 57000 * 100
  assert.equal(Math.round(roiPercent({ arv: 85000, askingPrice: 45000, repairEstimate: 12000 }) * 100) / 100, 49.12);
  assert.equal(roiPercent({ arv: 1000, askingPrice: 0, repairEstimate: 0 }), null);
});

test('Net profit subtracts all four cost buckets', () => {
  const n = netProfit({ arv: 85000, askingPrice: 45000, repairEstimate: 12000, holdingCosts: 2000, closingCosts: 1350 });
  assert.equal(n, 24650);
});

test('Confidence score averages factors and inverts inspection risk', () => {
  // Hot=9, demand 7, risk 4 -> 7, creative 8 => 7.75 -> 8
  const c = confidenceScore({ sellerMotivation: 'Hot', marketDemand: 7, inspectionRisk: 4, creativeStructure: 8 });
  assert.equal(c.score, 8);
  assert.deepEqual(confidenceScore({ sellerMotivation: 'Cold', marketDemand: 7 }).missing, [
    'inspectionRisk',
    'creativeStructure',
  ]);
});

test('Deal inside the Buy Box passes and reports default assumptions', () => {
  const r = underwrite({ askingPrice: 45000, repairEstimate: 12000, arv: 85000, propertyType: 'Mobile Home on Land' });
  assert.equal(r.ok, true);
  assert.equal(r.buyBox.pass, true);
  assert.equal(r.netProfit, 85000 - (45000 + 12000 + 0 + 1350));
  assert.equal(r.assumptions.length, 3); // holding, closing, confidence
});

test('Heavy rehab and thin ROI fail the Buy Box', () => {
  const r = underwrite({ askingPrice: 100000, repairEstimate: 40000, arv: 150000, propertyType: 'SFH' });
  assert.equal(r.buyBox.pass, false);
  assert.equal(r.buyBox.reasons.length, 2);
});

test('Missing core inputs are flagged, not guessed', () => {
  const r = underwrite({ askingPrice: 45000 });
  assert.equal(r.ok, false);
  assert.equal(r.errors.length, 2);
});

test('Bad optional inputs are rejected instead of producing NaN', () => {
  const base = { askingPrice: 45000, repairEstimate: 12000, arv: 85000 };
  assert.equal(underwrite({ ...base, closingCosts: '1500' }).ok, false);
  assert.equal(underwrite({ ...base, holdingCosts: NaN }).ok, false);
  assert.equal(underwrite({ ...base, sellerMotivation: 'toString' }).ok, false);
  assert.equal(underwrite({ ...base, marketDemand: 11 }).ok, false);
  assert.equal(underwrite({ ...base, propertyType: 5 }).ok, false);
  assert.equal(underwrite(null).ok, false);
  assert.equal(underwrite([]).ok, false);
});

test('CLI flags parse', () => {
  assert.deepEqual(parseArgs(['--asking', '45000', '--motivation', 'Warm', '--risk', '3']), {
    askingPrice: 45000,
    sellerMotivation: 'Warm',
    inspectionRisk: 3,
  });
  assert.throws(() => parseArgs(['--bogus', '1']));
});
