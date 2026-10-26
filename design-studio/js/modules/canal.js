/* B. Canals / नहर
 * - Unlined alluvial canals: Lacey's regime theory and Kennedy's theory (IS 7112).
 * - Lined canals by Manning (IS 4745 / IS 10430): trapezoidal, and triangular with rounded bottom.
 * - Longitudinal-section helper: bed levels by chainage with falls where the ground drops.
 * Shared cross-section drawing with lining, banks, berms, FSL and bed level. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../core/index.js'));
  else root.DS.register(factory(root.DS));
})(typeof self !== 'undefined' ? self : this, function (DS) {
  'use strict';
  var B = DS.base, Drawing = DS.Drawing, f = B.f, G = B.G;

  /* ---------- formulas ---------- */
  function siltFactor(dmm) { return 1.76 * Math.sqrt(dmm); }
  // Lacey regime relations (SI)
  function lacey(Q, fs) {
    var V = Math.pow(Q * fs * fs / 140, 1 / 6);
    var A = Q / V, P = 4.75 * Math.sqrt(Q), R = 2.5 * V * V / fs;
    var S = Math.pow(fs, 5 / 3) / (3340 * Math.pow(Q, 1 / 6));
    return { V: V, A: A, P: P, R: R, S: S };
  }
  // Trapezoid with side slope z (H:V) having perimeter P and area A -> bed width b and depth D
  function trapFromPA(P, A, z) {
    var k = 2 * Math.sqrt(1 + z * z) - z;        // (k) D² − P D + A = 0
    var disc = P * P - 4 * k * A;
    if (disc < 0) return null;
    var D = (P - Math.sqrt(disc)) / (2 * k);
    return { D: D, b: P - 2 * D * Math.sqrt(1 + z * z) };
  }
  // Kennedy critical velocity V0 = 0.55 m D^0.64 (SI)
  function kennedyV0(m, D) { return 0.55 * m * Math.pow(D, 0.64); }
  // Kutter's formula (SI)
  function kutterV(N, R, S) {
    var a = 23 + 1 / N + 0.00155 / S;
    var C = a / (1 + (23 + 0.00155 / S) * N / Math.sqrt(R));
    return C * Math.sqrt(R * S);
  }
  function kennedy(Q, m, N, ratio, z) {
    var area = function (D) { return (ratio + z) * D * D; };
    var D = B.solveUp(function (d) { return area(d) * kennedyV0(m, d); }, Q, 1e-4, 1);
    var b = ratio * D, A = area(D), P = b + 2 * D * Math.sqrt(1 + z * z), R = A / P, V0 = kennedyV0(m, D);
    // slope that makes Kutter velocity equal V0 (velocity rises with S)
    var S = B.bisect(function (s) { return kutterV(N, R, s) - V0; }, 1e-7, 0.05, 1e-12);
    return { D: D, b: b, A: A, P: P, R: R, V0: V0, S: S };
  }
  function manningQ(n, A, R, S) { return A * Math.pow(R, 2 / 3) * Math.sqrt(S) / n; }
  function trapGeom(b, D, z) { var A = (b + z * D) * D, P = b + 2 * D * Math.sqrt(1 + z * z); return { A: A, P: P, R: A / P, T: b + 2 * z * D }; }
  // Triangular section with rounded bottom (radius = D, centre at FSL): A = D²(θ + cotθ), P = 2D(θ + cotθ)
  function triGeom(D, z) {
    var th = Math.atan(1 / z), k = th + 1 / Math.tan(th);
    return { A: D * D * k, P: 2 * D * k, R: D / 2, T: triTop(D, z), theta: th };
  }
  function triTop(D, z) {
    // top width at FSL: tangent point (D sinθ, −D cosθ) from centre, then slope 1:z up to FSL
    var th = Math.atan(1 / z), xt = D * Math.sin(th), yt = D * Math.cos(th);
    return 2 * (xt + z * yt);
  }

  // Suggested freeboard to top of lining (IS 10430 table, verify)
  function liningFreeboard(Q) { return Q < 0.75 ? 0.3 : Q < 1.5 ? 0.5 : Q <= 85 ? 0.6 : 0.75; }
  // Typical bank top widths (service-road bank, other bank) — departmental practice, verify
  function bankWidths(Q) {
    if (Q <= 1.5) return [4.0, 1.5];
    if (Q <= 10) return [5.0, 2.0];
    if (Q <= 30) return [6.0, 2.5];
    if (Q <= 150) return [7.0, 3.5];
    return [8.0, 5.0];
  }
  // Typical B/D ratio for lined trapezoidal canals (guidance, verify IS 10430)
  function bdGuide(Q) {
    if (Q < 5) return [1, 2];
    if (Q < 15) return [2, 4];
    if (Q < 50) return [3, 6];
    if (Q < 150) return [5, 8];
    return [6, 10];
  }

  /* ---------- shared cross-section drawing ----------
   * g = {half: [[x,y]...] inner profile of the right half from centre bed up to TBL,
   *      bed, fsl, tbl, gl, lining (t, top), banks [left, right], outer (H:V), title, z} */
  function offsetPolyline(pts, t) {
    // offset to the right of travel direction (outward/down for a profile drawn left→right from the centre)
    var out = [];
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i], n1 = null, n2 = null;
      if (i > 0) n1 = normal(pts[i - 1], p);
      if (i < pts.length - 1) n2 = normal(p, pts[i + 1]);
      var nx, ny;
      if (n1 && n2) {
        nx = n1[0] + n2[0]; ny = n1[1] + n2[1];
        var l = Math.sqrt(nx * nx + ny * ny), c = (n1[0] * n2[0] + n1[1] * n2[1] + 1) / 2;
        nx /= l; ny /= l; var s = t / Math.sqrt(Math.max(c, 0.1));
        out.push([p[0] + nx * s, p[1] + ny * s]);
      } else { var nn = n1 || n2; out.push([p[0] + nn[0] * t, p[1] + nn[1] * t]); }
    }
    return out;
  }
  function normal(a, b) { var dx = b[0] - a[0], dy = b[1] - a[1], l = Math.sqrt(dx * dx + dy * dy) || 1; return [dy / l, -dx / l]; }

  function sectionDrawing(g) {
    var d = new Drawing({ title: g.title || 'Canal cross-section' });
    var half = g.half;            // right half inner profile, starts at (0, bed)
    var mirror = function (pts) { return pts.map(function (q) { return [-q[0], q[1]]; }); };
    var right = half, left = mirror(half);
    var topR = right[right.length - 1], topL = left[left.length - 1];
    var wl = g.banks[0], wr = g.banks[1], zo = g.outer;
    function bankSide(top, w, dir) {
      // from inner top edge outwards: bank top, outer slope to ground (or cut slope up to ground)
      var pts = [];
      if (g.tbl >= g.gl) {
        pts.push([top[0] + dir * w, g.tbl]);
        pts.push([top[0] + dir * (w + zo * (g.tbl - g.gl)), g.gl]);
      } else {
        pts.push([top[0] + dir * g.z * (g.gl - g.tbl), g.gl]);
      }
      return pts;
    }
    var outR = bankSide(topR, wr, 1), outL = bankSide(topL, wl, -1);
    var xEnd = Math.max(outR[outR.length - 1][0], -outL[outL.length - 1][0]) + 3;
    var bottom = g.bed - Math.max(1.0, (g.tbl - g.bed) * 0.35) - (g.lining ? g.lining.t : 0);
    // earth (natural ground + embankments) as one polygon
    var surf = [[-xEnd, g.gl]].concat(outL.slice().reverse(), left.slice().reverse(), right.slice(1), outR, [[xEnd, g.gl]]);
    d.hatch(surf.concat([[xEnd, bottom], [-xEnd, bottom]]), 'soil', { outline: false });
    d.pline(surf, 'SOIL');
    // lining
    if (g.lining && g.lining.t > 0) {
      var lr = right.filter(function (q) { return q[1] <= g.lining.top + 1e-9; });
      if (lr[lr.length - 1][1] < g.lining.top - 1e-9) {
        // add the point where the profile reaches lining top
        var k = lr.length; var a = right[k - 1], b2 = right[k];
        if (b2) { var t2 = (g.lining.top - a[1]) / (b2[1] - a[1]); lr.push([a[0] + t2 * (b2[0] - a[0]), g.lining.top]); }
      }
      var inner = mirror(lr).reverse().concat(lr.slice(1));
      var outer = offsetPolyline(inner, g.lining.t);
      d.hatch(inner.concat(outer.reverse()), 'concrete');
    }
    // water
    var wR = right.filter(function (q) { return q[1] <= g.fsl + 1e-9; });
    var last = wR[wR.length - 1];
    if (last[1] < g.fsl - 1e-9) {
      var j = wR.length, p1 = right[j - 1], p2 = right[j];
      if (p2) { var tt = (g.fsl - p1[1]) / (p2[1] - p1[1]); wR.push([p1[0] + tt * (p2[0] - p1[0]), g.fsl]); }
    }
    var water = mirror(wR).reverse().concat(wR.slice(1));
    d.hatch(water, 'water');
    var xw = wR.filter(function (q) { return q[1] >= g.fsl - 1e-9; })[0][0];
    var bed2 = g.bedWidth !== undefined ? g.bedWidth / 2 : 0;
    d.centre(0, bottom, 0, g.tbl + 1.0);
    // levels
    d.level(-xw * 0.45, g.fsl, 'FSL ' + f(g.fsl, 3), { side: 'l' });
    d.level(-Math.max(bed2, xw * 0.2) * 0.5, g.bed, 'Bed ' + f(g.bed, 3), { side: 'l' });
    d.level(topL[0] - wl * 0.5, g.tbl, 'TBL ' + f(g.tbl, 3), { side: 'l' });
    d.level(-xEnd + 1.5, g.gl, 'GL ' + f(g.gl, 3), { side: 'r' });
    // dimensions
    if (bed2 > 0) d.dimH(-bed2, bed2, g.bed - (g.lining ? g.lining.t : 0), 7, { text: 'B = ' + f(g.bedWidth, 2) });
    var xd = bed2 > 0 ? bed2 * 0.55 : xw * 0.3;
    d.dimV(xd, g.bed, g.fsl, 0, { text: 'D = ' + f(g.fsl - g.bed, 2) });
    d.dimV(topR[0], g.fsl, g.tbl, -4, { text: 'FB ' + f(g.tbl - g.fsl, 2) });
    d.dimH(topR[0], topR[0] + wr, g.tbl, -9, { text: f(wr, 2) });
    d.dimH(topL[0] - wl, topL[0], g.tbl, -9, { text: f(wl, 2) });
    d.dimH(-xw, xw, g.fsl, -14, { text: 'T = ' + f(2 * xw, 2) });
    var zt = g.z;
    d.text(topL[0] + zt * (g.tbl - g.fsl) / 2 + 0.3, (g.fsl + g.tbl) / 2, f(zt, 2) + ' : 1', { h: 2.2, ha: 'l' });
    if (g.tbl > g.gl) d.text(outR[outR.length - 1][0] - zo * (g.tbl - g.gl) / 2 + 0.4, (g.tbl + g.gl) / 2, f(zo, 1) + ' : 1', { h: 2.2, ha: 'l' });
    d.text(topR[0] + wr / 2, g.tbl, g.roadLabel || 'Service road', { h: 2.2, ha: 'c', va: 'b', dy: 1 });
    if (g.lining && g.lining.t > 0) d.text(-bed2 - 0.3, g.bed - g.lining.t, 'Lining ' + f(g.lining.t * 1000, 0) + ' mm', { h: 2.2, ha: 'r', va: 't', dy: -2 });
    return d;
  }

  function trapHalf(b, z, bed, fsl, tbl, berm) {
    var pts = [[0, bed], [b / 2, bed]];
    if (berm > 0 && tbl > fsl) {
      pts.push([b / 2 + z * (fsl - bed), fsl]);
      pts.push([b / 2 + z * (fsl - bed) + berm, fsl]);
      pts.push([b / 2 + z * (tbl - bed) + berm, tbl]);
    } else pts.push([b / 2 + z * (tbl - bed), tbl]);
    return pts;
  }
  function triHalf(D, z, bed, tbl) {
    var fsl = bed + D, th = Math.atan(1 / z), pts = [];
    for (var k = 0; k <= 12; k++) { var a = th * k / 12; pts.push([D * Math.sin(a), fsl - D * Math.cos(a)]); }
    var xt = D * Math.sin(th), yt = fsl - D * Math.cos(th);
    pts.push([xt + z * (tbl - yt), tbl]);
    return pts;
  }

  /* ---------- shared inputs ---------- */
  var siteInputs = [
    { sec: 'स्थल एवं तटबंध / Site and banks' },
    { key: 'bed', hi: 'तल स्तर', en: 'Bed level', unit: 'm', def: 210.0, min: -500, max: 9000 },
    { key: 'gl', hi: 'भूमि स्तर', en: 'Natural ground level', unit: 'm', def: 211.2, min: -500, max: 9000 },
    { key: 'zo', hi: 'बाहरी ढलान', en: 'Outer bank slope (H:V)', unit: 'H:1V', def: 2, min: 0.5, max: 5 }
  ];

  /* ---------- page: regime canal (Lacey / Kennedy) ---------- */
  var regimeInputs = [
    { sec: 'डिस्चार्ज एवं विधि / Discharge and method' },
    { key: 'Q', hi: 'डिस्चार्ज', en: 'Design discharge Q', unit: 'm³/s', def: 30, min: 0.1, max: 3000 },
    { key: 'method', hi: 'विधि', en: 'Method', type: 'select', def: 'lacey', options: [['lacey', "Lacey's regime theory"], ['kennedy', "Kennedy's theory (with Kutter's formula)"]] },
    { key: 'z', hi: 'भीतरी ढलान', en: 'Side slope (H:V)', unit: 'H:1V', def: 0.5, min: 0.25, max: 3, help: 'Regime channels settle to about ½ : 1 side slopes' },
    { sec: "लेसी / Lacey", show: function (v) { return v.method === 'lacey'; } },
    { key: 'dm', hi: 'गाद का औसत आकार', en: 'Mean silt size d_m', unit: 'mm', def: 0.323, min: 0.01, max: 5, show: function (v) { return v.method === 'lacey'; }, help: 'f = 1.76 √d_m; d_m 0.323 mm gives f ≈ 1.0' },
    { sec: 'केनेडी / Kennedy', show: function (v) { return v.method === 'kennedy'; } },
    { key: 'm', hi: 'क्रांतिक वेग अनुपात', en: 'Critical velocity ratio m', unit: '—', def: 1.0, min: 0.5, max: 1.5, show: function (v) { return v.method === 'kennedy'; } },
    { key: 'N', hi: 'कटर रूक्षता गुणांक', en: "Kutter's rugosity N", unit: '—', def: 0.0225, min: 0.01, max: 0.04, show: function (v) { return v.method === 'kennedy'; } },
    { key: 'ratio', hi: 'तल चौड़ाई/गहराई', en: 'Bed width / depth ratio B/D', unit: '—', def: 5.7, min: 1, max: 20, show: function (v) { return v.method === 'kennedy'; } },
    { sec: 'मुक्त फलक / Freeboard and banks' },
    { key: 'fb', hi: 'मुक्त फलक', en: 'Freeboard above FSL', unit: 'm', def: 0.9, min: 0.1, max: 3, help: 'Typical 0.5–1.0 m depending on discharge (verify IS 7112 / departmental practice)' },
    { key: 'berm', hi: 'बर्म चौड़ाई (FSL पर)', en: 'Berm width at FSL (each side)', unit: 'm', def: 2, min: 0, max: 20 },
    { key: 'wl', hi: 'बायाँ तटबंध शीर्ष', en: 'Left bank top width', unit: 'm', def: 2.5, min: 0.5, max: 20 },
    { key: 'wr', hi: 'दायाँ तटबंध शीर्ष (सड़क)', en: 'Right bank top width (service road)', unit: 'm', def: 6, min: 0.5, max: 20 }
  ].concat(siteInputs);

  function regimeDesign(v) {
    var r = new B.Report(), Q = v.Q, z = v.z, sec;
    r.ref('IS 7112:2002 — Criteria for design of cross-section for unlined canals in alluvial soil (verify clause numbers).');
    r.ref('S.K. Garg, Irrigation Engineering and Hydraulic Structures — Lacey and Kennedy theories.');
    r.limit('Applies to unlined canals in alluvial soils carrying silt in regime conditions.');
    if (v.method === 'lacey') {
      r.formula('f = 1.76 √d_m (d_m in mm)');
      r.formula('V = (Q f² / 140)^(1/6);  A = Q / V;  P = 4.75 √Q;  R = (5/2) V² / f');
      r.formula('S = f^(5/3) / (3340 Q^(1/6))');
      r.formula('Trapezoid with side slope z: (2√(1+z²) − z) D² − P D + A = 0');
      r.assume('Channel is in regime (true regime: constant discharge and silt charge, incoherent alluvium).');
      r.assume('Lacey’s semi-elliptical section is replaced by a trapezoid with side slope ' + z + ' : 1.');
      r.limit('Silt factor f typically 0.5 – 1.5 for Indian alluvial canals.');
      r.h('1. Silt factor');
      var fs = r.eq('f', '1.76 √d_m', '1.76 × √' + f(v.dm, 3), siltFactor(v.dm), '', 3);
      r.h('2. Regime quantities');
      var L = lacey(Q, fs);
      r.eq('V', '(Q f² / 140)^(1/6)', '(' + f(Q, 2) + ' × ' + f(fs, 3) + '² / 140)^(1/6)', L.V, 'm/s', 3);
      r.eq('A', 'Q / V', f(Q, 2) + ' / ' + f(L.V, 3), L.A, 'm²', 3);
      r.eq('P', '4.75 √Q', '4.75 × √' + f(Q, 2), L.P, 'm', 3);
      r.eq('R', '2.5 V² / f', '2.5 × ' + f(L.V, 3) + '² / ' + f(fs, 3), L.R, 'm', 3);
      r.eq('S', 'f^(5/3) / (3340 Q^(1/6))', '', L.S, '', 6);
      r.step('Bed slope = 1 in ' + f(1 / L.S, 0));
      r.h('3. Section dimensions');
      var tr = trapFromPA(L.P, L.A, z);
      if (!tr || tr.b <= 0) throw new Error('No trapezoid fits these P and A — reduce side slope / पार्श्व ढलान घटाएँ');
      r.eq('D', '[P − √(P² − 4kA)] / 2k, k = 2√(1+z²) − z', '', tr.D, 'm', 3);
      r.eq('B', 'P − 2D√(1+z²)', '', tr.b, 'm', 3);
      var chk = trapGeom(tr.b, tr.D, z);
      r.step('Check: A = (B + zD)D = ' + f(chk.A, 3) + ' m², R = A/P = ' + f(chk.R, 3) + ' m (Lacey R = ' + f(L.R, 3) + ' m; difference arises from the trapezoid approximation)');
      sec = { b: tr.b, D: tr.D, V: Q / chk.A, S: L.S, f: fs, A: chk.A, R: chk.R, P: chk.P };
      r.result('Silt factor f', fs, '', 3);
      r.check('Silt factor in usual range', fs >= 0.5 && fs <= 1.5, f(fs, 3), '0.5 – 1.5');
    } else {
      r.formula('Critical velocity V₀ = 0.55 m D^0.64 (SI)');
      r.formula('Q = A V₀ with A = (B/D + z) D²  → solve D');
      r.formula("Kutter: V = [(23 + 1/N + 0.00155/S) / (1 + (23 + 0.00155/S) N / √R)] √(RS)  → solve S for V = V₀");
      r.assume('Kennedy’s critical velocity relation applies (Upper Bari Doab data); m from silt grade.');
      r.assume('B/D ratio is chosen by the designer (Kennedy theory gives no unique section).');
      r.limit("Kutter's N about 0.0225 for earthen canals in good condition (verify).");
      r.h('1. Depth from continuity with V = V₀');
      var K = kennedy(Q, v.m, v.N, v.ratio, z);
      if (!isFinite(K.D)) throw new Error('No solution for depth / गहराई का हल नहीं मिला');
      r.eq('D', 'solve (B/D + z) D² × 0.55 m D^0.64 = Q', '(' + f(v.ratio, 2) + ' + ' + f(z, 2) + ') D² × 0.55 × ' + f(v.m, 2) + ' × D^0.64 = ' + f(Q, 2), K.D, 'm', 3);
      r.eq('B', '(B/D) × D', '', K.b, 'm', 3);
      r.eq('V₀', '0.55 m D^0.64', '', K.V0, 'm/s', 3);
      r.eq('A', '(B + zD) D', '', K.A, 'm²', 3);
      r.eq('R', 'A / P', f(K.A, 3) + ' / ' + f(K.P, 3), K.R, 'm', 3);
      r.h('2. Bed slope from Kutter’s formula');
      if (!isFinite(K.S)) throw new Error('Slope not found for Kutter’s formula / ढलान नहीं मिला');
      r.eq('S', 'Kutter V(N, R, S) = V₀', '', K.S, '', 7);
      r.step('Bed slope = 1 in ' + f(1 / K.S, 0));
      sec = { b: K.b, D: K.D, V: K.V0, S: K.S, A: K.A, R: K.R, P: K.P };
      r.result('Critical velocity ratio m', v.m, '', 2);
    }
    var fsl = v.bed + sec.D, tbl = fsl + v.fb;
    r.h('Levels');
    r.step('FSL = bed + D = ' + f(v.bed, 3) + ' + ' + f(sec.D, 3) + ' = ' + f(fsl, 3) + ' m');
    r.step('TBL = FSL + freeboard = ' + f(fsl, 3) + ' + ' + f(v.fb, 2) + ' = ' + f(tbl, 3) + ' m');
    r.result('Bed width B', sec.b, 'm', 2);
    r.result('Full supply depth D', sec.D, 'm', 3);
    r.result('Velocity V', sec.V, 'm/s', 3);
    r.result('Bed slope', '1 in ' + f(1 / sec.S, 0), '');
    r.result('FSL', fsl, 'm', 3);
    r.result('Top of bank', tbl, 'm', 3);
    r.check('Bed width positive', sec.b > 0, f(sec.b, 2) + ' m', '> 0');
    r.check('Velocity non-scouring for alluvium', sec.V <= 1.2, f(sec.V, 3) + ' m/s', '≤ 1.2 m/s (typical, verify)');
    r.check('Velocity non-silting', sec.V >= 0.3, f(sec.V, 3) + ' m/s', '≥ 0.3 m/s (typical, verify)');
    r.table('Canal section summary', ['Item', 'Value', 'Unit'], [['Q', Q, 'm³/s'], ['B', B.round(sec.b, 3), 'm'], ['D', B.round(sec.D, 3), 'm'],
      ['A', B.round(sec.A, 3), 'm²'], ['P', B.round(sec.P, 3), 'm'], ['R', B.round(sec.R, 3), 'm'], ['V', B.round(sec.V, 3), 'm/s'],
      ['S (1 in)', Math.round(1 / sec.S), ''], ['FSL', B.round(fsl, 3), 'm'], ['TBL', B.round(tbl, 3), 'm']], 'section');
    r.data = { b: sec.b, D: sec.D, fsl: fsl, tbl: tbl, S: sec.S };
    return r;
  }

  function regimeDrawing(v, rep) {
    var D = rep.data;
    var half = trapHalf(D.b, v.z, v.bed, D.fsl, D.tbl, v.berm);
    return [{ key: 'section', title: 'Canal cross-section / नहर अनुप्रस्थ काट', d: sectionDrawing({
      title: 'Unlined canal cross-section', half: half, bed: v.bed, fsl: D.fsl, tbl: D.tbl, gl: v.gl, banks: [v.wl, v.wr], outer: v.zo, z: v.z, bedWidth: D.b, berm: v.berm }) }];
  }

  function hecrasExport(name, sections, Q, S, n) {
    var txt = DS.hecras.geometryText('Canal', name, sections);
    var up = sections.length > 1 ? sections[sections.length - 1].chainage - sections[0].chainage : 0;
    var flow = DS.hecras.steadyFlowText('Canal', name, up, [{ name: 'FSL', Q: Q }, { name: '50% Q', Q: Q / 2 }], { upSlope: S, dnSlope: S });
    return { label: 'HEC-RAS cross-section + steady flow (.txt)', name: 'hecras-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.txt', mime: 'text/plain', text: txt + '\r\n' + flow, preview: true };
  }

  /* ---------- page: lined canal ---------- */
  var linedInputs = [
    { sec: 'जलीय डिज़ाइन / Hydraulic design' },
    { key: 'Q', hi: 'डिस्चार्ज', en: 'Design discharge Q', unit: 'm³/s', def: 12, min: 0.01, max: 3000 },
    { key: 'n', hi: 'मैनिंग n', en: "Manning's n (lining)", unit: '—', def: 0.018, min: 0.01, max: 0.04, help: 'Cement concrete lining 0.016–0.020 (verify IS 10430)' },
    { key: 'Sn', hi: 'तल ढलान 1 में', en: 'Bed slope 1 in', unit: '—', def: 5000, min: 100, max: 100000 },
    { key: 'shape', hi: 'आकार', en: 'Section shape', type: 'select', def: 'trap', options: [['trap', 'Trapezoidal'], ['tri', 'Triangular with rounded bottom (IS 4745)']] },
    { key: 'z', hi: 'पार्श्व ढलान', en: 'Side slope (H:V)', unit: 'H:1V', def: 1.5, min: 0.5, max: 3, help: 'Usual 1.25 : 1 to 1.5 : 1 for concrete lining (verify)' },
    { key: 'mode', hi: 'तल चौड़ाई', en: 'Bed width from', type: 'select', def: 'ratio', options: [['ratio', 'B/D ratio'], ['b', 'Fixed bed width B']], show: function (v) { return v.shape === 'trap'; } },
    { key: 'ratio', hi: 'B/D अनुपात', en: 'B/D ratio', unit: '—', def: 3, min: 0.5, max: 20, show: function (v) { return v.shape === 'trap' && v.mode === 'ratio'; } },
    { key: 'b', hi: 'तल चौड़ाई', en: 'Bed width B', unit: 'm', def: 4, min: 0.2, max: 200, show: function (v) { return v.shape === 'trap' && v.mode === 'b'; } },
    { key: 'vmin', hi: 'न्यूनतम वेग', en: 'Minimum (non-silting) velocity', unit: 'm/s', def: 0.6, min: 0.1, max: 3 },
    { key: 'vmax', hi: 'अधिकतम वेग', en: 'Maximum velocity for lining', unit: 'm/s', def: 2.0, min: 0.5, max: 6, help: 'Typical 2.0–2.5 m/s for CC lining (verify IS 10430)' },
    { sec: 'अस्तर एवं तटबंध / Lining and banks' },
    { key: 't', hi: 'अस्तर मोटाई', en: 'Lining thickness', unit: 'mm', def: 100, min: 40, max: 500 },
    { key: 'fbL', hi: 'अस्तर मुक्त फलक (0 = सुझाव)', en: 'Lining freeboard above FSL (0 = suggested)', unit: 'm', def: 0, min: 0, max: 3 },
    { key: 'fbB', hi: 'तटबंध मुक्त फलक (0 = सुझाव)', en: 'Bank freeboard above FSL (0 = suggested)', unit: 'm', def: 0, min: 0, max: 4 },
    { key: 'wl', hi: 'बायाँ तटबंध (0 = सुझाव)', en: 'Left (non-road) bank top width (0 = suggested)', unit: 'm', def: 0, min: 0, max: 20 },
    { key: 'wr', hi: 'सेवा सड़क तटबंध (0 = सुझाव)', en: 'Service-road bank top width (0 = suggested)', unit: 'm', def: 0, min: 0, max: 20 }
  ].concat(siteInputs);

  function linedDesign(v) {
    var r = new B.Report(), Q = v.Q, S = 1 / v.Sn, z = v.z, n = v.n;
    r.formula("Manning: Q = (1/n) A R^(2/3) S^(1/2)");
    if (v.shape === 'trap') r.formula('Trapezoid: A = (B + zD) D;  P = B + 2D√(1 + z²);  R = A/P');
    else r.formula('Triangular, rounded bottom (radius D): A = D²(θ + cot θ);  P = 2D(θ + cot θ);  R = D/2;  tan θ = 1/z');
    r.formula('Froude number F = V / √(g A/T)');
    r.ref('IS 4745 — Design of cross-section of lined canals (verify clause numbers).');
    r.ref('IS 10430 — Criteria for design of lined canals and guidance for selection of type of lining (freeboard and bank widths: verify tables).');
    r.assume('Uniform flow; Manning’s n constant for the lining; no allowance for weed or silting unless included in n.');
    r.assume('Suggested freeboard and bank widths are typical values — confirm with IS 10430 and departmental standards.');
    r.limit(v.shape === 'tri' ? 'IS 4745 recommends the triangular rounded-bottom section for smaller discharges (about Q ≤ 55 m³/s, verify).' : 'Trapezoidal (with rounded corners in IS 4745 for larger canals) — corners are drawn sharp here.');
    r.limit('Flow should be clearly subcritical (F ≤ 0.8) to avoid unstable waves.');

    var D, b, geo;
    r.h('1. Normal depth by Manning');
    if (v.shape === 'trap') {
      if (v.mode === 'ratio') {
        D = B.solveUp(function (d) { var g = trapGeom(v.ratio * d, d, z); return manningQ(n, g.A, g.R, S); }, Q, 1e-4, 1);
        b = v.ratio * D;
        r.step('Bed width taken as B = ' + f(v.ratio, 2) + ' D; solve (1/n) A R^(2/3) √S = Q for D');
      } else {
        b = v.b;
        D = B.solveUp(function (d) { var g = trapGeom(b, d, z); return manningQ(n, g.A, g.R, S); }, Q, 1e-4, 1);
        r.step('Bed width B = ' + f(b, 2) + ' m (given); solve (1/n) A R^(2/3) √S = Q for D');
      }
      geo = trapGeom(b, D, z);
    } else {
      D = B.solveUp(function (d) { var g = triGeom(d, z); return manningQ(n, g.A, g.R, S); }, Q, 1e-4, 1);
      b = 0;
      geo = triGeom(D, z);
      r.step('θ = atan(1/z) = ' + f(B.deg(geo.theta), 2) + '° = ' + f(geo.theta, 4) + ' rad;  θ + cot θ = ' + f(geo.theta + 1 / Math.tan(geo.theta), 4));
    }
    r.eq('D', 'normal depth', '', D, 'm', 3);
    if (v.shape === 'trap') r.eq('B', '', '', b, 'm', 3);
    r.eq('A', v.shape === 'trap' ? '(B + zD) D' : 'D²(θ + cot θ)', '', geo.A, 'm²', 3);
    r.eq('P', v.shape === 'trap' ? 'B + 2D√(1+z²)' : '2D(θ + cot θ)', '', geo.P, 'm', 3);
    r.eq('R', 'A / P', '', geo.R, 'm', 3);
    var V = r.eq('V', 'Q / A', f(Q, 3) + ' / ' + f(geo.A, 3), Q / geo.A, 'm/s', 3);
    r.step('Check: (1/n) A R^(2/3) √S = ' + f(manningQ(n, geo.A, geo.R, S), 3) + ' m³/s');
    var F = r.eq('F', 'V / √(g A / T)', f(V, 3) + ' / √(9.81 × ' + f(geo.A, 3) + ' / ' + f(geo.T, 3) + ')', V / Math.sqrt(G * geo.A / geo.T), '', 3);

    r.h('2. Freeboard and banks');
    var fbL = v.fbL > 0 ? v.fbL : liningFreeboard(Q);
    r.step('Lining freeboard = ' + f(fbL, 2) + ' m' + (v.fbL > 0 ? ' (given)' : ' (suggested from IS 10430 table: Q < 0.75 → 0.30; < 1.5 → 0.50; ≤ 85 → 0.60; > 85 → 0.75 m — verify)'));
    var fbB = v.fbB > 0 ? v.fbB : Math.max(fbL + 0.3, 0.6);
    r.step('Bank freeboard above FSL = ' + f(fbB, 2) + ' m' + (v.fbB > 0 ? ' (given)' : ' (suggested: lining freeboard + 0.30 m, at least 0.60 m — verify)'));
    var bw = bankWidths(Q), wl = v.wl > 0 ? v.wl : bw[1], wr = v.wr > 0 ? v.wr : bw[0];
    r.step('Bank top widths: service road ' + f(wr, 2) + ' m, other bank ' + f(wl, 2) + ' m' + (v.wl > 0 && v.wr > 0 ? ' (given)' : ' (typical practice for this discharge — verify)'));
    var fsl = v.bed + D, liningTop = fsl + fbL, tbl = fsl + fbB;
    r.step('FSL = ' + f(v.bed, 3) + ' + ' + f(D, 3) + ' = ' + f(fsl, 3) + ' m; top of lining = ' + f(liningTop, 3) + ' m; TBL = ' + f(tbl, 3) + ' m');

    r.result('Full supply depth D', D, 'm', 3);
    if (v.shape === 'trap') r.result('Bed width B', b, 'm', 3);
    r.result('Top width at FSL', geo.T, 'm', 3);
    r.result('Area A', geo.A, 'm²', 3);
    r.result('Velocity V', V, 'm/s', 3);
    r.result('Froude number', F, '', 3);
    r.result('FSL', fsl, 'm', 3);
    r.result('Top of lining', liningTop, 'm', 3);
    r.result('Top of bank', tbl, 'm', 3);
    r.check('Velocity ≥ non-silting', V >= v.vmin, f(V, 3) + ' m/s', '≥ ' + f(v.vmin, 2) + ' m/s');
    r.check('Velocity ≤ limit for lining', V <= v.vmax, f(V, 3) + ' m/s', '≤ ' + f(v.vmax, 2) + ' m/s');
    r.check('Flow well subcritical', F <= 0.8, f(F, 3), '≤ 0.8');
    r.check('Bank freeboard ≥ lining freeboard', fbB >= fbL, f(fbB, 2) + ' m', '≥ ' + f(fbL, 2) + ' m');
    if (v.shape === 'trap') {
      var g = bdGuide(Q), ratio = b / D;
      r.check('B/D within typical range', ratio >= g[0] && ratio <= g[1], f(ratio, 2), g[0] + ' – ' + g[1] + ' (guidance, verify)');
    }
    r.table('B/D guidance for lined trapezoidal canals (typical, verify IS 10430)', ['Q (m³/s)', 'B/D'], [['< 5', '1 – 2'], ['5 – 15', '2 – 4'], ['15 – 50', '3 – 6'], ['50 – 150', '5 – 8'], ['> 150', '6 – 10']], 'bd');
    // depth–discharge rating for HEC-RAS checks
    var rows = [];
    for (var k = 1; k <= 10; k++) {
      var dk = D * k / 10 * 1.2, gk = v.shape === 'trap' ? trapGeom(b, dk, z) : triGeom(dk, z);
      rows.push([B.round(dk, 3), B.round(gk.A, 3), B.round(gk.R, 3), B.round(manningQ(n, gk.A, gk.R, S), 3), B.round(manningQ(n, gk.A, gk.R, S) / gk.A, 3)]);
    }
    r.table('Depth–discharge (Manning)', ['Depth (m)', 'A (m²)', 'R (m)', 'Q (m³/s)', 'V (m/s)'], rows, 'rating');
    r.data = { D: D, b: b, fsl: fsl, tbl: tbl, liningTop: liningTop, wl: wl, wr: wr, S: S };
    return r;
  }

  function linedHalf(v, D) {
    return v.shape === 'trap' ? trapHalf(D.b, v.z, v.bed, D.fsl, D.tbl, 0) : triHalf(D.D, v.z, v.bed, D.tbl);
  }

  function linedDrawing(v, rep) {
    var D = rep.data;
    return [{ key: 'section', title: 'Lined canal cross-section / पक्की नहर अनुप्रस्थ काट', d: sectionDrawing({
      title: 'Lined canal cross-section', half: linedHalf(v, D), bed: v.bed, fsl: D.fsl, tbl: D.tbl, gl: v.gl, banks: [D.wl, D.wr], outer: v.zo, z: v.z,
      bedWidth: v.shape === 'trap' ? D.b : undefined, lining: { t: v.t / 1000, top: D.liningTop } }) }];
  }

  function linedExports(v, rep) {
    var D = rep.data;
    var pts = linedHalf(v, D);
    var right = pts.concat([[pts[pts.length - 1][0] + D.wr, D.tbl]]);
    var left = pts.map(function (q) { return [-q[0], q[1]]; }).reverse();
    left.unshift([left[0][0] - D.wl, D.tbl]);
    var all = left.concat(right.slice(1)), x0 = all[0][0];
    var points = all.map(function (q) { return [q[0] - x0, q[1]]; });
    var sec = { chainage: 0, points: points, bankLeft: -pts[pts.length - 1][0] - x0, bankRight: pts[pts.length - 1][0] - x0, nLOB: 0.03, nCh: v.n, nROB: 0.03 };
    return [hecrasExport('Lined canal', [sec], v.Q, D.S, v.n)];
  }

  /* ---------- page: longitudinal section ---------- */
  var SAMPLE_LS = '0, 212.40\n200, 212.30\n400, 212.10\n600, 211.95\n800, 211.60\n1000, 210.90\n1200, 210.70\n1400, 210.55\n1600, 209.70\n1800, 209.50\n2000, 209.35\n2200, 209.10\n2400, 208.20\n2600, 208.05\n2800, 207.90\n3000, 207.80';
  var lsInputs = [
    { sec: 'सर्वेक्षण / Survey' },
    { key: 'ground', hi: 'चेनेज, भूमि स्तर', en: 'Chainage (m), ground level (m) — paste from Excel', unit: 'm', type: 'textarea', def: SAMPLE_LS, rows: 8, help: 'Fictional sample. Two columns: chainage, ground level.' },
    { sec: 'नहर / Canal' },
    { key: 'Q', hi: 'डिस्चार्ज', en: 'Design discharge Q', unit: 'm³/s', def: 6, min: 0.01, max: 3000 },
    { key: 'bed0', hi: 'शीर्ष पर तल स्तर', en: 'Bed level at head (first chainage)', unit: 'm', def: 211.20, min: -500, max: 9000 },
    { key: 'Sn', hi: 'तल ढलान 1 में', en: 'Bed slope 1 in', unit: '—', def: 4000, min: 100, max: 100000 },
    { key: 'D', hi: 'पूर्ण आपूर्ति गहराई', en: 'Full supply depth D', unit: 'm', def: 1.5, min: 0.1, max: 15 },
    { key: 'fb', hi: 'मुक्त फलक', en: 'Freeboard to top of bank', unit: 'm', def: 0.75, min: 0.1, max: 3 },
    { key: 'b', hi: 'तल चौड़ाई', en: 'Bed width (for HEC-RAS sections)', unit: 'm', def: 3, min: 0.2, max: 200 },
    { key: 'z', hi: 'पार्श्व ढलान', en: 'Side slope (H:V)', unit: 'H:1V', def: 1.5, min: 0.25, max: 4 },
    { key: 'n', hi: 'मैनिंग n', en: "Manning's n", unit: '—', def: 0.018, min: 0.01, max: 0.05 },
    { sec: 'प्रपात नियम / Fall rules' },
    { key: 'dbal', hi: 'संतुलित गहराई (भूमि से तल)', en: 'Balancing depth: bed below ground', unit: 'm', def: 0.6, min: 0, max: 10, help: 'Bed level aimed at, below natural ground, for balanced cut and fill' },
    { key: 'minFall', hi: 'न्यूनतम प्रपात', en: 'Provide a fall when bed is higher than target by', unit: 'm', def: 0.5, min: 0.1, max: 5 },
    { key: 'maxFall', hi: 'अधिकतम प्रपात', en: 'Maximum height of one fall', unit: 'm', def: 1.5, min: 0.2, max: 10 }
  ];

  function lsDesign(v) {
    var r = new B.Report();
    var pts = B.parseTable(v.ground, 2).map(function (q) { return [q[0], q[1]]; }).sort(function (a, b) { return a[0] - b[0]; });
    if (pts.length < 2) throw new Error('कम से कम दो बिंदु चाहिए / Need at least two survey points');
    var S = 1 / v.Sn;
    r.formula('Bed level: z(ch) = z(ch_prev) − S (ch − ch_prev) − fall');
    r.formula('Target bed = GL − balancing depth; a fall is provided when bed − target ≥ minimum fall (drop = min(bed − target, max fall), rounded down to 0.05 m)');
    r.formula('FSL = bed + D;  TBL = FSL + freeboard');
    r.ref('Common canal L-section practice (S.K. Garg, Irrigation Engineering — location of falls).');
    r.assume('Falls are placed at survey chainages; detailed siting (near regulators, bridges) is done by the designer.');
    r.assume('Uniform bed slope between falls; no allowance for local structures.');
    r.limit('Survey points should be close enough (e.g. 100–200 m) to pick the drops in ground.');
    r.h('Bed levels along the canal');
    var bed = v.bed0, rows = [], falls = [];
    pts.forEach(function (p, i) {
      if (i > 0) bed -= S * (p[0] - pts[i - 1][0]);
      var target = p[1] - v.dbal, before = bed, fall = 0;
      if (bed - target >= v.minFall - 1e-9) {
        fall = Math.min(B.floorTo(bed - target, 0.05), v.maxFall);
        bed -= fall;
        falls.push({ ch: p[0], h: fall, up: before, dn: bed });
        r.step('Ch ' + DS.geo.fmtCh(p[0]) + ': bed ' + f(before, 3) + ' vs target ' + f(target, 3) + ' → fall of ' + f(fall, 2) + ' m; bed below fall ' + f(bed, 3));
      }
      rows.push([p[0], DS.geo.fmtCh(p[0]), B.round(p[1], 3), B.round(before, 3), B.round(bed, 3), fall ? B.round(fall, 2) : '', B.round(bed + v.D, 3), B.round(bed + v.D + v.fb, 3), B.round(p[1] - bed, 3)]);
    });
    if (!falls.length) r.step('No fall needed: bed stays within ' + f(v.minFall, 2) + ' m of the target level.');
    var cutMax = Math.max.apply(null, rows.map(function (x) { return x[8]; }));
    var fillMax = Math.max.apply(null, rows.map(function (x) { return x[7] - x[2]; }));
    r.result('Length', pts[pts.length - 1][0] - pts[0][0], 'm', 0);
    r.result('Number of falls', falls.length, '', 0);
    r.result('Total fall height', falls.reduce(function (a, x) { return a + x.h; }, 0), 'm', 2);
    r.result('Bed level at tail', bed, 'm', 3);
    r.result('Max depth of bed below ground', cutMax, 'm', 2);
    r.result('Max bank height above ground', fillMax, 'm', 2);
    r.check('Bed never above ground by more than D (bank in heavy fill)', rows.every(function (x) { return x[2] - x[4] > -v.D; }), f(Math.min.apply(null, rows.map(function (x) { return x[2] - x[4]; })), 2) + ' m', '> −D', 'GL − bed');
    r.check('Cutting depth reasonable', cutMax <= v.D + v.dbal + 2, f(cutMax, 2) + ' m', '≤ ' + f(v.D + v.dbal + 2, 2) + ' m (guidance)');
    r.table('Longitudinal section', ['Chainage (m)', 'Ch (km+m)', 'GL (m)', 'Bed before fall (m)', 'Bed level (m)', 'Fall (m)', 'FSL (m)', 'TBL (m)', 'GL − bed (m)'], rows, 'lsection');
    r.table('Falls', ['Chainage (m)', 'Fall height (m)', 'U/s bed (m)', 'D/s bed (m)'], falls.map(function (x) { return [x.ch, B.round(x.h, 2), B.round(x.up, 3), B.round(x.dn, 3)]; }), 'falls');
    r.data = { pts: pts, rows: rows, falls: falls, S: S };
    return r;
  }

  function lsDrawing(v, rep) {
    var D = rep.data, rows = D.rows;
    var x0 = rows[0][0], x1 = rows[rows.length - 1][0];
    var ys = [];
    rows.forEach(function (x) { ys.push(x[2], x[4], x[7]); });
    var ymin = Math.min.apply(null, ys), ymax = Math.max.apply(null, ys);
    var hr = (x1 - x0), vr = Math.max(ymax - ymin, 0.5);
    var vex = [1, 2, 5, 10, 20, 25, 50, 100].filter(function (k) { return vr * k <= hr * 0.45; }).pop() || 1;
    var d = new Drawing({ title: 'Canal longitudinal section', vex: vex });
    // ground
    var gl = rows.map(function (x) { return [x[0], x[2]]; });
    var base = ymin - vr * 0.15;
    d.hatch(gl.concat([[x1, base], [x0, base]]), 'soil', { outline: false });
    d.pline(gl, 'SOIL');
    // bed with falls (vertical drops)
    var bedPts = [], fsl = [], tbl = [];
    rows.forEach(function (x) {
      if (x[5] !== '') { bedPts.push([x[0], x[3]]); fsl.push([x[0], x[3] + v.D]); tbl.push([x[0], x[3] + v.D + v.fb]); }
      bedPts.push([x[0], x[4]]); fsl.push([x[0], x[6]]); tbl.push([x[0], x[7]]);
    });
    d.hatch(fsl.concat(bedPts.slice().reverse()), 'water', { outline: false });
    d.pline(bedPts, 'CONCRETE', { w: 0.5 });
    d.pline(fsl, 'WATER');
    d.pline(tbl, 'DIM', { dash: true });
    D.falls.forEach(function (fl) { d.text(fl.ch, fl.up + v.D + v.fb, 'Fall ' + f(fl.h, 2) + ' m', { h: 2.2, ha: 'c', va: 'b', dy: 2 }); });
    d.text(x0, rows[0][6], 'FSL', { h: 2.2, ha: 'r', dx: -1 });
    d.text(x0, rows[0][4], 'Bed', { h: 2.2, ha: 'r', dx: -1 });
    d.text(x0, rows[0][7], 'TBL', { h: 2.2, ha: 'r', dx: -1 });
    d.text(x0, rows[0][2], 'GL', { h: 2.2, ha: 'r', va: 't', dx: -1, dy: -1 });
    d.flow(x0 + hr * 0.12, (rows[0][4] + rows[0][6]) / 2, 0);
    // data band
    var labels = [['Chainage', 0], ['Ground level', 2], ['Bed level', 4], ['FSL', 6]];
    labels.forEach(function (lb, k) {
      d.text(x0, base, lb[0], { h: 2.2, ha: 'r', va: 'm', dx: -2, dy: -6 - k * 14 });
      d.line(x0, base, x1, base, 'DIM');
    });
    var step = Math.max(1, Math.ceil(rows.length / 25));
    rows.forEach(function (x, i) {
      if (i % step && i !== rows.length - 1) return;
      d.line(x[0], base, x[0], base, 'DIM');
      labels.forEach(function (lb, k) {
        var val = lb[1] === 0 ? x[1] : f(x[lb[1]], 2);
        d.text(x[0], base, val, { h: 2, ha: 'r', va: 'm', rot: 90, dy: -2 - k * 14 });
      });
    });
    return [{ key: 'lsection', title: 'Longitudinal section / अनुदैर्ध्य काट', d: d }];
  }

  function lsExports(v, rep) {
    var D = rep.data;
    var sections = D.rows.map(function (x) {
      var hs = DS.hecras.canalSection({ bed: x[4], b: v.b, z: v.z, bankH: v.D + v.fb, bankTop: 3, outer: 2, ground: x[2] });
      return { chainage: x[0], points: hs.points, bankLeft: hs.bankLeft, bankRight: hs.bankRight, nLOB: 0.03, nCh: v.n, nROB: 0.03 };
    });
    return [hecrasExport('Main reach', sections, v.Q, D.S, v.n)];
  }

  var hecrasGuide = [
    'In HEC-RAS create a new project, then open Edit → Geometric Data and draw one river reach (name it as in the export, e.g. "Canal").',
    'Choose Cross Section → Options → Add a new cross section; enter the River Station shown in the export.',
    'Copy the Station / Elevation block from the .txt file (Notepad), click the first cell of the table in HEC-RAS and paste (Ctrl+V).',
    "Type the downstream reach lengths, Manning's n values and the main-channel bank stations given above the table; Apply Data.",
    'Repeat for every river station, then save the geometry.',
    'Open Edit → Steady Flow Data, enter the profile flows at the upstream river station and set Normal Depth boundaries with the slopes given.',
    'Run Steady Flow Analysis (subcritical) and compare the computed water surface with the FSL in this design.'
  ];

  return {
    fns: { siltFactor: siltFactor, lacey: lacey, trapFromPA: trapFromPA, kennedyV0: kennedyV0, kutterV: kutterV, kennedy: kennedy,
      manningQ: manningQ, trapGeom: trapGeom, triGeom: triGeom, triTop: triTop, liningFreeboard: liningFreeboard, bankWidths: bankWidths,
      sectionDrawing: sectionDrawing, offsetPolyline: offsetPolyline },
    pages: [
      { id: 'canal-regime', group: 'B', order: 1, hi: 'कच्ची नहर (रेजीम)', en: 'Unlined canal — Lacey / Kennedy', refs: 'IS 7112; Lacey regime theory; Kennedy theory',
        intro: 'Section and slope of an unlined alluvial canal by Lacey’s regime theory or Kennedy’s theory, with banks, berms and levels.',
        inputs: regimeInputs, design: regimeDesign, drawings: regimeDrawing },
      { id: 'canal-lined', group: 'B', order: 2, hi: 'पक्की नहर', en: 'Lined canal (Manning)', refs: 'IS 4745, IS 10430',
        intro: 'Trapezoidal or triangular (rounded-bottom) lined canal by Manning’s equation, with freeboard, banks, service road and velocity checks.',
        inputs: linedInputs, design: linedDesign, drawings: linedDrawing, exports: linedExports, guide: hecrasGuide },
      { id: 'canal-lsection', group: 'B', order: 3, hi: 'नहर अनुदैर्ध्य काट', en: 'Canal longitudinal section', refs: 'Bed levels and falls by chainage',
        intro: 'Paste chainage and ground levels; get bed, FSL and bank levels with falls where the ground drops. Exports HEC-RAS cross-sections.',
        inputs: lsInputs, design: lsDesign, drawings: lsDrawing, exports: lsExports, guide: hecrasGuide }
    ]
  };
});
