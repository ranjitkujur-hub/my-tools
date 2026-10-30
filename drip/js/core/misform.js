// Recognise a photo or screenshot of the DRIP-MIS "Create Procurement Plan" screen and read its visible
// values. The field labels come from the form definition (corpus/drip_mis_form.json, in the encrypted
// bundle); the values are read by their vocabularies (method codes, categories, review types …), so OCR
// noise around them (dropdown arrows read as "v", "¥", "»") does not matter. Anything not read reliably
// is left empty for the user to fill in — nothing is guessed.
import { parseDmy, formatDmy } from './dates.js';

/** At least this many different field labels must be in the text. */
export const MIN_LABELS = 4;

// fields that are not values of the plan entry
const SKIP = new Set(['comment', 'send_to', 'cc']);

const lower = (s) => String(s ?? '').toLowerCase();

function editDistance(a, b) {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const t = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = t;
    }
  }
  return prev[b.length];
}

/** Words of a line with their positions. */
function words(line) {
  const out = [];
  const re = /[a-z0-9]+/gi;
  let m;
  while ((m = re.exec(line))) out.push({ w: m[0].toLowerCase(), at: m.index });
  return out;
}

const close = (got, want) => got === want
  || (want.length >= 2 && got.startsWith(want) && got.length <= want.length + 2)
  || (want.length >= 4 && editDistance(got, want) <= 1);

/** Where a label's first words appear in a line (character index), or -1. */
function findLabel(line, labelWords) {
  const ws = words(line);
  outer: for (let i = 0; i + labelWords.length <= ws.length; i++) {
    for (let j = 0; j < labelWords.length; j++) if (!close(ws[i + j].w, labelWords[j])) continue outer;
    return ws[i].at;
  }
  return -1;
}

function labelWordsOf(label) {
  return words(label).map((x) => x.w).slice(0, 4);
}

// separators between the boxes of one row: dropdown arrows and other symbols read by OCR
const SEP = /^(?:[^A-Za-z0-9\-–]{1,3}|v|V|y|Y|oy|ow|o|¥)$/;

/** Split a value row into the texts of its boxes. */
export function cells(row) {
  const out = [];
  let cur = [];
  for (const t of String(row).trim().split(/\s+/)) {
    if (SEP.test(t)) { if (cur.length) out.push(cur.join(' ')); cur = []; } else cur.push(t);
  }
  if (cur.length) out.push(cur.join(' '));
  return out;
}

const isSelect = (s) => /^\s*select\b/i.test(String(s || '')) || /^\s*elect\s*$/i.test(String(s || ''));
const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1).toLowerCase();

