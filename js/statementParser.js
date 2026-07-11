// Pure text parsing for Trading 212 monthly statement PDFs. Takes the raw text
// already extracted from the PDF (see pdfExtract.js) and returns the "Open
// positions" table as structured holdings. No DOM/pdf.js access here — keeps
// this unit-testable in Node, same pattern as portfolio.js and tax.js.

const OPEN_POSITIONS_HEADING = 'Open positions';
const SECTION_END_MARKERS = ['Invest account - transactions', 'Pending orders'];

// One row of the "Open positions" table looks like (Trading 212's PDF layout):
// SYMBOL ISIN CURRENCY QUANTITY AVG_PRICE PRICE RETURN VALUE FX_RATE €RETURN €VALUE
// e.g. "BRK.B US0846707026 USD 1.33378956 486.72595698 474.31 -16.56 632.6297 1.16647 €-15.19 €542.35"
const ROW_REGEX =
  /([A-Z]{1,7}(?:\.[A-Z])?)\s+([A-Z]{2}[A-Z0-9]{9}\d)\s+([A-Z]{3,4})\s+(-?[\d,.]+)\s+(-?[\d,.]+)\s+(-?[\d,.]+)\s+(-?[\d,.]+)\s+(-?[\d,.]+)\s+(-?[\d,.]+)\s+(€-?[\d,.]+)\s+(€-?[\d,.]+)/g;

function toNumber(str) {
  return Number(String(str).replace(/,/g, ''));
}

/**
 * Slices out the "Open positions" table from the full statement text: from its
 * heading up to the next major section (or end of text if none follows).
 * Returns '' if the heading isn't present (not a Trading 212 statement, or a
 * page/section we don't recognize).
 */
export function extractOpenPositionsSection(text) {
  const start = text.indexOf(OPEN_POSITIONS_HEADING);
  if (start === -1) return '';
  const rest = text.slice(start + OPEN_POSITIONS_HEADING.length);
  let end = rest.length;
  for (const marker of SECTION_END_MARKERS) {
    const idx = rest.indexOf(marker);
    if (idx !== -1) end = Math.min(end, idx);
  }
  return rest.slice(0, end);
}

/**
 * Parses the "Open positions" table out of the full text of a Trading 212
 * monthly statement PDF. Returns [] if no such table is found.
 */
export function parseHoldingsFromText(text) {
  const section = extractOpenPositionsSection(text);
  if (!section) return [];

  const holdings = [];
  for (const match of section.matchAll(ROW_REGEX)) {
    const [
      ,
      symbol,
      isin,
      currency,
      quantity,
      avgPrice,
      price,
      returnNative,
      valueNative,
      fxRate,
      returnEur,
      valueEur,
    ] = match;
    holdings.push({
      symbol,
      isin,
      currency,
      quantity: toNumber(quantity),
      avgPrice: toNumber(avgPrice),
      price: toNumber(price),
      returnNative: toNumber(returnNative),
      valueNative: toNumber(valueNative),
      fxRate: toNumber(fxRate),
      returnEur: toNumber(returnEur.slice(1)),
      valueEur: toNumber(valueEur.slice(1)),
    });
  }
  return holdings;
}
