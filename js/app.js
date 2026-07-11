import { loadIndex, loadReturns } from './dataLoader.js';
import { selectTopN, capWeights, equalWeights, indexCoverage, sectorBreakdown, concentrationCheck } from './portfolio.js';
import { compareDiyVsEtf } from './tax.js';
import { extractTextFromPdf } from './pdfExtract.js';
import { parseHoldingsFromText } from './statementParser.js';
import { buildSparkline } from './sparkline.js';

const els = {
  indexSelect: document.getElementById('index-select'),
  weightingSelect: document.getElementById('weighting-select'),
  topN: document.getElementById('top-n'),
  topNValue: document.getElementById('top-n-value'),
  selectAll: document.getElementById('select-all'),
  selectNone: document.getElementById('select-none'),
  holdingsScroll: document.getElementById('holdings-table-scroll'),
  holdingsViewToggle: document.getElementById('holdings-view-toggle'),
  selectedCount: document.getElementById('selected-count'),
  coverage: document.getElementById('coverage-value'),
  concentration: document.getElementById('concentration-value'),
  sectorChart: document.getElementById('sector-chart'),
  holdingsTable: document.getElementById('holdings-table-body'),
  principal: document.getElementById('tax-principal'),
  annualReturn: document.getElementById('tax-return'),
  years: document.getElementById('tax-years'),
  taxResult: document.getElementById('tax-result'),
  dropzone: document.getElementById('statement-dropzone'),
  fileInput: document.getElementById('statement-file-input'),
  statementStatus: document.getElementById('statement-status'),
  statementHoldingsSection: document.getElementById('statement-holdings-section'),
  statementHoldingsBody: document.getElementById('statement-holdings-body'),
  statementClear: document.getElementById('statement-clear'),
};

let fullIndex = [];
let candidates = []; // top-N filter result, plus any pinned held stocks (see updateCandidates)
let excluded = new Set(); // symbols manually deselected within the current candidates
let statementHoldings = []; // all open positions parsed from an imported statement PDF
let heldSymbols = new Set(); // subset of statementHoldings symbols present in fullIndex
let returnsBySymbol = {}; // ticker -> { return1y, return5yAnnualized, return10yAnnualized, sparkline }, from data/returns.json

const HOLDINGS_COLLAPSED_ROWS = 10;
const HOLDINGS_EXPANDED_ROWS = 30;
let holdingsView = 'collapsed'; // 'collapsed' | 'expanded' | 'all' — cycled by #holdings-view-toggle

