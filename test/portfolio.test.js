import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  selectTopN,
  capWeights,
  equalWeights,
  indexCoverage,
  sectorBreakdown,
  concentrationCheck,
} from '../js/portfolio.js';

const sample = [
  { symbol: 'AAA', sector: 'Tech', marketCapB: 300 },
  { symbol: 'BBB', sector: 'Tech', marketCapB: 200 },
  { symbol: 'CCC', sector: 'Health', marketCapB: 100 },
  { symbol: 'DDD', sector: 'Energy', marketCapB: 50 },
];

test('selectTopN returns the N largest by market cap, descending', () => {
  const top2 = selectTopN(sample, 2);
  assert.deepEqual(top2.map((s) => s.symbol), ['AAA', 'BBB']);
});

test('selectTopN with n=0 returns empty array', () => {
  assert.deepEqual(selectTopN(sample, 0), []);
});

test('selectTopN throws on negative n', () => {
  assert.throws(() => selectTopN(sample, -1), RangeError);
});

test('selectTopN does not mutate the input array', () => {
  const copy = [...sample];
  selectTopN(sample, 2);
  assert.deepEqual(sample, copy);
});

test('capWeights sums to 1 and is proportional to market cap', () => {
  const weighted = capWeights(sample);
  const total = weighted.reduce((sum, s) => sum + s.weight, 0);
  assert.ok(Math.abs(total - 1) < 1e-9);
  assert.ok(Math.abs(weighted[0].weight - 300 / 650) < 1e-9);
});

test('capWeights handles empty list without dividing by zero', () => {
  assert.deepEqual(capWeights([]), []);
});

test('capWeights handles zero total market cap without NaN', () => {
  const zeroed = [{ symbol: 'X', marketCapB: 0 }, { symbol: 'Y', marketCapB: 0 }];
  const weighted = capWeights(zeroed);
  assert.deepEqual(weighted.map((s) => s.weight), [0, 0]);
});

test('equalWeights gives every stock 1/n', () => {
  const weighted = equalWeights(sample);
  for (const s of weighted) {
    assert.ok(Math.abs(s.weight - 0.25) < 1e-9);
  }
});

test('equalWeights handles empty list', () => {
  assert.deepEqual(equalWeights([]), []);
});

test('indexCoverage is 1 when the basket is the whole index', () => {
  assert.ok(Math.abs(indexCoverage(sample, sample) - 1) < 1e-9);
});

test('indexCoverage is fraction of total market cap captured', () => {
  const basket = selectTopN(sample, 2); // 300 + 200 = 500 of 650
  assert.ok(Math.abs(indexCoverage(basket, sample) - 500 / 650) < 1e-9);
});

test('indexCoverage handles empty full index without dividing by zero', () => {
  assert.equal(indexCoverage([], []), 0);
});

test('sectorBreakdown aggregates weights per sector and sorts descending', () => {
  const weighted = capWeights(sample); // Tech 500/650, Health 100/650, Energy 50/650
  const breakdown = sectorBreakdown(weighted);
  assert.deepEqual(breakdown.map((b) => b.sector), ['Tech', 'Health', 'Energy']);
  assert.ok(Math.abs(breakdown[0].weight - 500 / 650) < 1e-9);
});

test('sectorBreakdown total weight equals 1', () => {
  const weighted = capWeights(sample);
  const breakdown = sectorBreakdown(weighted);
  const total = breakdown.reduce((sum, b) => sum + b.weight, 0);
  assert.ok(Math.abs(total - 1) < 1e-9);
});

test('concentrationCheck flags the largest holding above threshold', () => {
  const weighted = capWeights(sample);
  const result = concentrationCheck(weighted, 0.4);
  assert.equal(result.largest, 'AAA');
  assert.equal(result.exceedsThreshold, true);
});

test('concentrationCheck does not flag when under threshold', () => {
  const weighted = equalWeights(sample);
  const result = concentrationCheck(weighted, 0.5);
  assert.equal(result.exceedsThreshold, false);
});

test('concentrationCheck handles empty list', () => {
  const result = concentrationCheck([]);
  assert.equal(result.largest, null);
  assert.equal(result.exceedsThreshold, false);
});
