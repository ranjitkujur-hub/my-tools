// A small streaming XML reader for the Office file parsers (works in the browser, in workers and in Node,
// none of which may have DOMParser). It only needs to understand well-formed OOXML parts.

const ENT = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

export function decodeEntities(s) {
  if (s.indexOf('&') < 0) return s;
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(cp) && cp > 0 && cp < 0x110000 ? String.fromCodePoint(cp) : '';
    }
    return ENT[e] ?? m;
  });
}

const ATTR_RE = /([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;

export function attrs(tag) {
  const out = {};
  ATTR_RE.lastIndex = 0;
  let m;
  while ((m = ATTR_RE.exec(tag))) out[m[1]] = decodeEntities(m[3] ?? m[4] ?? '');
  return out;
}

/**
 * Walk an XML string. Handlers: open(name, attrs, selfClosing), close(name), text(decodedText).
 * A self-closing element gets only open(..., true), no close().
 * Comments, processing instructions and CDATA (as text) are handled.
 */
export function walk(xml, { open, close, text } = {}) {
  const len = xml.length;
  let i = 0;
  while (i < len) {
    const lt = xml.indexOf('<', i);
    if (lt < 0) {
      if (text && i < len) text(decodeEntities(xml.slice(i)));
      break;
    }
    if (lt > i && text) text(decodeEntities(xml.slice(i, lt)));
    if (xml.startsWith('<!--', lt)) {
      const e = xml.indexOf('-->', lt + 4);
      i = e < 0 ? len : e + 3;
      continue;
    }
    if (xml.startsWith('<![CDATA[', lt)) {
      const e = xml.indexOf(']]>', lt + 9);
      if (text) text(xml.slice(lt + 9, e < 0 ? len : e));
      i = e < 0 ? len : e + 3;
      continue;
    }
    if (xml[lt + 1] === '?' || xml[lt + 1] === '!') {
      const e = xml.indexOf('>', lt + 2);
      i = e < 0 ? len : e + 1;
      continue;
    }
    // find the end of the tag, skipping '>' inside quoted attribute values
    let j = lt + 1;
    let q = null;
    for (; j < len; j++) {
      const c = xml[j];
      if (q) { if (c === q) q = null; } else if (c === '"' || c === "'") q = c; else if (c === '>') break;
    }
    const raw = xml.slice(lt + 1, j);
    i = j + 1;
    if (raw[0] === '/') {
      if (close) close(raw.slice(1).trim());
      continue;
    }
    const self = raw.endsWith('/');
    const body = self ? raw.slice(0, -1) : raw;
    const sp = body.search(/[\s/]/);
    const name = sp < 0 ? body : body.slice(0, sp);
    if (open) open(name, sp < 0 ? {} : attrs(body.slice(sp)), self);
  }
}

/** All text of elements named `tag` (e.g. 'a:t'), in document order. */
export function texts(xml, tag) {
  const out = [];
  let depth = 0;
  let cur = '';
  walk(xml, {
    open: (n, a, self) => { if (n === tag && !self) { depth++; cur = ''; } },
    close: (n) => { if (n === tag && depth) { depth--; out.push(cur); } },
    text: (t) => { if (depth) cur += t; },
  });
  return out;
}

/** Relationship map of a .rels part: {rId: {target, type}} */
export function relationships(xml) {
  const out = {};
  if (!xml) return out;
  walk(xml, {
    open: (n, a) => {
      if (n === 'Relationship' && a.Id) out[a.Id] = { target: a.Target || '', type: a.Type || '', external: a.TargetMode === 'External' };
    },
  });
  return out;
}

/** Resolve a relationship target against the folder of the part that owns it. */
export function resolvePart(fromPart, target) {
  if (target.startsWith('/')) return target.slice(1);
  const base = fromPart.split('/').slice(0, -1);
  for (const seg of target.split('/')) {
    if (seg === '..') base.pop();
    else if (seg && seg !== '.') base.push(seg);
  }
  return base.join('/');
}

/** The .rels part that belongs to a part: ppt/slides/slide1.xml -> ppt/slides/_rels/slide1.xml.rels */
export function relsPath(part) {
  const p = part.split('/');
  const f = p.pop();
  return [...p, '_rels', `${f}.rels`].join('/');
}