const fmtPct = (x) => `${(x * 100).toFixed(1)}%`;
const fmtEur = (x) =>
  x.toLocaleString('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

async function loadReturnsData() {
  try {
    const data = await loadReturns();
    returnsBySymbol = data.tickers || {};
  } catch (err) {
    console.error('Could not load return history — trend/return columns will be blank.', err);
    returnsBySymbol = {};
  }
}

async function loadAndRender() {
  const data = await loadIndex(els.indexSelect.value);
  fullIndex = data.constituents;
  els.topN.max = fullIndex.length;
  if (Number(els.topN.value) > fullIndex.length) els.topN.value = fullIndex.length;
  excluded = new Set(); // new index: start with everything selected
  recomputeHeldSymbols();
  updateCandidates();
  render();
  renderStatementHoldings();
  if (statementHoldings.length > 0) updateStatementStatusMessage(); // re-matched against the newly loaded index
}

function updateStatementStatusMessage() {
  const indexLabel = els.indexSelect.value === 'nasdaq100' ? 'NASDAQ-100' : 'S&P 500';
  els.statementStatus.textContent = `Imported ${statementHoldings.length} open position${statementHoldings.length === 1 ? '' : 's'} — ${heldSymbols.size} matched the current ${indexLabel} list and ${heldSymbols.size === 1 ? 'is' : 'are'} selected.`;
}

// Candidates are the top-N stocks by market cap, plus any stock the imported
// statement shows as currently held — those stay in the list (and selected,
// since they start out of `excluded`) no matter where N is set.
function updateCandidates() {
  const n = Number(els.topN.value);
  els.topNValue.textContent = n;
  const topN = selectTopN(fullIndex, n);
  const topNSymbols = new Set(topN.map((s) => s.symbol));
  const pinnedHeld = fullIndex.filter((s) => heldSymbols.has(s.symbol) && !topNSymbols.has(s.symbol));
  candidates = [...topN, ...pinnedHeld];
}

function recomputeHeldSymbols() {
  const indexSymbols = new Set(fullIndex.map((s) => s.symbol));
  heldSymbols = new Set(statementHoldings.map((h) => h.symbol).filter((sym) => indexSymbols.has(sym)));
}

function selectedStocks() {
  return candidates.filter((s) => !excluded.has(s.symbol));
}

function render() {
  const selected = selectedStocks();
  const weighted = els.weightingSelect.value === 'equal' ? equalWeights(selected) : capWeights(selected);

  els.selectedCount.textContent = `${selected.length} of ${candidates.length} selected`;
  els.coverage.textContent = fmtPct(indexCoverage(selected, fullIndex));

  const conc = concentrationCheck(weighted);
  els.concentration.textContent = conc.largest
    ? `${conc.largest} — ${fmtPct(conc.weight)}${conc.exceedsThreshold ? ' ⚠️ above 10%' : ''}`
    : '—';

  renderSectorChart(sectorBreakdown(weighted));
  renderHoldingsTable(weighted);
  updateHoldingsViewToggle();
}

// Rows are shown/hidden purely via a CSS max-height on #holdings-table-scroll
// (see .holdings-scroll in styles.css) — no pagination, the tbody always
// holds every candidate row.
function updateHoldingsViewToggle() {
  const total = candidates.length;
  els.holdingsScroll.classList.toggle('holdings-scroll--expanded', holdingsView === 'expanded');
  els.holdingsScroll.classList.toggle('holdings-scroll--all', holdingsView === 'all');

  if (total <= HOLDINGS_COLLAPSED_ROWS) {
    els.holdingsViewToggle.hidden = true;
    return;
  }

  els.holdingsViewToggle.hidden = false;
  const labels = {
    collapsed: `Show more (${Math.min(HOLDINGS_EXPANDED_ROWS, total)} of ${total})`,
    expanded: `Show all (${total})`,
    all: 'Show less',
  };
  els.holdingsViewToggle.textContent = labels[holdingsView];
}

function renderSectorChart(breakdown) {
  els.sectorChart.innerHTML = '';
  for (const { sector, weight } of breakdown) {
    const row = document.createElement('div');
    row.className = 'sector-row';

    const label = document.createElement('span');
    label.className = 'sector-label';
    label.textContent = sector;

    const barTrack = document.createElement('div');
    barTrack.className = 'sector-bar-track';
    const bar = document.createElement('div');
    bar.className = 'sector-bar';
    bar.style.width = fmtPct(weight);
    barTrack.appendChild(bar);

    const value = document.createElement('span');
    value.className = 'sector-value';
    value.textContent = fmtPct(weight);

    row.append(label, barTrack, value);
    els.sectorChart.appendChild(row);
  }
}

function renderSparklineCell(returns) {
  const spark = returns && buildSparkline(returns.sparkline);
  if (!spark) return '<span class="hint">—</span>';
  return `
    <svg class="sparkline sparkline--${spark.trend}" width="${spark.width}" height="${spark.height}" viewBox="0 0 ${spark.width} ${spark.height}" aria-hidden="true">
      <polyline points="${spark.points}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" />
    </svg>
  `;
}

function fmtSignedPct(x) {
  return x == null ? null : `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`;
}

function renderReturnBadges(returns) {
  const periods = [
    ['1y', returns?.return1y],
    ['5y', returns?.return5yAnnualized],
    ['10y', returns?.return10yAnnualized],
  ];
  return `
    <div class="return-badges">
      ${periods
        .map(([label, value]) => {
          const text = fmtSignedPct(value);
          if (text == null) return `<span class="return-badge return-badge--empty">${label} —</span>`;
          const cls = value >= 0 ? 'positive' : 'negative';
          return `<span class="return-badge ${cls}">${label} ${text}</span>`;
        })
        .join('')}
    </div>
  `;
}

function renderHoldingsTable(weighted) {
  els.holdingsTable.innerHTML = '';
  const weightBySymbol = new Map(weighted.map((s) => [s.symbol, s.weight]));
  const sorted = [...candidates].sort((a, b) => b.marketCapB - a.marketCapB);

  for (const s of sorted) {
    const isSelected = !excluded.has(s.symbol);
    const weight = weightBySymbol.get(s.symbol);

    const tr = document.createElement('tr');
    if (!isSelected) tr.className = 'row-excluded';

    const checkboxTd = document.createElement('td');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = isSelected;
    checkbox.setAttribute('aria-label', `Include ${s.symbol}`);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) excluded.delete(s.symbol);
      else excluded.add(s.symbol);
      render();
    });
    checkboxTd.appendChild(checkbox);

    tr.appendChild(checkboxTd);
    tr.insertAdjacentHTML(
      'beforeend',
      `
      <td>${s.symbol}</td>
      <td>${s.name}</td>
      <td>${s.sector}</td>
      <td>${weight !== undefined ? fmtPct(weight) : '—'}</td>
      <td>${renderSparklineCell(returnsBySymbol[s.symbol])}</td>
      <td>${renderReturnBadges(returnsBySymbol[s.symbol])}</td>
    `,
    );
    els.holdingsTable.appendChild(tr);
  }
}

