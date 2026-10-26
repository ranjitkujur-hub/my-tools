/* C1. Weirs and barrages on permeable foundations / पारगम्य नींव पर वियर
 * Bligh's creep theory and Khosla's theory (IS 6966 Part 1): uplift at the
 * key points of the upstream and downstream end cut-offs with corrections,
 * exit gradient, floor thickness and cut-off depths from Lacey's scour depth. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../core/index.js'));
  else root.DS.register(factory(root.DS));
})(typeof self !== 'undefined' ? self : this, function (DS) {
  'use strict';
  var B = DS.base, Drawing = DS.Drawing, f = B.f;

  /* ---------- formulas ---------- */
  // Khosla: lambda for a single end pile of depth d under a floor of length b
  function lambda(b, d) { var a = b / d; return (1 + Math.sqrt(1 + a * a)) / 2; }
  // Residual pressure (fraction of H) at E and D of a downstream end pile
  function phiE(lam) { return Math.acos((lam - 2) / lam) / Math.PI; }
  function phiD(lam) { return Math.acos((lam - 1) / lam) / Math.PI; }
  // Exit gradient GE = H/d · 1/(π√λ)
  function exitGradient(H, d, lam) { return H / d / (Math.PI * Math.sqrt(lam)); }
  // Mutual interference of piles (percent): C = 19 √(D/b') (d + D)/b
  function interference(D, d, bPrime, b) { return D > 0 ? 19 * Math.sqrt(D / bPrime) * (d + D) / b : 0; }
  // Khosla's correction for a sloping floor, percent for full slope length (positive for down slopes)
  var SLOPE_HV = [1, 2, 3, 4, 5, 6, 7, 8];
  var SLOPE_C = [11.2, 6.5, 4.5, 3.3, 2.8, 2.5, 2.3, 2.0];
  function slopeCorrection(s) { return s < 1 ? 11.2 : B.interp(SLOPE_HV, SLOPE_C, s); }
  // Lacey's normal scour depth R = 1.35 (q²/f)^(1/3)
  function laceyScour(q, fs) { return 1.35 * Math.pow(q * q / fs, 1 / 3); }
  // Bligh: creep length and residual head
  function blighLength(b, d1, d2) { return b + 2 * d1 + 2 * d2; }

  /* Full Khosla analysis for two end piles.
   * p = {H, b, d1, d2, t1, t2, Dlev1 (u/s pile bottom level), Dlev2, us (u/s floor level), ds (d/s floor level), slopePct} */
  function khosla(p) {
    var lam1 = lambda(p.b, p.d1), lam2 = lambda(p.b, p.d2);
    var E1 = 100, D1 = 100 - 100 * phiD(lam1), C1 = 100 - 100 * phiE(lam1);
    var E2 = 100 * phiE(lam2), D2 = 100 * phiD(lam2), C2 = 0;
    var bp = p.b - (p.pileW || 0);
    // interference: on C1 by the d/s pile (+), on E2 by the u/s pile (−); depths below the level of the point
    var Dc1 = p.us - p.Dlev2, dc1 = p.d1;
    var Ce1 = interference(Dc1, dc1, bp, p.b);
    var De2 = p.ds - p.Dlev1, de2 = p.d2;
    var Ce2 = interference(De2, de2, bp, p.b);
    // floor thickness
    var Ct1 = (D1 - C1) / p.d1 * p.t1;
    var Ct2 = (E2 - D2) / p.d2 * p.t2;
    var Cs = p.slopePct || 0;
    return {
      lam1: lam1, lam2: lam2, raw: { E1: E1, D1: D1, C1: C1, E2: E2, D2: D2, C2: C2 },
      corr: { int1: Ce1, int2: -Ce2, t1: Ct1, t2: -Ct2, slope: Cs },
      C1: C1 + Ce1 + Ct1, E2: E2 - Ce2 - Ct2 + Cs, D1: D1, D2: D2, E1: E1, C2: C2,
      GE: exitGradient(p.H, p.d2, lam2)
    };
  }

  /* ---------- inputs ---------- */
  var inputs = [
    { sec: 'जलीय आँकड़े / Hydraulic data' },
    { key: 'Q', hi: 'डिज़ाइन बाढ़', en: 'Design flood Q', unit: 'm³/s', def: 1500, min: 1, max: 100000 },
    { key: 'Lw', hi: 'जलमार्ग की लंबाई', en: 'Length of waterway', unit: 'm', def: 200, min: 1, max: 5000 },
    { key: 'fs', hi: 'सिल्ट गुणांक', en: 'Lacey silt factor f', unit: '—', def: 1.0, min: 0.3, max: 5 },
    { key: 'usHFL', hi: 'अपस्ट्रीम उच्च बाढ़ स्तर', en: 'Upstream HFL (after afflux)', unit: 'm', def: 105.0, min: -100, max: 9000 },
    { key: 'dsHFL', hi: 'डाउनस्ट्रीम उच्च बाढ़ स्तर', en: 'Downstream HFL', unit: 'm', def: 104.0, min: -100, max: 9000 },
    { key: 'pond', hi: 'तालाब स्तर', en: 'Pond level (max static, d/s dry)', unit: 'm', def: 103.5, min: -100, max: 9000 },
    { sec: 'फर्श एवं क्रेस्ट / Floor and crest' },
    { key: 'usFloor', hi: 'अपस्ट्रीम फर्श स्तर', en: 'Upstream floor level', unit: 'm', def: 100.0, min: -100, max: 9000 },
    { key: 'dsFloor', hi: 'डाउनस्ट्रीम फर्श स्तर', en: 'Downstream floor level', unit: 'm', def: 99.0, min: -100, max: 9000 },
    { key: 'crest', hi: 'क्रेस्ट स्तर', en: 'Crest level', unit: 'm', def: 103.5, min: -100, max: 9000 },
    { key: 'crestW', hi: 'क्रेस्ट चौड़ाई', en: 'Crest top width', unit: 'm', def: 2.5, min: 0.3, max: 30 },
    { key: 'usSlope', hi: 'अपस्ट्रीम ढलान', en: 'Upstream face slope (H:1V)', unit: 'H:V', def: 1, min: 0, max: 10 },
    { key: 'dsSlope', hi: 'डाउनस्ट्रीम ग्लेसिस ढलान', en: 'Downstream glacis slope (H:1V)', unit: 'H:V', def: 3, min: 0.5, max: 10 },
    { key: 'Lu', hi: 'अपस्ट्रीम फर्श लंबाई', en: 'Upstream floor length (to crest block)', unit: 'm', def: 10, min: 0, max: 500 },
    { key: 'b', hi: 'कुल फर्श लंबाई', en: 'Total impervious floor length b', unit: 'm', def: 50, min: 2, max: 1000 },
    { key: 'd1', hi: 'अपस्ट्रीम कट-ऑफ गहराई', en: 'Upstream cut-off depth d1 (below u/s floor)', unit: 'm', def: 4, min: 0.3, max: 50 },
    { key: 'd2', hi: 'डाउनस्ट्रीम कट-ऑफ गहराई', en: 'Downstream cut-off depth d2 (below d/s floor)', unit: 'm', def: 6, min: 0.3, max: 50 },
    { key: 't1', hi: 'अपस्ट्रीम फर्श मोटाई', en: 'Floor thickness at u/s cut-off t1', unit: 'm', def: 1.0, min: 0.1, max: 10 },
    { key: 't2', hi: 'डाउनस्ट्रीम सिरे पर फर्श मोटाई', en: 'Floor thickness at d/s cut-off t2', unit: 'm', def: 1.1, min: 0.1, max: 10 },
    { key: 'slope', hi: 'ग्लेसिस ढलान सुधार', en: 'Apply slope correction for the d/s glacis', type: 'select', def: 'yes', options: [['yes', 'Yes — glacis lies between the cut-offs'], ['no', 'No']] },
    { sec: 'मानदंड / Criteria' },
    { key: 'G', hi: 'फर्श सामग्री का विशिष्ट गुरुत्व', en: 'Specific gravity of floor material G', unit: '—', def: 2.24, min: 1.5, max: 3.2 },
    { key: 'Cb', hi: 'ब्लाई क्रीप गुणांक', en: "Bligh's creep coefficient C", unit: '—', def: 15, min: 3, max: 25,
      help: 'Typical: fine micaceous sand 18, fine sand 15, coarse sand 12, gravel and sand 9, boulders 4–6' },
    { key: 'GEn', hi: 'सुरक्षित निकास प्रवणता (1 में)', en: 'Safe exit gradient, 1 in', unit: '—', def: 6, min: 2, max: 10,
      help: 'Typical: shingle 1 in 4–5, coarse sand 1 in 5–6, fine sand 1 in 6–7' },
    { key: 'kus', hi: 'अपस्ट्रीम स्कॉर गुणक', en: 'U/s scour factor (× Lacey R below u/s HFL)', unit: '—', def: 1.5, min: 0.5, max: 3 },
    { key: 'kds', hi: 'डाउनस्ट्रीम स्कॉर गुणक', en: 'D/s scour factor (× Lacey R below d/s HFL)', unit: '—', def: 2.0, min: 0.5, max: 3 }
  ];

  function geometry(v) {
    var x1 = v.Lu;                                        // u/s toe of crest block
    var x2 = x1 + v.usSlope * (v.crest - v.usFloor);       // u/s edge of crest
    var x3 = x2 + v.crestW;                               // d/s edge of crest
    var xg = x3 + v.dsSlope * (v.crest - v.dsFloor);       // toe of d/s glacis
    return { x1: x1, x2: x2, x3: x3, xg: xg, bs: xg - x3 };
  }

  function design(v) {
    if (v.crest <= v.usFloor || v.crest <= v.dsFloor) throw new Error('क्रेस्ट फर्श से ऊपर हो / Crest must be above both floors');
    if (v.dsFloor > v.usFloor) throw new Error('डाउनस्ट्रीम फर्श ऊपरी फर्श से ऊँचा नहीं / D/s floor should not be above the u/s floor');
    if (v.pond <= v.dsFloor) throw new Error('तालाब स्तर डाउनस्ट्रीम फर्श से ऊपर हो / Pond level must be above the d/s floor');
    var g = geometry(v);
    if (g.xg >= v.b - 1) throw new Error('फर्श छोटा है: ग्लेसिस का पैर ' + f(g.xg, 2) + ' m पर / Floor too short: glacis toe at ' + f(g.xg, 2) + ' m, increase b or reduce slopes');
    var r = new B.Report();
    r.formula('Max static head H = pond level − d/s floor level (d/s dry)');
    r.formula("Bligh: creep length L = b + 2d1 + 2d2 ≥ C·H; residual head h = H (1 − l/L); t = (4/3) h/(G − 1)");
    r.formula('Khosla: α = b/d, λ = [1 + √(1 + α²)]/2, φE = (1/π) cos⁻¹[(λ − 2)/λ], φD = (1/π) cos⁻¹[(λ − 1)/λ]');
    r.formula('U/s pile: φE1 = 100 %, φD1 = 100 − φD, φC1 = 100 − φE; d/s pile: φE2 = φE, φD2 = φD, φC2 = 0');
    r.formula("Mutual interference: C = 19 √(D/b′) · (d + D)/b  (%)");
    r.formula('Floor thickness correction: ± (φD − φC or φE − φD)/d × t');
    r.formula('Exit gradient: GE = (H/d) · 1/(π√λ)');
    r.formula('Floor thickness: t = h/(G − 1), h = φ·H/100');
    r.formula("Lacey scour depth: R = 1.35 (q²/f)^(1/3), q = Q/L");
    r.ref('IS 6966 (Part 1):1989 Hydraulic design of barrages and weirs — alluvial reaches (verify clause for scour factors and exit gradient values).');
    r.ref('Khosla, Bose and Taylor (1936), Design of weirs on permeable foundations, CBIP Publication No. 12.');
    r.ref('S.K. Garg, Irrigation Engineering and Hydraulic Structures — Bligh and Khosla methods.');
    r.assume('Homogeneous, isotropic permeable foundation of large depth; seepage is 2D steady flow.');
    r.assume('Only the two end cut-offs are considered; intermediate piles are not modelled.');
    r.assume('Pressure varies linearly between the key points C1 and E2 along the floor.');
    r.assume('Uplift is measured as head above the d/s floor level; worst case = pond full, d/s dry, no flow.');
    if (v.slope === 'yes') r.assume('Slope correction for the d/s glacis applied at E2 (glacis lies between the cut-offs), proportional to bs/b′.');
    r.limit('Khosla closed-form solutions are for a flat floor; level differences are handled by the usual corrections only.');
    r.limit('Exit gradient check governs piping; floor thickness check governs uplift. Both need the d/s cut-off intact.');

    var H = v.pond - v.dsFloor;
    r.h('1. Heads and scour depth');
    r.eq('Max static head H', 'pond − d/s floor', f(v.pond, 3) + ' − ' + f(v.dsFloor, 3), H, 'm', 3);
    var q = r.eq('Discharge intensity q', 'Q / L', f(v.Q, 1) + ' / ' + f(v.Lw, 1), v.Q / v.Lw, 'm³/s/m', 3);
    var R = r.eq('Lacey scour depth R', '1.35 (q²/f)^(1/3)', '1.35 × (' + f(q, 3) + '² / ' + f(v.fs, 2) + ')^(1/3)', laceyScour(q, v.fs), 'm', 3);
    var reqUs = r.eq('Required u/s cut-off bottom', 'u/s HFL − ' + v.kus + 'R', f(v.usHFL, 3) + ' − ' + v.kus + ' × ' + f(R, 3), v.usHFL - v.kus * R, 'm', 3);
    var reqDs = r.eq('Required d/s cut-off bottom', 'd/s HFL − ' + v.kds + 'R', f(v.dsHFL, 3) + ' − ' + v.kds + ' × ' + f(R, 3), v.dsHFL - v.kds * R, 'm', 3);
    var lev1 = v.usFloor - v.d1, lev2 = v.dsFloor - v.d2;
    r.step('Provided u/s cut-off bottom = ' + f(v.usFloor, 3) + ' − ' + f(v.d1, 2) + ' = ' + f(lev1, 3) + ' m; d/s cut-off bottom = ' + f(v.dsFloor, 3) + ' − ' + f(v.d2, 2) + ' = ' + f(lev2, 3) + ' m');

    r.h("2. Bligh's creep check");
    var Lc = r.eq('Creep length L', 'b + 2d1 + 2d2', f(v.b, 2) + ' + 2×' + f(v.d1, 2) + ' + 2×' + f(v.d2, 2), blighLength(v.b, v.d1, v.d2), 'm', 2);
    var Lreq = r.eq('Required creep length', 'C · H', f(v.Cb, 1) + ' × ' + f(H, 3), v.Cb * H, 'm', 2);
    var lToe = 2 * v.d1 + g.xg;
    var hB = r.eq('Bligh residual head at glacis toe', 'H (1 − l/L)', f(H, 3) + ' × (1 − ' + f(lToe, 2) + '/' + f(Lc, 2) + ')', H * (1 - lToe / Lc), 'm', 3);
    var tB = r.eq('Bligh floor thickness at toe', '(4/3) h/(G − 1)', '1.333 × ' + f(hB, 3) + ' / ' + f(v.G - 1, 2), 4 / 3 * hB / (v.G - 1), 'm', 3);

    r.h("3. Khosla's key-point pressures");
    var slopePct = 0;
    if (v.slope === 'yes') {
      var cs = slopeCorrection(v.dsSlope);
      slopePct = cs * g.bs / (v.b - 0.4);
      r.step('Glacis slope ' + f(v.dsSlope, 2) + ':1 → Khosla slope correction ' + f(cs, 2) + ' % for full length; bs = ' + f(g.bs, 2) + ' m, b′ = ' + f(v.b - 0.4, 2) + ' m');
      r.eq('Slope correction at E2', f(cs, 2) + ' × bs/b′', f(cs, 2) + ' × ' + f(g.bs, 2) + ' / ' + f(v.b - 0.4, 2), slopePct, '%', 2);
    }
    var k = khosla({ H: H, b: v.b, d1: v.d1, d2: v.d2, t1: v.t1, t2: v.t2, Dlev1: lev1, Dlev2: lev2, us: v.usFloor, ds: v.dsFloor, pileW: 0.4, slopePct: slopePct });
    r.step('U/s pile: α1 = b/d1 = ' + f(v.b, 2) + '/' + f(v.d1, 2) + ' = ' + f(v.b / v.d1, 3) + ', λ1 = ' + f(k.lam1, 4) +
      ' → φE = ' + f(100 - k.raw.C1, 2) + ' %, φD = ' + f(100 - k.raw.D1, 2) + ' %');
    r.step('   φE1 = 100 %, φD1 = 100 − ' + f(100 - k.raw.D1, 2) + ' = ' + f(k.raw.D1, 2) + ' %, φC1 = 100 − ' + f(100 - k.raw.C1, 2) + ' = ' + f(k.raw.C1, 2) + ' %');
    r.step('D/s pile: α2 = b/d2 = ' + f(v.b, 2) + '/' + f(v.d2, 2) + ' = ' + f(v.b / v.d2, 3) + ', λ2 = ' + f(k.lam2, 4) +
      ' → φE2 = ' + f(k.raw.E2, 2) + ' %, φD2 = ' + f(k.raw.D2, 2) + ' %, φC2 = 0');
    r.h('4. Corrections');
    r.step('Interference on C1 by d/s pile: D = ' + f(v.usFloor - lev2, 2) + ' m, d = ' + f(v.d1, 2) + ' m, b′ = ' + f(v.b - 0.4, 2) + ' m → C = +' + f(k.corr.int1, 3) + ' %');
    r.step('Thickness correction at C1 = (φD1 − φC1)/d1 × t1 = (' + f(k.raw.D1, 2) + ' − ' + f(k.raw.C1, 2) + ')/' + f(v.d1, 2) + ' × ' + f(v.t1, 2) + ' = +' + f(k.corr.t1, 3) + ' %');
    r.step('Interference on E2 by u/s pile: D = ' + f(Math.max(0, v.dsFloor - lev1), 2) + ' m, d = ' + f(v.d2, 2) + ' m → C = ' + f(k.corr.int2, 3) + ' %' +
      (v.dsFloor - lev1 <= 0 ? ' (u/s pile does not reach below d/s floor level)' : ''));
    r.step('Thickness correction at E2 = −(φE2 − φD2)/d2 × t2 = −(' + f(k.raw.E2, 2) + ' − ' + f(k.raw.D2, 2) + ')/' + f(v.d2, 2) + ' × ' + f(v.t2, 2) + ' = ' + f(k.corr.t2, 3) + ' %');
    r.step('Corrected φC1 = ' + f(k.C1, 2) + ' %, corrected φE2 = ' + f(k.E2, 2) + ' %');

    r.h('5. Exit gradient');
    var GEs = 1 / v.GEn;
    r.eq('GE', '(H/d2) · 1/(π√λ2)', '(' + f(H, 3) + '/' + f(v.d2, 2) + ') / (π × √' + f(k.lam2, 4) + ')', k.GE, '', 4);
    r.step('= 1 in ' + f(1 / k.GE, 2) + '; safe value 1 in ' + f(v.GEn, 1));

    r.h('6. Floor thickness along the d/s floor');
    var phiAt = function (x) { return k.C1 + (k.E2 - k.C1) * x / v.b; };
    var nStep = 4, Ld = v.b - g.xg, steps = [], rows = [];
    for (var i = 0; i <= nStep; i++) {
      var x = g.xg + Ld * i / nStep, ph = phiAt(x), h = ph * H / 100, tr = Math.max(0.3, h / (v.G - 1));
      rows.push([B.round(x, 2), B.round(ph, 2), B.round(h, 3), B.round(h / (v.G - 1), 3)]);
      if (i < nStep) steps.push({ x0: x, x1: g.xg + Ld * (i + 1) / nStep, t: B.ceilTo(tr, 0.1) });
      r.step('x = ' + f(x, 2) + ' m: φ = ' + f(ph, 2) + ' %, h = ' + f(ph, 2) + '% × ' + f(H, 3) + ' = ' + f(h, 3) + ' m, t = h/(G − 1) = ' + f(h / (v.G - 1), 3) + ' m');
    }
    var tEndReq = rows[rows.length - 1][3];
    r.step('Adopted stepped thickness (rounded up to 0.1 m, minimum 0.3 m): ' + steps.map(function (s) { return f(s.x0, 1) + '–' + f(s.x1, 1) + ' m: ' + f(s.t, 1) + ' m'; }).join('; '));
    r.table('Uplift and floor thickness along the d/s floor', ['x from u/s end (m)', 'φ (%)', 'Uplift head h (m)', 'Required t (m)'], rows, 'floor');
    r.table("Khosla key points", ['Point', 'Raw φ (%)', 'Corrected φ (%)', 'Head above d/s floor (m)', 'Level of HGL (m)'], [
      ['E1', 100, 100, H, v.dsFloor + H],
      ['D1', B.round(k.raw.D1, 2), B.round(k.D1, 2), B.round(k.D1 * H / 100, 3), B.round(v.dsFloor + k.D1 * H / 100, 3)],
      ['C1', B.round(k.raw.C1, 2), B.round(k.C1, 2), B.round(k.C1 * H / 100, 3), B.round(v.dsFloor + k.C1 * H / 100, 3)],
      ['E2', B.round(k.raw.E2, 2), B.round(k.E2, 2), B.round(k.E2 * H / 100, 3), B.round(v.dsFloor + k.E2 * H / 100, 3)],
      ['D2', B.round(k.raw.D2, 2), B.round(k.D2, 2), B.round(k.D2 * H / 100, 3), B.round(v.dsFloor + k.D2 * H / 100, 3)],
      ['C2', 0, 0, 0, v.dsFloor]], 'keypoints');

    r.result('Max static head H', H, 'm', 3);
    r.result('Lacey scour depth R', R, 'm', 2);
    r.result('Corrected φC1 (u/s pile)', k.C1, '%', 2);
    r.result('Corrected φE2 (d/s pile)', k.E2, '%', 2);
    r.result('Exit gradient GE', '1 in ' + f(1 / k.GE, 2), '');
    r.result('Required floor thickness at glacis toe', rows[0][3], 'm', 2);
    r.result('Required floor thickness at d/s end', tEndReq, 'm', 2);
    r.result("Bligh creep length provided / required", f(Lc, 1) + ' / ' + f(Lreq, 1), 'm');

    r.check('Exit gradient (Khosla)', k.GE <= GEs, '1 in ' + f(1 / k.GE, 2), '≤ 1 in ' + f(v.GEn, 1));
    r.check("Bligh's creep length", Lc >= Lreq, f(Lc, 1) + ' m', '≥ C·H = ' + f(Lreq, 1) + ' m');
    r.check('U/s cut-off depth for scour', lev1 <= reqUs + 1e-6, 'bottom ' + f(lev1, 2) + ' m', '≤ ' + f(reqUs, 2) + ' m', 'verify clause for scour factor');
    r.check('D/s cut-off depth for scour', lev2 <= reqDs + 1e-6, 'bottom ' + f(lev2, 2) + ' m', '≤ ' + f(reqDs, 2) + ' m', 'verify clause for scour factor');
    r.check('Floor thickness t2 assumed at d/s end', v.t2 >= tEndReq - 1e-6, f(v.t2, 2) + ' m', '≥ ' + f(tEndReq, 2) + ' m (Khosla)');
    r.check('Glacis toe within floor', g.xg < v.b - 3, f(g.xg, 2) + ' m', '< b − 3 = ' + f(v.b - 3, 2) + ' m');
    if (tB > rows[0][3]) r.warn('Bligh gives a thicker floor at the toe (' + f(tB, 2) + ' m) than Khosla (' + f(rows[0][3], 2) + ' m); Khosla is the basis of IS 6966.');
    r.data = { v: v, g: g, H: H, k: k, steps: steps, lev1: lev1, lev2: lev2, rows: rows };
    return r;
  }

  /* ---------- drawing ---------- */
  function drawings(v, rep) {
    var D = rep.data, g = D.g, k = D.k, d = new Drawing({ title: 'Weir floor profile and uplift' });
    var pw = 0.4, us = v.usFloor, ds = v.dsFloor;
    var tToe = D.steps[0].t;
    // concrete floor + crest block
    var top = [[0, us], [g.x1, us], [g.x2, v.crest], [g.x3, v.crest], [g.xg, ds], [v.b, ds]];
    var bot = [[v.b, ds - v.t2]];
    for (var i = D.steps.length - 1; i >= 0; i--) {
      var s = D.steps[i];
      bot.push([s.x1, ds - s.t]); bot.push([s.x0, ds - s.t]);
      if (i > 0) bot.push([s.x0, ds - D.steps[i - 1].t]);
    }
    bot[0] = [v.b, ds - D.steps[D.steps.length - 1].t];
    bot.push([g.x1, us - v.t1]); bot.push([0, us - v.t1]);
    var floorPoly = top.concat(bot);
    // soil around piles
    var yb = Math.min(D.lev1, D.lev2) - 2;
    var soil = [[-20, us], [0, us], [0, D.lev1], [pw, D.lev1], [pw, us - v.t1], [g.x1, us - v.t1]];
    for (var j = 0; j < D.steps.length; j++) {
      var st = D.steps[j];
      if (j === 0) soil.push([st.x0, ds - st.t]); else soil.push([st.x0, ds - D.steps[j - 1].t], [st.x0, ds - st.t]);
      soil.push([j === D.steps.length - 1 ? v.b - pw : st.x1, ds - st.t]);
    }
    soil.push([v.b - pw, D.lev2], [v.b, D.lev2], [v.b, ds], [v.b + 20, ds], [v.b + 20, yb], [-20, yb]);
    d.hatch(soil, 'soil', { outline: false });
    d.line(-20, us, 0, us, 'SOIL'); d.line(v.b, ds, v.b + 20, ds, 'SOIL');
    // water (pond, static) upstream and d/s HFL line
    var xp = g.x1 + v.usSlope * (v.pond - us);
    if (v.pond > us) d.hatch([[-20, us], [g.x1, us], [Math.min(xp, g.x2), Math.min(v.pond, v.crest)], [-20, Math.min(v.pond, v.crest)]], 'water');
    d.line(-20, v.usHFL, g.x2, v.usHFL, 'WATER', { dash: true });
    d.line(g.xg, v.dsHFL, v.b + 20, v.dsHFL, 'WATER', { dash: true });
    d.hatch(floorPoly, 'concrete');
    d.hatch([[0, us], [pw, us], [pw, D.lev1], [0, D.lev1]], 'concrete');
    d.hatch([[v.b - pw, ds], [v.b, ds], [v.b, D.lev2], [v.b - pw, D.lev2]], 'concrete');
    d.flow(-8, us + 0.45 * (Math.min(v.pond, v.crest) - us), 0, '');
    // levels
    d.level(-18, v.usHFL, 'U/S HFL ' + f(v.usHFL, 3), { side: 'r' });
    d.level(-13, v.pond, 'POND ' + f(v.pond, 3), { side: 'r' });
    d.level((g.x2 + g.x3) / 2, v.crest, 'CREST ' + f(v.crest, 3), { side: 'r' });
    d.level(v.b + 18, v.dsHFL, 'D/S HFL ' + f(v.dsHFL, 3), { side: 'l' });
    d.level(-19, us, 'U/S FLOOR ' + f(us, 3), { side: 'l' });
    d.level(v.b + 19, ds, 'D/S FLOOR ' + f(ds, 3), { side: 'r' });
    d.text(pw / 2, D.lev1, 'U/S CUT-OFF ' + f(D.lev1, 2), { ha: 'c', va: 't', dy: -1.2, h: 2.2 });
    d.text(v.b - pw / 2, D.lev2, 'D/S CUT-OFF ' + f(D.lev2, 2), { ha: 'c', va: 't', dy: -1.2, h: 2.2 });
    // dimensions
    var yd = Math.min(D.lev1, D.lev2);
    d.dimH(0, v.b, yd, 9, { text: 'b = ' + f(v.b, 2) });
    d.dimH(0, g.x1, us, -6);
    d.dimH(g.xg, v.b, ds - D.steps[0].t, 5, { text: f(v.b - g.xg, 2) });
    d.dimV(pw, D.lev1, us, -5, { text: 'd1 = ' + f(v.d1, 2) });
    d.dimV(v.b, D.lev2, ds, -6, { text: 'd2 = ' + f(v.d2, 2) });
    D.steps.forEach(function (s) { d.text((s.x0 + s.x1) / 2, ds - s.t, 't=' + f(s.t, 1), { ha: 'c', va: 't', dy: -0.8, h: 2 }); });
    // hydraulic gradient (residual pressure) line above the floor
    var hgl = function (ph) { return ds + ph * D.H / 100; };
    d.pline([[0, hgl(k.C1)], [v.b, hgl(k.E2)]], 'WATER', { dash: true });
    d.text(g.xg, hgl(k.C1 + (k.E2 - k.C1) * g.xg / v.b), 'HGL (Khosla)', { ha: 'l', va: 'b', dx: 1, dy: 1, h: 2 });
    // uplift pressure diagram below the profile (heads to the same scale)
    var y0 = yb - Math.max(8, 0.25 * v.b);
    var hC1 = k.C1 * D.H / 100, hE2 = k.E2 * D.H / 100;
    d.hatch([[0, y0], [v.b, y0], [v.b, y0 - hE2], [0, y0 - hC1]], 'pressure');
    d.text(v.b / 2, y0, 'UPLIFT PRESSURE DIAGRAM (head in m, same scale)', { ha: 'c', va: 'b', dy: 1, h: 2.5 });
    d.text(0, y0 - hC1, 'C1 ' + f(k.C1, 1) + '% = ' + f(hC1, 2) + ' m', { ha: 'l', va: 't', dy: -1, h: 2.2 });
    d.text(v.b, y0 - hE2, 'E2 ' + f(k.E2, 1) + '% = ' + f(hE2, 2) + ' m', { ha: 'r', va: 't', dy: -1, h: 2.2 });
    var hT = (k.C1 + (k.E2 - k.C1) * g.xg / v.b) * D.H / 100;
    d.line(g.xg, y0, g.xg, y0 - hT, 'WATER');
    d.text(g.xg, y0 - hT, 'toe ' + f(hT, 2) + ' m', { ha: 'c', va: 't', dy: -1, h: 2.2 });
    return [{ key: 'profile', title: 'Weir floor profile, cut-offs and uplift / वियर फर्श एवं उत्थान दाब', d: d }];
  }

  return {
    fns: { lambda: lambda, phiE: phiE, phiD: phiD, exitGradient: exitGradient, interference: interference, slopeCorrection: slopeCorrection,
      laceyScour: laceyScour, blighLength: blighLength, khosla: khosla, geometry: geometry },
    pages: [{
      id: 'weir-khosla', group: 'C', order: 1, hi: 'वियर / बैराज (खोसला)', en: 'Weir / barrage floor (Bligh and Khosla)',
      refs: 'IS 6966 (Part 1); Khosla’s theory; Bligh’s creep',
      intro: 'Impervious floor of a weir or barrage on a permeable foundation: uplift at the cut-offs, exit gradient, floor thickness and cut-off depths.',
      inputs: inputs, design: design, drawings: drawings
    }]
  };
});
