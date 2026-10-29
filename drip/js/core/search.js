// BM25F-style search with field weights, synonym expansion and light fuzzy matching.
// The index is built at build time (inside each encrypted bundle) and merged at run time.
import { normalize } from './text.js';

export const FIELD_WEIGHTS = {
  q: 3, alt: 2.5, answer: 1,            // FAQ items
  title: 2, text: 1, notes: 0.7, ocr: 0.4, // slides
  clause: 2, section: 1,                 // RFP chunks
};

const STOP = new Set(`a an the of to in on for and or is are was were be been being by with as at from that this these those it its
into than then there their them they we our you your i me my he she his her can could should would will shall may might must do does did
what which who whom whose when where why how about any all also not no yes if so such per under over upto up out more less
please tell explain give show want need know
ka ki ke ko se me mein main hai hain ho hota hoti hote tha thi the kya kaise kab kaun kitna kitni kitne koi kuch aur ya bhi par pe liye
lie wala wali wale hum humein hame aap apna apni batao bataiye bataye chahiye sakta sakte sakti raha rahe rahi jata jati jate kar karna
करें का की के को से में है हैं हो होता होती होते था थी थे क्या कैसे कब कौन कितना कितनी कितने कोई कुछ और या भी पर लिए वाला वाली
वाले हम आप अपना अपनी बताएं बताइए चाहिए सकता सकते सकती रहा रहे रही जाता जाती जाते कर करना यह वह ये वे इस उस इन उन तो`.split(/\s+/));

const HI_SUFFIXES = ['ियाँ', 'ियां', 'ियों', 'ाओं', 'ाएं', 'ाएँ', 'ाओ', 'ों', 'ें', 'ीं', 'ाँ', 'ां'];

export function stem(t) {
  if (/^[a-z]+$/.test(t)) {
    if (t.length > 4 && t.endsWith('ies')) t = t.slice(0, -3) + 'y';
    else if (t.length > 4 && t.endsWith('sses')) t = t.slice(0, -2);
    else if (t.length > 3 && t.endsWith('s') && !/(ss|us|is)$/.test(t)) t = t.slice(0, -1);
    if (t.length > 5 && t.endsWith('ing')) t = t.slice(0, -3);
    else if (t.length > 4 && t.endsWith('ed')) t = t.slice(0, -2);
    if (t.length > 4 && t.endsWith('e')) t = t.slice(0, -1);
    if (t.length > 3 && /([bdgklmnprt])\1$/.test(t)) t = t.slice(0, -1);
    return t;
  }
  if (/[ऀ-ॿ]/.test(t)) {
    for (const s of HI_SUFFIXES) if (t.length > s.length + 1 && t.endsWith(s)) return t.slice(0, -s.length);
  }
  return t;
}

export function tokenize(text, { keepStop = false, noStem = false } = {}) {
  const n = normalize(text).replace(/[-/]/g, ' ');
  const out = [];
  for (let w of n.split(' ')) {
    w = w.replace(/^[.$%]+|[.]+$/g, '');
    if (!w) continue;
    if (!keepStop && STOP.has(w)) continue;
    out.push(noStem ? w : stem(w));
  }
  return out;
}

/** docs: [{key, fields: {fieldName: text}}] -> compact serialisable index */
export function buildIndex(docs) {
  const terms = new Map();
  const outDocs = [];
  docs.forEach((d, i) => {
    const wtf = new Map();
    let dl = 0;
    for (const [f, text] of Object.entries(d.fields)) {
      const w = FIELD_WEIGHTS[f] ?? 1;
      if (!text) continue;
      for (const t of tokenize(text)) {
        wtf.set(t, (wtf.get(t) || 0) + w);
        dl += w;
      }
    }
    outDocs.push({ k: d.key, l: Math.round(dl * 10) });
    for (const [t, v] of wtf) {
      if (!terms.has(t)) terms.set(t, []);
      terms.get(t).push(i, Math.round(v * 10));
    }
  });
  return { v: 1, docs: outDocs, terms: Object.fromEntries(terms) };
}

/** Merge several indexes (e.g. general + office) into one searchable object. */
export function mergeIndexes(list) {
  const docs = [];
  const terms = new Map();
  for (const idx of list) {
    const off = docs.length;
    for (const d of idx.docs) docs.push(d);
    for (const [t, post] of Object.entries(idx.terms)) {
      if (!terms.has(t)) terms.set(t, []);
      const arr = terms.get(t);
      for (let j = 0; j < post.length; j += 2) arr.push(post[j] + off, post[j + 1]);
    }
  }
  const avgdl = docs.reduce((s, d) => s + d.l, 0) / Math.max(1, docs.length);
  const byFirst = new Map();
  for (const t of terms.keys()) {
    const c = t[0];
    if (!byFirst.has(c)) byFirst.set(c, []);
    byFirst.get(c).push(t);
  }
  return { docs, terms, avgdl, byFirst, N: docs.length };
}

export function prepareSynonyms(groups) {
  // phrases are matched unstemmed (so "limit" does not trigger "limited"), expanded stemmed
  return (groups || []).map((g) => {
    const raw = g.terms.map((t) => tokenize(t, { keepStop: true, noStem: true }));
    const stemmed = g.terms.map((t) => tokenize(t, { keepStop: true }));
    const keep = raw.map((p, i) => (p.length ? i : -1)).filter((i) => i >= 0);
    return { id: g.id, match: keep.map((i) => raw[i]), phrases: keep.map((i) => stemmed[i]) };
  });
}

