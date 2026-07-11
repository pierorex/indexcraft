# Handoff instructions — ETF Builder

Written 2026-07-11. This file exists so a new session (AI or human) can pick up
this project without re-deriving context. Update it whenever you finish a
chunk of work or learn something a future session would need. Keep it current
— stale handoff docs are worse than none. It merges what used to be a
separate `backlog.md` (feature status) and `instructions.md` (implementation
state/continuity) into one file, since they were both read together anyway.

## What this project is

A static, client-side DIY index-replication tool: pick top-N S&P 500 /
NASDAQ-100 names, choose cap- vs equal-weighting, see index coverage / sector
concentration, and compare a DIY basket against a UCITS ETF under Irish tax
rules (CGT vs exit tax + deemed disposal). No backend, no build step. Runs
straight off `index.html` via any static file server.

Full product rationale and scope (deployment, data sourcing, "why no
backend" writeups) lives in `README.md` — read that too. This file covers
feature status/backlog and implementation state/continuity, not product
vision.

No Trading212 (or any broker) push-to-broker integration — view/plan only,
dropped from scope on purpose. See "Explicitly out of scope" below.

## Status legend

`[x]` done · `[ ]` not started · `[~]` partially covered

## Feature backlog

### v0 / MVP

- [x] Load S&P 500 / NASDAQ-100 constituents (static bundled snapshot, see README on refreshing)
- [x] Pick top N holdings via slider
- [x] Cap-weight vs equal-weight toggle
- [x] Index coverage % (how much of total index market cap your top-N basket captures)
- [x] Sector concentration breakdown
- [x] Single-stock concentration warning (largest holding % of basket)
- [x] Irish tax comparison: DIY basket (CGT 33%, annual exemption) vs UCITS ETF (41% exit tax, deemed disposal every 8 years)
- [x] Responsive layout (phone / iPad / desktop)
- [x] Unit-tested math (weighting, coverage, tax simulation)

### Statement import

- [x] Drag-and-drop a Trading 212 monthly statement PDF to auto-select your current open positions in the holdings table (pinned regardless of the top-N slider) and see them summarized in a dedicated import section — parsing happens entirely client-side (pdf.js text extraction + regex), no upload anywhere
- [ ] Support other brokers' statement formats (currently Trading 212 PDF only)

### Construction & selection

- [ ] Custom screens before picking: sector exposure caps, exclude specific sectors/stocks (e.g. no tobacco, no airlines)
- [ ] Minimum quality/profitability filter (ROIC, FCF margin, debt/equity)
- [ ] Overlap detector — compare proposed basket against stocks you already hold elsewhere (e.g. Amazon) to avoid doubling up
- [ ] Minimum-stocks-for-target-tracking-error calculator ("smallest basket within 1% annualized tracking error of the index")
- [ ] Backtested tracking-error estimate vs the real index (needs historical price data, not just current weights)
- [ ] Factor/quality screener as an alternative to pure cap-weight replication

### Cost & friction modeling

- [x] All-in cost comparison baseline (tax drag via the ETF-vs-DIY comparator)
- [ ] Include spread + FX conversion + platform fee modeling in the cost comparison (currently tax-only)
- [ ] Trade batching simulator — minimum trade list from current state to target weights, batched to minimize transaction/spread cost

### Ongoing maintenance

- [ ] Drift dashboard — track live holdings vs target weights, flag when any position drifts >X%
- [ ] Email/push alert on drift threshold breach (needs a backend or scheduled job — see README Q6)
- [ ] Corporate action awareness — splits, spin-offs, ticker/name changes
- [ ] "What changed in the index" digest — quarterly reconstitution summary (additions/removals)

### Reporting

- [ ] Irish tax pack export — CGT disposals + dividend withholding log, formatted for self-assessment / accountant
- [ ] Performance vs. benchmark chart — basket (using your real logged fill prices) vs index total return
- [ ] Dividend withholding tracker (15% under W-8BEN) for the Irish tax return

### Data sourcing (see README Q5 writeup)

- [x] MVP ships a static, manually-refreshed snapshot — no live API call, no API key in client code
- [ ] Small refresh script (Node, run locally / in CI) to regenerate `data/*.json` from a free source periodically
- [ ] Evaluate whether a thin backend proxy is ever justified (see README Q6 writeup) — current answer: no, not for this app's needs

### Explicitly out of scope (for now)

- Trading212 (or any broker) API integration — push-to-broker
- Real-time/live quotes — this is a planning tool, not a trading terminal
- Investment advice / recommendations — pure calculator, user makes all decisions

## Current feature goal (as of this session)

Just shipped: **import a Trading 212 monthly statement PDF** to auto-select
your real holdings in the basket builder.

1. Drag-and-drop (or click-to-browse) a Trading 212 monthly statement PDF.
2. It's parsed entirely client-side (pdf.js text extraction + a regex parser)
   — nothing is uploaded anywhere.
3. Every symbol from the statement's "Open positions" table that also exists
   in the currently-loaded index dataset gets selected (checkbox un-excluded)
   in the main holdings table, and is **pinned into view regardless of where
   the top-N slider is set** — raising or lowering N never drops a held stock
   out of the list or deselects it.
4. A new "Import your Trading 212 statement" panel lists *every* parsed
   holding (matched or not), with quantity/value/return and a "matched
   current list / not in current list" indicator.

This is view/select-only — no push-to-broker, no write-back to Trading 212.
That's intentional; see "Explicitly out of scope" above.

### Where we are

Done and verified:
- `js/statementParser.js` — pure regex parser, extracts the "Open positions"
  table from raw PDF text. Unit tested (`test/statementParser.test.js`, 10
  tests) against fixtures modeled on a **real** Trading 212 statement export
  (see "How this was validated" below).
- `js/pdfExtract.js` — thin wrapper around the global `pdfjsLib` (loaded via
  CDN `<script>` in `index.html`) that turns a PDF `ArrayBuffer` into flat
  text, page by page, in reading order.
- `index.html` — new "Import your Trading 212 statement" panel: dropzone,
  file input, status line, and a holdings table. Placed as the first panel in
  `<main>`, before the index/weighting/top-N controls.
- `css/styles.css` — `.dropzone` (+ `.dragover` state), `.statement-holdings`,
  `.match-yes` / `.match-no`, and standalone `.positive` / `.negative` utility
  classes (previously these colors only existed as compound selectors scoped
  to `.tax-final`).
- `js/app.js` — wiring: `statementHoldings` (all parsed positions) and
  `heldSymbols` (subset that exist in the currently loaded index) are new
  module-level state. `updateCandidates()` now unions top-N with any held
  stock not already in top-N. `recomputeHeldSymbols()` re-runs on every index
  switch (S&P 500 ↔ NASDAQ-100), which also refreshes the status message.
- Full `npm test` suite passes (42 tests total, 10 new).
- End-to-end verified in a real headless-Chromium browser (Playwright,
  installed ad hoc in `/tmp` scratchpad, **not** added to this repo) against
  the user's real May 2026 statement: 34 open positions parsed correctly,
  15/34 matched the S&P 500 illustrative snapshot and were auto-selected,
  held stocks survived top-N slider changes down to N=5 and back to N=100,
  index switching re-matched and updated the status text correctly, non-PDF
  uploads were rejected with a clear message, no console/page errors.

Not done / explicitly deferred (see Feature backlog above):
- Only Trading 212's PDF layout is supported. Other brokers would need their
  own parser (the regex in `statementParser.js` is tightly shaped around
  Trading 212's exact column layout — see "How the PDF parsing works").
- No overlap/drift detector yet (compare basket vs. real holdings and show
  what to buy/sell) — this import feature is the prerequisite plumbing for
  that; it's the recommended next step (see "Construction & selection" and
  "Ongoing maintenance" above).
- No real cost-basis-driven tax comparison (the tax comparator still runs on
  a hypothetical principal/return/years, not the statement's actual average
  prices).

## How the PDF parsing works (read this before touching statementParser.js)

Trading 212's statement PDF is presumably rendered from HTML (predictable,
consistent column layout). `pdfExtract.js` uses `pdfjsLib.getTextContent()`
per page and joins each page's text items with single spaces, in the order
pdf.js returns them — which matches the table's reading order (row by row,
left to right) for this document.

