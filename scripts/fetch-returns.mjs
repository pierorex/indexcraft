#!/usr/bin/env node
// Precomputes 1y/5y/10y return stats + a 1-year sparkline series for every ticker across
// data/sp500.json and data/nasdaq100.json, and writes data/returns.json keyed by symbol.
//
// Source: Yahoo Finance's unofficial chart endpoint (query1.finance.yahoo.com/v8/finance/chart),
// monthly-interval adjusted close (accounts for splits/dividends, so returns reflect total return,
// not just price appreciation). No API key. Runs server-side (Node), so no CORS/browser issues.
//
// Deliberately not Stooq: their CSV endpoint now requires solving a client-side proof-of-work
// challenge before responding, which is a bot-detection mechanism — not something to build a
// solver for.
//
// Run: node scripts/fetch-returns.mjs

import { readFile, writeFile } from 'node:fs/promises';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';
const CONCURRENCY = 8;
const RETRIES = 2;
const RETRY_DELAY_MS = 500;

function toYahooSymbol(symbol) {
  return symbol.replace(/\./g, '-');
}

async function loadTickers() {
  const [sp500, nasdaq100] = await Promise.all([
    readFile(new URL('../data/sp500.json', import.meta.url), 'utf8').then(JSON.parse),
    readFile(new URL('../data/nasdaq100.json', import.meta.url), 'utf8').then(JSON.parse),
  ]);
  const symbols = new Set([
    ...sp500.constituents.map((c) => c.symbol),
    ...nasdaq100.constituents.map((c) => c.symbol),
  ]);
  return [...symbols].sort();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchChart(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(toYahooSymbol(symbol))}?range=10y&interval=1mo`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error(json?.chart?.error?.description || 'no chart result');
  return result;
}

function computeStats(result) {
  const timestamps = result.timestamp;
  const adjclose = result.indicators?.adjclose?.[0]?.adjclose;
  const close = result.indicators?.quote?.[0]?.close;
  const series = adjclose || close;
  if (!timestamps || !series) return null;

  // Drop trailing nulls (Yahoo sometimes includes an in-progress current-month bucket with no
  // close yet) and any other null points so index math below stays aligned to real data.
  const points = timestamps
    .map((t, i) => ({ t, v: series[i] }))
    .filter((p) => p.v != null);
  if (points.length < 2) return null;

  const latest = points[points.length - 1].v;
  const monthsAgo = (n) => points[Math.max(0, points.length - 1 - n)];

  const p1y = monthsAgo(12);
  const p5y = monthsAgo(60);
  const p10y = monthsAgo(120);

  const totalReturn = (fromPoint, toValue) => (fromPoint.v > 0 ? toValue / fromPoint.v - 1 : null);
  const annualized = (fromPoint, toValue, years) =>
    fromPoint.v > 0 && toValue / fromPoint.v > 0 ? (toValue / fromPoint.v) ** (1 / years) - 1 : null;

  const return1y = points.length > 12 ? totalReturn(p1y, latest) : null;
  const return5yAnnualized = points.length > 60 ? annualized(p5y, latest, 5) : null;
  const return10yAnnualized = points.length > 120 ? annualized(p10y, latest, 10) : null;

  const sparkline = points.slice(-13).map((p) => Math.round(p.v * 100) / 100);

  return { return1y, return5yAnnualized, return10yAnnualized, sparkline };
}

function round4(x) {
  return x == null ? null : Math.round(x * 10000) / 10000;
}

async function fetchWithRetry(symbol) {
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    try {
      const result = await fetchChart(symbol);
      const stats = computeStats(result);
      if (!stats) throw new Error('insufficient data points');
      return stats;
    } catch (err) {
      if (attempt === RETRIES) return { error: err.message };
      await sleep(RETRY_DELAY_MS * (attempt + 1));
    }
  }
}

async function runPool(items, worker, concurrency) {
  const results = new Array(items.length);
  let next = 0;
  async function runOne() {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, runOne));
  return results;
}

async function main() {
  const symbols = await loadTickers();
  console.log(`Fetching return history for ${symbols.length} unique tickers...`);

  let done = 0;
  const results = await runPool(
    symbols,
    async (symbol) => {
      const stats = await fetchWithRetry(symbol);
      done++;
      if (done % 50 === 0) console.log(`  ${done}/${symbols.length}...`);
      return [symbol, stats];
    },
    CONCURRENCY,
  );

  const tickers = {};
  const failed = [];
  for (const [symbol, stats] of results) {
    if (stats.error) {
      failed.push(`${symbol} (${stats.error})`);
      continue;
    }
    tickers[symbol] = {
      return1y: round4(stats.return1y),
      return5yAnnualized: round4(stats.return5yAnnualized),
      return10yAnnualized: round4(stats.return10yAnnualized),
      sparkline: stats.sparkline,
    };
  }

  if (failed.length > 0) {
    console.warn(`WARNING: ${failed.length}/${symbols.length} tickers failed and were omitted:`);
    console.warn(failed.join(', '));
  }

  const out = {
    asOf: new Date().toISOString().slice(0, 10),
    source: 'Yahoo Finance chart endpoint (unofficial), monthly adjusted close. Generated by scripts/fetch-returns.mjs.',
    tickers,
  };

  await writeFile(new URL('../data/returns.json', import.meta.url), JSON.stringify(out) + '\n');
  console.log(`Wrote data/returns.json with ${Object.keys(tickers).length} tickers (${failed.length} failed).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
