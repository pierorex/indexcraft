# ETF Builder

DIY S&P 500 / NASDAQ-100 basket builder. Static HTML/CSS/JS, no build step, no backend.

## Run it

```
python3 -m http.server 8743
```

Then open http://localhost:8743. (Needs a real HTTP server, not `file://`, because `index.html` fetches the JSON files in `data/`.)

## Deploying

Works as-is on GitHub Pages (or any static host) with zero changes — no build step, no backend. All paths in `index.html` (`css/styles.css`, `js/app.js`, `data/*.json`) are relative, so it doesn't matter whether Pages serves it at the domain root or under a project subpath like `username.github.io/etf-builder/`. Just push the repo and enable Pages on the branch/folder in repo settings. Pages serves over real HTTPS, so the `fetch()` calls for the JSON data work fine there — this is only a problem locally over `file://`, not once it's deployed.

## Test it

```
npm test
```

Runs `node --test` over `test/*.test.js` — no dependencies, just Node's built-in test runner. All portfolio-construction math (`js/portfolio.js`) and tax simulation (`js/tax.js`) is pure functions, unit-tested in isolation from the DOM.

## Refreshing the data

`data/sp500.json` and `data/nasdaq100.json` are a manually assembled, illustrative snapshot — not live data. They're good enough to play with the tool, not good enough to actually build a basket from. See Q5 below for how to get real, current constituent + weight data and turn it into the same JSON shape (`{ index, asOf, source, constituents: [{ symbol, name, sector, marketCapB }] }`).

---

## Q5 — Are there public APIs for S&P 500 / NASDAQ-100 data?

Short answer: **not for free, directly from the index providers.** S&P Dow Jones Indices and Nasdaq both license constituent + weight data commercially — there's no free official "give me the current S&P 500 weights" endpoint.

What actually works, cheapest to most capable:

1. **ETF holdings files (best free option).** iShares (`IVV` for S&P 500) and Invesco (`QQQ` for NASDAQ-100) publish their full daily holdings as public CSV/JSON — no auth, no key. Since these ETFs are built to track the indices almost exactly, their holdings *are* the index weights for practical purposes. This is what I'd actually wire up first: a small script that downloads the daily holdings file, reshapes it into `{symbol, name, sector, marketCapB}` (market cap implied from weight × fund AUM, or just store weight directly), and writes `data/*.json`.
2. **Wikipedia tables** ("List of S&P 500 companies") — free, has tickers/sectors/dates added, but no market cap or weight, and scraping a wiki page is the least stable source long-term.
3. **Free-tier financial data APIs** — Financial Modeling Prep, Finnhub, Alpha Vantage, EOD Historical Data, Tiingo. Most either gate the actual constituents endpoint behind a paid tier or rate-limit hard enough that a manual refresh script is still the practical pattern (call it occasionally, not live).
4. **Paid/official** — S&P Capital IQ, Nasdaq Data Link's paid index sets — only worth it if accuracy/compliance actually matters, which it doesn't for a personal planning tool.

Recommendation: use the iShares/Invesco holdings files. Pull them with a small Node or Python script run locally (or on a schedule via GitHub Actions), commit the regenerated `data/*.json`. No live API call from the browser, no key to protect, no backend needed.

## Q6 — Would a Python backend actually help?

For this app, no — the cost doesn't clear the bar.

**What a backend would buy you:**
- Hiding an API key, if you ever use a provider that requires one for live quotes.
- Scheduled background refresh instead of manual/local script runs.
- Heavier computation that doesn't belong in the browser — e.g. a real backtested tracking-error calculation over years of daily prices for hundreds of stocks (that's real data + real compute, not something to ship as a client-side fetch).
- Aggregating multiple paid data sources behind one internal API.

**What it costs you, solo:**
- An endpoint to deploy, monitor, and patch.
- Auth/rate-limiting to keep it from being scraped or abused if it's public.
- Cold starts and a recurring (small but nonzero) cloud bill.
- One more thing to maintain when nothing about this app's core value — pick a basket, see coverage/concentration, compare DIY vs ETF tax — actually needs server-side compute. All of that math runs instantly in the browser on ~100 rows of data.

**Where the line actually is:** skip the backend entirely for now. If you later want the backtested tracking-error feature (the one item on the backlog that's genuinely compute/data heavy), the right shape is still not "a Lambda the public can hit" — it's a scheduled job (GitHub Actions cron, or a local script you run monthly) that computes results and writes a static JSON file, same pattern as the data refresh. A deployed, publicly-reachable backend only earns its keep if you need *live*, *on-demand*, *user-specific* computation — none of which this app needs yet.
