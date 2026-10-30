// Question answering over the unlocked bundles: FAQ answers, matching sources and
// rules-engine answers for questions that name an amount. Never writes new answer text
// beyond the rules engine's templated lines.
import { mergeIndexes, prepareSynonyms, search, tokenize, stem, idf } from './search.js';
import { parseAmount } from './amount.js';
import { normalize } from './text.js';
import { classify, recommendationLines } from './rules.js';
import { strictAmounts, explicitCategory, MIN_RULES_INR } from './textamounts.js';

export const FAQ_THRESHOLD = { coverage: 0.5, score: 3 };

const CAT_WORDS = [
  ['cs-ind', /(individual consultant|individual|व्यक्तिगत)/],
  ['ncs', /(non[- ]?consult|ncs|गैर[- ]?परामर्श)/],
  ['cs-firm', /(consult|परामर्श|कंसल्टेंट|qcbs|cqs|rfp|salahkar)/],
  ['goods', /(goods|equipment|supply|माल|सामग्री|samaan|saman|उपकरण|instrument)/],
  ['works', /(works?\b|civil|कार्य|निर्माण|kaam|kam\b|construction|rehabilitation)/],
];
const INTENT = /(method|review|prior|post|cpmu|document|process|which|what|kaun|konsi|kaunsi|कौन|विधि|vidhi|समीक्षा|threshold|limit|सीमा|tender|procure|kaise|how|rfq|rfb|ncb|icb|qcbs|gem)/;

export function detectCategory(q) {
  const n = normalize(q);
  for (const [cat, re] of CAT_WORDS) if (re.test(n)) return cat;
  return null;
}

/** A question is "long" (text from a photo or a selection) when it has more than this many words. */
export const LONG_WORDS = 14;
export const LONG_TERMS = 25;

export function isLongText(text) {
  return tokenize(text, { keepStop: true, noStem: true }).length > LONG_WORDS;
}

const KEEP_RES = [
  /(?:₹|\brs\.?|\binr\b|\bus\s*\$|\busd\b|\$)\s*\d[\d,]*(?:\.\d+)?(?:\s*(?:lakhs?|lacs?|crores?|cr\b|millions?|mn\b|k\b))?/gi,
  /\b\d[\d,]*(?:\.\d+)?\s*(?:lakhs?|lacs?|crores?|millions?)\b/gi,
  /\b\d{1,3}(?:\.\d+)?\s*(?:%|percent\b)/gi,
  /\b\d{1,4}\s*(?:calendar\s+|working\s+|business\s+)?(?:days?|weeks?|months?)\b/gi,
];

/**
 * Turn long text into a search query: the most distinctive terms (by IDF in the material index),
 * plus amounts, percentages and day counts kept as they are. Returns {query, terms, kept}.
 */
export function distinctiveQuery(index, text, max = LONG_TERMS) {
  const seen = new Map(); // stem -> {word, tf}
  for (const w of tokenize(text, { noStem: true })) {
    const st = stem(w);
    // short Latin fragments are mostly OCR debris; Devanagari words may be short
    if (st.length < (/[a-z]/.test(st) ? 4 : 2) || /^[\d.,%$₹-]+$/.test(st) || !index.terms.has(st)) continue;
    const cur = seen.get(st);
    if (cur) cur.tf++;
    else seen.set(st, { word: w, tf: 1, idf: idf(index, st) });
  }
  const terms = [...seen.values()].sort((a, b) => (b.idf - a.idf) || (b.tf - a.tf)).slice(0, max).map((x) => x.word);
  const kept = [];
  for (const re of KEEP_RES) {
    re.lastIndex = 0;
    for (const m of String(text).matchAll(re)) if (!kept.includes(m[0].trim())) kept.push(m[0].trim());
  }
  return { query: [...terms, ...kept].join(' '), terms, kept };
}

/** Snippet of `text` around the most query words, about `len` characters. */
export function makeSnippet(text, terms, len = 220) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (t.length <= len) return t;
  const low = normalize(t);
  let best = 0;
  let bestHits = -1;
  for (let i = 0; i < low.length; i += 40) {
    const win = low.slice(i, i + len);
    const hits = terms.reduce((s, w) => s + (w && win.includes(w) ? 1 : 0), 0);
    if (hits > bestHits) { bestHits = hits; best = i; }
  }
  const start = Math.max(0, best - 20);
  return `${start > 0 ? '…' : ''}${t.slice(start, start + len).trim()}${start + len < t.length ? '…' : ''}`;
}

