// Word, PowerPoint and Excel (OOXML) parsers. Each turns a file into citable units:
//   DOCX: sections split at headings, about 600–900 characters each ("Section: <heading> · para n")
//   PPTX: one unit per slide in presentation order, hidden slides counted ("Slide n"), with speaker notes
//   XLSX: blocks of about 40 rows per sheet ("Sheet <name>, rows a–b")
import { unzipSync } from '../../../vendor/fflate.js';
import { walk, relationships, resolvePart, relsPath } from '../xml.js';
import { FileError } from './detect.js';

export { FileError };

export const UNIT_MAX = 900;
export const UNIT_MIN = 600;

const dec = new TextDecoder('utf-8');

export function unzip(bytes) {
  try {
    return unzipSync(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  } catch (e) {
    throw new FileError('corrupt', `zip: ${e.message}`);
  }
}

function part(files, path) {
  const b = files[path];
  return b ? dec.decode(b) : null;
}

/** Split a long paragraph at sentence ends (or spaces) into pieces of at most `max` characters. */
export function splitLong(text, max = UNIT_MAX) {
  const out = [];
  let t = text.trim();
  while (t.length > max) {
    const win = t.slice(0, max);
    let cut = Math.max(win.lastIndexOf('. '), win.lastIndexOf('; '), win.lastIndexOf('? '), win.lastIndexOf('। '));
    if (cut < max * 0.4) cut = win.lastIndexOf(' ');
    if (cut < max * 0.4) cut = max - 1;
    out.push(t.slice(0, cut + 1).trim());
    t = t.slice(cut + 1).trim();
  }
  if (t) out.push(t);
  return out;
}

const isOn = (a) => !a || !['0', 'false', 'off'].includes(String(a['w:val'] ?? '').toLowerCase());

// ---------------------------------------------------------------- DOCX

function headingStyles(stylesXml) {
  const heads = new Map(); // styleId -> level
  if (!stylesXml) return heads;
  let cur = null;
  walk(stylesXml, {
    open: (n, a) => {
      if (n === 'w:style') cur = { id: a['w:styleId'], type: a['w:type'], name: '', lvl: null };
      else if (cur && n === 'w:name') cur.name = a['w:val'] || '';
      else if (cur && n === 'w:outlineLvl') cur.lvl = +a['w:val'];
    },
    close: (n) => {
      if (n !== 'w:style' || !cur) return;
      // "heading 1"…, custom styles such as "HeadingITC1" or "A1-Heading 2", "Title", or an outline level
      const m = /heading\D*(\d)?/i.exec(`${cur.name} ${cur.id || ''}`);
      if (cur.type === 'paragraph' && (m || /^title$/i.test(cur.name) || (cur.lvl !== null && cur.lvl < 9))) heads.set(cur.id, m?.[1] ? +m[1] : (cur.lvl ?? 0) + 1);
      cur = null;
    },
  });
  return heads;
}

// deleted (tracked) text, field codes, moved-away text and the duplicate fallback of text boxes
const DOCX_SKIP = new Set(['w:del', 'w:delText', 'w:instrText', 'w:moveFrom', 'mc:Fallback']);

/** Paragraph and table blocks of a WordprocessingML part (document.xml or footnotes.xml). */
export function docxBlocks(xml, heads = new Map(), { footnotes = false } = {}) {
  const blocks = [];
  let p = null;          // current paragraph (text boxes nest paragraphs inside paragraphs)
  const pStack = [];
  let inRun = false;
  let runBold = false;
  let inRPr = false;
  let inPPr = false;
  let skip = 0;          // inside w:del, w:delText, w:instrText, separators
  let tTag = 0;          // inside w:t
  const tables = [];     // stack of {rows, row, cell}
  let fn = null;         // footnote being read

  const pushPara = (para) => {
    const text = para.text.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim();
    if (!text) return;
    const t = tables[tables.length - 1];
    if (t) { t.cell.push(text); return; }
    const short = text.length <= 80 && text.split(/\s+/).length <= 12 && !/[.:;,]$/.test(text);
    const heading = Boolean((para.style && heads.has(para.style)) || para.outline !== null || (para.allBold && para.hasText && short && !/^\d+(\.\d+)*$/.test(text)));
    blocks.push({ kind: heading ? 'heading' : 'para', text, fn: fn?.id });
  };

  walk(xml, {
    open: (n, a, self) => {
      if (n === 'w:footnote' && footnotes) {
        fn = { id: a['w:id'], skip: ['separator', 'continuationSeparator', 'continuationNotice'].includes(a['w:type']) };
        if (fn.skip) skip++;
        return;
      }
      if (DOCX_SKIP.has(n)) { if (!self) skip++; return; }
      if (skip) return;
      switch (n) {
        case 'w:p': pStack.push(p); p = { text: '', style: null, outline: null, allBold: true, hasText: false }; break;
        case 'w:pPr': inPPr = true; break;
        case 'w:pStyle': if (p && inPPr) p.style = a['w:val']; break;
        case 'w:outlineLvl': if (p && inPPr && +a['w:val'] < 9) p.outline = +a['w:val']; break;
        case 'w:r': inRun = true; runBold = false; break;
        case 'w:rPr': inRPr = true; break;
        case 'w:b': if (inRun && inRPr) runBold = isOn(a); break;
        case 'w:t': if (!self) tTag++; break;
        case 'w:tab': if (inRun && p) p.text += '\t'; break;
        case 'w:br': case 'w:cr': if (inRun && p) p.text += '\n'; break;
        case 'w:noBreakHyphen': if (inRun && p) p.text += '-'; break;
        case 'w:tbl': tables.push({ rows: [], row: null, cell: null }); break;
        case 'w:tr': if (tables.length) tables[tables.length - 1].row = []; break;
        case 'w:tc': if (tables.length) tables[tables.length - 1].cell = []; break;
        default:
      }
    },
    close: (n) => {
      if (n === 'w:footnote' && footnotes) { if (fn?.skip) skip--; fn = null; return; }
      if (DOCX_SKIP.has(n)) { skip = Math.max(0, skip - 1); return; }
      if (skip) return;
      switch (n) {
        case 'w:pPr': inPPr = false; break;
        case 'w:rPr': inRPr = false; break;
        case 'w:r': inRun = false; break;
        case 'w:t': tTag = Math.max(0, tTag - 1); break;
        case 'w:p': if (p) pushPara(p); p = pStack.pop() ?? null; break;
        case 'w:tc': {
          const t = tables[tables.length - 1];
          if (t?.row && t.cell) t.row.push(t.cell.join(' ').replace(/\s+/g, ' ').trim());
          if (t) t.cell = null;
          break;
        }
        case 'w:tr': {
          const t = tables[tables.length - 1];
          if (t?.row && t.row.some(Boolean)) t.rows.push(t.row.join(' | '));
          if (t) t.row = null;
          break;
        }
        case 'w:tbl': {
          const t = tables.pop();
          if (!t) break;
          const outer = tables[tables.length - 1];
          if (outer?.cell) outer.cell.push(t.rows.join(' / '));
          else for (const r of t.rows) blocks.push({ kind: 'row', text: r, fn: fn?.id });
          break;
        }
        default:
      }
    },
    text: (t) => {
      if (skip || !tTag || !p) return;
      p.text += t;
      if (t.trim()) {
        p.hasText = true;
        if (!runBold) p.allBold = false;
      }
    },
  });
  return blocks;
}

/** Group blocks into units: split at headings, at most about 900 characters each. */
export function sectionUnits(blocks, { start = 'Start', labelPrefix = 'Section' } = {}) {
  const units = [];
  let heading = start;
  let para = 0;
  let cur = null;
  const flush = () => {
    if (cur && cur.lines.length) {
      const h = heading.length > 70 ? `${heading.slice(0, 68)}…` : heading;
      units.push({ n: units.length + 1, label: `${labelPrefix}: ${h} · para ${cur.para}`, title: heading, text: cur.lines.join('\n') });
    }
    cur = null;
  };
  for (const b of blocks) {
    if (b.kind === 'heading') {
      flush();
      heading = b.text.replace(/\s+/g, ' ');
      para = 0;
      continue;
    }
    para++;
    for (const piece of splitLong(b.text)) {
      const len = cur ? cur.lines.reduce((s, l) => s + l.length + 1, 0) : 0;
      if (cur && len >= UNIT_MIN) flush();
      else if (cur && len + piece.length > UNIT_MAX) flush();
      if (!cur) cur = { para, lines: [] };
      cur.lines.push(piece);
    }
  }
  flush();
  return units;
}

export function parseDocx(bytes) {
  const files = unzip(bytes);
  const doc = part(files, 'word/document.xml');
  if (!doc) throw new FileError('corrupt', 'no word/document.xml');
  const heads = headingStyles(part(files, 'word/styles.xml'));
  const units = sectionUnits(docxBlocks(doc, heads));
  const fnXml = part(files, 'word/footnotes.xml');
  if (fnXml) {
    const fnBlocks = docxBlocks(fnXml, new Map(), { footnotes: true }).map((b) => ({ ...b, kind: 'para' }));
    for (const u of sectionUnits(fnBlocks, { start: 'Footnotes' })) units.push({ ...u, n: units.length + 1 });
  }
  return { kind: 'docx', units, note: 'Word: page numbers are not available' };
}

// ---------------------------------------------------------------- PPTX

const SHAPES = new Set(['p:sp', 'p:grpSp', 'p:graphicFrame', 'p:pic', 'p:cxnSp', 'p:contentPart', 'mc:AlternateContent']);

/** Placeholder positions of a layout or master: {byIdx: Map(idx -> {x, y}), byType: Map(type -> {x, y})} */
function placeholderPositions(xml) {
  const byIdx = new Map();
  const byType = new Map();
  if (!xml) return { byIdx, byType };
  let depth = 0;
  let cur = null;
  walk(xml, {
    open: (n, a, self) => {
      if (self) {
        if (cur && n === 'p:ph') cur.ph = { type: a.type || 'obj', idx: a.idx ?? '0' };
        if (cur && n === 'a:off' && !cur.off) cur.off = { x: +a.x || 0, y: +a.y || 0 };
        return;
      }
      depth++;
      if (n === 'p:sp' && !cur) cur = { depth, ph: null, off: null };
    },
    close: (n) => {
      if (cur && n === 'p:sp' && depth === cur.depth) {
        if (cur.ph && cur.off) {
          byIdx.set(cur.ph.idx, cur.off);
          if (!byType.has(cur.ph.type)) byType.set(cur.ph.type, cur.off);
        }
        cur = null;
      }
      depth--;
    },
  });
  return { byIdx, byType };
}

/** Text paragraphs of a text body part, used for speaker notes (the body placeholder only). */
function notesText(xml) {
  if (!xml) return '';
  const paras = [];
  let shape = null;
  let p = null;
  let tDepth = 0;
  let depth = 0;
  walk(xml, {
    open: (n, a, self) => {
      if (self) {
        if (shape && n === 'p:ph') shape.ph = a.type || 'obj';
        if (p && n === 'a:br') p.push('\n');
        return;
      }
      depth++;
      if (n === 'p:sp' && !shape) shape = { depth, ph: null, paras: [] };
      else if (shape && n === 'a:p') p = [];
      else if (p && n === 'a:t') tDepth++;
    },
    close: (n) => {
      if (n === 'a:t' && tDepth) tDepth--;
      else if (n === 'a:p' && p && shape) { shape.paras.push(p.join('')); p = null; } else if (shape && n === 'p:sp' && depth === shape.depth) {
        if (shape.ph === 'body') paras.push(...shape.paras);
        shape = null;
      }
      depth--;
    },
    text: (t) => { if (p && tDepth) p.push(t); },
  });
  return paras.join('\n').trim();
}

/** One slide: {title, lines, hidden} with shapes ordered top-to-bottom, left-to-right. */
export function slideContent(xml, layoutPos, masterPos) {
  const shapes = [];
  let hidden = false;
  let depth = 0;
  let treeDepth = -1;
  let shape = null;
  let altDepth = 0;   // inside mc:Fallback (skipped: it repeats mc:Choice)
  let para = null;
  let inRun = false;
  let tDepth = 0;
  let table = null;   // {row, cell, rows}
  let cellPara = null;
  walk(xml, {
    open: (n, a, self) => {
      if (n === 'p:sld' && a.show === '0') hidden = true;
      if (altDepth) { if (!self) altDepth++; return; }
      if (n === 'mc:Fallback' && !self) { altDepth = 1; return; }
      if (self) {
        if (shape) {
          if (n === 'p:ph' && !shape.ph) shape.ph = { type: a.type || 'obj', idx: a.idx ?? '0' };
          else if (n === 'a:off' && !shape.off) shape.off = { x: +a.x || 0, y: +a.y || 0 };
        }
        return;
      }
      depth++;
      if (n === 'p:spTree' && treeDepth < 0) { treeDepth = depth; return; }
      if (!shape && treeDepth > 0 && depth === treeDepth + 1 && SHAPES.has(n)) {
        shape = { depth, ph: null, off: null, lines: [], paras: [] };
        return;
      }
      if (!shape) return;
      switch (n) {
        case 'a:tbl': table = { rows: [], row: null, cell: null }; break;
        case 'a:tr': if (table) table.row = []; break;
        case 'a:tc': if (table) table.cell = []; break;
        case 'a:p':
          if (table?.cell) cellPara = [];
          else para = { text: '', all: '' };
          break;
        case 'a:r': inRun = true; break;
        case 'a:t': tDepth++; break;
        default:
      }
    },
    close: (n) => {
      if (altDepth) { altDepth--; return; }
      if (shape && n === 'a:t') { tDepth = Math.max(0, tDepth - 1); depth--; return; }
      if (shape) {
        switch (n) {
          case 'a:r': inRun = false; break;
          case 'a:p':
            if (cellPara && table?.cell) { table.cell.push(cellPara.join('')); cellPara = null; } else if (para) {
              const t = para.text.trim();
              if (t) shape.lines.push(t);
              shape.paras.push(para.all.trim());
              para = null;
            }
            break;
          case 'a:tc': if (table?.row && table.cell) table.row.push(table.cell.join('\n').trim().replace(/\s*\n\s*/g, ' ')); if (table) table.cell = null; break;
          case 'a:tr': if (table?.row && table.row.some(Boolean)) shape.lines.push(table.row.join(' | ')); if (table) table.row = null; break;
          case 'a:tbl': table = null; break;
          default:
        }
        if (depth === shape.depth) {
          if (!shape.off && shape.ph) shape.off = layoutPos.byIdx.get(shape.ph.idx) || masterPos.byType.get(shape.ph.type === 'obj' ? 'body' : shape.ph.type) || null;
          shapes.push(shape);
          shape = null;
        }
      }
      depth--;
    },
    text: (t) => {
      if (!shape || !tDepth || altDepth) return;
      if (cellPara) cellPara.push(t);
      else if (para) { para.all += t; if (inRun) para.text += t; }
    },
  });
  const order = shapes.map((s, i) => ({ s, i })).sort((a, b) => ((a.s.off?.y || 0) - (b.s.off?.y || 0)) || ((a.s.off?.x || 0) - (b.s.off?.x || 0)) || (a.i - b.i));
  const titleShape = shapes.find((s) => s.ph && ['title', 'ctrTitle'].includes(s.ph.type));
  return {
    hidden,
    title: titleShape ? titleShape.paras.join('\n').trim() : '',
    lines: order.flatMap((o) => o.s.lines),
  };
}

export function parsePptx(bytes) {
  const files = unzip(bytes);
  const pres = part(files, 'ppt/presentation.xml');
  if (!pres) throw new FileError('corrupt', 'no ppt/presentation.xml');
  const rels = relationships(part(files, 'ppt/_rels/presentation.xml.rels'));
  const ids = [];
  walk(pres, { open: (n, a) => { if (n === 'p:sldId') ids.push(a['r:id']); } });
  const layoutCache = new Map();
  const positionsOf = (p) => {
    if (!layoutCache.has(p)) layoutCache.set(p, placeholderPositions(part(files, p)));
    return layoutCache.get(p);
  };
  const units = [];
  ids.forEach((rid, i) => {
    const target = rels[rid]?.target;
    if (!target) return;
    const slidePart = resolvePart('ppt/presentation.xml', target);
    const xml = part(files, slidePart);
    if (!xml) return;
    const srels = relationships(part(files, relsPath(slidePart)));
    let layoutPart = null;
    let notesPart = null;
    for (const r of Object.values(srels)) {
      if (r.type.endsWith('/slideLayout')) layoutPart = resolvePart(slidePart, r.target);
      if (r.type.endsWith('/notesSlide')) notesPart = resolvePart(slidePart, r.target);
    }
    let masterPart = null;
    if (layoutPart) for (const r of Object.values(relationships(part(files, relsPath(layoutPart))))) if (r.type.endsWith('/slideMaster')) masterPart = resolvePart(layoutPart, r.target);
    const c = slideContent(xml, layoutPart ? positionsOf(layoutPart) : placeholderPositions(null), masterPart ? positionsOf(masterPart) : placeholderPositions(null));
    const n = i + 1;
    units.push({ n, label: `Slide ${n}`, title: c.title, text: c.lines.join('\n'), notes: notesPart ? notesText(part(files, notesPart)) : '', hidden: c.hidden || undefined });
  });
  return { kind: 'pptx', units };
}

// ---------------------------------------------------------------- XLSX

export const XLSX_ROWS = 40;

function colIndex(ref) {
  const m = /^([A-Z]+)/.exec(ref || '');
  if (!m) return null;
  let n = 0;
  for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function sharedStrings(xml) {
  const out = [];
  if (!xml) return out;
  let si = null;
  let inT = 0;
  let rph = 0;
  walk(xml, {
    open: (n, a, self) => {
      if (self) return;
      if (n === 'si') si = '';
      else if (n === 'rPh') rph++;
      else if (n === 't' && si !== null && !rph) inT++;
    },
    close: (n) => {
      if (n === 'si') { out.push(si ?? ''); si = null; } else if (n === 'rPh') rph--;
      else if (n === 't' && inT) inT--;
    },
    text: (t) => { if (inT && si !== null) si += t; },
  });
  return out;
}

function sheetRows(xml, strings) {
  const rows = [];
  let row = null;
  let cell = null;
  let inV = 0;
  let inT = 0;
  walk(xml, {
    open: (n, a, self) => {
      if (n === 'row') { row = { r: +a.r || rows.length + 1, cells: [] }; if (self) row = null; } else if (n === 'c' && row) { cell = { col: colIndex(a.r), t: a.t || 'n', v: '' }; if (self) cell = null; } else if (cell && n === 'v' && !self) inV++;
      else if (cell && n === 't' && !self) inT++;
    },
    close: (n) => {
      if (n === 'v' && inV) inV--;
      else if (n === 't' && inT) inT--;
      else if (n === 'c' && cell && row) {
        let v = cell.v;
        if (cell.t === 's') v = strings[+v] ?? '';
        else if (cell.t === 'b') v = v === '1' ? 'TRUE' : 'FALSE';
        v = String(v).replace(/\s+/g, ' ').trim();
        if (v) row.cells.push({ col: cell.col ?? row.cells.length, v });
        cell = null;
      } else if (n === 'row' && row) {
        if (row.cells.length) rows.push(row);
        row = null;
      }
    },
    text: (t) => { if (cell && (inV || inT)) cell.v += t; },
  });
  return rows;
}

export function parseXlsx(bytes) {
  const files = unzip(bytes);
  const wb = part(files, 'xl/workbook.xml');
  if (!wb) throw new FileError('corrupt', 'no xl/workbook.xml');
  const rels = relationships(part(files, 'xl/_rels/workbook.xml.rels'));
  const strings = sharedStrings(part(files, 'xl/sharedStrings.xml'));
  const sheets = [];
  walk(wb, { open: (n, a) => { if (n === 'sheet') sheets.push({ name: a.name || `Sheet${sheets.length + 1}`, rid: a['r:id'], hidden: a.state && a.state !== 'visible' }); } });
  const units = [];
  const sheetInfo = [];
  for (const s of sheets) {
    const target = rels[s.rid]?.target;
    const xml = target ? part(files, resolvePart('xl/workbook.xml', target)) : null;
    if (!xml) continue;
    const rows = sheetRows(xml, strings);
    sheetInfo.push({ name: s.name, rows: rows.length });
    for (let i = 0; i < rows.length; i += XLSX_ROWS) {
      const block = rows.slice(i, i + XLSX_ROWS);
      const a = block[0].r;
      const b = block[block.length - 1].r;
      units.push({
        n: units.length + 1,
        label: `Sheet ${s.name}, rows ${a}–${b}`,
        title: s.name,
        text: block.map((r) => r.cells.sort((x, y) => x.col - y.col).map((c) => c.v).join(' | ')).join('\n'),
      });
    }
  }
  return { kind: 'xlsx', units, sheets: sheetInfo };
}
