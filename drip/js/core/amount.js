// Parses money amounts written in questions: "<n> crore", "<n> lakh", "₹<n>", "Rs <n>",
// "$<n>k", "US$ <n> million", Devanagari digits with "लाख"/"करोड़".

const DEV_DIGITS = '०१२३४५६७८९';

const SCALES = [
  [/^(crores?|cr|karod|karor|crore|करोड़|करोड)$/, 1e7, 'INR'],
  [/^(lakhs?|lacs?|lac|lakh|लाख)$/, 1e5, 'INR'],
  [/^(millions?|mn|m)$/, 1e6, 'USD'],
  [/^(billions?|bn)$/, 1e9, 'USD'],
  [/^(k|thousand|thousands|hazar|hajar|हज़ार|हजार)$/, 1e3, null],
];

const INR_MARK = /(₹|\brs\.?|\binr\b|rupees?|rupaye|rupay|रुपये|रुपए|रु\.?)/;
const USD_MARK = /(us\s*\$|\$|\busd\b|dollars?|डॉलर|dollar)/;

const NUM_RE = /(us\s*\$|usd|\$|₹|rs\.?|inr)?\s*(\d[\d,]*(?:\.\d+)?)\s*(crores?|cr\b|crore|करोड़|करोड|karod|karor|lakhs?|lacs?|lac\b|लाख|millions?|mn\b|m\b|billions?|bn\b|k\b|thousands?|हज़ार|हजार|hazar|hajar)?\.?\s*(dollars?|usd|us\$|rupees?|inr|रुपये|रुपए|डॉलर|rupaye)?/giu;

const NOT_MONEY_AFTER = /^\s*(%|percent|per\s*cent|प्रतिशत|days?|din|दिन|weeks?|हफ्ते|सप्ताह|months?|mahine|महीने|माह|years?|saal|साल|वर्ष|hours?|ghante|business|calendar|x\b|nos?\b|samples?|points?)/i;

export function toAsciiDigits(s) {
  return String(s ?? '').replace(/[०-९]/g, (d) => String(DEV_DIGITS.indexOf(d)));
}

/** Returns {value, currency: 'INR'|'USD', assumed, modifier, text} or null. */
export function parseAmount(question) {
  const src = toAsciiDigits(question).toLowerCase().replace(/़/g, '');
  const found = [];
  NUM_RE.lastIndex = 0;
  let m;
  while ((m = NUM_RE.exec(src))) {
    const [all, pre, numStr, scaleWord, post] = m;
    const after = src.slice(m.index + all.length);
    if (!pre && !scaleWord && !post && NOT_MONEY_AFTER.test(after)) continue;
    const before = src.slice(Math.max(0, m.index - 12), m.index);
    // skip clause numbers like "ITB 19.1" or "5.59 of the regulation"
    if (!pre && !scaleWord && !post && /(itb|itc|gcc|scc|pcc|bds|clause|para|regulation|section|annex|slide|page|पृष्ठ)\s*$/.test(before)) continue;
    let value = parseFloat(numStr.replace(/,/g, ''));
    if (!Number.isFinite(value)) continue;
    let currency = null;
    let scaled = false;
    if (scaleWord) {
      const w = scaleWord.replace(/\.$/, '');
      for (const [re, mult, cur] of SCALES) {
        if (re.test(w)) { value *= mult; currency = cur; scaled = true; break; }
      }
    }
    const marker = `${pre || ''} ${post || ''} ${before}`;
    if (USD_MARK.test(`${pre || ''} ${post || ''}`) || (!pre && !post && /(\$|usd|us\$)\s*$/.test(before))) currency = 'USD';
    else if (INR_MARK.test(`${pre || ''} ${post || ''}`) || (!pre && /(₹|rs\.?|inr)\s*$/.test(before))) currency = 'INR';
    const strong = Boolean(pre || post || scaled);
    const assumed = !currency;
    if (!currency) currency = 'INR';
    if (!strong && value < 1000) continue; // a bare small number is not an amount
    found.push({ value, currency, assumed, strong, index: m.index, text: all.trim(), marker });
  }
  if (!found.length) return null;
  found.sort((a, b) => (b.strong - a.strong) || (b.value - a.value));
  const best = found[0];
  const modifier = /(below|under|less than|lower than|upto|up to|within|से कम|से नीचे|\bkam\b|neeche|niche|tak\b|तक)/.test(src)
    ? 'below'
    : /(above|more than|over|exceed|greater than|से अधिक|से ज्यादा|से ज़्यादा|zyada|jyada|adhik|upar)/.test(src) ? 'above' : null;
  return { value: best.value, currency: best.currency, assumed: best.assumed, modifier, text: best.text };
}

/** Convert a parsed amount to both currencies. */
export function toBoth(value, currency, rate) {
  return currency === 'USD'
    ? { inr: value * rate, usd: value, currency }
    : { inr: value, usd: value / rate, currency };
}