export function createEngine({ general, office = null }) {
  const bundles = [general, office].filter(Boolean);
  const index = mergeIndexes(bundles.map((b) => b.index));
  const synonyms = prepareSynonyms(general.synonyms);
  const faq = new Map();
  for (const b of bundles) for (const f of b.faq) faq.set(f.id, f);
  const units = new Map();
  for (const b of bundles) for (const [doc, list] of Object.entries(b.units)) for (const u of list) units.set(`${doc}:${u.n}`, u);
  const docs = new Map(bundles.flatMap((b) => b.docs.map((d) => [d.id, d])));
  const chunks = new Map();
  if (office) for (const c of office.chunks) chunks.set(`${c.p}:${c.i}`, c);

  const snippet = makeSnippet;

  function sourceOf(key, terms) {
    if (key.startsWith('s:')) {
      const [, doc, n] = key.split(':');
      const u = units.get(`${doc}:${n}`);
      const text = [u.text, u.notes, u.ocr].filter(Boolean).join(' ');
      return { kind: 'slide', doc, n: +n, title: u.title || (u.text || '').split('\n')[0], snippet: snippet(text, terms) };
    }
    if (key.startsWith('p:')) {
      const [, p, i] = key.split(':');
      const c = chunks.get(`${p}:${i}`);
      const u = units.get(`RFP-TEN:${p}`);
      return { kind: 'page', doc: 'RFP-TEN', n: +p, clause: c?.c || null, section: u.label, snippet: snippet(u.text.slice(c.s, c.e), terms) };
    }
    return null;
  }

  function rulesAnswer(q, amount, { category: given = null } = {}) {
    const n = normalize(q);
    if (!amount || (!given && !INTENT.test(n))) return null;
    const category = given || detectCategory(q);
    if (!category) return null;
    let value = amount.value;
    const step = amount.currency === 'USD' ? 1 : general.rules.currency.inr_per_usd;
    if (amount.modifier === 'below') value = Math.max(0, value - step);
    if (amount.modifier === 'above') value += step;
    const res = classify(general.rules, { category, value, currency: amount.currency });
    return { category, amount, res, lines: recommendationLines(general.rules, res) };
  }

  /**
   * Answer a question. opts.long: treat q as long text (photo/selection) and search with its most
   * distinctive terms; opts.userIndex: also search the user's own documents (a separate, third group).
   */
  function ask(q, { limit = 60, long = false, userIndex = null } = {}) {
    const lq = long ? distinctiveQuery(index, q) : null;
    const query = lq ? lq.query || q : q;
    const results = search(index, query, { synonyms, limit });
    const terms = tokenize(query).filter((t) => t.length > 2);
    const faqHits = results.filter((r) => r.key.startsWith('f:'));
    const srcHits = results.filter((r) => !r.key.startsWith('f:'));
    const top = faqHits[0];
    const pass = top && top.coverage >= FAQ_THRESHOLD.coverage && top.score >= FAQ_THRESHOLD.score;
    const best = pass ? faq.get(top.key.slice(2)) : null;
    const relatedIds = [];
    for (const h of faqHits.slice(pass ? 1 : 0)) {
      if (relatedIds.length >= 2) break;
      if (h.coverage >= 0.3 && h.score >= top.score * 0.35) relatedIds.push(h.key.slice(2));
    }
    const seen = new Set();
    const sources = [];
    for (const h of srcHits) {
      const s = sourceOf(h.key, terms);
      const k = `${s.doc}:${s.n}`;
      if (seen.has(k)) continue;
      seen.add(k);
      sources.push({ ...s, score: h.score });
      if (sources.length >= 5) break;
    }
    // Long text (a photo, a page): the rules card only for exactly one plausible amount (at least ₹ 1 lakh,
    // with a currency or next to an amount label) and a category the text states plainly; otherwise the
    // amounts are only listed ("check with the rules").
    let rules = null;
    let amountsFound = [];
    if (lq) {
      const amounts = strictAmounts(q, { rate: general.rules.currency.inr_per_usd }).filter((a) => a.inr >= MIN_RULES_INR);
      const category = explicitCategory(q);
      if (amounts.length === 1 && category) {
        const a = amounts[0];
        rules = rulesAnswer(q, { value: a.value, currency: a.currency, assumed: false, modifier: null, text: a.text }, { category });
      }
      if (!rules) amountsFound = amounts.slice(0, 6);
    } else {
      rules = rulesAnswer(q, parseAmount(q));
    }
    return {
      q,
      long: Boolean(lq),
      query: lq ? query : null,
      best,
      score: top?.score || 0,
      coverage: top?.coverage || 0,
      faqRanked: faqHits.slice(0, 5).map((h) => ({ id: h.key.slice(2), score: h.score, coverage: h.coverage })),
      related: relatedIds.map((id) => faq.get(id)),
      sources,
      // the user's own documents are ranked on their own, so the official material is never pushed out
      userSources: userIndex ? userIndex.search(query, { limit: 5, minCoverage: lq ? 0.1 : 0.3 }) : [],
      rules,
      amountsFound,
    };
  }

  return { ask, faq, units, docs, index, synonyms, general, office };
}
