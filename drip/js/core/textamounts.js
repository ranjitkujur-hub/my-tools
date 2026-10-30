// Amounts and the procurement category in long text (a photo, a screenshot, a page of a file).
// Much stricter than for a typed question, because OCR text is full of stray numbers:
// - exchange-rate expressions ("1USD = INR 70", "₹70 per US$") are not amounts;
// - an amount counts only with an explicit currency or unit (₹, Rs, INR, rupees, lakh, crore; US$/$/USD only
//   with "million" or thousands separators), or as a long digit string next to an amount label;
// - the category counts only when the text says it plainly — never from incidental words such as
//   "Type of Works", "Small Works" in a document name, or a method code like WORKS-RFB.
import { parseAmount, toAsciiDigits } from './amount.js';
import { normalize } from './text.js';

/** The full rules card needs at least this much (₹ 1 lakh). */
export const MIN_RULES_INR = 1e5;

const RATE_RES = [
  // 1USD = INR 70 · 1 US$ = Rs. 70 · USD 1 = INR 70
  /\b1\s*(?:us\s*d|us\s*\$|usd|\$|dollar)\s*[=:]\s*(?:inr|rs\.?|₹)\s*\d+(?:\.\d+)?/gi,
  /(?:us\s*\$|usd|\$)\s*1\s*[=:]\s*(?:inr|rs\.?|₹)\s*\d+(?:\.\d+)?/gi,
  // ₹70 per US$ · INR 70 / USD · @ ₹ 70 per dollar
  /(?:@\s*)?(?:₹|\brs\.?|\binr)\s*\d+(?:\.\d+)?\s*(?:per|\/|a)\s*(?:us\s*\$|usd|\$|dollar)/gi,
  // (1USD = INR when the number was cut off onto the next line
  /\b1\s*(?:us\s*d|usd|us\s*\$)\s*[=:]\s*(?:inr|rs\.?|₹)/gi,
];

/** Replace exchange-rate expressions with spaces (positions are kept). */
export function stripRates(text) {
  let t = String(text);
  for (const re of RATE_RES) t = t.replace(re, (m) => ' '.repeat(m.length));
  return t;
}

const INR_RE = /(?:₹|\brs\.?(?![a-z])|\binr\b|\brupees?\b)\s*\d[\d,]*(?:\.\d+)?(?:\s*(?:lakhs?|lacs?|crores?|cr\b\.?|लाख|करोड़|करोड))?|(?<![\d.,])\d[\d,]*(?:\.\d+)?\s*(?:lakhs?|lacs?|crores?|cr\b\.?|लाख|करोड़|करोड)(?:\s*(?:rupees?|inr))?|(?<![\d.,])\d[\d,]*(?:\.\d+)?\s*(?:rupees?|रुपये|रुपए)/giu;
const USD_RE = /(?:\bus\s*\$|\busd\b|\$)\s*(\d[\d,]*(?:\.\d+)?)(\s*(?:millions?|mn\b|billions?|bn\b))?/gi;
const LABEL_RE = /(estimated\s*(?:amount|cost|value)|estimate|amount|cost|value|budget|राशि|लागत|अनुमान)/i;
const LONG_DIGITS_RE = /(?<![\d.,/-])\d{5,}(?:\.\d{1,2})?(?![\d/-])|(?<![\d.,/-])\d{1,3}(?:,\d{2,3}){2,}(?:\.\d{1,2})?(?![\d/-])/g;

/**
 * Plausible amounts in long text: [{value, currency, inr, text, how: 'currency'|'label'}], equivalent
 * ₹ and US$ figures (at `rate`) counted once.
 */
