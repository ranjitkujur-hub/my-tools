// Indian-style money formatting.

function groupIndian(intStr) {
  if (intStr.length <= 3) return intStr;
  const last3 = intStr.slice(-3);
  const rest = intStr.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${rest},${last3}`;
}

function trimZeros(s) {
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}

/** ₹ 12,34,567 (Indian digit grouping) */
export function formatInr(n, { decimals = 0 } = {}) {
  if (!Number.isFinite(n)) return '';
  const neg = n < 0;
  const fixed = Math.abs(n).toFixed(decimals);
  const [i, d] = fixed.split('.');
  return `${neg ? '-' : ''}₹ ${groupIndian(i)}${d ? '.' + d : ''}`;
}

/** ₹ 12.35 lakh */
export function formatLakh(n) {
  return `₹ ${trimZeros((n / 1e5).toFixed(2))} lakh`;
}

/** ₹ 1.23 crore */
export function formatCrore(n) {
  const cr = n / 1e7;
  const d = cr >= 100 ? 0 : cr >= 1 ? 2 : 3;
  return `₹ ${trimZeros(cr.toFixed(d))} crore`;
}

/** US$ 1.23 million; small amounts in dollars (US$ 499, US$ 4,250) rather than "US$ 0 million" */
export function formatUsdMillion(usd) {
  if (Math.abs(usd) < 10000) return `US$ ${Math.round(usd).toLocaleString('en-US')}`;
  const m = usd / 1e6;
  const d = m >= 100 ? 0 : m >= 10 ? 1 : m >= 1 ? 2 : 3;
  return `US$ ${trimZeros(m.toFixed(d))} million`;
}

/** US$ 1,234,567 */
export function formatUsd(usd) {
  return `US$ ${Math.round(usd).toLocaleString('en-US')}`;
}

/** Full description of a rupee amount: ₹ x (₹ y crore; ₹ z lakh) */
export function describeInr(n) {
  if (!Number.isFinite(n)) return '';
  if (n >= 1e7) return `${formatInr(n)} (${formatCrore(n)}; ${formatLakh(n)})`;
  if (n >= 1e5) return `${formatInr(n)} (${formatLakh(n)})`;
  return formatInr(n);
}

/** Threshold value as words: usd million or inr crore. */
export function describeThreshold(value, unit) {
  if (unit === 'usd') return `US$ ${trimZeros(String(value))} million`;
  if (unit === 'inr') return `₹ ${trimZeros(String(value))} crore`;
  return formatInr(value);
}
