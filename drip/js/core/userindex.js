// Search over the user's own documents ("मेरे दस्तावेज़ / My documents"): the same BM25 ranking,
// synonyms and highlighting as the material, but a separate index, so these results are ranked on their own.
import { buildIndex, mergeIndexes, search, tokenize } from './search.js';
import { makeSnippet } from './engine.js';

const unitText = (u) => [u.text, u.notes].filter(Boolean).join('\n');

/** Index of one document (cached by the caller per document id). */
export function docIndex(doc) {
  const items = [];
  (doc.units || []).forEach((u, i) => {
    const text = unitText(u);
    if (!text.trim()) return;
    items.push({ key: `u:${doc.id}:${i}`, fields: { title: u.title || '', text: u.text || '', notes: u.notes || '' } });
  });
  return buildIndex(items);
}

/**
 * docs: [{id, name, path, type, units}]; synonyms: prepared synonym groups (engine.synonyms).
 * cache: Map(doc.id -> index) reused between rebuilds.
 */
export function createUserIndex(docs, synonyms = [], cache = new Map()) {
  const byId = new Map(docs.map((d) => [d.id, d]));
  for (const id of [...cache.keys()]) if (!byId.has(id)) cache.delete(id);
  const parts = docs.map((d) => {
    if (!cache.has(d.id)) cache.set(d.id, docIndex(d));
    return cache.get(d.id);
  });
  const index = mergeIndexes(parts);

  /** [{docId, name, path, type, i, n, label, snippet, score, coverage}] */
  function find(q, { limit = 5, docId = null, minCoverage = 0 } = {}) {
    if (!index.N || !String(q || '').trim()) return [];
    const prefix = docId ? `u:${docId}:` : null;
    const hits = search(index, q, { synonyms, limit: Math.max(limit * 4, 20), filter: prefix ? (k) => k.startsWith(prefix) : null });
    const terms = tokenize(q).filter((t) => t.length > 2);
    const out = [];
    for (const h of hits) {
      if (h.coverage < minCoverage) continue;
      const [, id, i] = h.key.split(':');
      const d = byId.get(id);
      const u = d?.units?.[+i];
      if (!u) continue;
      out.push({ docId: id, name: d.name, path: d.path || d.name, type: d.type, i: +i, n: u.n, label: u.label, snippet: makeSnippet(unitText(u), terms), score: h.score, coverage: h.coverage });
      if (out.length >= limit) break;
    }
    return out;
  }

  return { search: find, size: index.N, docs: byId };
}
