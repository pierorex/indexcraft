#!/usr/bin/env node
// Regenerates data/sp500.json and data/nasdaq100.json from public sources — no API key, no scraping
// libraries (project stays dependency-free; see README "no build step").
//
// Sources:
//   - S&P 500 membership + name + GICS sector: Wikipedia "List of S&P 500 companies" (community
//     maintained, sourced from SEC filings). Wikipedia does NOT publish market cap, so...
//   - Market cap (both indices) + sector fallback for NASDAQ-100-only names: Nasdaq's public
//     stock-screener API (api.nasdaq.com/api/screener/stocks) — same data that backs their own
//     screener UI, covers the whole US market in one call, no key required.
//   - NASDAQ-100 membership + name + market cap: Nasdaq's own list-type API
//     (api.nasdaq.com/api/quote/list-type/nasdaq100) — the JSON backing their public NASDAQ-100
//     listing page.
//
// Run: node scripts/fetch-constituents.mjs

import { writeFile } from 'node:fs/promises';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.text();
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.json();
}

// GICS sector names (Wikipedia) -> this app's existing short sector-label convention.
const GICS_TO_APP_SECTOR = {
  'Information Technology': 'Technology',
  'Health Care': 'Healthcare',
};

// Nasdaq screener's own sector taxonomy -> this app's convention (used only as a fallback for
// NASDAQ-100 names that aren't also S&P 500 members, so aren't already covered by Wikipedia/GICS).
const NASDAQ_TO_APP_SECTOR = {
  'Basic Materials': 'Materials',
  Finance: 'Financials',
  'Health Care': 'Healthcare',
  Telecommunications: 'Communication Services',
  Miscellaneous: null, // too vague to map — leave unset, falls back to "Unknown" in the UI
};

function normalizeGicsSector(raw) {
  return GICS_TO_APP_SECTOR[raw] || raw;
}

function normalizeNasdaqSector(raw) {
  if (!raw) return null;
  if (raw in NASDAQ_TO_APP_SECTOR) return NASDAQ_TO_APP_SECTOR[raw];
  return raw;
}

// Applied to both Wikipedia's "Security" column (e.g. "Alphabet Inc. (Class A)") and Nasdaq's
// companyName field (e.g. "Apple Inc. Common Stock") to get this app's existing short-name style
// (e.g. the illustrative snapshot's "Alphabet", "Apple"). Deliberately conservative — names like
// "Booking Holdings" or "CME Group" are real company names, not suffixes, and are left alone.
function stripOnePass(raw) {
  return raw
    .trim()
    .replace(/\s*\((?:Class|Series) [A-Z]\)$/i, '')
    .replace(/\s+Company\s*\(The\)$/i, '')
    .replace(/\s*\(The\)$/i, '')
    // Share-class/registration descriptors, in either word order ("Class A Common Stock" or
    // "Common Stock Class A" — Nasdaq's feed uses both depending on the company).
    .replace(/\s+(?:Class|Series) [A-Z]\s+Common Stock$/i, '')
    .replace(/\s+Common Stock\s+(?:Class|Series) [A-Z]$/i, '')
    .replace(/\s+(?:Class|Series) [A-Z]\s+Capital Stock$/i, '')
    .replace(/\s+(?:Class|Series) [A-Z]\s+Subordinate Voting Shares$/i, '')
    .replace(/\s+American Depositary Shares$/i, '')
    .replace(/\s+((?:Class|Series) [A-Z]\s+)?Ordinary Shares(\s*\([^)]*\))?$/i, '')
    .replace(/\s+New York Registry Shares$/i, '')
    .replace(/\s+Common Shares$/i, '')
    .replace(/\s+Common Stock$/i, '')
    // State-of-incorporation parenthetical (e.g. "Copart, Inc. (DE)") — Nasdaq's feed puts this
    // both before and after "Common Stock" depending on the company, hence the fixed-point loop
    // below rather than trying to hardcode one order.
    .replace(/\s*\([A-Z]{2}\)$/, '')
    .replace(/,?\s+Inc\.?$/i, '')
    .replace(/\s+Incorporated$/i, '')
    .replace(/\s+Corporation$/i, '')
    .replace(/\s+Corp\.?$/i, '')
    .replace(/\s+plc$/i, '')
    .replace(/,?\s+Ltd\.?$/i, '')
    .replace(/\s+N\.V\.$/i, '')
    .replace(/\s+S\.A\.$/i, '')
    .trim();
}

// Applied to both Wikipedia's "Security" column (e.g. "Alphabet Inc. (Class A)") and Nasdaq's
// companyName field (e.g. "Apple Inc. Common Stock"/"Cisco Systems, Inc. Common Stock (DE)") to
// get this app's existing short-name style (e.g. the illustrative snapshot's "Alphabet", "Apple").
// Deliberately conservative — names like "Booking Holdings" or "CME Group" are real company names,
// not suffixes, and are left alone. Runs to a fixed point since suffix order varies by company.
function cleanCompanyName(raw) {
  let name = raw;
  for (let i = 0; i < 5; i++) {
    const next = stripOnePass(name);
    if (next === name) break;
    name = next;
  }
  return name;
}

function applyNameOverride(name) {
  return NAME_OVERRIDES[name] || name;
}

// Wikipedia lists a handful of "Surname (Firstname)" names for its own alphabetical sort — not
// worth a general reordering heuristic for one known case.
const NAME_OVERRIDES = {
  'Lilly (Eli)': 'Eli Lilly',
};

