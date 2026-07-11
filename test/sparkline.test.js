import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSparkline } from '../js/sparkline.js';

test('buildSparkline returns null for fewer than 2 values', () => {
  assert.equal(buildSparkline([]), null);
  assert.equal(buildSparkline([5]), null);
  assert.equal(buildSparkline(null), null);
});

test('buildSparkline marks an upward series as positive trend', () => {
  const result = buildSparkline([10, 12, 15, 20]);
  assert.equal(result.trend, 'positive');
});

test('buildSparkline marks a downward series as negative trend', () => {
  const result = buildSparkline([20, 18, 15, 10]);
  assert.equal(result.trend, 'negative');
});

test('buildSparkline marks a flat series (equal endpoints) as flat trend', () => {
  const result = buildSparkline([10, 15, 5, 10]);
  assert.equal(result.trend, 'flat');
});

test('buildSparkline maps the first and last x to the padding bounds', () => {
  const { points } = buildSparkline([1, 2, 3], { width: 60, height: 20, padding: 2 });
  const coords = points.split(' ').map((p) => p.split(',').map(Number));
  assert.equal(coords[0][0], 2); // first x = padding
  assert.equal(coords[coords.length - 1][0], 58); // last x = width - padding
});

test('buildSparkline maps the highest value to the smallest y (top of the chart)', () => {
  const { points } = buildSparkline([5, 20, 5], { width: 60, height: 20, padding: 2 });
  const coords = points.split(' ').map((p) => p.split(',').map(Number));
  const ys = coords.map((c) => c[1]);
  assert.equal(Math.min(...ys), ys[1]); // the max value (20) is the middle point
});

test('buildSparkline handles a constant series without dividing by zero', () => {
  const result = buildSparkline([7, 7, 7]);
  assert.ok(result.points.length > 0);
  assert.equal(result.trend, 'flat');
});
