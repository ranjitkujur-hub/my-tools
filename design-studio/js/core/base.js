/* Core helpers shared by every module: number formatting, solvers,
 * parsing of pasted tables, and the Report builder that every design()
 * returns. No DOM access, so it runs in the browser (window.DS.base)
 * and in Node (require) for unit tests.
 *
 * How a module is written (see js/modules/*.js):
 *   page = { id, group, order, hi, en, refs, intro, inputs: [...],
 *            design(v) -> Report, drawings(v, rep) -> [{key, title, d: Drawing}],
 *            exports(v, rep) -> [{label, name, mime, text}] (optional) }
 *   Inputs: { sec: 'हिंदी / English' } starts a section;
 *           { key, hi, en, unit, def, min, max, step, type: 'number'|'select'|'text'|'textarea'|'check',
 *             options: [[value, label]], show: function (v) { return bool; }, help }
 */
(function (root, factory) {
  var m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else {
    root.DS = root.DS || {};
    root.DS.base = m;
    root.DS.modules = root.DS.modules || [];
    root.DS.register = function (mod) { root.DS.modules.push(mod); };
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var G = 9.81;            // m/s²
  var GAMMA_W = 9.81;      // kN/m³, unit weight of water

  var DISCLAIMER = 'प्रारंभिक डिज़ाइन सहायक — अंतिम डिज़ाइन सक्षम अभियंता द्वारा संबंधित IS/IRC कोड से जाँचें / ' +
    'Preliminary design aid — final design must be checked by a competent engineer against the relevant IS/IRC codes.';

  var GROUPS = [
    { id: 'A', hi: 'जल विज्ञान', en: 'Hydrology' },
    { id: 'B', hi: 'नहर', en: 'Canals' },
    { id: 'C', hi: 'जलीय संरचनाएँ', en: 'Hydraulic structures' },
    { id: 'D', hi: 'बाँध', en: 'Dams' },
    { id: 'E', hi: 'पुल एवं पुलिया', en: 'Bridges and culverts' },
    { id: 'F', hi: 'आरसीसी मूल', en: 'RCC basics (IS 456)' },
    { id: 'S', hi: 'सॉफ़्टवेयर से जोड़', en: 'Software bridges' }
  ];

  function num(v) {
    if (typeof v === 'number') return v;
    if (v === null || v === undefined) return NaN;
    var s = String(v).trim().replace(/,/g, '');
    if (s === '') return NaN;
    return Number(s);
  }

  // Fixed decimals; '—' for non-finite.
  function f(x, dp) {
    if (x === null || x === undefined || !isFinite(x)) return '—';
    dp = dp === undefined ? 3 : dp;
    var s = Number(x).toFixed(dp);
    if (/^-0\.?0*$/.test(s)) s = s.slice(1);
    return s;
  }

  function round(x, dp) {
    var p = Math.pow(10, dp === undefined ? 3 : dp);
    return Math.round(x * p) / p;
  }

  // Round up to a multiple (e.g. ceilTo(1.23, 0.05) = 1.25).
  function ceilTo(x, step) { return Math.ceil(x / step - 1e-9) * step; }
  function floorTo(x, step) { return Math.floor(x / step + 1e-9) * step; }

  // Bisection on [lo, hi]; fn(lo) and fn(hi) must have opposite signs.
  function bisect(fn, lo, hi, tol, maxIt) {
    tol = tol || 1e-9; maxIt = maxIt || 200;
    var flo = fn(lo), fhi = fn(hi);
    if (!isFinite(flo) || !isFinite(fhi)) return NaN;
    if (flo === 0) return lo;
    if (fhi === 0) return hi;
    if (flo * fhi > 0) return NaN;
    for (var i = 0; i < maxIt; i++) {
      var mid = (lo + hi) / 2, fm = fn(mid);
      if (fm === 0 || (hi - lo) / 2 < tol) return mid;
      if (flo * fm < 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; }
    }
    return (lo + hi) / 2;
  }

  // Root of an increasing function fn(x) = target, searching upward from lo.
  function solveUp(fn, target, lo, hi) {
    lo = lo || 1e-6; hi = hi || 1;
    var g = function (x) { return fn(x) - target; };
    var n = 0;
    while (g(hi) < 0 && n++ < 200) hi *= 2;
    return bisect(g, lo, hi, 1e-10);
  }

  // Linear interpolation in a table; clamps at the ends.
  function interp(xs, ys, x) {
    if (x <= xs[0]) return ys[0];
    var n = xs.length;
    if (x >= xs[n - 1]) return ys[n - 1];
    for (var i = 1; i < n; i++) {
      if (x <= xs[i]) {
        var t = (x - xs[i - 1]) / (xs[i] - xs[i - 1]);
        return ys[i - 1] + t * (ys[i] - ys[i - 1]);
      }
    }
    return ys[n - 1];
  }

  // "12, 15.2\n18" -> [12, 15.2, 18]. Ignores words and empty lines.
  function parseSeries(text) {
    return String(text || '').split(/[\s,;]+/).map(num).filter(function (x) { return isFinite(x); });
  }

  // Pasted table (CSV, tab or space separated) -> array of numeric rows with
  // at least `minCols` numbers. Header and comment lines are skipped.
  function parseTable(text, minCols) {
    minCols = minCols || 2;
    var rows = [];
    String(text || '').split(/\r?\n/).forEach(function (line) {
      line = line.trim();
      if (!line || line.charAt(0) === '#') return;
      var cells = line.split(/[\t,;]+|\s+/).map(num);
      if (cells.length < minCols) return;
      for (var i = 0; i < minCols; i++) if (!isFinite(cells[i])) return;
      rows.push(cells.filter(function (c) { return isFinite(c); }));
    });
    return rows;
  }

  // Same, but keeps text cells (for names): returns arrays of trimmed strings.
  function parseRows(text) {
    var rows = [];
    String(text || '').split(/\r?\n/).forEach(function (line) {
      line = line.trim();
      if (!line || line.charAt(0) === '#') return;
      rows.push(line.split(/\t|,|;/).map(function (c) { return c.trim(); }));
    });
    return rows;
  }

  function deg(rad) { return rad * 180 / Math.PI; }
  function rad(d) { return d * Math.PI / 180; }

  // Default values for a page's inputs.
  function defaults(inputs) {
    var v = {};
    (inputs || []).forEach(function (i) { if (i.key) v[i.key] = i.def; });
    return v;
  }

  // Values typed in the form arrive as strings; convert numbers.
  function coerce(inputs, raw) {
    var v = {};
    (inputs || []).forEach(function (i) {
      if (!i.key) return;
      var x = raw && Object.prototype.hasOwnProperty.call(raw, i.key) ? raw[i.key] : i.def;
      if (!i.type || i.type === 'number') x = num(x);
      else if (i.type === 'check') x = x === true || x === 'true' || x === 'on' || x === 1;
      else x = x === undefined || x === null ? '' : String(x);
      v[i.key] = x;
    });
    return v;
  }

  // Validation errors {key: message} for numeric inputs that are visible.
  function validate(inputs, v) {
    var err = {};
    (inputs || []).forEach(function (i) {
      if (!i.key || (i.type && i.type !== 'number')) return;
      if (i.show && !i.show(v)) return;
      var x = v[i.key];
      if (!isFinite(x)) { err[i.key] = 'संख्या लिखें / enter a number'; return; }
      if (i.min !== undefined && x < i.min) err[i.key] = 'न्यूनतम / min ' + i.min;
      else if (i.max !== undefined && x > i.max) err[i.key] = 'अधिकतम / max ' + i.max;
    });
    return err;
  }

  /* ---------- Report ---------- */
  function Report() {
    this.method = { formulae: [], refs: [], assumptions: [], limits: [] };
    this.steps = [];
    this.results = [];
    this.checks = [];
    this.tables = [];
    this.warnings = [];
    this.data = {};
  }
  Report.prototype.formula = function (s) { this.method.formulae.push(s); return this; };
  Report.prototype.ref = function (s) { this.method.refs.push(s); return this; };
  Report.prototype.assume = function (s) { this.method.assumptions.push(s); return this; };
  Report.prototype.limit = function (s) { this.method.limits.push(s); return this; };
  Report.prototype.h = function (s) { this.steps.push({ h: s }); return this; };
  Report.prototype.step = function (s) { this.steps.push({ t: s }); return this; };
  // eq('Wetted perimeter P', '4.75 √Q', '4.75 × √30', 26.02, 'm', 3)
  Report.prototype.eq = function (label, formula, subst, value, unit, dp) {
    var s = label + ' = ' + formula;
    if (subst) s += ' = ' + subst;
    s += ' = ' + f(value, dp) + (unit ? ' ' + unit : '');
    this.steps.push({ t: s });
    return value;
  };
  Report.prototype.result = function (label, value, unit, dp) {
    this.results.push({ label: label, value: value, unit: unit || '', dp: dp === undefined ? 3 : dp,
      text: typeof value === 'number' ? f(value, dp === undefined ? 3 : dp) : String(value) });
    return this;
  };
  Report.prototype.check = function (label, ok, value, limit, note) {
    this.checks.push({ label: label, ok: !!ok, value: value === undefined ? '' : String(value),
      limit: limit === undefined ? '' : String(limit), note: note || '' });
    return !!ok;
  };
  Report.prototype.table = function (title, columns, rows, id) {
    this.tables.push({ id: id || ('t' + (this.tables.length + 1)), title: title, columns: columns, rows: rows });
    return this;
  };
  Report.prototype.warn = function (s) { this.warnings.push(s); return this; };
  Report.prototype.allOk = function () {
    return this.checks.every(function (c) { return c.ok; });
  };

  return {
    G: G, GAMMA_W: GAMMA_W, DISCLAIMER: DISCLAIMER, GROUPS: GROUPS,
    num: num, f: f, round: round, ceilTo: ceilTo, floorTo: floorTo,
    bisect: bisect, solveUp: solveUp, interp: interp,
    parseSeries: parseSeries, parseTable: parseTable, parseRows: parseRows,
    deg: deg, rad: rad, defaults: defaults, coerce: coerce, validate: validate,
    Report: Report
  };
});