// ---- vocabularies (generic DRIP-MIS / World Bank terms)
const V = {
  financial_year: (row) => {
    const m = /\b(20\d{2})\s*[-–]\s*(20\d{2}|\d{2})\b/.exec(row);
    if (!m) return '';
    const b = m[2].length === 2 ? `${m[1].slice(0, 2)}${m[2]}` : m[2];
    return +b === +m[1] + 1 ? `${m[1]}-${b}` : '';
  },
  dam_general: (row) => (/\bgeneral\b/i.test(row) ? 'General' : /\bdam\b/i.test(row) ? 'Dam' : ''),
  pst_status: (row) => {
    const m = /\b(approved|not\s*approved|pending|submitted|draft|rejected|returned)\b/i.exec(row);
    return m ? m[1].replace(/\s+/g, ' ').split(' ').map(cap).join(' ') : '';
  },
  component: (cell) => {
    const m = /^\s*(IV|III|II|I|V)\b/.exec(String(cell || ''));
    return m ? m[1] : '';
  },
  method: (row) => {
    const m = /\b(works|goods|ncs|cs|non[- ]?consult\w*|consult\w*)\s*[-–]\s*([a-z]{2,6})\b/i.exec(row);
    return m ? `${m[1].toUpperCase()}-${m[2].toUpperCase()}` : '';
  },
  category: (cell) => {
    const t = String(cell || '');
    if (/^\W{0,3}non[- ]?consult/i.test(t)) return 'Non-Consulting Services';
    if (/^\W{0,3}consult\w*\s*serv/i.test(t)) return 'Consultant Services';
    if (/^\W{0,3}works?\b/i.test(t)) return 'Works';
    if (/^\W{0,3}goods\b/i.test(t)) return 'Goods';
    return '';
  },
  review_type: (row) => (/\bpr[il1|!]or\b/i.test(row) ? 'Prior' : /\bp[o0]st\b/i.test(row) ? 'Post' : ''),
  process: (row) => {
    const m = /\b(?:s|5)?[il1]ngle\s*stage\s*(one|two|1|2)\s*envel/i.exec(row);
    if (m) return `Single Stage ${/one|1/i.test(m[1]) ? 'One' : 'Two'} Envelope`;
    return /\btwo\s*stage\b/i.test(row) ? 'Two Stage' : '';
  },
  market_approach: (row) => {
    const m = /\b(open|limited|direct)\s*[-–]?\s*(inter\s*national|national)\b/i.exec(row);
    return m ? `${cap(m[1])} - ${/inter/i.test(m[2]) ? 'International' : 'National'}` : '';
  },
  doc_type: (row) => {
    const m = /\brequest\s*for\s*(bids?|quotations?|proposals?)(?:\s*[-–]\s*(small\s*works|works|goods|non[- ]?consult\w*(?:\s*services?)?|plant))?/i.exec(row);
    if (!m) return { value: '', end: -1 };
    const kind = /^bid/i.test(m[1]) ? 'Bids' : /^quot/i.test(m[1]) ? 'Quotations' : 'Proposals';
    const sub = m[2] ? (/small/i.test(m[2]) ? 'Small Works' : /^works/i.test(m[2]) ? 'Works' : /^goods/i.test(m[2]) ? 'Goods' : /plant/i.test(m[2]) ? 'Plant' : 'Non-Consulting Services') : '';
    return { value: `Request for ${kind}${sub ? ` - ${sub}` : ''}`, end: m.index + m[0].length };
  },
};

const letters = (s) => lower(s).replace(/[^a-z]/g, '');

/** A value cut off by the narrow box ("Instrumentation, SCADA, Surveill") completed from known values. */
function complete(read, known) {
  const r = letters(read);
  if (r.length < 6) return read;
  for (const k of known || []) {
    const kl = letters(k);
    if (kl.startsWith(r) || editDistance(kl.slice(0, r.length), r) <= 2) return k;
  }
  return read;
}

const DATE_TOKEN = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b|\b\d{6,8}\b|[a-z]*(?:mm|yy)[a-z/]*/gi;

function dateTokens(row) {
  const out = [];
  DATE_TOKEN.lastIndex = 0;
  let m;
  while ((m = DATE_TOKEN.exec(row))) {
    const d = m[1] ? parseDmy(`${m[1]}/${m[2]}/${m[3]}`) : null;
    out.push({ at: m.index, value: d ? formatDmy(d) : '' }); // placeholders and unreadable dates stay empty
  }
  return out;
}

/**
 * Parse OCR text. Returns {isForm, labels, entry, found: [keys], blank, notes: [{en, hi}]}.
 * opts: {form (with fields), dams: known dam names (office tier), rate (₹ per US$)}
 */