function renderTaxComparison() {
  const principal = Number(els.principal.value);
  const annualReturn = Number(els.annualReturn.value) / 100;
  const years = Number(els.years.value);

  const result = compareDiyVsEtf({ principal, annualReturn, years });

  els.taxResult.innerHTML = `
    <div class="tax-card">
      <h3>DIY basket (CGT, single sale)</h3>
      <p class="tax-final">${fmtEur(result.diy.finalValue)}</p>
      <p class="tax-detail">Tax paid: ${fmtEur(result.diy.totalTaxPaid)}</p>
    </div>
    <div class="tax-card">
      <h3>UCITS ETF (exit tax + deemed disposal)</h3>
      <p class="tax-final">${fmtEur(result.etf.finalValue)}</p>
      <p class="tax-detail">Tax paid: ${fmtEur(result.etf.totalTaxPaid)} across ${result.etf.deemedDisposalEvents.length} deemed disposal${result.etf.deemedDisposalEvents.length === 1 ? '' : 's'} + final sale</p>
    </div>
    <div class="tax-card tax-card--advantage">
      <h3>DIY advantage</h3>
      <p class="tax-final ${result.diyAdvantage >= 0 ? 'positive' : 'negative'}">${fmtEur(result.diyAdvantage)}</p>
      <p class="tax-detail">Assumes buy-and-hold with no interim DIY sales — see README for caveats</p>
    </div>
  `;
}

function renderStatementHoldings() {
  els.statementHoldingsSection.hidden = statementHoldings.length === 0;
  els.statementHoldingsBody.innerHTML = '';
  const indexSymbols = new Set(fullIndex.map((s) => s.symbol));
  const sorted = [...statementHoldings].sort((a, b) => b.valueEur - a.valueEur);

  for (const h of sorted) {
    const inList = indexSymbols.has(h.symbol);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${h.symbol}</td>
      <td>${h.quantity.toLocaleString('en-IE', { maximumFractionDigits: 4 })}</td>
      <td>${fmtEur(h.valueEur)}</td>
      <td class="${h.returnEur >= 0 ? 'positive' : 'negative'}">${fmtEur(h.returnEur)}</td>
      <td class="${inList ? 'match-yes' : 'match-no'}">${inList ? '✓ selected above' : '— not in current list'}</td>
    `;
    els.statementHoldingsBody.appendChild(tr);
  }
}

async function handleStatementFile(file) {
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    els.statementStatus.textContent = 'Please upload a PDF file.';
    return;
  }

  els.statementStatus.textContent = `Parsing ${file.name}…`;
  try {
    const buffer = await file.arrayBuffer();
    const text = await extractTextFromPdf(buffer);
    const holdings = parseHoldingsFromText(text);

    if (holdings.length === 0) {
      els.statementStatus.textContent = 'No open positions found in that PDF — is it a Trading 212 monthly statement?';
      return;
    }

    statementHoldings = holdings;
    recomputeHeldSymbols();
    for (const sym of heldSymbols) excluded.delete(sym); // select the imported holdings
    updateCandidates();
    render();
    renderStatementHoldings();
    updateStatementStatusMessage();
  } catch (err) {
    console.error(err);
    els.statementStatus.textContent = 'Could not read that PDF. Make sure it is a Trading 212 monthly statement.';
  }
}

els.dropzone.addEventListener('click', () => els.fileInput.click());
els.dropzone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    els.fileInput.click();
  }
});
els.dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  els.dropzone.classList.add('dragover');
});
els.dropzone.addEventListener('dragleave', () => els.dropzone.classList.remove('dragover'));
els.dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  els.dropzone.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file) handleStatementFile(file);
});
els.fileInput.addEventListener('change', () => {
  const file = els.fileInput.files[0];
  if (file) handleStatementFile(file);
  els.fileInput.value = ''; // allow re-selecting the same file later
});
els.statementClear.addEventListener('click', () => {
  statementHoldings = [];
  heldSymbols = new Set();
  els.statementStatus.textContent = '';
  updateCandidates();
  render();
  renderStatementHoldings();
});

els.indexSelect.addEventListener('change', loadAndRender);
els.weightingSelect.addEventListener('change', render);
els.topN.addEventListener('input', () => {
  updateCandidates();
  render();
});
els.selectAll.addEventListener('click', () => {
  excluded.clear();
  render();
});
els.selectNone.addEventListener('click', () => {
  excluded = new Set(candidates.map((s) => s.symbol));
  render();
});
els.holdingsViewToggle.addEventListener('click', () => {
  holdingsView = holdingsView === 'collapsed' ? 'expanded' : holdingsView === 'expanded' ? 'all' : 'collapsed';
  updateHoldingsViewToggle();
});
[els.principal, els.annualReturn, els.years].forEach((el) =>
  el.addEventListener('input', renderTaxComparison),
);

async function init() {
  await loadReturnsData();
  await loadAndRender();
  renderTaxComparison();
}
init();