`statementParser.js` then:
1. Slices the full text down to the "Open positions" section — from the
   heading string `'Open positions'` to the next of `'Invest account -
   transactions'` / `'Pending orders'` (or end of text).
2. Runs one regex over that slice matching exactly 11 whitespace-separated
   fields per row: `SYMBOL ISIN CURRENCY QUANTITY AVG_PRICE PRICE RETURN
   VALUE FX_RATE €RETURN €VALUE`. This exact-field-count requirement is what
   keeps it from false-matching the "Executed trades" or "Dividends" tables
   elsewhere in the statement, which have a different number/shape of fields
   after the ISIN+currency — no explicit section boundary was needed for
   those, but open-positions boundary slicing is done anyway as a belt-and-suspenders measure.

Known-good edge cases the regex handles (see test fixtures): dotted tickers
(`BRK.B`), single-letter tickers (`U`, `V`), GBX-denominated instruments with
large integer prices (`EQGB`), thousands-separated EUR values
(`€45,222.20`), a table that spans a page break, and non-USD instrument
currencies (GBP, GBX).

**This was validated against one real statement PDF**, not a broad sample.
If a future statement (different month, different holdings, possibly a
different T212 template version) fails to parse:
1. Extract raw text first to see what pdf.js actually returns — don't guess.
   The fastest way: `npm install --no-save pdfjs-dist@3.11.174` in a scratch
   dir and run `getDocument` + `getTextContent` per page (legacy CJS build:
   `pdfjs-dist/legacy/build/pdf.js`, required via `createRequire` since it's
   not a clean ESM export in this version). This is exactly how the current
   regex was derived and verified — see the "before recommending from
   memory" style caution: don't assume the layout, check it.