function stripTags(html) {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

// Wikipedia uses dotted share-class tickers ("BRK.B"); Nasdaq's screener API uses slashes
// ("BRK/B"). This app's existing data/schema convention is the dotted form, so that's the
// canonical `symbol` we write — this helper is only for looking values up in the screener map.
function toScreenerSymbol(symbol) {
  return symbol.replace(/\./g, '/');
}

async function fetchSp500List() {
  const html = await fetchText('https://en.wikipedia.org/wiki/List_of_S%26P_500_companies');
  const tableMatch = html.match(/<table[^>]*id="constituents"[^>]*>[\s\S]*?<\/table>/);
  if (!tableMatch) throw new Error('Could not find #constituents table on Wikipedia S&P 500 page');
  const rows = tableMatch[0].match(/<tr[^>]*>[\s\S]*?<\/tr>/g).slice(1); // drop header row

  const out = [];
  for (const row of rows) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => stripTags(m[1]));
    if (cells.length < 3) continue;
    const [symbol, name, sector] = cells;
    out.push({ symbol, name: applyNameOverride(cleanCompanyName(name)), sector: normalizeGicsSector(sector) });
  }
  return out;
}

async function fetchNasdaq100List() {
  const data = await fetchJson('https://api.nasdaq.com/api/quote/list-type/nasdaq100');
  const rows = data?.data?.data?.rows;
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('Nasdaq list-type/nasdaq100 API returned no rows');
  }
  return rows.map((r) => ({
    symbol: r.symbol,
    name: cleanCompanyName(r.companyName),
    marketCapB: Math.round(Number(String(r.marketCap).replace(/,/g, '')) / 1e9),
  }));
}

async function fetchScreenerUniverse() {
  const data = await fetchJson('https://api.nasdaq.com/api/screener/stocks?tableonly=true&limit=10000&download=true');
  const rows = data?.data?.rows;
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('Nasdaq screener API returned no rows');
  }
  const map = new Map();
  for (const r of rows) {
    const marketCap = Number(r.marketCap);
    map.set(r.symbol, {
      marketCapB: Number.isFinite(marketCap) && marketCap > 0 ? Math.round(marketCap / 1e9) : null,
      sector: normalizeNasdaqSector(r.sector),
    });
  }
  return map;
}

async function main() {
  console.log('Fetching S&P 500 list from Wikipedia...');
  const spList = await fetchSp500List();
  console.log(`  ${spList.length} rows parsed`);

  console.log('Fetching NASDAQ-100 list from Nasdaq...');
  const ndxList = await fetchNasdaq100List();
  console.log(`  ${ndxList.length} rows parsed`);

  console.log('Fetching Nasdaq screener universe (market cap + sector fallback)...');
  const universe = await fetchScreenerUniverse();
  console.log(`  ${universe.size} rows in universe`);

  const sp500SectorBySymbol = new Map(spList.map((s) => [s.symbol, s.sector]));

  const missingCap = [];
  const sp500Constituents = [];
  for (const s of spList) {
    const screener = universe.get(toScreenerSymbol(s.symbol));
    const marketCapB = screener?.marketCapB ?? null;
    if (marketCapB == null) {
      missingCap.push(s.symbol);
      continue; // no reliable free source had a market cap for this symbol — drop rather than fabricate
    }
    sp500Constituents.push({ symbol: s.symbol, name: s.name, sector: s.sector, marketCapB });
  }

  const missingSector = [];
  const nasdaq100Constituents = ndxList.map((n) => {
    let sector = sp500SectorBySymbol.get(n.symbol);
    if (!sector) sector = universe.get(toScreenerSymbol(n.symbol))?.sector || null;
    if (!sector) {
      missingSector.push(n.symbol);
      sector = 'Unknown';
    }
    return { symbol: n.symbol, name: n.name, sector, marketCapB: n.marketCapB };
  });

  if (missingCap.length > 0) {
    console.warn(`WARNING: ${missingCap.length} S&P 500 symbol(s) dropped — no market cap available from any source (checked Nasdaq screener + per-symbol summary):`, missingCap);
  }
  if (missingSector.length > 0) {
    console.warn(`WARNING: ${missingSector.length} NASDAQ-100 symbols had no sector match (Wikipedia or screener):`, missingSector);
  }

  const today = new Date().toISOString().slice(0, 10);

  const sp500Json = {
    index: 'S&P 500',
    asOf: today,
    source: 'Constituents + GICS sector: Wikipedia "List of S&P 500 companies". Market cap: Nasdaq public stock-screener API (api.nasdaq.com/api/screener/stocks). Generated by scripts/fetch-constituents.mjs — see README.',
    constituents: sp500Constituents.sort((a, b) => b.marketCapB - a.marketCapB),
  };

  const nasdaq100Json = {
    index: 'NASDAQ-100',
    asOf: today,
    source: 'Constituents + market cap: Nasdaq public list-type API (api.nasdaq.com/api/quote/list-type/nasdaq100). Sector: matched against S&P 500/GICS where overlapping, else Nasdaq screener API. Generated by scripts/fetch-constituents.mjs — see README.',
    constituents: nasdaq100Constituents.sort((a, b) => b.marketCapB - a.marketCapB),
  };

  await writeFile(new URL('../data/sp500.json', import.meta.url), JSON.stringify(sp500Json, null, 2) + '\n');
  await writeFile(new URL('../data/nasdaq100.json', import.meta.url), JSON.stringify(nasdaq100Json, null, 2) + '\n');

  console.log(`Wrote data/sp500.json (${sp500Constituents.length} constituents) and data/nasdaq100.json (${nasdaq100Constituents.length} constituents).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
