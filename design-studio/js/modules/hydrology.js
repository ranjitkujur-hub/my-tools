/* A. Hydrology / जल विज्ञान
 * - Flood peaks: Dickens, Ryves, Inglis, Rational method with Kirpich tc.
 * - Gumbel (EV-I) flood frequency analysis of an annual-maximum series. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../core/index.js'));
  else root.DS.register(factory(root.DS));
})(typeof self !== 'undefined' ? self : this, function (DS) {
  'use strict';
  var B = DS.base, Drawing = DS.Drawing, f = B.f;

  /* ---------- formulas ---------- */
  function dickens(A, C) { return C * Math.pow(A, 0.75); }          // Q m³/s, A km²
  function ryves(A, C) { return C * Math.pow(A, 2 / 3); }
  function inglis(A, C) { return (C || 124) * A / Math.sqrt(A + 10.4); }
  // Kirpich (1940): tc (min) = 0.01947 L^0.77 S^-0.385, L in m, S in m/m
  function kirpich(L, S) { return 0.01947 * Math.pow(L, 0.77) * Math.pow(S, -0.385); }
  // Rational method: Q = C i A / 3.6  (i mm/h, A km²)
  function rational(C, i, A) { return C * i * A / 3.6; }
  // Short-duration rainfall from one-day rainfall: Rt = R24 (t/24)^(1/3), t in hours
  function rainfallDepth(R24, tHours) { return R24 * Math.pow(tHours / 24, 1 / 3); }

  // Gumbel frequency factor for an infinite sample
  function gumbelKinf(T) { return -Math.sqrt(6) / Math.PI * (0.5772 + Math.log(Math.log(T / (T - 1)))); }
  function reducedVariate(T) { return -Math.log(Math.log(T / (T - 1))); }
  // Reduced mean yn and reduced standard deviation Sn for sample size N (Gumbel's extreme value tables)
  var YN_N = [10, 15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90, 100, 150, 200, 500, 1000];
  var YN = [0.4952, 0.5128, 0.5236, 0.5309, 0.5362, 0.5403, 0.5436, 0.5463, 0.5485, 0.5521, 0.5548, 0.5569, 0.5586, 0.5600, 0.5646, 0.5672, 0.5724, 0.5745];
  var SN = [0.9496, 1.0206, 1.0628, 1.0914, 1.1124, 1.1285, 1.1413, 1.1518, 1.1607, 1.1747, 1.1854, 1.1938, 1.2007, 1.2065, 1.2253, 1.2360, 1.2588, 1.2685];
  function ynSn(N) { return { yn: B.interp(YN_N, YN, N), sn: B.interp(YN_N, SN, N) }; }
  function gumbelK(T, N) { var t = ynSn(N); return (reducedVariate(T) - t.yn) / t.sn; }

  function meanStd(xs) {
    var n = xs.length, m = xs.reduce(function (a, b) { return a + b; }, 0) / n;
    var s = Math.sqrt(xs.reduce(function (a, b) { return a + (b - m) * (b - m); }, 0) / (n - 1));
    return { mean: m, sd: s, n: n };
  }

  /* ---------- small chart helper (axes drawn with the Drawing model) ---------- */
  function niceStep(range, n) {
    var raw = range / n, p = Math.pow(10, Math.floor(Math.log10(raw))), r = raw / p;
    return (r <= 1 ? 1 : r <= 2 ? 2 : r <= 2.5 ? 2.5 : r <= 5 ? 5 : 10) * p;
  }
  // Draws axes in a W x H (drawing units) box; returns mapping functions.
  function axes(d, o) {
    var W = o.W, H = o.H, x0 = o.xmin, x1 = o.xmax, y0 = o.ymin, y1 = o.ymax;
    var X = function (x) { return (x - x0) / (x1 - x0) * W; }, Y = function (y) { return (y - y0) / (y1 - y0) * H; };
    d.line(0, 0, W, 0, 'DIM'); d.line(0, 0, 0, H, 'DIM');
    var sy = niceStep(y1 - y0, 6);
    for (var y = Math.ceil(y0 / sy) * sy; y <= y1 + 1e-9; y += sy) {
      d.line(-W * 0.012, Y(y), 0, Y(y), 'DIM');
      d.line(0, Y(y), W, Y(y), 'DIM', { dash: true, w: 0.1 });
      d.text(-W * 0.02, Y(y), f(y, sy < 1 ? 2 : 0), { ha: 'r', va: 'm', h: 2 });
    }
    if (o.xticks) o.xticks.forEach(function (t) {
      d.line(X(t[0]), 0, X(t[0]), -H * 0.02, 'DIM');
      d.text(X(t[0]), -H * 0.035, t[1], { ha: 'c', va: 't', h: 2 });
    });
    if (o.xlabel) d.text(W / 2, -H * 0.12, o.xlabel, { ha: 'c', va: 't', h: 2.5 });
    if (o.ylabel) d.text(-W * 0.09, H / 2, o.ylabel, { ha: 'c', va: 'b', h: 2.5, rot: 90 });
    return { X: X, Y: Y };
  }

  /* ---------- page: flood peaks ---------- */
  var floodInputs = [
    { sec: 'जलग्रहण क्षेत्र / Catchment' },
    { key: 'A', hi: 'जलग्रहण क्षेत्रफल', en: 'Catchment area A', unit: 'km²', def: 45, min: 0.01, max: 100000 },
    { sec: 'अनुभवजन्य सूत्र / Empirical formulae' },
    { key: 'Cd', hi: 'डिकेन्स गुणांक', en: 'Dickens coefficient C_D', unit: '—', def: 14, min: 1, max: 50,
      help: 'Typical 6 (N. India plains), 11–14 (N. India hilly), 14–28 (Central India), 22–28 (coastal Andhra/Odisha)' },
    { key: 'Cr', hi: 'राइव्स गुणांक', en: 'Ryves coefficient C_R', unit: '—', def: 8.5, min: 1, max: 50,
      help: 'Typical 6.8 (within 80 km of coast), 8.5 (80–240 km from coast), 10.2 (limited hilly areas)' },
    { key: 'Ci', hi: 'इंग्लिस गुणांक', en: 'Inglis coefficient', unit: '—', def: 124, min: 1, max: 500,
      help: 'Inglis: Q = 124 A / √(A + 10.4) for fan-shaped catchments (former Bombay State)' },
    { sec: 'तर्कसंगत विधि / Rational method' },
    { key: 'C', hi: 'अपवाह गुणांक', en: 'Runoff coefficient C', unit: '—', def: 0.35, min: 0.01, max: 1 },
    { key: 'L', hi: 'मुख्य धारा की लंबाई', en: 'Length of main stream L', unit: 'm', def: 9000, min: 10, max: 500000 },
    { key: 'H', hi: 'धारा में कुल गिरावट', en: 'Fall along stream H', unit: 'm', def: 60, min: 0.01, max: 5000 },
    { key: 'rainMode', hi: 'वर्षा इनपुट', en: 'Rainfall input', type: 'select', def: 'R24',
      options: [['R24', 'One-day rainfall R24 → intensity at tc'], ['i', 'Intensity at tc given directly']] },
    { key: 'R24', hi: 'एक दिवसीय वर्षा', en: 'One-day rainfall R24', unit: 'mm', def: 250, min: 1, max: 2000, show: function (v) { return v.rainMode === 'R24'; } },
    { key: 'i', hi: 'वर्षा तीव्रता', en: 'Rainfall intensity i (for duration tc)', unit: 'mm/h', def: 40, min: 0.1, max: 1000, show: function (v) { return v.rainMode === 'i'; } }
  ];

  function floodDesign(v) {
    var r = new B.Report();
    r.formula('Dickens: Q = C_D · A^(3/4)');
    r.formula('Ryves: Q = C_R · A^(2/3)');
    r.formula('Inglis: Q = 124 A / √(A + 10.4)');
    r.formula('Rational: Q = C · i · A / 3.6   (i in mm/h, A in km², Q in m³/s)');
    r.formula('Kirpich: tc (min) = 0.01947 · L^0.77 · S^(−0.385)   (L in m, S in m/m)');
    if (v.rainMode === 'R24') r.formula('Short-duration rainfall: R_t = R24 · (t/24)^(1/3), i = R_t / t');
    r.ref('K. Subramanya, Engineering Hydrology — empirical flood formulae (Dickens, Ryves, Inglis) and rational method.');
    r.ref('Kirpich, Z.P. (1940), Time of concentration of small agricultural watersheds, Civil Engineering 10(6).');
    r.ref('IRC:SP:13 — rational method for small culverts (verify clause for local rainfall–duration relation).');
    r.assume('Empirical coefficients are regional; choose from local experience or regional studies.');
    r.assume('Rational method: rainfall uniform over the catchment for a duration equal to tc; C constant.');
    if (v.rainMode === 'R24') r.assume('Short-duration ratio (t/24)^(1/3) is an empirical average; use local IDF curves where available.');
    r.limit('Empirical formulae give an order of magnitude only; they carry no return period.');
    r.limit('Rational method is normally limited to small catchments (about 25–50 km²).');

    var A = v.A;
    r.h('1. Dickens');
    var qd = r.eq('Q', 'C_D · A^0.75', f(v.Cd, 2) + ' × ' + f(A, 2) + '^0.75', dickens(A, v.Cd), 'm³/s', 2);
    r.h('2. Ryves');
    var qr = r.eq('Q', 'C_R · A^(2/3)', f(v.Cr, 2) + ' × ' + f(A, 2) + '^(2/3)', ryves(A, v.Cr), 'm³/s', 2);
    r.h('3. Inglis');
    var qi = r.eq('Q', v.Ci + ' A / √(A + 10.4)', v.Ci + ' × ' + f(A, 2) + ' / √(' + f(A, 2) + ' + 10.4)', inglis(A, v.Ci), 'm³/s', 2);
    r.h('4. Rational method with Kirpich tc');
    var S = r.eq('Slope S', 'H / L', f(v.H, 2) + ' / ' + f(v.L, 0), v.H / v.L, 'm/m', 5);
    var tc = r.eq('tc', '0.01947 L^0.77 S^−0.385', '0.01947 × ' + f(v.L, 0) + '^0.77 × ' + f(S, 5) + '^−0.385', kirpich(v.L, S), 'min', 1);
    var i;
    if (v.rainMode === 'R24') {
      var Rt = r.eq('R_tc', 'R24 (tc/24)^(1/3)', f(v.R24, 1) + ' × (' + f(tc / 60, 3) + '/24)^(1/3)', rainfallDepth(v.R24, tc / 60), 'mm', 1);
      i = r.eq('i', 'R_tc / tc', f(Rt, 1) + ' / ' + f(tc / 60, 3) + ' h', Rt / (tc / 60), 'mm/h', 1);
    } else {
      i = v.i;
      r.step('i = ' + f(i, 1) + ' mm/h (given, for duration tc)');
    }
    var qrat = r.eq('Q', 'C i A / 3.6', f(v.C, 2) + ' × ' + f(i, 1) + ' × ' + f(A, 2) + ' / 3.6', rational(v.C, i, A), 'm³/s', 2);

    var rows = [['Dickens', qd, 'C_D = ' + v.Cd], ['Ryves', qr, 'C_R = ' + v.Cr], ['Inglis', qi, 'coef. ' + v.Ci], ['Rational (Kirpich tc)', qrat, 'C = ' + v.C + ', i = ' + f(i, 1) + ' mm/h']];
    var max = Math.max(qd, qr, qi, qrat);
    r.result('Dickens Q', qd, 'm³/s', 1);
    r.result('Ryves Q', qr, 'm³/s', 1);
    r.result('Inglis Q', qi, 'm³/s', 1);
    r.result('Time of concentration tc', tc, 'min', 1);
    r.result('Rainfall intensity i', i, 'mm/h', 1);
    r.result('Rational Q', qrat, 'm³/s', 1);
    r.result('Highest of the four', max, 'm³/s', 1);
    r.table('Flood peak by method', ['Method', 'Q (m³/s)', 'Coefficients'], rows.map(function (x) { return [x[0], B.round(x[1], 2), x[2]]; }), 'methods');
    r.check('Dickens C_D within typical range', v.Cd >= 6 && v.Cd <= 30, f(v.Cd, 1), '6 – 30');
    r.check('Ryves C_R within typical range', v.Cr >= 6.8 && v.Cr <= 10.2, f(v.Cr, 1), '6.8 – 10.2');
    r.check('Rational method area limit', A <= 50, f(A, 1) + ' km²', '≤ 50 km²', 'larger areas: use unit hydrograph / HEC-HMS');
    r.check('Kirpich slope range', S >= 0.0001 && S <= 0.2, f(S, 5), '0.0001 – 0.2 (verify)');
    r.data = { rows: rows, max: max };
    return r;
  }

  function floodDrawing(v, rep) {
    var d = new Drawing({ title: 'Flood peak comparison', nts: true });
    var rows = rep.data.rows, max = rep.data.max * 1.15, W = 120, H = 70;
    var ax = axes(d, { W: W, H: H, xmin: 0, xmax: rows.length, ymin: 0, ymax: max, ylabel: 'Q (m³/s)' });
    rows.forEach(function (x, k) {
      var bx = ax.X(k + 0.2), bw = ax.X(0.6) - ax.X(0);
      d.hatch([[bx, 0], [bx + bw, 0], [bx + bw, ax.Y(x[1])], [bx, ax.Y(x[1])]], 'water');
      d.text(bx + bw / 2, ax.Y(x[1]), f(x[1], 1), { ha: 'c', va: 'b', dy: 1, h: 2.2 });
      d.text(bx + bw / 2, 0, x[0], { ha: 'c', va: 't', dy: -1.5, h: 2.2 });
    });
    return [{ key: 'chart', title: 'Flood peak comparison / बाढ़ शिखर तुलना', d: d }];
  }

  /* ---------- page: Gumbel ---------- */
  var SAMPLE_SERIES = '2001, 412\n2002, 655\n2003, 298\n2004, 820\n2005, 515\n2006, 377\n2007, 960\n2008, 448\n2009, 702\n2010, 335\n' +
    '2011, 590\n2012, 1210\n2013, 476\n2014, 623\n2015, 388\n2016, 745\n2017, 530\n2018, 880\n2019, 461\n2020, 1045\n' +
    '2021, 569\n2022, 402\n2023, 678\n2024, 731\n2025, 497';

  var gumbelInputs = [
    { sec: 'वार्षिक अधिकतम बाढ़ / Annual maximum series' },
    { key: 'series', hi: 'वार्षिक अधिकतम बाढ़ (वर्ष, Q)', en: 'Annual maximum floods (year, Q) or Q only — paste from Excel', unit: 'm³/s', type: 'textarea', def: SAMPLE_SERIES,
      help: 'Fictional sample data. One value per line; a year column is optional.' },
    { key: 'method', hi: 'विधि', en: 'Frequency factor', type: 'select', def: 'finite',
      options: [['finite', 'Gumbel with sample-size correction (yn, Sn)'], ['inf', 'Gumbel for very long record (N → ∞)']] },
    { key: 'Textra', hi: 'अतिरिक्त पुनरावृत्ति अवधि', en: 'Extra return period (optional, 0 = none)', unit: 'years', def: 0, min: 0, max: 10000 }
  ];

  function parseFloods(text) {
    var rows = B.parseTable(text, 1), qs = [];
    rows.forEach(function (rw) { qs.push(rw.length >= 2 ? rw[1] : rw[0]); });
    return qs.filter(function (q) { return q > 0; });
  }

  function gumbelDesign(v) {
    var r = new B.Report();
    var Q = parseFloods(v.series);
    if (Q.length < 5) throw new Error('कम से कम 5 वार्षिक मान चाहिए / Need at least 5 annual maximum values');
    var ms = meanStd(Q), N = ms.n;
    r.formula('x_T = x̄ + K · σ_(n−1)');
    r.formula('Reduced variate y_T = −ln[ln(T/(T−1))]');
    r.formula(v.method === 'finite' ? 'K = (y_T − y_n) / S_n   (y_n, S_n from Gumbel tables for sample size N)' : 'K = −(√6/π)[0.5772 + ln ln(T/(T−1))]');
    r.formula('Plotting position (Weibull): T = (N + 1) / m');
    r.ref('Gumbel, E.J. (1941/1958), Statistics of Extremes; Chow, Maidment & Mays, Applied Hydrology (1988), §12.3.');
    r.ref('K. Subramanya, Engineering Hydrology — Gumbel’s method and the y_n, S_n table.');
    r.assume('Annual maxima are independent and identically distributed and follow the EV-I (Gumbel) law.');
    r.assume('Sample standard deviation uses (N − 1).');
    r.limit('Extrapolation beyond about 2–4 times the record length (e.g. 1000-year flood) is highly uncertain.');
    r.limit('Record shorter than about 20–25 years gives weak estimates.');

    r.h('1. Statistics of the series');
    r.step('N = ' + N + ' years');
    r.eq('Mean x̄', 'Σx / N', '', ms.mean, 'm³/s', 2);
    r.eq('Standard deviation σ', '√[Σ(x − x̄)² / (N − 1)]', '', ms.sd, 'm³/s', 2);
    var t = ynSn(N);
    if (v.method === 'finite') {
      r.step('From Gumbel tables for N = ' + N + ': y_n = ' + f(t.yn, 4) + ', S_n = ' + f(t.sn, 4) + (N < 10 || N > 1000 ? ' (outside table, end value used)' : ' (interpolated)'));
    }
    r.h('2. Flood for each return period');
    var Ts = [25, 50, 100, 1000];
    if (v.Textra > 1 && Ts.indexOf(v.Textra) < 0) Ts.push(v.Textra);
    Ts.sort(function (a, b) { return a - b; });
    var res = Ts.map(function (T) {
      var yT = reducedVariate(T), K = v.method === 'finite' ? gumbelK(T, N) : gumbelKinf(T), x = ms.mean + K * ms.sd;
      r.step('T = ' + T + ' yr: y_T = ' + f(yT, 4) + ', K = ' + f(K, 4) + ', x_T = ' + f(ms.mean, 2) + ' + ' + f(K, 4) + ' × ' + f(ms.sd, 2) + ' = ' + f(x, 1) + ' m³/s');
      r.result(T + '-year flood', x, 'm³/s', 1);
      return [T, yT, K, x];
    });
    r.table('Return-period floods', ['T (years)', 'y_T', 'K', 'Q_T (m³/s)'], res.map(function (x) { return [x[0], B.round(x[1], 4), B.round(x[2], 4), B.round(x[3], 1)]; }), 'floods');
    var sorted = Q.slice().sort(function (a, b) { return b - a; });
    var pp = sorted.map(function (q, k) { var T = (N + 1) / (k + 1); return [k + 1, q, B.round(T, 2), B.round(reducedVariate(T > 1 ? T : 1.0001), 4)]; });
    r.table('Plotting positions (Weibull)', ['Rank m', 'Q (m³/s)', 'T = (N+1)/m', 'y'], pp, 'plotting');
    r.result('Mean', ms.mean, 'm³/s', 1);
    r.result('Standard deviation', ms.sd, 'm³/s', 1);
    r.check('Record length', N >= 20, N + ' years', '≥ 20 years (recommended)');
    r.check('1000-year extrapolation', N * 4 >= 1000, 'N = ' + N, '4N ≥ 1000 for reliable estimate', 'treat 1000-year value as indicative');
    r.data = { mean: ms.mean, sd: ms.sd, N: N, res: res, pp: pp };
    return r;
  }

  function gumbelDrawing(v, rep) {
    var d = new Drawing({ title: 'Gumbel probability plot', nts: true });
    var D = rep.data, W = 150, H = 85;
    var ys = D.pp.map(function (p) { return p[3]; }).concat(D.res.map(function (x) { return x[1]; }));
    var qs = D.pp.map(function (p) { return p[1]; }).concat(D.res.map(function (x) { return x[3]; }));
    var ymin = Math.min(-1.5, Math.min.apply(null, ys)), ymax = Math.max.apply(null, ys) + 0.3;
    var qmin = 0, qmax = Math.max.apply(null, qs) * 1.08;
    var ticks = [2, 5, 10, 25, 50, 100, 1000].map(function (T) { return [reducedVariate(T), 'T=' + T]; }).filter(function (t) { return t[0] <= ymax; });
    ticks.unshift([0, 'y=0']);
    var ax = axes(d, { W: W, H: H, xmin: ymin, xmax: ymax, ymin: qmin, ymax: qmax, xticks: ticks, xlabel: 'Gumbel reduced variate y (return period T, years)', ylabel: 'Q (m³/s)' });
    D.pp.forEach(function (p) { d.circle(ax.X(p[3]), ax.Y(p[1]), 0.9, 'WATER'); });
    // fitted line: x = mean + sd*K(y)
    var pts = [];
    for (var k = 0; k <= 40; k++) {
      var y = ymin + (ymax - ymin) * k / 40, K;
      if (v.method === 'finite') { var t = ynSn(D.N); K = (y - t.yn) / t.sn; } else K = (y * Math.sqrt(6) / Math.PI) - 0.5772 * Math.sqrt(6) / Math.PI;
      var q = D.mean + K * D.sd;
      if (q >= qmin && q <= qmax) pts.push([ax.X(y), ax.Y(q)]);
    }
    if (pts.length > 1) d.pline(pts, 'CONCRETE', { w: 0.35 });
    D.res.forEach(function (x) {
      d.circle(ax.X(x[1]), ax.Y(x[3]), 1.2, 'REBAR');
      d.text(ax.X(x[1]), ax.Y(x[3]), x[0] + '-yr: ' + f(x[3], 0), { ha: 'r', va: 'b', dx: -1.5, dy: 1, h: 2.2 });
    });
    return [{ key: 'plot', title: 'Gumbel flood frequency plot / गम्बेल आवृत्ति आलेख', d: d }];
  }

  return {
    fns: { dickens: dickens, ryves: ryves, inglis: inglis, kirpich: kirpich, rational: rational, rainfallDepth: rainfallDepth,
      gumbelKinf: gumbelKinf, gumbelK: gumbelK, reducedVariate: reducedVariate, ynSn: ynSn, meanStd: meanStd, parseFloods: parseFloods, axes: axes },
    pages: [
      { id: 'flood-peak', group: 'A', order: 1, hi: 'बाढ़ शिखर', en: 'Flood peak (empirical and rational)', refs: 'Dickens, Ryves, Inglis; Rational + Kirpich',
        intro: 'Peak flood by empirical formulae and by the rational method with Kirpich’s time of concentration.',
        inputs: floodInputs, design: floodDesign, drawings: floodDrawing },
      { id: 'gumbel', group: 'A', order: 2, hi: 'गम्बेल बाढ़ आवृत्ति', en: 'Gumbel flood frequency', refs: 'Gumbel EV-I',
        intro: 'Paste an annual-maximum flood series to get the 25, 50, 100 and 1000-year floods.',
        inputs: gumbelInputs, design: gumbelDesign, drawings: gumbelDrawing }
    ]
  };
});