2. Compare against `ROW_REGEX` in `js/statementParser.js` field by field.
3. Add the new row shape as a fixture in `test/statementParser.test.js`
   before changing the regex, so the old shape doesn't silently break.

## APIs, dependencies, external services

- **pdf.js 3.11.174**, loaded via CDN in `index.html`:
  `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js`. Worker
  script is configured lazily in `pdfExtract.js` pointing at the matching
  CDN worker build (`pdf.worker.min.js`). If this version is ever bumped,
  update **both** the `<script>` tag in `index.html` and `PDFJS_VERSION` in
  `js/pdfExtract.js` — they must match or pdf.js will throw a version
  mismatch error at runtime.
- No other runtime dependencies. `package.json` has zero `dependencies` /
  `devDependencies` — the project intentionally stays dependency-free
  (Node's built-in `node --test` runner covers everything). Don't add a
  bundler, a test framework, or an npm dependency without a strong reason —
  this is a stated project value (see README Q6, "no build step").
- `data/sp500.json` and `data/nasdaq100.json` are **hand-assembled
  illustrative snapshots**, not live/complete index data — 103 and 99
  constituents respectively, not the real ~500 / ~100. This is why a real
  statement only partially matches (e.g. 15/34 holdings matched S&P 500 in
  testing) — most misses are simply because the stock isn't in the sample
  dataset, not a parsing failure. See README "Q5" for how to source real
  data if that ever becomes worth doing.

## Known issues / rough edges

- **Symbol collisions across indices aren't handled.** If a user has a
  position in a stock that exists in both `sp500.json` and `nasdaq100.json`
  under the same symbol, matching is per-currently-loaded-index only (by
  design — there's one index active at a time). Not a bug, just worth knowing.
- **No handling for split ISINs / corporate actions / ticker renames** in the
  parser — if a held stock's symbol in the statement doesn't literally match
  the symbol string in the JSON dataset, it won't match. No fuzzy matching.
- **Non-equity / ETF holdings** (e.g. `VUSA`, `VUAG`, `EQGB` in the test
  statement — UCITS ETFs the user also holds) will never match either
  dataset, since `sp500.json`/`nasdaq100.json` only contain single-name
  equities. They still show up in the new "statement holdings" panel, just
  flagged as "not in current list." This is expected, not a bug.
- The dropzone's actual native HTML5 drag-and-drop event path
  (`dragover`/`drop` with a real `DataTransfer`) was **not** exercised by
  Playwright in this session — testing used `input[type=file].setInputFiles()`,
  which drives the same `handleStatementFile()` code path as a drop would,
  but doesn't prove the `dragover`/`dragleave`/`drop` listeners themselves
  are wired correctly. They're straightforward standard-pattern code, but a
  human should drag a real file onto it once before fully trusting it.
- No test coverage exists for `js/pdfExtract.js` or the drag/drop DOM wiring
  in `js/app.js` itself (consistent with existing project convention — only
  pure functions in `portfolio.js` / `tax.js` / `statementParser.js` are
  unit tested; DOM-touching code isn't). If that convention ever changes,
  those are the gaps.

## Dev environment notes

- Run locally: `python3 -m http.server 8743` from repo root, then open
  `http://localhost:8743`. Must be a real HTTP server — `file://` breaks the
  `fetch()` calls for `data/*.json` (CORS on local file access).
- Tests: `npm test` (`node --test test/*.test.js`, zero deps).
- No git repository is initialized in this directory as of this session
  (verified via environment info — "Is a git repository: false"). If you
  want version history / rollback safety, `git init` first.
- This session used Playwright (installed ad hoc into a scratch tmp
  directory, not this repo) purely to verify the feature end-to-end against
  a real statement PDF at `/Users/piero/Documents/mortgage/trading212/`. That
  install is not part of this project and doesn't need to be reproduced
  unless you're re-verifying PDF parsing changes — see "How the PDF parsing
  works" above for the minimal repro steps if needed.

## Suggested next steps (not started)

In rough priority order, from the last conversation:

1. **Overlap/drift detector** — compare the target basket (from top-N +
   weighting) against `statementHoldings`, show over/underweight per
   position. This is the most natural next feature since the import
   plumbing (this session's work) is the hard prerequisite for it, and it's
   already an unstarted backlog item under "Construction & selection" /
   "Ongoing maintenance" above.
2. **Trade list generator** — given target weights + current holdings +
   cash to deploy, compute a batched buy/sell list. Backlogged under "Cost &
   friction modeling" above.
3. **Real cost-basis tax comparison** — feed the statement's actual average
   prices into the DIY vs. ETF tax comparator instead of a hypothetical
   principal, for a comparison that reflects the user's actual position.
   Not currently on the backlog as a discrete item — would need to be added
   if pursued.
