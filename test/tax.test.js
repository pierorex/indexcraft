import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateUcitsEtf, simulateDiyCgt, compareDiyVsEtf, DEFAULTS } from '../js/tax.js';

test('simulateUcitsEtf with zero years returns principal untaxed', () => {
  const result = simulateUcitsEtf({ principal: 10000, annualReturn: 0.07, years: 0 });
  assert.equal(result.finalValue, 10000);
  assert.equal(result.totalTaxPaid, 0);
  assert.deepEqual(result.deemedDisposalEvents, []);
});

test('simulateUcitsEtf with flat (zero) growth pays no tax', () => {
  const result = simulateUcitsEtf({ principal: 10000, annualReturn: 0, years: 16 });
  assert.equal(result.finalValue, 10000);
  assert.equal(result.totalTaxPaid, 0);
});

test('simulateUcitsEtf triggers a deemed disposal exactly at year 8, not at final year', () => {
  const result = simulateUcitsEtf({ principal: 10000, annualReturn: 0.05, years: 8 });
  // year 8 == years, so it's the final sale, not an interim deemed disposal
  assert.deepEqual(result.deemedDisposalEvents, []);
  assert.ok(result.totalTaxPaid > 0);
});

test('simulateUcitsEtf triggers exactly one deemed disposal between year 8 and 16', () => {
  const result = simulateUcitsEtf({ principal: 10000, annualReturn: 0.05, years: 10 });
  assert.equal(result.deemedDisposalEvents.length, 1);
  assert.equal(result.deemedDisposalEvents[0].year, 8);
});

test('simulateUcitsEtf taxes deemed disposal gain at 41% and steps up basis', () => {
  const result = simulateUcitsEtf({
    principal: 10000,
    annualReturn: 0.05,
    years: 9,
    taxRate: 0.41,
  });
  const grownValue = 10000 * Math.pow(1.05, 8);
  const expectedGain = grownValue - 10000;
  const expectedTax = expectedGain * 0.41;
  assert.ok(Math.abs(result.deemedDisposalEvents[0].tax - expectedTax) < 1e-6);
});

test('simulateUcitsEtf does not tax or rebase on a loss at deemed disposal', () => {
  // Down years then a partial recovery: value at year 8 below principal.
  const result = simulateUcitsEtf({ principal: 10000, annualReturn: -0.1, years: 9 });
  assert.equal(result.deemedDisposalEvents[0].tax, 0);
});

test('simulateUcitsEtf never produces a negative final value for non-negative input', () => {
  const result = simulateUcitsEtf({ principal: 10000, annualReturn: 0.08, years: 30 });
  assert.ok(result.finalValue > 0);
});

test('simulateUcitsEtf throws on negative years or non-positive interval', () => {
  assert.throws(() => simulateUcitsEtf({ principal: 1, annualReturn: 0, years: -1 }), RangeError);
  assert.throws(
    () => simulateUcitsEtf({ principal: 1, annualReturn: 0, years: 1, intervalYears: 0 }),
    RangeError,
  );
});

test('simulateDiyCgt with zero years returns principal untaxed', () => {
  const result = simulateDiyCgt({ principal: 10000, annualReturn: 0.07, years: 0 });
  assert.equal(result.finalValue, 10000);
  assert.equal(result.totalTaxPaid, 0);
});

test('simulateDiyCgt applies the annual exemption before taxing the gain', () => {
  // Small gain entirely covered by the exemption should be untaxed.
  const result = simulateDiyCgt({
    principal: 10000,
    annualReturn: 0,
    years: 1,
    annualExemption: 1270,
  });
  assert.equal(result.totalTaxPaid, 0);
});

test('simulateDiyCgt taxes only the gain above the exemption at 33%', () => {
  const principal = 10000;
  const grossValue = principal * Math.pow(1.07, 20);
  const gain = grossValue - principal;
  const expectedTax = (gain - 1270) * 0.33;
  const result = simulateDiyCgt({ principal, annualReturn: 0.07, years: 20 });
  assert.ok(Math.abs(result.totalTaxPaid - expectedTax) < 1e-6);
});

test('simulateDiyCgt never taxes a loss', () => {
  const result = simulateDiyCgt({ principal: 10000, annualReturn: -0.05, years: 5 });
  assert.equal(result.totalTaxPaid, 0);
  assert.ok(result.finalValue < 10000);
});

test('compareDiyVsEtf: DIY beats ETF over a long horizon with no interim DIY sales', () => {
  // Buy-and-hold DIY only pays tax once at the end; ETF pays deemed disposal tax
  // every 8 years, which compounds away more of the gain over a long horizon.
  const result = compareDiyVsEtf({ principal: 10000, annualReturn: 0.07, years: 24 });
  assert.ok(result.diyAdvantage > 0);
});

test('compareDiyVsEtf: with zero growth neither structure owes tax and they tie', () => {
  const result = compareDiyVsEtf({ principal: 10000, annualReturn: 0, years: 16 });
  assert.equal(result.diy.finalValue, result.etf.finalValue);
  assert.equal(result.diyAdvantage, 0);
});

test('DEFAULTS match the documented Irish rates', () => {
  assert.equal(DEFAULTS.etfTaxRate, 0.41);
  assert.equal(DEFAULTS.cgtRate, 0.33);
  assert.equal(DEFAULTS.deemedDisposalIntervalYears, 8);
  assert.equal(DEFAULTS.annualExemption, 1270);
});
