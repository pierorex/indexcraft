import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractOpenPositionsSection, parseHoldingsFromText } from '../js/statementParser.js';

// Fixture below mirrors the actual token stream pdf.js produces for a Trading 212
// monthly statement (items joined with single spaces, in reading order) —
// verified against a real statement export. Includes the quirks that make this
// parsing non-trivial: multi-word "Pending orders" / "No data available" noise
// before the real table, a dotted ticker (BRK.B), single-letter tickers (U, V),
// GBX/GBP instruments with large integer prices, and a page break mid-table.
const STATEMENT_FIXTURE = `
CUSTOMER ID 6263286 CUSTOMER NAME Jean Piero Hernandez Meze Invest account - open positions summary Pending orders INSTRUMENT ISIN INSTRUMENT CURRENCY ORDER ID TYPE DIRECTION EXPIRATION QUANTITY LIMIT PRICE STOP PRICE VALUE No data available Open positions INSTRUMENT ISIN INSTRUMENT CURRENCY QUANTITY AVERAGE PRICE PRICE RETURN VALUE FX RATE RETURN VALUE AAPL US0378331005 USD 40.60945372 179.58576962 311.35 5350.87 12643.7534 1.16647 €4,323.06 €10,839.33 BRK.B US0846707026 USD 1.33378956 486.72595698 474.31 -16.56 632.6297 1.16647 €-15.19 €542.35 EQGB IE00BYVTMW98 GBX 10.30919902 43462.29218495 57500 144717.52 592778.9437 86.73 €1,612.99 €6,834.76 U US91332U1016 USD 12.42612 68.45177739 30.43 -472.46 378.1268 1.16647 €-467.73 €324.16 V US92826C8394 USD 1.03079612 207.1505663 327.12 123.66 337.194 1.16647 €82.47 €289.07
CUSTOMER ID 6263286 CUSTOMER NAME Jean Piero Hernandez Meze NVDA US67066G1040 USD 288.93567226 28.81551431 212.49 53070.11 61395.941 1.16647 €45,222.20 €52,633.96 ZM US98980L1017 USD 5.3395017 331.94296015 101.68 -1229.49 542.9205 1.16647 €-1,034.56 €465.44
Invest account - transactions and dividends Note: some disclosure text here.
`;

test('extractOpenPositionsSection returns empty string when heading is missing', () => {
  assert.equal(extractOpenPositionsSection('nothing relevant here'), '');
});

test('extractOpenPositionsSection slices from the heading to the next section', () => {
  const section = extractOpenPositionsSection(STATEMENT_FIXTURE);
  assert.ok(section.includes('AAPL'));
  assert.ok(!section.includes('transactions and dividends'));
});

test('parseHoldingsFromText returns [] when there is no Open positions table', () => {
  assert.deepEqual(parseHoldingsFromText('just some random PDF text, not a statement'), []);
});

test('parseHoldingsFromText ignores the Pending orders table above it', () => {
  const holdings = parseHoldingsFromText(STATEMENT_FIXTURE);
  assert.equal(holdings.some((h) => h.symbol === 'LIMIT' || h.symbol === 'STOP'), false);
});

test('parseHoldingsFromText extracts every row across a page break', () => {
  const holdings = parseHoldingsFromText(STATEMENT_FIXTURE);
  assert.deepEqual(
    holdings.map((h) => h.symbol),
    ['AAPL', 'BRK.B', 'EQGB', 'U', 'V', 'NVDA', 'ZM'],
  );
});

test('parseHoldingsFromText handles a dotted ticker (BRK.B) and negative EUR values', () => {
  const holdings = parseHoldingsFromText(STATEMENT_FIXTURE);
  const brkB = holdings.find((h) => h.symbol === 'BRK.B');
  assert.equal(brkB.isin, 'US0846707026');
  assert.equal(brkB.currency, 'USD');
  assert.equal(brkB.returnEur, -15.19);
  assert.equal(brkB.valueEur, 542.35);
});

test('parseHoldingsFromText handles GBX instruments with large integer prices', () => {
  const holdings = parseHoldingsFromText(STATEMENT_FIXTURE);
  const eqgb = holdings.find((h) => h.symbol === 'EQGB');
  assert.equal(eqgb.currency, 'GBX');
  assert.equal(eqgb.price, 57500);
  assert.equal(eqgb.fxRate, 86.73);
  assert.equal(eqgb.valueEur, 6834.76);
});

test('parseHoldingsFromText strips thousands separators from EUR values', () => {
  const holdings = parseHoldingsFromText(STATEMENT_FIXTURE);
  const nvda = holdings.find((h) => h.symbol === 'NVDA');
  assert.equal(nvda.returnEur, 45222.2);
  assert.equal(nvda.valueEur, 52633.96);
});

test('parseHoldingsFromText parses single-letter tickers correctly', () => {
  const holdings = parseHoldingsFromText(STATEMENT_FIXTURE);
  const u = holdings.find((h) => h.symbol === 'U');
  const v = holdings.find((h) => h.symbol === 'V');
  assert.ok(u);
  assert.ok(v);
  assert.equal(u.quantity, 12.42612);
  assert.equal(v.valueEur, 289.07);
});

test('parseHoldingsFromText parses quantity, avgPrice and price as numbers', () => {
  const holdings = parseHoldingsFromText(STATEMENT_FIXTURE);
  const aapl = holdings.find((h) => h.symbol === 'AAPL');
  assert.equal(aapl.quantity, 40.60945372);
  assert.equal(aapl.avgPrice, 179.58576962);
  assert.equal(aapl.price, 311.35);
});
