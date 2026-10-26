/* CSV for Excel: RFC 4180 quoting, CRLF line ends. The UI adds a UTF-8 BOM
 * when downloading so Excel shows Hindi text correctly. */
(function (root, factory) {
  var m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else { root.DS = root.DS || {}; root.DS.csv = m; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function cell(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return isFinite(v) ? String(Math.round(v * 1e6) / 1e6) : '';
    var s = String(v);
    if (/^[=+\-@]/.test(s) && !/^-?\d/.test(s)) s = "'" + s;   // no formula injection in Excel
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function toCSV(columns, rows) {
    var out = [];
    if (columns && columns.length) out.push(columns.map(cell).join(','));
    (rows || []).forEach(function (r) { out.push(r.map(cell).join(',')); });
    return out.join('\r\n') + '\r\n';
  }

  // Parse CSV text back to arrays (used by tests and for pasted CSV input).
  function parse(text) {
    var rows = [], row = [], cur = '', q = false, i = 0, s = String(text);
    for (; i < s.length; i++) {
      var c = s[i];
      if (q) {
        if (c === '"') { if (s[i + 1] === '"') { cur += '"'; i++; } else q = false; }
        else cur += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && s[i + 1] === '\n') i++;
        row.push(cur); rows.push(row); row = []; cur = '';
      } else cur += c;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows;
  }

  // A whole report (inputs, results, checks, tables) as one CSV.
  function reportCSV(title, inputsEcho, rep) {
    var out = [];
    out.push(toCSV([title], []));
    out.push(toCSV(['Inputs', 'Value', 'Unit'], inputsEcho.map(function (i) { return [i.label, i.value, i.unit]; })));
    out.push(toCSV(['Results', 'Value', 'Unit'], rep.results.map(function (r) { return [r.label, r.text, r.unit]; })));
    out.push(toCSV(['Check', 'Value', 'Limit', 'Status'], rep.checks.map(function (c) { return [c.label, c.value, c.limit, c.ok ? 'OK' : 'NOT OK']; })));
    rep.tables.forEach(function (t) { out.push(toCSV([t.title], [])); out.push(toCSV(t.columns, t.rows)); });
    return out.join('\r\n');
  }

  return { cell: cell, toCSV: toCSV, parse: parse, reportCSV: reportCSV };
});
