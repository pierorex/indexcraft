// Pure functions for basket construction math. No DOM access — keeps this unit-testable
// in Node and reusable in the browser via <script type="module">.

/**
 * Returns the top N stocks by market cap, descending.
 */
export function selectTopN(stocks, n) {
  if (n < 0) throw new RangeError('n must be >= 0');
  return [...stocks]
    .sort((a, b) => b.marketCapB - a.marketCapB)
    .slice(0, n);
}

/**
 * Cap-weighted allocation: weight proportional to market cap. Weights sum to 1
 * (within floating point tolerance) across the given stock list.
 */
export function capWeights(stocks) {
  const total = stocks.reduce((sum, s) => sum + s.marketCapB, 0);
  if (total <= 0) return stocks.map((s) => ({ ...s, weight: 0 }));
  return stocks.map((s) => ({ ...s, weight: s.marketCapB / total }));
}

/**
 * Equal-weighted allocation: every stock gets 1/n.
 */
export function equalWeights(stocks) {
  const n = stocks.length;
  if (n === 0) return [];
  return stocks.map((s) => ({ ...s, weight: 1 / n }));
}

/**
 * What fraction of the *full* index's market cap does this basket capture.
 * basket and fullIndex are both arrays of {marketCapB}.
 */
export function indexCoverage(basket, fullIndex) {
  const fullTotal = fullIndex.reduce((sum, s) => sum + s.marketCapB, 0);
  if (fullTotal <= 0) return 0;
  const basketTotal = basket.reduce((sum, s) => sum + s.marketCapB, 0);
  return basketTotal / fullTotal;
}

/**
 * Aggregates weights by sector. Input stocks must already carry a `weight` field
 * (output of capWeights/equalWeights). Returns a map of sector -> total weight,
 * sorted descending by weight.
 */
export function sectorBreakdown(weightedStocks) {
  const totals = new Map();
  for (const s of weightedStocks) {
    const sector = s.sector || 'Unknown';
    totals.set(sector, (totals.get(sector) || 0) + s.weight);
  }
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([sector, weight]) => ({ sector, weight }));
}

/**
 * Flags single-stock concentration risk: the largest position's weight, and
 * whether it exceeds the given threshold (default 10%).
 */
export function concentrationCheck(weightedStocks, threshold = 0.1) {
  if (weightedStocks.length === 0) {
    return { largest: null, weight: 0, exceedsThreshold: false };
  }
  const largest = weightedStocks.reduce((max, s) => (s.weight > max.weight ? s : max));
  return {
    largest: largest.symbol,
    weight: largest.weight,
    exceedsThreshold: largest.weight > threshold,
  };
}