function containsSeq(tokens, seq) {
  outer: for (let i = 0; i + seq.length <= tokens.length; i++) {
    for (let j = 0; j < seq.length; j++) if (tokens[i + j] !== seq[j]) continue outer;
    return true;
  }
  return false;
}

function editDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

function fuzzyTerms(index, t) {
  if (t.length < 4 || /^\d/.test(t)) return [];
  const max = t.length >= 8 ? 2 : 1;
  const cands = index.byFirst.get(t[0]) || [];
  const out = [];
  for (const c of cands) {
    if (Math.abs(c.length - t.length) > max) continue;
    if (editDistance(t, c, max) <= max) out.push(c);
    if (out.length >= 4) break;
  }
  return out;
}

/** Expand a query into weighted terms. Returns {terms: Map(term -> {w, orig}), original: [...]} */
export function expandQuery(index, query, synonyms) {
  const raw = tokenize(query, { keepStop: true, noStem: true });
  const original = tokenize(query);
  const terms = new Map();
  const put = (t, w, orig) => {
    const cur = terms.get(t);
    if (!cur || cur.w < w) terms.set(t, { w, orig: orig ?? cur?.orig ?? t });
  };
  for (const t of original) put(t, 1, t);
  for (const g of synonyms || []) {
    const hi = g.match.findIndex((p) => containsSeq(raw, p));
    if (hi < 0) continue;
    const hit = g.phrases[hi];
    const origKey = hit.join(' ');
    for (const p of g.phrases) {
      if (p === hit || p.join(' ') === origKey) continue;
      for (const t of p) if (!STOP.has(t)) put(t, 0.5 / Math.max(1, p.length - 1) + 0.15, origKey);
    }
  }
  for (const t of original) {
    if (index.terms.has(t)) continue;
    for (const f of fuzzyTerms(index, t)) put(f, 0.7, t);
  }
  return { terms, original };
}

export function idf(index, t) {
  const post = index.terms.get(t);
  if (!post) return 0;
  const df = post.length / 2;
  return Math.log(1 + (index.N - df + 0.5) / (df + 0.5));
}

/**
 * Search. Returns [{key, score, coverage}] sorted by score.
 * coverage = share of the query's information (idf) matched by the document.
 */
export function search(index, query, { synonyms, limit = 50, filter } = {}) {
  const { terms, original } = expandQuery(index, query, synonyms);
  const k1 = 1.2;
  const b = 0.6;
  const scores = new Map();
  const matched = new Map();
  // idf mass of the original query (known terms; unknown words count via their fuzzy/synonym stand-ins)
  const origMass = new Map();
  // words the material does not contain count as rare words, unless a typo/synonym stand-in is found
  const unknownIdf = Math.log(1 + (index.N + 0.5) / 0.5);
  const standIn = new Map();
  for (const [t, { w, orig }] of terms) if (t !== orig && index.terms.has(t)) standIn.set(orig, Math.max(standIn.get(orig) || 0, idf(index, t) * Math.min(1, w)));
  const maxW = new Map(); // best available weight per question word (synonym-only words get full credit)
  for (const [t, { w, orig }] of terms) if (index.terms.has(t)) maxW.set(orig, Math.max(maxW.get(orig) || 0, Math.min(1, w)));
  const known = [...new Set(original)].map((t) => (index.terms.has(t) ? idf(index, t) : standIn.get(t))).filter((x) => x !== undefined);
  const unknownMass = known.length ? Math.max(1.5, (0.8 * known.reduce((a, b) => a + b, 0)) / known.length) : unknownIdf;
  for (const t of new Set(original)) origMass.set(t, index.terms.has(t) ? idf(index, t) : (standIn.get(t) ?? unknownMass));
  for (const [t, { w, orig }] of terms) {
    const post = index.terms.get(t);
    if (!post) continue;
    const id = idf(index, t);
    if (!origMass.has(orig)) origMass.set(orig, id * Math.min(1, w));
    for (let j = 0; j < post.length; j += 2) {
      const di = post[j];
      const doc = index.docs[di];
      if (filter && !filter(doc.k)) continue;
      const tf = post[j + 1] / 10;
      const dl = doc.l / 10;
      const s = id * w * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * dl * 10) / index.avgdl)));
      scores.set(di, (scores.get(di) || 0) + s);
      if (!matched.has(di)) matched.set(di, new Map());
      const mm = matched.get(di);
      mm.set(orig, Math.max(mm.get(orig) || 0, Math.min(1, w) / (maxW.get(orig) || 1)));
    }
  }
  let total = 0;
  for (const v of origMass.values()) total += v;
  const res = [];
  for (const [di, score] of scores) {
    let cov = 0;
    for (const [o, w] of matched.get(di)) cov += (origMass.get(o) || 0) * w;
    const coverage = total ? cov / total : 0;
    // documents that cover more of the question rank higher than ones matching only expansions
    res.push({ key: index.docs[di].k, score: score * (0.4 + 0.6 * coverage), raw: score, coverage });
  }
  res.sort((a, b2) => b2.score - a.score);
  return res.slice(0, limit);
}
