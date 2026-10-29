// Text normalisation shared by the app, the build and the tests.

const QUOTE_SINGLE = /[‘’‚‛′`´]/g;
const QUOTE_DOUBLE = /[“”„‟″]/g;
const DASHES = /[‐‑‒–—―−]/g;

/** Canonical form used to check that a citation quote is verbatim:
 *  ignores case, all whitespace and quote/dash variants. */
export function quoteKey(s) {
  return String(s ?? '')
    .normalize('NFKC')
    .replace(/­/g, '')
    .toLowerCase()
    .replace(QUOTE_SINGLE, "'")
    .replace(QUOTE_DOUBLE, '"')
    .replace(DASHES, '-')
    .replace(/\s+/g, '');
}

/** Where a quote is found in a unit: 'text' | 'notes' | 'ocr' | 'layout' | null */
export function findQuote(quote, unit) {
  const q = quoteKey(quote);
  if (!q) return null;
  for (const f of ['text', 'notes', 'layout', 'ocr']) {
    if (unit[f] && quoteKey(unit[f]).includes(q)) return f;
  }
  return null;
}

const DEV_DIGITS = '०१२३४५६७८९';

/** Query/search normalisation: lower-case, Devanagari digits to ASCII,
 *  nukta removed, chandrabindu folded into anusvara, punctuation stripped. */
export function normalize(s) {
  let t = String(s ?? '').normalize('NFC').toLowerCase();
  t = t.replace(/[०-९]/g, (d) => String(DEV_DIGITS.indexOf(d)));
  t = t.replace(/़/g, '');            // nukta
  t = t.replace(/ँ/g, 'ं');      // chandrabindu -> anusvara
  t = t.replace(QUOTE_SINGLE, "'").replace(QUOTE_DOUBLE, '"').replace(DASHES, '-');
  // keep letters (Latin, Devanagari incl. matras), digits, '.', '%', '$', '₹'
  t = t.replace(/[^a-z0-9ऀ-ॿ.%$₹\s-]/g, ' ');
  t = t.replace(/(^|\s)[.-]+|[.-]+(?=\s|$)/g, ' ');
  return t.replace(/\s+/g, ' ').trim();
}

export function hasDevanagari(s) {
  return /[ऀ-ॿ]/.test(String(s ?? ''));
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