export function strictAmounts(text, { rate = 70 } = {}) {
  const src = stripRates(toAsciiDigits(String(text || '')));
  const found = [];
  const taken = [];
  const free = (a, b) => !taken.some(([x, y]) => a < y && b > x);
  const push = (value, currency, raw, at, how) => {
    if (!Number.isFinite(value) || value <= 0) return;
    taken.push([at, at + raw.length]);
    found.push({ value, currency, inr: currency === 'USD' ? value * rate : value, text: raw.trim(), how });
  };
  let m;
  INR_RE.lastIndex = 0;
  while ((m = INR_RE.exec(src))) {
    const a = parseAmount(m[0]);
    if (a) push(a.value, 'INR', m[0], m.index, 'currency');
  }
  USD_RE.lastIndex = 0;
  while ((m = USD_RE.exec(src))) {
    if (!free(m.index, m.index + m[0].length)) continue;
    const scaled = Boolean(m[2]);
    const separators = /\d,\d{3}(?:,\d{3})*(?:\.\d+)?$/.test(m[1]);
    if (!scaled && !separators) continue; // "$499" in a status bar is not an amount
    const v = parseFloat(m[1].replace(/,/g, '')) * (scaled ? (/b/i.test(m[2]) ? 1e9 : 1e6) : 1);
    push(v, 'USD', m[0], m.index, 'currency');
  }
  // long digit strings next to an amount label (on the same line before them, or on the line above)
  const lines = src.split('\n');
  let off = 0;
  lines.forEach((line, i) => {
    LONG_DIGITS_RE.lastIndex = 0;
    while ((m = LONG_DIGITS_RE.exec(line))) {
      const at = off + m.index;
      if (!free(at, at + m[0].length)) continue;
      const before = line.slice(0, m.index);
      const label = LABEL_RE.test(before) ? before : (LABEL_RE.test(lines[i - 1] || '') ? lines[i - 1] : (LABEL_RE.test(lines[i - 2] || '') && !/\d{4,}/.test(lines[i - 1] || '') ? lines[i - 2] : null));
      if (!label) continue;
      const usd = /(us\s*\$|usd|\$|uss)/i.test(label.slice(Math.max(0, label.search(LABEL_RE))));
      // a label line naming both currencies ("… (Rs in INR) … (US$) …"): the first number is ₹, the next US$
      const both = /inr|rs\b|₹/i.test(label) && usd;
      const currency = both ? (found.some((f) => f.how === 'label' && f.currency === 'INR') ? 'USD' : 'INR') : usd ? 'USD' : 'INR';
      push(parseFloat(m[0].replace(/,/g, '')), currency, m[0], at, 'label');
    }
    off += line.length + 1;
  });
  // the same amount in ₹ and in US$ (DRIP-MIS shows both) counts once
  const out = [];
  for (const f of found.sort((a, b) => (a.currency === 'INR' ? 0 : 1) - (b.currency === 'INR' ? 0 : 1))) {
    if (out.some((o) => Math.abs(o.inr - f.inr) <= Math.max(2 * rate, o.inr * 0.001))) continue;
    out.push(f);
  }
  return out;
}

// incidental uses of category words that say nothing about this package's category
const INCIDENTAL = [
  /type\s*(?:af|of)\s*works?/gi,
  /request\s*for\s*bids?\s*[-–]?\s*(?:small\s*)?(?:works|goods)/gi,
  /small\s*works/gi,
  /\b(?:works|goods|ncs|cs)\s*[-–]\s*[a-z]{2,6}\b/gi, // method codes such as WORKS-RFB
  /public\s*works|works\s*department|\bwrd\b/gi,
  /dam\s*rehabilitation\s*and\s*improvement/gi,
];

const CATEGORY_SIGNS = [
  ['ncs', /\bnon[- ]?consult\w*\s*services?\b/g],
  ['cs', /\b(?:consultant|consulting|consultancy)\s*services?\b|\bconsultancy\b|\bqcbs\b|\bcqs\b|\brequest\s*for\s*proposals?\b|\bterms\s*of\s*reference\b/g],
  ['works', /\bcivil\s*works?\b|\bworks\s*(?:contract|estimate|package)\b|\bof\s*(?:the\s*)?works\b|\bcategory\W{0,3}works\b|\bconstruction\s*of\b|\brehabilitation\s*works?\b/g],
  ['goods', /\bsupply\s*of\b|\bgoods\s*(?:contract|package)\b|\bof\s*(?:the\s*)?goods\b|\bcategory\W{0,3}goods\b|\bpurchase\s*of\b/g],
];

/** 'works' | 'goods' | 'ncs' | 'cs-firm' when the text plainly names one category, else null. */
export function explicitCategory(text) {
  let t = String(text || '').toLowerCase();
  for (const re of INCIDENTAL) t = t.replace(re, ' ');
  t = normalize(t);
  const hits = {};
  for (const [cat, re] of CATEGORY_SIGNS) {
    re.lastIndex = 0;
    let n = (t.match(re) || []).length;
    // "non-consulting services" also contains "consulting services"
    if (cat === 'cs') n -= hits.ncs || 0;
    if (n > 0) hits[cat] = n;
  }
  const cats = Object.keys(hits);
  if (cats.length !== 1) return null;
  return cats[0] === 'cs' ? 'cs-firm' : cats[0];
}
