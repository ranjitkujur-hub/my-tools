// Question answering over the unlocked bundles: FAQ answers, matching sources and
// rules-engine answers for questions that name an amount. Never writes new answer text
// beyond the rules engine's templated lines.
import { mergeIndexes, prepareSynonyms, search, tokenize } from './search.js';
import { parseAmount } from './amount.js';
import { normalize } from './text.js';
import { classify, recommendationLines } from './rules.js';

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

  function snippet(text, terms, len = 220) {
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

  function rulesAnswer(q, amount) {
    const n = normalize(q);
    if (!amount || !INTENT.test(n)) return null;
    const category = detectCategory(q);
    if (!category) return null;
    let value = amount.value;
    const step = amount.currency === 'USD' ? 1 : general.rules.currency.inr_per_usd;
    if (amount.modifier === 'below') value = Math.max(0, value - step);
    if (amount.modifier === 'above') value += step;
    const res = classify(general.rules, { category, value, currency: amount.currency });
    return { category, amount, res, lines: recommendationLines(general.rules, res) };
  }

  function ask(q, { limit = 60 } = {}) {
    const results = search(index, q, { synonyms, limit });
    const terms = tokenize(q).filter((t) => t.length > 2);
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
    const amount = parseAmount(q);
    return {
      q,
      best,
      score: top?.score || 0,
      coverage: top?.coverage || 0,
      faqRanked: faqHits.slice(0, 5).map((h) => ({ id: h.key.slice(2), score: h.score, coverage: h.coverage })),
      related: relatedIds.map((id) => faq.get(id)),
      sources,
      rules: rulesAnswer(q, amount),
    };
  }

  return { ask, faq, units, docs, index, synonyms, general, office };
}
