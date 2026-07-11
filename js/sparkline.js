// Pure geometry for a minimal inline sparkline — no DOM, no axes/labels. Returns SVG polyline
// point data + an overall trend direction; the caller wraps this in an <svg> tag.
export function buildSparkline(values, { width = 60, height = 20, padding = 2 } = {}) {
  if (!values || values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const innerW = width - padding * 2;
  const innerH = height - padding * 2;

  const points = values
    .map((v, i) => {
      const x = padding + (i / (values.length - 1)) * innerW;
      const y = padding + innerH - ((v - min) / range) * innerH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const first = values[0];
  const last = values[values.length - 1];
  const trend = last > first ? 'positive' : last < first ? 'negative' : 'flat';

  return { points, width, height, trend };
}
