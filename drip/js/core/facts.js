// "मुख्य बातें / Key facts" of a user's document: money amounts, percentages, day/month periods and dates,
// each with its sentence and citation unit. These are points to check, not verdicts.
import { parseAmount, toAsciiDigits } from './amount.js';
import { stripRates } from './textamounts.js';

const AMOUNT_RES = [
  // currency first: ₹ 25,00,000 · Rs. 3 lakh · INR 1.2 crore · US$ 0.8 million · $400k
  /(?:₹|\brs\.?|\binr\b|\bus\s*\$|\busd\b|\$)\s*\d[\d,]*(?:\.\d+)?(?:\s*(?:lakhs?|lacs?|crores?|cr\b\.?|millions?|mn\b|billions?|bn\b|k\b|लाख|करोड़|करोड))?/giu,
  // scale words: 2.5 crore · 50 lakh · 1.2 million dollars
  /(?<![\d.,])\d[\d,]*(?:\.\d+)?\s*(?:lakhs?|lacs?|crores?|cr\b\.?|लाख|करोड़|करोड|millions?|billions?)(?:\s*(?:rupees?|inr|usd|dollars?|us\$))?/giu,
  // trailing currency words: 5000 rupees
  /(?<![\d.,])\d[\d,]*(?:\.\d+)?\s*(?:rupees?|रुपये|रुपए|dollars?)/giu,
];
const PERCENT_RE = /(?<![\d.])\d{1,3}(?:\.\d+)?\s*(?:%|percent\b|per\s*cent\b|प्रतिशत)/giu;
const PERIOD_RE = /(?<![\d.,/])\(?(\d{1,4})\)?\s*(?:\([a-z ]+\)\s*)?(?:(calendar|working|business|clear|consecutive)\s+)?(days?|weeks?|months?|दिन|सप्ताह|महीने|महीना|माह)(?![a-z])/giu;
const DATE_RE = /(?<![\d/.-])(\d{1,2})([./-])(\d{1,2})\2((?:19|20)\d{2})(?![\d])/g;

export const FACT_TYPES = ['amount', 'percent', 'period', 'date'];

const ABBR = /(?:^|[\s(])(?:rs|no|nos|cl|para|sr|vs|viz|etc|e\.g|i\.e|dt|mr|mrs|dr|govt|dept|approx|min|max)$/i;

/** The sentence around [start, end) of a text, at most about 280 characters. */
export function sentenceAt(text, start, end, max = 280) {
  const isEnd = (i) => {
    const c = text[i];
    if (c === '\n') return true;
    if (!/[.!?।]/.test(c) || (i + 1 < text.length && !/\s/.test(text[i + 1]))) return false;
    return !(c === '.' && ABBR.test(text.slice(Math.max(0, i - 8), i)));
  };
  let a = start;
  while (a > 0 && !isEnd(a - 1)) a--;
  let b = end;
  while (b < text.length && !isEnd(b)) b++;
  if (b < text.length && text[b] !== '\n') b++;
  let s = text.slice(a, b).replace(/\s+/g, ' ').trim();
  if (s.length > max) {
    const from = Math.max(0, start - a - Math.floor(max / 2));
    s = `${from > 0 ? '…' : ''}${s.slice(from, from + max).trim()}…`;
  }
  return s;
}

function validDate(d, m) {
  return d >= 1 && d <= 31 && m >= 1 && m <= 12;
}

/** Facts in one text. */
export function factsInText(text) {
  const orig = String(text || '');
  // same length, so positions stay valid in the original; an exchange rate ("1USD = INR 70") is not an amount
  const t = stripRates(toAsciiDigits(orig));
  const out = [];
  const taken = []; // [start, end) of amounts, so "2.5 crore" is not also a period or percent
  const overlaps = (s, e) => taken.some(([a, b]) => s < b && e > a);
  for (const re of AMOUNT_RES) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(t))) {
      const raw = m[0].replace(/[\s,.]+$/, '');
      if (overlaps(m.index, m.index + raw.length)) continue;
      const a = parseAmount(raw);
      if (!a) continue;
      taken.push([m.index, m.index + raw.length]);
      out.push({ type: 'amount', text: raw, value: a.value, currency: a.currency, start: m.index, end: m.index + raw.length });
    }
  }
  PERCENT_RE.lastIndex = 0;
  let m;
  while ((m = PERCENT_RE.exec(t))) {
    if (overlaps(m.index, m.index + m[0].length)) continue;
    out.push({ type: 'percent', text: m[0], value: parseFloat(m[0]), start: m.index, end: m.index + m[0].length });
  }
  PERIOD_RE.lastIndex = 0;
  while ((m = PERIOD_RE.exec(t))) {
    if (overlaps(m.index, m.index + m[0].length)) continue;
    const n = +m[1];
    if (!n) continue;
    const unit = /^(day|दिन)/i.test(m[3]) ? 'days' : /^(week|सप्ताह)/i.test(m[3]) ? 'weeks' : 'months';
    out.push({ type: 'period', text: m[0].replace(/[()]/g, '').replace(/\s+/g, ' '), value: n, unit, kind: m[2]?.toLowerCase() || null, start: m.index, end: m.index + m[0].length });
  }
  DATE_RE.lastIndex = 0;
  while ((m = DATE_RE.exec(t))) {
    const d = +m[1];
    const mo = +m[3];
    if (!validDate(d, mo)) continue;
    out.push({ type: 'date', text: m[0], value: `${String(d).padStart(2, '0')}/${String(mo).padStart(2, '0')}/${m[4]}`, start: m.index, end: m.index + m[0].length });
  }
  out.sort((a, b) => a.start - b.start);
  return out.map((f) => ({ ...f, sentence: sentenceAt(orig, f.start, f.end) }));
}

/** Facts of a document: [{type, text, value, sentence, unit: {n, label}}], in document order. */
export function extractFacts(doc, { limit = 400 } = {}) {
  const out = [];
  const seen = new Set();
  for (const u of doc.units || []) {
    for (const f of factsInText([u.text, u.notes].filter(Boolean).join('\n'))) {
      const k = `${f.type}|${f.text}|${f.sentence}`;
      if (seen.has(k)) continue;
      seen.add(k);
      const { start, end, ...rest } = f;
      out.push({ ...rest, unit: { n: u.n, label: u.label } });
      if (out.length >= limit) return out;
    }
  }
  return out;
}
