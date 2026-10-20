/* पत्र पंजी — core logic (no DOM). Works in the browser (window.LRCore) and in Node (require). */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LRCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var APP_ID = 'letter-register';
  var BACKUP_VERSION = 1;

  var TYPES = {
    in: { hi: 'आवक', en: 'Incoming' },
    out: { hi: 'जावक', en: 'Outgoing' },
    event: { hi: 'घटना', en: 'Event' }
  };
  var STATUSES = {
    pending: { hi: 'लंबित', en: 'Pending' },
    replied: { hi: 'उत्तर दिया', en: 'Replied' },
    closed: { hi: 'बंद', en: 'Closed' },
    info: { hi: 'सूचनार्थ', en: 'For information' }
  };
  var APPROX = '(लगभग)';
  var DEFAULT_OFFICE_LINE = 'कार्यालय कार्यपालक अभियंता, तेनुघाट बाँध प्रमण्डल, तेनुघाट';

  var HINDI_MONTHS = ['जनवरी', 'फरवरी', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुलाई', 'अगस्त', 'सितम्बर', 'अक्टूबर', 'नवम्बर', 'दिसम्बर'];

  /* ---------- text helpers ---------- */

  function str(v) {
    if (v === null || v === undefined) return '';
    return String(v);
  }

  function toAsciiDigits(s) {
    return str(s).replace(/[\u0966-\u096F]/g, function (c) {
      return String(c.charCodeAt(0) - 0x0966);
    });
  }

  /**
   * Normalise text for forgiving search:
   * - Devanagari digits → ASCII, Latin lower-case without accents
   * - nukta removed (ड़ → ड, क़ → क), chandrabindu ँ → anusvara ं
   * - half nasal + consonant → anusvara (सम्बन्ध ≈ संबंध, प्रमण्डल ≈ प्रमंडल)
   * - zero-width joiners and punctuation removed, spaces collapsed
   */
  function normalizeSearch(s) {
    var t = toAsciiDigits(s).normalize('NFD');
    t = t.replace(/\u093C/g, '');
    t = t.replace(/\u0901/g, '\u0902');
    t = t.replace(/[\u0919\u091E\u0923\u0928\u092E]\u094D(?=[\u0915-\u0939])/g, '\u0902');
    t = t.replace(/[\u200B-\u200D\uFEFF\u00AD]/g, '');
    t = t.replace(/[\u0300-\u036f]/g, '');
    t = t.toLowerCase();
    t = t.replace(/[.,;:()[\]{}"'`’‘“”/\\\-_|!?।॥*+=<>#&~@%^$]/g, ' ');
    t = t.replace(/\s+/g, ' ').trim();
    return t;
  }

  /* ---------- dates ---------- */

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function daysInMonth(y, m) {
    return new Date(Date.UTC(y, m, 0)).getUTCDate();
  }

  function validParts(y, m, d) {
    if (!(y >= 1800 && y <= 2200)) return false;
    if (m !== undefined && m !== null && !(m >= 1 && m <= 12)) return false;
    if (d !== undefined && d !== null && !(d >= 1 && d <= daysInMonth(y, m))) return false;
    return true;
  }

  function fromExcelSerial(serial) {
    if (!(serial > 0 && serial < 200000)) return null;
    var whole = Math.floor(serial);
    // Excel's 1900 date system treats 1900 as a leap year (serial 60 = 29.02.1900, which never existed)
    var base = whole < 60 ? Date.UTC(1899, 11, 31) : Date.UTC(1899, 11, 30);
    var dt = new Date(base + whole * 86400000);
    return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate(), precision: 'day' };
  }

  function expandYear(y) {
    if (y.length === 2) {
      var n = parseInt(y, 10);
      return n <= 50 ? 2000 + n : 1900 + n;
    }
    return parseInt(y, 10);
  }

  var MONTH_WORDS = (function () {
    var en = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    var hi = [
      ['जनवरी'], ['फरवरी', 'फ़रवरी'], ['मार्च'], ['अप्रैल', 'अप्रेल'], ['मई'], ['जून'],
      ['जुलाई'], ['अगस्त'], ['सितम्बर', 'सितंबर'], ['अक्टूबर', 'अक्तूबर'], ['नवम्बर', 'नवंबर'], ['दिसम्बर', 'दिसंबर']
    ];
    var map = {};
    en.forEach(function (w, i) { map[w] = i + 1; });
    ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
      .forEach(function (w, i) { map[w] = i + 1; });
    map.sept = 9;
    hi.forEach(function (ws, i) { ws.forEach(function (w) { map[normalizeSearch(w)] = i + 1; }); });
    return map;
  })();

  /**
   * Parse a date. Always day before month (DD.MM.YYYY), never MM/DD.
   * Accepts: 12.08.2026, 12/08/2026, 12-08-2026, 12.8.26, 12082026, 2026-08-12,
   * 08.2026 / 8/2026 / 2026-08 (month only), 2026 (year only), "12 Aug 2026", "अगस्त 2026",
   * Excel serial numbers (number or 5-digit string) and JS Date objects.
   * Returns {y, m, d, precision: 'day'|'month'|'year'} or null.
   */
  function parseDate(input) {
    if (input === null || input === undefined) return null;
    if (input instanceof Date) {
      if (isNaN(input.getTime())) return null;
      return { y: input.getFullYear(), m: input.getMonth() + 1, d: input.getDate(), precision: 'day' };
    }
    if (typeof input === 'number') return fromExcelSerial(input);
    var s = toAsciiDigits(input).trim();
    s = s.replace(/\(?\s*(लगभग|approx\.?|approximately|circa|c\.)\s*\)?/gi, ' ').replace(/\s+/g, ' ').trim();
    s = s.replace(/^(दिनांक|दि\.|dt\.?|date)\s*[:\-]?\s*/i, '').trim();
    if (!s) return null;
    var m;
    var res = null;
    if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/))) {
      res = { y: +m[1], m: +m[2], d: +m[3], precision: 'day' };
    } else if ((m = s.match(/^(\d{1,2})\s*[.\/\-]\s*(\d{1,2})\s*[.\/\-]\s*(\d{4}|\d{2})$/)) ||
               (m = s.match(/^(\d{1,2}) (\d{1,2}) (\d{4})$/))) {
      res = { y: expandYear(m[3]), m: +m[2], d: +m[1], precision: 'day' };
    } else if ((m = s.match(/^(\d{2})(\d{2})(\d{4})$/))) {
      res = { y: +m[3], m: +m[2], d: +m[1], precision: 'day' };
    } else if ((m = s.match(/^(\d{5})(\.\d+)?$/))) {
      return fromExcelSerial(parseFloat(s));
    } else if ((m = s.match(/^(\d{1,2})\s*[.\/\-]\s*(\d{4})$/))) {
      res = { y: +m[2], m: +m[1], precision: 'month' };
    } else if ((m = s.match(/^(\d{4})\s*[.\/\-]\s*(\d{1,2})$/))) {
      res = { y: +m[1], m: +m[2], precision: 'month' };
    } else if ((m = s.match(/^(\d{4})$/))) {
      res = { y: +m[1], precision: 'year' };
    } else {
      // month names: "12 Aug 2026", "Aug 12, 2026", "अगस्त 2026", "12 अगस्त, 2026"
      var words = normalizeSearch(s).split(' ');
      var day = null, mon = null, year = null;
      for (var i = 0; i < words.length; i++) {
        var w = words[i];
        if (/^\d{4}$/.test(w) && year === null) year = +w;
        else if (/^\d{1,2}(st|nd|rd|th)?$/.test(w) && day === null) day = parseInt(w, 10);
        else if (MONTH_WORDS[w] && mon === null) mon = MONTH_WORDS[w];
        else return null;
      }
      if (year === null || mon === null) return null;
      res = day !== null ? { y: year, m: mon, d: day, precision: 'day' } : { y: year, m: mon, precision: 'month' };
    }
    if (!res) return null;
    if (!validParts(res.y, res.m, res.d)) return null;
    return res;
  }

  function formatDate(p) {
    if (!p) return '';
    if (p.precision === 'year') return String(p.y);
    if (p.precision === 'month') return pad2(p.m) + '.' + p.y;
    return pad2(p.d) + '.' + pad2(p.m) + '.' + p.y;
  }

  /** Canonical stored form: "DD.MM.YYYY", "MM.YYYY" or "YYYY"; '' when empty/invalid. */
  function normalizeDate(input) {
    return formatDate(parseDate(input));
  }

  function isPartialDate(s) {
    var p = parseDate(s);
    return !!p && p.precision !== 'day';
  }

  /** Display form: full dates as DD.MM.YYYY, partial ones as "अगस्त 2026 (लगभग)" / "2026 (लगभग)". */
  function displayDate(s) {
    var p = parseDate(s);
    if (!p) return str(s);
    if (p.precision === 'day') return formatDate(p);
    if (p.precision === 'month') return HINDI_MONTHS[p.m - 1] + ' ' + p.y + ' ' + APPROX;
    return p.y + ' ' + APPROX;
  }

  var NO_DATE_KEY = 99999999;

  /** Sort key YYYYMMDD; missing month/day count as 00 so that "2026 (लगभग)" comes before dated letters of 2026. */
  function dateKey(s) {
    var p = typeof s === 'object' && s && s.y ? s : parseDate(s);
    if (!p) return NO_DATE_KEY;
    return p.y * 10000 + (p.m || 0) * 100 + (p.d || 0);
  }

  /** [first, last] YYYYMMDD keys covered by a (possibly partial) date. */
  function dateSpan(s) {
    var p = parseDate(s);
    if (!p) return null;
    if (p.precision === 'year') return [p.y * 10000 + 101, p.y * 10000 + 1231];
    if (p.precision === 'month') return [p.y * 10000 + p.m * 100 + 1, p.y * 10000 + p.m * 100 + daysInMonth(p.y, p.m)];
    var k = dateKey(p);
    return [k, k];
  }

  function todayKey(now) {
    var d = now || new Date();
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  }

  function todayString(now) {
    var d = now || new Date();
    return pad2(d.getDate()) + '.' + pad2(d.getMonth() + 1) + '.' + d.getFullYear();
  }

  function keyToDate(k) {
    return new Date(Math.floor(k / 10000), Math.floor(k / 100) % 100 - 1, k % 100);
  }

  function daysBetweenKeys(a, b) {
    return Math.round((keyToDate(b) - keyToDate(a)) / 86400000);
  }

  /* ---------- entries ---------- */

  var idCounter = 0;
  function newId() {
    idCounter = (idCounter + 1) % 1296;
    return 'e' + Date.now().toString(36) + Math.floor(Math.random() * 46656).toString(36) + idCounter.toString(36);
  }

  var TEXT_FIELDS = ['letterNo', 'from', 'to', 'subject', 'refsText', 'summary', 'action', 'fileLocation', 'remarks'];

  function uniqueStrings(list) {
    var seen = {};
    var out = [];
    (list || []).forEach(function (v) {
      var t = str(v).trim();
      if (t && !seen[t]) { seen[t] = 1; out.push(t); }
    });
    return out;
  }

  /** Fill defaults and coerce types so every stored entry has the same shape. */
  function sanitizeEntry(e, now) {
    e = e || {};
    var ts = (now || new Date()).toISOString();
    var out = {
      id: str(e.id) || newId(),
      type: TYPES[e.type] ? e.type : 'in',
      date: normalizeDate(e.date) || '',
      receivedDate: normalizeDate(e.receivedDate) || '',
      refIds: uniqueStrings(e.refIds),
      matters: uniqueStrings(e.matters),
      dueDate: normalizeDate(e.dueDate) || '',
      status: STATUSES[e.status] ? e.status : 'info',
      replyId: str(e.replyId),
      sample: !!e.sample,
      createdAt: str(e.createdAt) || ts,
      updatedAt: str(e.updatedAt) || str(e.createdAt) || ts
    };
    TEXT_FIELDS.forEach(function (f) { out[f] = str(e[f]).trim(); });
    return out;
  }

  function compareEntries(a, b) {
    var d = dateKey(a.date) - dateKey(b.date);
    if (d) return d;
    d = dateKey(a.receivedDate) - dateKey(b.receivedDate);
    if (d) return d;
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
    return str(a.letterNo).localeCompare(str(b.letterNo));
  }

  function sortEntries(entries, desc) {
    var out = entries.slice().sort(compareEntries);
    if (desc) out.reverse();
    return out;
  }

  function typeLabel(t) { var x = TYPES[t]; return x ? x.hi + ' / ' + x.en : ''; }
  function statusLabel(s) { var x = STATUSES[s]; return x ? x.hi + ' / ' + x.en : ''; }

  function searchText(e) {
    var parts = [e.letterNo, e.from, e.to, e.subject, e.refsText, e.summary, e.action, e.fileLocation, e.remarks,
      e.date, displayDate(e.date), e.receivedDate, e.dueDate, typeLabel(e.type), statusLabel(e.status),
      (e.matters || []).join(' '), e.sample ? 'नमूना sample' : ''];
    return normalizeSearch(parts.join(' \u0001 '));
  }

  function matchesQuery(e, query) {
    var q = normalizeSearch(query);
    if (!q) return true;
    var hay = e._search || searchText(e);
    return q.split(' ').every(function (tok) { return hay.indexOf(tok) !== -1; });
  }

  function overlapsRange(dateStr, fromKey, toKey) {
    if (!fromKey && !toKey) return true;
    var span = dateSpan(dateStr);
    if (!span) return false;
    if (fromKey && span[1] < fromKey) return false;
    if (toKey && span[0] > toKey) return false;
    return true;
  }

  /** filters: {q, type, matter, status, dateFrom, dateTo, from, to} */
  function filterEntries(entries, f) {
    f = f || {};
    var fromKey = f.dateFrom ? dateSpan(f.dateFrom) : null;
    var toKey = f.dateTo ? dateSpan(f.dateTo) : null;
    var fromQ = normalizeSearch(f.from);
    var toQ = normalizeSearch(f.to);
    return entries.filter(function (e) {
      if (f.type && e.type !== f.type) return false;
      if (f.status && e.status !== f.status) return false;
      if (f.matter && (e.matters || []).indexOf(f.matter) === -1) return false;
      if (fromQ && normalizeSearch(e.from).indexOf(fromQ) === -1) return false;
      if (toQ && normalizeSearch(e.to).indexOf(toQ) === -1) return false;
      if ((fromKey || toKey) && !overlapsRange(e.date, fromKey && fromKey[0], toKey && toKey[1])) return false;
      if (f.q && !matchesQuery(e, f.q)) return false;
      return true;
    });
  }

  /* ---------- pending ---------- */

  /** Pending items grouped: overdue, due within 7 days, other pending. */
  function pendingGroups(entries, now) {
    var tk = todayKey(now);
    var groups = { overdue: [], soon: [], later: [] };
    entries.forEach(function (e) {
      if (e.status !== 'pending') return;
      var p = parseDate(e.dueDate);
      if (!p || p.precision !== 'day') { groups.later.push(e); return; }
      var days = daysBetweenKeys(tk, dateKey(p));
      if (days < 0) groups.overdue.push(e);
      else if (days <= 7) groups.soon.push(e);
      else groups.later.push(e);
    });
    var byDue = function (a, b) { return dateKey(a.dueDate) - dateKey(b.dueDate) || compareEntries(a, b); };
    groups.overdue.sort(byDue);
    groups.soon.sort(byDue);
    groups.later.sort(byDue);
    return groups;
  }

  function daysUntil(dateStr, now) {
    var p = parseDate(dateStr);
    if (!p || p.precision !== 'day') return null;
    return daysBetweenKeys(todayKey(now), dateKey(p));
  }

  /* ---------- chronology ---------- */

  var CHRONO_COLUMNS = [
    { key: 'sn', label: 'क्रम सं.' },
    { key: 'date', label: 'दिनांक' },
    { key: 'letterNo', label: 'पत्रांक' },
    { key: 'fromTo', label: 'प्रेषक → प्राप्तकर्ता' },
    { key: 'subject', label: 'विषय / सार' },
    { key: 'remarks', label: 'अभ्युक्ति' }
  ];

  function fromToText(e) {
    var a = str(e.from).trim(), b = str(e.to).trim();
    if (a && b) return a + ' → ' + b;
    if (a) return a + ' →';
    if (b) return '→ ' + b;
    return '';
  }

  /**
   * Build a numbered, date-ordered chronology.
   * opts: {matter, ids (restrict to these entries), dateFrom, dateTo, includeSummary, columns (keys), title}
   */
  function buildChronology(entries, opts) {
    opts = opts || {};
    var list = entries;
    if (opts.ids) {
      var idset = {};
      opts.ids.forEach(function (id) { idset[id] = 1; });
      list = list.filter(function (e) { return idset[e.id]; });
    }
    if (opts.matter) list = list.filter(function (e) { return (e.matters || []).indexOf(opts.matter) !== -1; });
    var fk = opts.dateFrom ? dateSpan(opts.dateFrom) : null;
    var tk = opts.dateTo ? dateSpan(opts.dateTo) : null;
    if (fk || tk) list = list.filter(function (e) { return overlapsRange(e.date, fk && fk[0], tk && tk[1]); });
    list = sortEntries(list);
    var keys = opts.columns && opts.columns.length ? opts.columns : CHRONO_COLUMNS.map(function (c) { return c.key; });
    var columns = CHRONO_COLUMNS.filter(function (c) { return keys.indexOf(c.key) !== -1; });
    var rows = list.map(function (e, i) {
      var subj = str(e.subject);
      if (opts.includeSummary && e.summary) subj = subj ? subj + '\n' + e.summary : e.summary;
      var full = {
        sn: String(i + 1) + '.',
        date: displayDate(e.date),
        letterNo: e.letterNo || (e.type === 'event' ? TYPES.event.hi : ''),
        fromTo: fromToText(e),
        subject: subj,
        remarks: str(e.remarks)
      };
      return { id: e.id, cells: columns.map(function (c) { return full[c.key]; }) };
    });
    var title = 'घटनाक्रम — ' + (opts.title || opts.matter || 'चयनित पत्र');
    return { title: title, columns: columns, rows: rows };
  }

  /* ---------- annexure ---------- */

  function annexureLines(entries, startAt) {
    var n = startAt || 1;
    return entries.map(function (e, i) {
      var parts = [];
      if (e.letterNo) parts.push('पत्रांक ' + e.letterNo);
      if (e.date) parts.push('दिनांक ' + displayDate(e.date));
      var line = 'अनुलग्नक-' + (n + i) + ': ' + parts.join(' ');
      if (e.subject) line += (parts.length ? ' ' : '') + '(' + e.subject + ')';
      return line;
    });
  }

  /* ---------- matters (tags) ---------- */

  function allMatters(entries) {
    var counts = {};
    entries.forEach(function (e) {
      (e.matters || []).forEach(function (m) { counts[m] = (counts[m] || 0) + 1; });
    });
    return Object.keys(counts).sort(function (a, b) { return a.localeCompare(b, 'hi'); })
      .map(function (m) { return { name: m, count: counts[m] }; });
  }

  /** Rename a matter tag (or merge it into an existing one). Returns the entries that changed (already updated copies). */
  function renameMatter(entries, oldName, newName, now) {
    newName = str(newName).trim();
    var changed = [];
    entries.forEach(function (e) {
      var idx = (e.matters || []).indexOf(oldName);
      if (idx === -1) return;
      var ms = e.matters.slice();
      if (newName) ms[idx] = newName; else ms.splice(idx, 1);
      var copy = Object.assign({}, e, { matters: uniqueStrings(ms), updatedAt: (now || new Date()).toISOString() });
      changed.push(copy);
    });
    return changed;
  }

  /** Values for autocomplete, most used first. */
  function distinctValues(entries, field) {
    var counts = {};
    entries.forEach(function (e) {
      var v = str(e[field]).trim();
      if (v) counts[v] = (counts[v] || 0) + 1;
    });
    return Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a] || a.localeCompare(b); });
  }

  /* ---------- CSV ---------- */

  function csvCell(v) {
    var s = str(v);
    if (/[",\r\n]/.test(s) || /^\s|\s$/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function toCSV(rows) {
    return '\uFEFF' + rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n') + '\r\n';
  }

  function parseCSV(text) {
    text = str(text).replace(/^\uFEFF/, '');
    var firstLine = text.split(/\r?\n/)[0] || '';
    var delim = ',';
    var counts = { ',': 0, ';': 0, '\t': 0 };
    var inQ = false;
    for (var k = 0; k < firstLine.length; k++) {
      var ch = firstLine[k];
      if (ch === '"') inQ = !inQ;
      else if (!inQ && counts[ch] !== undefined) counts[ch]++;
    }
    if (counts['\t'] > counts[','] && counts['\t'] >= counts[';']) delim = '\t';
    else if (counts[';'] > counts[',']) delim = ';';
    var rows = [], row = [], cell = '', i = 0, quoted = false;
    while (i < text.length) {
      var c = text[i];
      if (quoted) {
        if (c === '"') {
          if (text[i + 1] === '"') { cell += '"'; i += 2; continue; }
          quoted = false; i++; continue;
        }
        cell += c; i++; continue;
      }
      if (c === '"' && cell === '') { quoted = true; i++; continue; }
      if (c === delim) { row.push(cell); cell = ''; i++; continue; }
      if (c === '\r' || c === '\n') {
        row.push(cell); rows.push(row); row = []; cell = '';
        if (c === '\r' && text[i + 1] === '\n') i++;
        i++; continue;
      }
      cell += c; i++;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (x) { return str(x).trim() !== ''; }); });
  }

  /* ---------- export rows ---------- */

  var EXPORT_FIELDS = [
    { key: 'type', label: 'प्रकार / Type' },
    { key: 'letterNo', label: 'पत्रांक / Letter no.' },
    { key: 'date', label: 'दिनांक / Date' },
    { key: 'receivedDate', label: 'प्राप्ति / प्रेषण तिथि / Received or sent' },
    { key: 'from', label: 'प्रेषक / From' },
    { key: 'to', label: 'प्राप्तकर्ता / To' },
    { key: 'subject', label: 'विषय / Subject' },
    { key: 'refsText', label: 'प्रसंग / References' },
    { key: 'matters', label: 'मामला / Matter' },
    { key: 'summary', label: 'सार / Summary' },
    { key: 'action', label: 'कार्रवाई / Action required' },
    { key: 'dueDate', label: 'समय-सीमा / Due date' },
    { key: 'status', label: 'स्थिति / Status' },
    { key: 'reply', label: 'उत्तर / Reply' },
    { key: 'fileLocation', label: 'फ़ाइल स्थान / File location' },
    { key: 'remarks', label: 'अभ्युक्ति / Remarks' }
  ];

  function shortRef(e) {
    if (!e) return '';
    var s = e.letterNo ? e.letterNo : TYPES[e.type].hi;
    if (e.date) s += ' दि. ' + displayDate(e.date);
    return s;
  }

  function exportRows(entries) {
    var byId = {};
    entries.forEach(function (e) { byId[e.id] = e; });
    var rows = [EXPORT_FIELDS.map(function (f) { return f.label; })];
    sortEntries(entries).forEach(function (e) {
      rows.push(EXPORT_FIELDS.map(function (f) {
        switch (f.key) {
          case 'type': return TYPES[e.type].hi;
          case 'status': return STATUSES[e.status].hi;
          case 'matters': return (e.matters || []).join('; ');
          case 'reply': return e.replyId ? shortRef(byId[e.replyId]) : '';
          case 'refsText':
            var linked = (e.refIds || []).map(function (id) { return shortRef(byId[id]); }).filter(Boolean);
            return [e.refsText].concat(linked).filter(Boolean).join('; ');
          default: return str(e[f.key]);
        }
      }));
    });
    return rows;
  }

  /* ---------- import ---------- */

  var IMPORT_FIELDS = [
    { key: 'type', label: 'प्रकार / Type', syn: ['प्रकार', 'type', 'आवक जावक', 'in out', 'kind'] },
    { key: 'letterNo', label: 'पत्रांक / Letter no.', syn: ['पत्रांक', 'पत्र संख्या', 'पत्र सं', 'ज्ञापांक', 'letter no', 'letter number', 'ref no', 'number', 'no'] },
    { key: 'date', label: 'दिनांक / Date', syn: ['दिनांक', 'तिथि', 'तारीख', 'date', 'letter date', 'dated'] },
    { key: 'receivedDate', label: 'प्राप्ति / प्रेषण तिथि', syn: ['प्राप्ति तिथि', 'प्राप्ति', 'प्रेषण तिथि', 'प्रेषण', 'received', 'received date', 'dispatch', 'dispatch date', 'sent date'] },
    { key: 'from', label: 'प्रेषक / From', syn: ['प्रेषक', 'से', 'from', 'sender'] },
    { key: 'to', label: 'प्राप्तकर्ता / To', syn: ['प्राप्तकर्ता', 'सेवा में', 'को', 'to', 'addressee', 'recipient'] },
    { key: 'subject', label: 'विषय / Subject', syn: ['विषय', 'subject'] },
    { key: 'refsText', label: 'प्रसंग / References', syn: ['प्रसंग', 'संदर्भ', 'reference', 'references', 'ref'] },
    { key: 'matters', label: 'मामला / Matter', syn: ['मामला', 'मामले', 'matter', 'matters', 'tag', 'tags', 'case', 'file subject'] },
    { key: 'summary', label: 'सार / Summary', syn: ['सार', 'सारांश', 'summary', 'gist', 'contents'] },
    { key: 'action', label: 'कार्रवाई / Action', syn: ['कार्रवाई', 'कार्यवाही', 'action', 'action required'] },
    { key: 'dueDate', label: 'समय-सीमा / Due date', syn: ['समय सीमा', 'समयसीमा', 'due', 'due date', 'deadline'] },
    { key: 'status', label: 'स्थिति / Status', syn: ['स्थिति', 'status'] },
    { key: 'fileLocation', label: 'फ़ाइल स्थान / File location', syn: ['फ़ाइल स्थान', 'फाइल', 'संचिका', 'file', 'file no', 'file location', 'location', 'path'] },
    { key: 'remarks', label: 'अभ्युक्ति / Remarks', syn: ['अभ्युक्ति', 'टिप्पणी', 'remarks', 'remark', 'notes', 'note'] }
  ];

  /** Guess a column → field mapping from header texts. Returns array (one per column) of field key or ''. */
  function guessMapping(headers) {
    var used = {};
    var result = headers.map(function () { return ''; });
    var normHeaders = headers.map(function (h) { return normalizeSearch(h); });
    // pass 1: exact synonym match; pass 2: header contains synonym (longest synonyms first)
    [true, false].forEach(function (exact) {
      normHeaders.forEach(function (h, col) {
        if (result[col] || !h) return;
        var best = null, bestLen = 0;
        IMPORT_FIELDS.forEach(function (f) {
          if (used[f.key]) return;
          f.syn.concat([f.label]).forEach(function (syn) {
            var ns = normalizeSearch(syn);
            if (!ns) return;
            var hit = exact ? h === ns : (ns.length >= 3 && (' ' + h + ' ').indexOf(' ' + ns + ' ') !== -1);
            if (hit && ns.length > bestLen) { best = f.key; bestLen = ns.length; }
          });
        });
        if (best) { result[col] = best; used[best] = 1; }
      });
    });
    return result;
  }

  function mapType(v) {
    var n = normalizeSearch(v);
    if (!n) return null;
    if (/^(आवक|in|incoming|inward|received|प्राप्त)(?![a-z])/.test(n)) return 'in';
    if (/^(जावक|out|outgoing|outward|sent|dispatch|dispatched|प्रेषित)(?![a-z])/.test(n)) return 'out';
    if (/^(घटना|event|meeting|बैठक|निरीक्षण|inspection|order|आदेश|notification|अधिसूचना)(?![a-z])/.test(n)) return 'event';
    return null;
  }

  function mapStatus(v) {
    var n = normalizeSearch(v);
    if (!n) return null;
    if (/^(लंबित|pending|open)(?![a-z])/.test(n)) return 'pending';
    if (/^(उत्तर|replied|reply|answered)(?![a-z])/.test(n)) return 'replied';
    if (/^(बंद|closed|close|done|disposed|निष्पादित)(?![a-z])/.test(n)) return 'closed';
    if (/^(सूचना|सूचनार्थ|info|information|for info|for information|fyi)(?![a-z])/.test(n)) return 'info';
    return null;
  }

  /**
   * Turn spreadsheet rows into entries.
   * rows: array of arrays (first row = headers when hasHeader); mapping: array of field keys per column.
   * Returns {entries, problems: [{row, message}]} — row numbers are 1-based spreadsheet rows.
   */
  function mapImportRows(rows, mapping, opts) {
    opts = opts || {};
    var start = opts.hasHeader === false ? 0 : 1;
    var now = opts.now || new Date();
    var entries = [], problems = [];
    for (var r = start; r < rows.length; r++) {
      var row = rows[r] || [];
      if (!row.some(function (c) { return str(c).trim() !== ''; })) continue;
      var e = { matters: [], refIds: [] };
      var notes = [];
      mapping.forEach(function (field, col) {
        if (!field) return;
        var raw = row[col];
        var text = raw instanceof Date ? '' : str(raw).trim();
        if (raw === null || raw === undefined || (text === '' && !(raw instanceof Date))) return;
        switch (field) {
          case 'date': case 'receivedDate': case 'dueDate':
            var p = parseDate(raw);
            if (p) e[field] = formatDate(p);
            else {
              problems.push({ row: r + 1, message: 'दिनांक समझ नहीं आया / Date not understood: "' + text + '"' });
              notes.push('मूल ' + field + ': ' + text);
            }
            break;
          case 'type':
            var t = mapType(raw);
            if (t) e.type = t; else problems.push({ row: r + 1, message: 'प्रकार अज्ञात / Unknown type: "' + text + '" → आवक' });
            break;
          case 'status':
            var s = mapStatus(raw);
            if (s) e.status = s; else problems.push({ row: r + 1, message: 'स्थिति अज्ञात / Unknown status: "' + text + '" → सूचनार्थ' });
            break;
          case 'matters':
            e.matters = e.matters.concat(text.split(/[;,|\n]/));
            break;
          default:
            e[field] = e[field] ? e[field] + '\n' + text : text;
        }
      });
      if (opts.extraMatter) e.matters.push(opts.extraMatter);
      if (notes.length) e.remarks = [e.remarks].concat(notes).filter(Boolean).join('\n');
      if (!e.type) e.type = opts.defaultType || 'in';
      if (!e.status) e.status = opts.defaultStatus || 'info';
      e.createdAt = new Date(now.getTime() + entries.length).toISOString();
      entries.push(sanitizeEntry(e, now));
    }
    return { entries: entries, problems: problems };
  }

  /* ---------- backup ---------- */

  function stripInternal(e) {
    var o = {};
    Object.keys(e).forEach(function (k) { if (k.charAt(0) !== '_') o[k] = e[k]; });
    return o;
  }

  function makeBackup(entries, settings, now) {
    return {
      app: APP_ID,
      version: BACKUP_VERSION,
      exportedAt: (now || new Date()).toISOString(),
      count: entries.length,
      settings: settings || {},
      entries: entries.map(stripInternal)
    };
  }

  function serializeBackup(entries, settings, now) {
    return JSON.stringify(makeBackup(entries, settings, now), null, 1);
  }

  /** Parse and validate a backup file. Returns {ok, entries, settings, exportedAt, error}. */
  function parseBackup(text) {
    var data;
    try {
      data = typeof text === 'string' ? JSON.parse(text.replace(/^\uFEFF/, '')) : text;
    } catch (err) {
      return { ok: false, error: 'यह फ़ाइल सही बैकअप (JSON) नहीं है / Not a valid backup file' };
    }
    var list = Array.isArray(data) ? data : data && data.entries;
    if (!Array.isArray(list)) return { ok: false, error: 'फ़ाइल में पत्र नहीं मिले / No entries found in file' };
    if (!Array.isArray(data) && data.app && data.app !== APP_ID) {
      return { ok: false, error: 'यह किसी अन्य ऐप का बैकअप है / Backup belongs to another app (' + data.app + ')' };
    }
    var seen = {};
    var entries = [];
    list.forEach(function (raw) {
      if (!raw || typeof raw !== 'object') return;
      var e = sanitizeEntry(raw);
      if (seen[e.id]) e.id = newId();
      seen[e.id] = 1;
      entries.push(e);
    });
    return {
      ok: true,
      entries: entries,
      settings: (!Array.isArray(data) && data.settings && typeof data.settings === 'object') ? data.settings : {},
      exportedAt: Array.isArray(data) ? '' : str(data.exportedAt)
    };
  }

  /** Short description of a set of entries, for restore/import previews. */
  function summarize(entries) {
    var s = { total: entries.length, in: 0, out: 0, event: 0, samples: 0, first: '', last: '', matters: 0 };
    var sorted = sortEntries(entries.filter(function (e) { return e.date; }));
    entries.forEach(function (e) { s[e.type]++; if (e.sample) s.samples++; });
    if (sorted.length) { s.first = displayDate(sorted[0].date); s.last = displayDate(sorted[sorted.length - 1].date); }
    s.matters = allMatters(entries).length;
    return s;
  }

  /** Merge backup entries into current ones: same id → newer updatedAt wins. */
  function mergeEntries(current, incoming) {
    var byId = {};
    current.forEach(function (e) { byId[e.id] = e; });
    var added = 0, updated = 0;
    incoming.forEach(function (e) {
      var old = byId[e.id];
      if (!old) { byId[e.id] = e; added++; }
      else if (str(e.updatedAt) > str(old.updatedAt)) { byId[e.id] = e; updated++; }
    });
    return { entries: Object.keys(byId).map(function (k) { return byId[k]; }), added: added, updated: updated };
  }

  /* ---------- samples ---------- */

  function makeSamples(now) {
    now = now || new Date();
    var y = now.getFullYear();
    var tk = todayKey(now);
    var plus = function (days) {
      var d = keyToDate(tk); d.setDate(d.getDate() + days);
      return pad2(d.getDate()) + '.' + pad2(d.getMonth() + 1) + '.' + d.getFullYear();
    };
    var M1 = 'नमूना — भू-अर्जन (काल्पनिक गाँव)';
    var M2 = 'नमूना — बकाया वसूली';
    var tag = '[नमूना / SAMPLE] ';
    var raw = [
      { id: 'sample-1', type: 'event', date: String(y - 2), from: 'काल्पनिक अंचल कार्यालय', to: '', subject: tag + 'भू-अर्जन प्रस्ताव पर प्रारंभिक संयुक्त निरीक्षण', matters: [M1], summary: 'लगभग 4.50 एकड़ भूमि चिन्हित (काल्पनिक आँकड़े)', status: 'info', remarks: 'पुराना अभिलेख, सटीक तिथि उपलब्ध नहीं' },
      { id: 'sample-2', type: 'in', letterNo: 'नमूना-101/' + (y - 1), date: '15.03.' + (y - 1), receivedDate: '18.03.' + (y - 1), from: 'उपायुक्त, काल्पनिक जिला', to: 'कार्यपालक अभियंता, नमूना प्रमण्डल', subject: tag + 'भू-अर्जन हेतु प्राक्कलन की माँग', matters: [M1], summary: 'राशि रु. 12,34,000/- का प्राक्कलन 15 दिनों में माँगा गया (काल्पनिक)', status: 'replied', replyId: 'sample-3', fileLocation: 'संचिका नमूना-7, पृष्ठ 12' },
      { id: 'sample-3', type: 'out', letterNo: 'नमूना-202/' + (y - 1), date: '28.03.' + (y - 1), from: 'कार्यपालक अभियंता, नमूना प्रमण्डल', to: 'उपायुक्त, काल्पनिक जिला', subject: tag + 'भू-अर्जन प्राक्कलन का प्रेषण', refIds: ['sample-2'], refsText: 'आपका पत्रांक नमूना-101', matters: [M1], status: 'closed', fileLocation: 'C:\\Users\\Example\\Documents\\Sample\\letter-202.pdf' },
      { id: 'sample-4', type: 'event', date: '07.' + (y - 1), from: 'अधीक्षण अभियंता, नमूना अंचल', subject: tag + 'समीक्षा बैठक — भू-अर्जन की प्रगति', matters: [M1], summary: 'बैठक में शेष 1.20 एकड़ हेतु प्रस्ताव शीघ्र भेजने का निर्देश (काल्पनिक)', status: 'info' },
      { id: 'sample-5', type: 'in', letterNo: 'नमूना-55/' + y, date: plus(-20), from: 'महालेखाकार कार्यालय (काल्पनिक)', to: 'कार्यपालक अभियंता, नमूना प्रमण्डल', subject: tag + 'बकाया राशि की वसूली संबंधी अनुपालन', matters: [M2], summary: 'बकाया रु. 56,780/- (काल्पनिक) की वसूली का प्रतिवेदन', action: 'अनुपालन प्रतिवेदन भेजना', dueDate: plus(-3), status: 'pending' },
      { id: 'sample-6', type: 'in', letterNo: 'नमूना-77/' + y, date: plus(-6), from: 'मुख्य अभियंता (काल्पनिक)', to: 'कार्यपालक अभियंता, नमूना प्रमण्डल', subject: tag + 'जलाशय स्तर का साप्ताहिक प्रतिवेदन', matters: [M2, M1], summary: 'जल स्तर 250.50 मी. (काल्पनिक)', action: 'प्रतिवेदन भेजें', dueDate: plus(4), status: 'pending' },
      { id: 'sample-7', type: 'out', letterNo: 'नमूना-303/' + y, date: plus(-2), from: 'कार्यपालक अभियंता, नमूना प्रमण्डल', to: 'सभी सहायक अभियंता (काल्पनिक)', subject: tag + 'स्थल निरीक्षण कार्यक्रम की सूचना', matters: [M2], status: 'info', remarks: 'प्रतिलिपि सूचनार्थ' }
    ];
    return raw.map(function (e, i) {
      e.sample = true;
      e.createdAt = new Date(now.getTime() + i).toISOString();
      return sanitizeEntry(e, now);
    });
  }

  return {
    APP_ID: APP_ID,
    TYPES: TYPES,
    STATUSES: STATUSES,
    DEFAULT_OFFICE_LINE: DEFAULT_OFFICE_LINE,
    HINDI_MONTHS: HINDI_MONTHS,
    CHRONO_COLUMNS: CHRONO_COLUMNS,
    EXPORT_FIELDS: EXPORT_FIELDS,
    IMPORT_FIELDS: IMPORT_FIELDS,
    NO_DATE_KEY: NO_DATE_KEY,
    toAsciiDigits: toAsciiDigits,
    normalizeSearch: normalizeSearch,
    parseDate: parseDate,
    formatDate: formatDate,
    normalizeDate: normalizeDate,
    isPartialDate: isPartialDate,
    displayDate: displayDate,
    dateKey: dateKey,
    dateSpan: dateSpan,
    todayKey: todayKey,
    todayString: todayString,
    daysUntil: daysUntil,
    newId: newId,
    sanitizeEntry: sanitizeEntry,
    compareEntries: compareEntries,
    sortEntries: sortEntries,
    typeLabel: typeLabel,
    statusLabel: statusLabel,
    searchText: searchText,
    matchesQuery: matchesQuery,
    filterEntries: filterEntries,
    pendingGroups: pendingGroups,
    buildChronology: buildChronology,
    fromToText: fromToText,
    annexureLines: annexureLines,
    allMatters: allMatters,
    renameMatter: renameMatter,
    distinctValues: distinctValues,
    shortRef: shortRef,
    toCSV: toCSV,
    parseCSV: parseCSV,
    exportRows: exportRows,
    guessMapping: guessMapping,
    mapType: mapType,
    mapStatus: mapStatus,
    mapImportRows: mapImportRows,
    makeBackup: makeBackup,
    serializeBackup: serializeBackup,
    parseBackup: parseBackup,
    summarize: summarize,
    mergeEntries: mergeEntries,
    makeSamples: makeSamples
  };
});
