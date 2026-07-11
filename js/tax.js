// Irish DIY-stocks (CGT) vs UCITS-ETF (exit tax + deemed disposal) comparator.
// Pure functions, no DOM — unit-testable in Node.
//
// Modelling assumptions (Irish "gross roll-up" regime as of 2026):
// - UCITS ETF: 41% tax on gains, charged (a) every 8 years on unrealised gains
//   ("deemed disposal") and (b) on actual disposal. No annual exemption, no loss relief.
// - Deemed disposal tax is paid by redeeming units from the holding itself (the more
//   realistic case for a retail investor without separate cash earmarked for it), so
//   the position's value drops by the tax paid. Cost basis steps up to the post-tax
//   value, which is what stops the same gain being taxed twice at final sale.
// - If a deemed-disposal interval produces a loss, no tax is charged and — per Revenue
//   guidance — the loss cannot be relieved and the cost basis is NOT stepped down
//   (prevents using deemed disposal to manufacture a deductible loss).
// - DIY individual stocks: ordinary CGT, 33%, only on realised gains, with the annual
//   personal exemption (currently €1,270) available in the year of sale.

export const DEFAULTS = {
  etfTaxRate: 0.41,
  deemedDisposalIntervalYears: 8,
  cgtRate: 0.33,
  annualExemption: 1270,
};

/**
 * Simulates a UCITS ETF position under Irish gross roll-up rules.
 * @returns {{finalValue:number, totalTaxPaid:number, deemedDisposalEvents:Array}}
 */
export function simulateUcitsEtf({
  principal,
  annualReturn,
  years,
  taxRate = DEFAULTS.etfTaxRate,
  intervalYears = DEFAULTS.deemedDisposalIntervalYears,
}) {
  if (principal < 0) throw new RangeError('principal must be >= 0');
  if (years < 0) throw new RangeError('years must be >= 0');
  if (intervalYears <= 0) throw new RangeError('intervalYears must be > 0');

  let value = principal;
  let basis = principal;
  let totalTaxPaid = 0;
  const deemedDisposalEvents = [];

  for (let year = 1; year <= years; year++) {
    value *= 1 + annualReturn;

    const isDeemedDisposalYear = year % intervalYears === 0 && year !== years;
    if (isDeemedDisposalYear) {
      const gain = value - basis;
      let tax = 0;
      if (gain > 0) {
        tax = gain * taxRate;
        value -= tax;
        basis = value; // step-up to post-tax value
        totalTaxPaid += tax;
      }
      deemedDisposalEvents.push({ year, gain, tax, valueAfter: value });
    }
  }

  // Final actual disposal: tax on remaining gain since last basis step-up.
  const finalGain = value - basis;
  const finalTax = finalGain > 0 ? finalGain * taxRate : 0;
  value -= finalTax;
  totalTaxPaid += finalTax;

  return { finalValue: value, totalTaxPaid, deemedDisposalEvents };
}

/**
 * Simulates a DIY individual-stock basket held to a single final sale, taxed as
 * ordinary Irish CGT with one year's annual exemption applied at sale.
 * @returns {{finalValue:number, totalTaxPaid:number}}
 */
export function simulateDiyCgt({
  principal,
  annualReturn,
  years,
  cgtRate = DEFAULTS.cgtRate,
  annualExemption = DEFAULTS.annualExemption,
}) {
  if (principal < 0) throw new RangeError('principal must be >= 0');
  if (years < 0) throw new RangeError('years must be >= 0');

  const grossValue = principal * Math.pow(1 + annualReturn, years);
  const gain = grossValue - principal;
  const taxableGain = Math.max(gain - annualExemption, 0);
  const tax = taxableGain * cgtRate;
  const finalValue = grossValue - tax;

  return { finalValue, totalTaxPaid: tax };
}

/**
 * Runs both simulations under identical assumptions and returns the comparison.
 * Positive `diyAdvantage` means the DIY basket nets out ahead after tax.
 */
export function compareDiyVsEtf(params) {
  const diy = simulateDiyCgt(params);
  const etf = simulateUcitsEtf(params);
  return {
    diy,
    etf,
    diyAdvantage: diy.finalValue - etf.finalValue,
  };
}