export function parseMisForm(text, { form, dams = [], rate = 70 } = {}) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const fields = (form?.fields || []).filter((f) => !SKIP.has(f.key));
  const defs = fields.map((f) => ({ ...f, words: labelWordsOf(f.label) }));
  // where each label is (first occurrence: labels come before their values)
  const at = new Map(); // key -> {line, pos}
  for (const d of defs) {
    for (let i = 0; i < lines.length; i++) {
      const pos = findLabel(lines[i], d.words);
      if (pos >= 0) { at.set(d.key, { line: i, pos }); break; }
    }
  }
  const labelLines = new Set([...at.values()].map((x) => x.line));
  // a form screen has several labels side by side on a line; a list that names the fields has one per line
  const perLine = new Map();
  for (const v of at.values()) perLine.set(v.line, (perLine.get(v.line) || 0) + 1);
  const rowsOfLabels = [...perLine.values()].filter((n) => n >= 2).length;
  const isForm = at.size >= MIN_LABELS && (rowsOfLabels >= 2 || at.size >= 10);
  const result = { isForm, labels: at.size, entry: {}, found: [], blank: false, notes: [] };
  if (!result.isForm) return result;

  const valueRow = (i) => {
    for (let j = i + 1; j < lines.length && j <= i + 2; j++) {
      if (/^\W*\d{1,3}\W*$/.test(lines[j])) continue; // the end of a wrapped label, e.g. "70)"
      return labelLines.has(j) ? null : { line: j, text: lines[j] };
    }
    return null;
  };
  const columns = (i) => [...at.entries()].filter(([, v]) => v.line === i).sort((a, b) => a[1].pos - b[1].pos).map(([k]) => k);
  const cellFor = (key) => {
    const a = at.get(key);
    if (!a) return null;
    const row = valueRow(a.line);
    if (!row) return { row: null, cell: null };
    const cols = columns(a.line);
    const cs = cells(row.text);
    return { row, cell: cs.length === cols.length ? cs[cols.indexOf(key)] : null, cols, cells: cs };
  };
  const e = {};
  const set = (k, v) => { if (v !== undefined && v !== null && String(v).trim() !== '') e[k] = v; };

  for (const key of ['financial_year', 'dam_general', 'pst_status', 'method', 'review_type', 'process', 'market_approach']) {
    const c = cellFor(key);
    if (c?.row) set(key, V[key](c.cell ?? c.row.text));
  }
  // category: the first box of its row
  {
    const c = cellFor('category');
    if (c?.row) set('category', V.category(c.cell ?? c.cells?.[0] ?? c.row.text));
  }
  // component: its own box, else the last roman numeral in the row
  {
    const c = cellFor('component');
    if (c?.row) {
      let v = c.cell ? V.component(c.cell) : '';
      if (!v) { const m = [...c.row.text.matchAll(/\b(IV|III|II|I)\b/g)].pop(); v = m ? m[1] : ''; }
      set('component', v);
    }
  }
  // the dam: the box after "Dam" (only when Dam/General = Dam)
  if (e.dam_general === 'Dam' && at.has('dam')) {
    const c = cellFor('dam');
    let v = c?.cell ?? '';
    if (!c?.cell && c?.row) {
      const after = c.row.text.replace(/^.*?\bdam\b/i, '');
      v = cells(after)[0] || '';
    }
    v = v.replace(/[^A-Za-z .'-]/g, '').trim();
    if (v && !isSelect(v) && v.length >= 3) {
      const known = dams.find((d) => editDistance(lower(d), lower(v)) <= 2 || (lower(d).includes(lower(v)) && v.length >= 5));
      set('dam', known || v.toUpperCase());
    }
  }
  // PST: its box, unless it says Select
  if (at.has('pst')) {
    const c = cellFor('pst');
    let v = c?.cell ?? (c?.row ? cells(c.row.text)[0] : '');
    v = String(v || '');
    if (e.pst_status) v = v.slice(0, Math.max(0, lower(v).indexOf(lower(e.pst_status))) || v.length);
    v = v.replace(/[^A-Za-z0-9 ./()-]/g, '').trim();
    if (v && !isSelect(v)) set('pst', /^pst$/i.test(v) ? 'PST' : v);
  }
  // name of work: the line right after its label, when that line is not another label
  {
    const c = cellFor('name_of_work');
    if (c?.row && !isSelect(c.row.text) && /[a-z]{3,}/i.test(c.row.text)) set('name_of_work', c.row.text);
  }
  // amounts: the first long number under "Estimated Amount (Rs in INR)", the decimal number under "(US$)"
  {
    const c = cellFor('amount_inr');
    if (c?.row) {
      const m = /(?<![\d.,/])(\d{1,3}(?:,\d{2,3})+|\d{4,})(?![\d/])/.exec(c.row.text);
      if (m) set('amount_inr', +m[1].replace(/,/g, ''));
      const near = lines.slice(c.row.line, c.row.line + 3).join('\n');
      const u = /(?<![\d.,/])(\d{1,3}(?:,\d{3})+\.\d{1,2}|\d{3,}\.\d{1,2})(?![\d/])/.exec(near);
      if (u && e.amount_inr) {
        const usd = +u[1].replace(/,/g, '');
        // DRIP-MIS calculates US$ = ₹ ÷ rate; a figure that does not agree was misread
        if (Math.abs(usd - e.amount_inr / rate) <= Math.max(1, usd * 0.002)) set('amount_usd', usd);
        else result.notes.push({ en: 'The US$ amount could not be read reliably; DRIP-MIS calculates it from the ₹ amount.', hi: 'US$ राशि ठीक से नहीं पढ़ी गई; DRIP-MIS इसे ₹ राशि से निकालता है।' });
      }
    }
  }
  // document type and type of works share a row
  {
    const c = cellFor('doc_type');
    if (c?.row) {
      const d = V.doc_type(c.cell ?? c.row.text);
      set('doc_type', d.value);
    }
    const t = cellFor('type_of_works');
    if (t?.row) {
      let v = t.cell;
      if (v == null) {
        const d = V.doc_type(t.row.text);
        v = d.end >= 0 ? cells(t.row.text.slice(d.end)).find((x) => /[a-z]{3,}/i.test(x)) : null;
      }
      if (v && !isSelect(v) && /[a-z]{3,}/i.test(v)) {
        const known = fields.find((f) => f.key === 'type_of_works')?.seen_values;
        set('type_of_works', complete(v.replace(/[^A-Za-z0-9 ,./()&-]/g, '').trim(), known));
      }
    }
  }
  // planned dates, row by row in form order; the months box sits left of "Contract Signing Planned"
  const dateKeys = fields.filter((f) => f.planned_date || f.key === 'completion_date').map((f) => f.key);
  const doneRows = new Set();
  for (const key of [...dateKeys, 'completion_months']) {
    const a = at.get(key);
    if (!a || doneRows.has(a.line)) continue;
    doneRows.add(a.line);
    const row = valueRow(a.line);
    if (!row) continue;
    const cols = columns(a.line).filter((k) => dateKeys.includes(k) || k === 'completion_months');
    let toks = dateTokens(row.text);
    if (cols.includes('completion_months')) {
      const m = /^\s*(\d{1,3})(?![\d/.-])/.exec(row.text);
      if (m && +m[1] >= 1 && +m[1] <= 120) set('completion_months', +m[1]);
    }
    const dcols = cols.filter((k) => k !== 'completion_months');
    if (toks.length > dcols.length) toks = toks.slice(-dcols.length);
    if (toks.length === dcols.length) dcols.forEach((k, i) => set(k, toks[i].value));
    else if (toks.length === 1 && dcols.length === 2) set(dcols[toks[0].at < row.text.length * 0.4 ? 0 : 1], toks[0].value);
  }

  // the months box against the two dates on either side of it (both visible on the screen)
  {
    const c = parseDmy(e.d_contract || '');
    const done = parseDmy(e.completion_date || '');
    if (c && done && done.getUTCDate() === c.getUTCDate()) {
      const months = (done.getUTCFullYear() - c.getUTCFullYear()) * 12 + (done.getUTCMonth() - c.getUTCMonth());
      if (months >= 1 && months <= 120 && e.completion_months !== months) {
        if (e.completion_months) result.notes.push({ en: `The months box was read as ${e.completion_months}; the contract and completion dates shown give ${months} months, which is used.`, hi: `माह ${e.completion_months} पढ़ा गया; दिखाई गई अनुबंध और पूर्णता तिथियों से ${months} माह बनते हैं, वही लिया गया।` });
        e.completion_months = months;
      }
    }
  }

  result.entry = e;
  result.found = Object.keys(e);
  result.blank = result.found.length === 0;
  return result;
}

/** Plan-helper category for a parsed entry: 'works' | 'goods' | 'ncs' | 'cs-firm' | 'cs-ind' | null. */
export function planCategory(entry) {
  const c = lower(entry.category);
  if (/non[- ]?consult/.test(c)) return 'ncs';
  if (/consult/.test(c)) return /\bic\b|individual/i.test(entry.method || '') ? 'cs-ind' : 'cs-firm';
  if (/works?/.test(c)) return 'works';
  if (/goods/.test(c)) return 'goods';
  return null;
}
