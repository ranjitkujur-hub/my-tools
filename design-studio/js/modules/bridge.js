/* E. Bridges and culverts / पुल एवं पुलिया
 * - Bridge waterway: Lacey regime width, linear waterway, normal and maximum
 *   scour (IRC:78), afflux (Molesworth), vertical clearance and freeboard (IRC:5),
 *   soffit, formation and foundation levels.
 * - Culverts: box and slab culvert preliminary sizing (IRC:SP:13) with vent
 *   hydraulics, preliminary thicknesses and a STAAD.Pro box-culvert frame. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../core/index.js'));
  else root.DS.register(factory(root.DS));
})(typeof self !== 'undefined' ? self : this, function (DS) {
  'use strict';
  var B = DS.base, Drawing = DS.Drawing, f = B.f, G = B.G;

  /* ---------- formulas ---------- */
  // Lacey regime width (IRC:5 / IRC:SP:13 form): W = 4.8 √Q
  function regimeWidth(Q) { return 4.8 * Math.sqrt(Q); }
  // Silt factor Ksf = 1.76 √dm, dm in mm
  function siltFactor(dm) { return 1.76 * Math.sqrt(dm); }
  // Normal (mean) scour depth below HFL, IRC:78: dsm = 1.34 (Db²/Ksf)^(1/3)
  function normalScour(Db, Ksf) { return 1.34 * Math.pow(Db * Db / Ksf, 1 / 3); }
  // Lacey regime scour depth for an unconstricted waterway: d = 0.473 (Q/f)^(1/3)
  function laceyScour(Q, fs) { return 0.473 * Math.pow(Q / fs, 1 / 3); }
  // Molesworth afflux (m): h = (V²/17.88 + 0.0152) ((A/a)² − 1), V in m/s
  function molesworth(V, A, a) { return a >= A ? 0 : (V * V / 17.88 + 0.0152) * (Math.pow(A / a, 2) - 1); }
  // Minimum vertical clearance (m) by design discharge, IRC:5 table (verify clause)
  function clearanceIRC5(Q) {
    if (Q < 0.3) return 0.15;
    if (Q < 3) return 0.45;
    if (Q < 30) return 0.6;
    if (Q < 300) return 0.9;
    if (Q < 3000) return 1.2;
    return 1.5;
  }
  // Barrel / vent head loss: (Ke + Kx) V²/2g + Manning friction n² V² L / R^(4/3)
  function barrelLoss(V, R, L, n, Ke, Kx) {
    var hv = V * V / (2 * G);
    var hf = n * n * V * V * L / Math.pow(R, 4 / 3);
    return { hv: hv, he: (Ke === undefined ? 0.5 : Ke) * hv, hx: (Kx === undefined ? 1.0 : Kx) * hv, hf: hf,
      total: ((Ke === undefined ? 0.5 : Ke) + (Kx === undefined ? 1.0 : Kx)) * hv + hf };
  }
  // Vent flow: free surface when water is below the soffit, full barrel otherwise.
  function ventFlow(Q, nCells, b, h, depth) {
    var full = depth >= h, y = Math.min(depth, h);
    var A = nCells * b * y;
    var P = full ? nCells * 2 * (b + h) : nCells * (b + 2 * y);
    return { full: full, y: y, A: A, P: P, R: A / P, V: Q / A };
  }
  function up(x, step) { return B.ceilTo(x, step || 0.025); }

  /* ======================= page 1: bridge waterway ======================= */
  var bridgeInputs = [
    { sec: 'जलीय आँकड़े / Hydraulic data' },
    { key: 'Q', hi: 'डिज़ाइन डिस्चार्ज', en: 'Design discharge Q', unit: 'm³/s', def: 450, min: 0.1, max: 100000 },
    { key: 'HFL', hi: 'उच्चतम बाढ़ स्तर', en: 'High flood level HFL', unit: 'm', def: 112.5, min: -500, max: 9000 },
    { key: 'bed', hi: 'न्यूनतम तल स्तर', en: 'Lowest bed level', unit: 'm', def: 108.0, min: -500, max: 9000 },
    { key: 'meanBed', hi: 'औसत तल स्तर', en: 'Mean bed level (for flow depth)', unit: 'm', def: 108.8, min: -500, max: 9000 },
    { key: 'bank', hi: 'किनारे का स्तर', en: 'Bank / ground level at abutments', unit: 'm', def: 113.5, min: -500, max: 9000 },
    { key: 'Wn', hi: 'प्राकृतिक जलमार्ग चौड़ाई', en: 'Natural (unobstructed) width at HFL', unit: 'm', def: 120, min: 1, max: 20000 },
    { key: 'dm', hi: 'तल सामग्री का औसत व्यास', en: 'Mean diameter of bed material dm', unit: 'mm', def: 0.3, min: 0.01, max: 500 },
    { key: 'kQ', hi: 'स्कावर हेतु डिस्चार्ज वृद्धि गुणक', en: 'Discharge increase factor for scour', unit: '—', def: 1.3, min: 1, max: 2,
      help: 'IRC:78 increases the design discharge for foundation design (about 1.1–1.3 depending on catchment area — verify clause).' },
    { sec: 'पुल का विन्यास / Bridge layout' },
    { key: 'nSpans', hi: 'स्पैन की संख्या', en: 'Number of spans', unit: 'nos', def: 8, min: 1, max: 60, step: 1 },
    { key: 'span', hi: 'स्पष्ट स्पैन', en: 'Clear span (each)', unit: 'm', def: 12, min: 1, max: 200 },
    { key: 'pierW', hi: 'पियर की मोटाई', en: 'Pier width (across flow)', unit: 'm', def: 1.2, min: 0.2, max: 10 },
    { key: 'abW', hi: 'एबटमेंट की मोटाई', en: 'Abutment width (top, along bridge)', unit: 'm', def: 1.5, min: 0.3, max: 10 },
    { key: 'abutCase', hi: 'एबटमेंट स्कावर स्थिति', en: 'Abutment scour case', type: 'select', def: 'retained',
      options: [['retained', 'Approach retained / bed protected (1.27 dsm)'], ['allround', 'Scour all round (2.0 dsm)']] },
    { key: 'grip', hi: 'अधिकतम स्कावर से नीचे पकड़', en: 'Foundation grip below max scour', unit: 'm', def: 3.2, min: 0, max: 50 },
    { sec: 'स्तर एवं डेक / Levels and deck' },
    { key: 'formation', hi: 'प्रस्तावित फ़ॉर्मेशन स्तर', en: 'Proposed formation (road) level', unit: 'm', def: 115.2, min: -500, max: 9000 },
    { key: 'depth', hi: 'अधिसंरचना की गहराई', en: 'Superstructure depth (road top to soffit)', unit: 'm', def: 1.2, min: 0.2, max: 10 },
    { key: 'freeboard', hi: 'न्यूनतम फ्रीबोर्ड', en: 'Minimum freeboard (formation above HFL + afflux)', unit: 'm', def: 0.6, min: 0, max: 5 },
    { key: 'affluxMax', hi: 'अनुमेय एफ़्लक्स', en: 'Allowable afflux', unit: 'm', def: 0.3, min: 0.01, max: 3 },
    { key: 'Vperm', hi: 'अनुमेय वेग', en: 'Permissible velocity under bridge', unit: 'm/s', def: 3.0, min: 0.3, max: 10 },
    { key: 'cw', hi: 'कैरिजवे चौड़ाई', en: 'Carriageway width', unit: 'm', def: 7.5, min: 2, max: 40 },
    { key: 'kerb', hi: 'क्रैश बैरियर/कर्ब चौड़ाई (प्रत्येक ओर)', en: 'Crash barrier / kerb width (each side)', unit: 'm', def: 0.5, min: 0, max: 3 },
    { key: 'nGirders', hi: 'गर्डरों की संख्या', en: 'Number of longitudinal girders', unit: 'nos', def: 3, min: 0, max: 12, step: 1,
      help: '0 = solid slab deck' },
    { key: 'tSlab', hi: 'डेक स्लैब मोटाई', en: 'Deck slab thickness', unit: 'm', def: 0.25, min: 0.15, max: 2 }
  ];

  function bridgeDesign(v) {
    var r = new B.Report();
    var n = Math.round(v.nSpans);
    if (v.bed >= v.HFL) throw new Error('तल स्तर HFL से नीचे होना चाहिए / Bed level must be below HFL');
    if (v.meanBed >= v.HFL) throw new Error('औसत तल स्तर HFL से नीचे होना चाहिए / Mean bed level must be below HFL');
    if (v.nGirders > 0 && v.tSlab >= v.depth) throw new Error('स्लैब मोटाई अधिसंरचना गहराई से कम हो / Slab must be thinner than the superstructure depth');

    r.formula('Lacey regime width: W = 4.8 √Q');
    r.formula('Silt factor: Ksf = 1.76 √dm   (dm in mm)');
    r.formula('Normal scour depth below HFL: dsm = 1.34 (Db² / Ksf)^(1/3),  Db = Q_s / L_eff (m³/s per m)');
    r.formula('Unconstricted (L ≥ W): dsm = 0.473 (Q_s / Ksf)^(1/3)  — same as above with Db = Q_s / W');
    r.formula('Maximum scour: piers 2.0 dsm; abutments 1.27 dsm (approach retained) or 2.0 dsm (scour all round)');
    r.formula('Afflux (Molesworth): h = (V²/17.88 + 0.0152) [(A/a)² − 1]');
    r.formula('Required soffit = HFL + afflux + vertical clearance (IRC:5 table)');
    r.ref('IRC:5 — Standard specifications and code of practice for road bridges, Section I (linear waterway, clearance, freeboard — verify clause).');
    r.ref('IRC:78 — Foundations and substructure, scour depth clause (dsm = 1.34(Db²/Ksf)^1/3) — verify clause and discharge increase factor.');
    r.ref('IRC:SP:13 — Guidelines for the design of small bridges and culverts (Lacey waterway, afflux).');
    r.ref('Molesworth afflux formula, as given in IRC:SP:13 and standard bridge engineering texts (e.g. Ponnuswamy, Bridge Engineering).');
    r.assume('Alluvial river with bed material of mean diameter dm; regime (Lacey) conditions.');
    r.assume('Effective linear waterway = sum of clear spans; pier widths deducted.');
    r.assume('Afflux: areas taken as width × mean flow depth (HFL − mean bed level); approach velocity V = Q / A.');
    r.assume('Clearance is measured from HFL + afflux to the lowest point of the superstructure (soffit).');
    r.limit('Scour formula is for alluvial (erodible) beds; for rock or clay beds use IRC:78 provisions for such strata.');
    r.limit('Molesworth formula is empirical; for wide or skewed crossings check afflux by backwater (e.g. HEC-RAS).');
    r.limit('Foundation type, bearing capacity and grip must be confirmed by geotechnical investigation.');

    r.h('1. Regime width and linear waterway');
    var W = r.eq('W', '4.8 √Q', '4.8 × √' + f(v.Q, 1), regimeWidth(v.Q), 'm', 2);
    var L = r.eq('Effective linear waterway L', 'n × clear span', n + ' × ' + f(v.span, 2), n * v.span, 'm', 2);
    var Lo = r.eq('Overall length between abutment faces', 'L + (n − 1) × pier width', f(L, 2) + ' + ' + (n - 1) + ' × ' + f(v.pierW, 2), L + (n - 1) * v.pierW, 'm', 2);
    r.step('L / W = ' + f(L / W, 3) + (L >= W ? ' → waterway not constricted (Db = Q_s / W)' : ' → waterway constricted (Db = Q_s / L)'));

    r.h('2. Normal scour depth (IRC:78)');
    var Qs = r.eq('Discharge for scour Q_s', 'factor × Q', f(v.kQ, 2) + ' × ' + f(v.Q, 1), v.kQ * v.Q, 'm³/s', 1);
    var Ksf = r.eq('Ksf', '1.76 √dm', '1.76 × √' + f(v.dm, 3), siltFactor(v.dm), '—', 3);
    var Lw = Math.min(L, W);
    var Db = r.eq('Db', 'Q_s / ' + (L >= W ? 'W' : 'L'), f(Qs, 1) + ' / ' + f(Lw, 2), Qs / Lw, 'm³/s/m', 3);
    var dsm = r.eq('dsm', '1.34 (Db²/Ksf)^(1/3)', '1.34 × (' + f(Db, 3) + '² / ' + f(Ksf, 3) + ')^(1/3)', normalScour(Db, Ksf), 'm below HFL', 3);
    if (L >= W) r.step('Check with Lacey form 0.473 (Q_s/Ksf)^(1/3) = ' + f(laceyScour(Qs, Ksf), 3) + ' m (agrees within rounding of the constants)');

    r.h('3. Maximum scour and foundation levels');
    var kAb = v.abutCase === 'allround' ? 2.0 : 1.27;
    var dPier = r.eq('Max scour at piers', '2.0 dsm', '2.0 × ' + f(dsm, 3), 2.0 * dsm, 'm', 3);
    var dAb = r.eq('Max scour at abutments', f(kAb, 2) + ' dsm', f(kAb, 2) + ' × ' + f(dsm, 3), kAb * dsm, 'm', 3);
    var msl = r.eq('Mean scour level', 'HFL − dsm', f(v.HFL, 3) + ' − ' + f(dsm, 3), v.HFL - dsm, 'm', 3);
    var pierScourLvl = r.eq('Max scour level at piers', 'HFL − 2.0 dsm', f(v.HFL, 3) + ' − ' + f(dPier, 3), v.HFL - dPier, 'm', 3);
    var abScourLvl = r.eq('Max scour level at abutments', 'HFL − ' + f(kAb, 2) + ' dsm', f(v.HFL, 3) + ' − ' + f(dAb, 3), v.HFL - dAb, 'm', 3);
    var pierFdn = r.eq('Pier foundation level', 'max scour level − grip', f(pierScourLvl, 3) + ' − ' + f(v.grip, 2), pierScourLvl - v.grip, 'm', 3);
    var abFdn = r.eq('Abutment foundation level', 'max scour level − grip', f(abScourLvl, 3) + ' − ' + f(v.grip, 2), abScourLvl - v.grip, 'm', 3);

    r.h('4. Afflux (Molesworth)');
    var Dm = r.eq('Mean flow depth', 'HFL − mean bed', f(v.HFL, 3) + ' − ' + f(v.meanBed, 3), v.HFL - v.meanBed, 'm', 3);
    var A = r.eq('Unobstructed area A', 'Wn × Dm', f(v.Wn, 2) + ' × ' + f(Dm, 3), v.Wn * Dm, 'm²', 2);
    var a = r.eq('Area at bridge a', 'min(L, Wn) × Dm', f(Math.min(L, v.Wn), 2) + ' × ' + f(Dm, 3), Math.min(L, v.Wn) * Dm, 'm²', 2);
    var V = r.eq('Approach velocity V', 'Q / A', f(v.Q, 1) + ' / ' + f(A, 2), v.Q / A, 'm/s', 3);
    var h = r.eq('Afflux h', '(V²/17.88 + 0.0152)[(A/a)² − 1]', '(' + f(V, 3) + '²/17.88 + 0.0152) × [(' + f(A, 2) + '/' + f(a, 2) + ')² − 1]', molesworth(V, A, a), 'm', 3);
    var Vb = r.eq('Velocity under bridge', 'Q / a', f(v.Q, 1) + ' / ' + f(a, 2), v.Q / a, 'm/s', 3);

    r.h('5. Clearance, soffit and formation (IRC:5)');
    var cl = clearanceIRC5(v.Q);
    r.step('Minimum vertical clearance for Q = ' + f(v.Q, 1) + ' m³/s (IRC:5 table, verify clause): ' + f(cl * 1000, 0) + ' mm');
    var soffitReq = r.eq('Required soffit level', 'HFL + afflux + clearance', f(v.HFL, 3) + ' + ' + f(h, 3) + ' + ' + f(cl, 3), v.HFL + h + cl, 'm', 3);
    var soffit = r.eq('Provided soffit level', 'formation − superstructure depth', f(v.formation, 3) + ' − ' + f(v.depth, 3), v.formation - v.depth, 'm', 3);
    var fb = r.eq('Freeboard provided', 'formation − (HFL + afflux)', f(v.formation, 3) + ' − ' + f(v.HFL + h, 3), v.formation - v.HFL - h, 'm', 3);
    var fmReq = Math.max(soffitReq + v.depth, v.HFL + h + v.freeboard);
    r.step('Minimum formation level = max(required soffit + depth, HFL + afflux + freeboard) = ' + f(fmReq, 3) + ' m');

    r.result('Regime width W', W, 'm', 2);
    r.result('Effective linear waterway L', L, 'm', 2);
    r.result('Overall length between abutments', Lo, 'm', 2);
    r.result('Normal scour depth dsm (below HFL)', dsm, 'm', 2);
    r.result('Max scour level at piers', pierScourLvl, 'm', 3);
    r.result('Max scour level at abutments', abScourLvl, 'm', 3);
    r.result('Pier foundation level', pierFdn, 'm', 3);
    r.result('Abutment foundation level', abFdn, 'm', 3);
    r.result('Afflux', h, 'm', 3);
    r.result('Vertical clearance required', cl, 'm', 2);
    r.result('Required soffit level', soffitReq, 'm', 3);
    r.result('Minimum formation level', fmReq, 'm', 3);

    r.check('Afflux within allowable', h <= v.affluxMax, f(h, 3) + ' m', '≤ ' + f(v.affluxMax, 2) + ' m');
    r.check('Velocity under bridge', Vb <= v.Vperm, f(Vb, 2) + ' m/s', '≤ ' + f(v.Vperm, 2) + ' m/s', 'provide bed/abutment protection if close to limit');
    r.check('Vertical clearance (soffit ≥ HFL + afflux + clearance)', soffit >= soffitReq - 1e-9, f(soffit, 3) + ' m', '≥ ' + f(soffitReq, 3) + ' m', 'IRC:5 — verify clause');
    r.check('Freeboard', fb >= v.freeboard - 1e-9, f(fb, 3) + ' m', '≥ ' + f(v.freeboard, 2) + ' m', 'IRC:5 — verify clause');
    r.check('Waterway not excessively constricted', L >= 0.6 * W, 'L/W = ' + f(L / W, 2), '≥ 0.60 (guidance)', 'heavy fluming raises scour and afflux');
    r.check('Grip below max scour (well foundation guidance)', v.grip >= dPier / 3 - 1e-9, f(v.grip, 2) + ' m', '≥ dmax/3 = ' + f(dPier / 3, 2) + ' m', 'IRC:78 — verify clause');
    if (v.bank < v.HFL) r.warn('Bank level is below HFL — guide bunds/approach protection needed.');
    if (L > 1.2 * W) r.warn('Linear waterway is much larger than the regime width — check that the river will use all spans.');

    r.table('Levels summary', ['Item', 'Level (m)'], [
      ['Formation (road top)', B.round(v.formation, 3)], ['Soffit provided', B.round(soffit, 3)], ['Required soffit', B.round(soffitReq, 3)],
      ['HFL + afflux', B.round(v.HFL + h, 3)], ['HFL', B.round(v.HFL, 3)], ['Mean bed', B.round(v.meanBed, 3)], ['Lowest bed', B.round(v.bed, 3)],
      ['Mean scour level', B.round(msl, 3)], ['Max scour at piers', B.round(pierScourLvl, 3)], ['Max scour at abutments', B.round(abScourLvl, 3)],
      ['Pier foundation', B.round(pierFdn, 3)], ['Abutment foundation', B.round(abFdn, 3)]], 'levels');
    r.table('Hydraulic summary', ['Quantity', 'Value', 'Unit'], [
      ['Design discharge Q', v.Q, 'm³/s'], ['Scour discharge Q_s', B.round(Qs, 2), 'm³/s'], ['Regime width W', B.round(W, 2), 'm'],
      ['Linear waterway L', B.round(L, 2), 'm'], ['Db', B.round(Db, 3), 'm³/s/m'], ['Ksf', B.round(Ksf, 3), '—'], ['dsm', B.round(dsm, 3), 'm'],
      ['Afflux', B.round(h, 3), 'm'], ['Approach velocity', B.round(V, 3), 'm/s'], ['Velocity under bridge', B.round(Vb, 3), 'm/s']], 'hydraulics');

    r.data = { n: n, L: L, Lo: Lo, dsm: dsm, msl: msl, pierScourLvl: pierScourLvl, abScourLvl: abScourLvl, pierFdn: pierFdn, abFdn: abFdn,
      h: h, soffit: soffit, soffitReq: soffitReq };
    return r;
  }

  // Elevation is built twice: label room on the approaches depends on the final scale.
  function bridgeElevation(v, rep) {
    var D = rep.data, d, apprL = 10, apprR = 10;
    // wide, shallow crossings: exaggerate the vertical scale (shown in the scale label)
    var Htot = v.formation - Math.min(D.pierFdn, D.abFdn) + 1.5, ratio = D.Lo / (Htot * 3);
    var vex = ratio <= 1 ? 1 : (ratio <= 2.2 ? 2 : 5);
    var tF = 'FORMATION ' + f(v.formation, 3), tS = 'SOFFIT ' + f(D.soffit, 3);
    var tR = ['HFL ' + f(v.HFL, 3), 'MEAN SCOUR ' + f(D.msl, 3), 'MAX SCOUR (PIERS) ' + f(D.pierScourLvl, 3)];
    var tA = 'ABUT. FDN ' + f(D.abFdn, 3);
    function mm(t) { return Math.max(18, t.length * 1.7) + 3; }
    for (var it = 0; it < 4; it++) {
      d = drawElevation(v, D, apprL, apprR, tF, tS, tR, tA, vex);
      var k = d.fitScale(267, 146) / 1000;
      var needL = (Math.max(mm(tF), mm(tA), mm('BED 000.000')) + 6) * k, needR = (Math.max.apply(null, tR.map(mm)) + 6) * k;
      if (needL <= apprL + 1e-6 && needR <= apprR + 1e-6) break;
      apprL = Math.max(apprL, needL * 1.05); apprR = Math.max(apprR, needR * 1.05);
    }
    return d;
  }

  function drawElevation(v, D, apprL, apprR, tF, tS, tR, tA, vex) {
    var d = new Drawing({ title: 'Bridge elevation', vex: vex });
    var n = D.n, Lo = D.Lo, aw = v.abW, sof = D.soffit, fm = v.formation;
    var xL = -aw, xR = Lo + aw;
    var bottom = Math.min(D.pierFdn, D.abFdn) - 1.5;
    // ground: approach banks at bank level, river bed between abutment faces
    var ground = [[xL - apprL, v.bank], [xL, v.bank], [0, v.bed], [Lo, v.bed], [xR, v.bank], [xR + apprR, v.bank]];
    d.hatch(ground.concat([[xR + apprR, bottom], [xL - apprL, bottom]]), 'soil', { outline: false });
    d.pline(ground, 'SOIL', { w: 0.4 });
    // water in each span
    var piers = [];
    for (var i = 0; i < n; i++) {
      var x0 = i * (v.span + v.pierW), x1 = x0 + v.span;
      d.hatch([[x0, v.bed], [x1, v.bed], [x1, v.HFL], [x0, v.HFL]], 'water');
      if (i < n - 1) piers.push(x1);
    }
    // piers on well foundations
    piers.forEach(function (px) {
      var ww = v.pierW + 1.0, wx = px + v.pierW / 2 - ww / 2;
      d.hatch([[wx, D.pierFdn], [wx + ww, D.pierFdn], [wx + ww, v.bed], [wx, v.bed]], 'concrete');
      d.hatch([[px, v.bed], [px + v.pierW, v.bed], [px + v.pierW, sof], [px, sof]], 'concrete');
      d.centre(px + v.pierW / 2, D.pierFdn - 0.6, px + v.pierW / 2, fm + 0.8);
    });
    // abutments with footing
    [[xL, 0], [Lo, xR]].forEach(function (s, k) {
      var a0 = s[0], a1 = s[1], fw = aw + 1.5, fx = k === 0 ? a1 - fw : a0;
      d.hatch([[fx, D.abFdn], [fx + fw, D.abFdn], [fx + fw, D.abFdn + 1.0], [fx, D.abFdn + 1.0]], 'concrete');
      d.hatch([[a0, D.abFdn + 1.0], [a1, D.abFdn + 1.0], [a1, sof], [a0, sof]], 'concrete');
    });
    // deck
    d.hatch([[xL, sof], [xR, sof], [xR, fm], [xL, fm]], 'concrete');
    // scour lines, labelled on the right approach
    var xr1 = xR + 1;
    d.line(0, D.msl, xr1, D.msl, 'CENTRE', { dash: true });
    d.line(0, D.pierScourLvl, xr1, D.pierScourLvl, 'CENTRE', { dash: true });
    d.level(xr1, v.HFL, tR[0], { side: 'r' });
    d.level(xr1, D.msl, tR[1], { side: 'r' });
    d.level(xr1, D.pierScourLvl, tR[2], { side: 'r' });
    // left approach: formation and abutment foundation; soffit noted under the deck in the first span
    d.level(xL - 1, fm, tF, { side: 'l' });
    d.level(xL - 1, D.abFdn, tA, { side: 'l' });
    d.level(0, v.bed, 'BED ' + f(v.bed, 3), { side: 'l' });
    if (piers.length) d.level(piers[0] + v.pierW / 2, D.pierFdn, 'PIER FDN ' + f(D.pierFdn, 3), { side: 'l', len: 22 });
    if (vex !== 1) d.text(Lo / 2, bottom, 'VERTICAL SCALE EXAGGERATED ' + vex + ' TIMES', { ha: 'c', va: 't', dy: -11, h: 2.2 });
    // dimensions
    for (i = 0; i < n; i++) {
      var s0 = i * (v.span + v.pierW);
      d.dimH(s0, s0 + v.span, fm, -6, { dp: 2 });
    }
    d.dimH(0, Lo, fm, -13, { text: 'CLEAR WATERWAY ' + f(D.L, 2) + ' (OVERALL ' + f(Lo, 2) + ')' });
    d.text(Lo / 2, bottom, 'ELEVATION (LOOKING DOWNSTREAM) — ' + n + ' SPAN' + (n > 1 ? 'S' : '') + ' OF ' + f(v.span, 2) + ' m CLEAR', { ha: 'c', va: 't', dy: -2, h: 3 });
    d.text(Lo / 2, bottom, tS + ' (REQUIRED ' + f(D.soffitReq, 3) + ')   AFFLUX ' + f(D.h, 3) + '   NORMAL SCOUR dsm ' + f(D.dsm, 3), { ha: 'c', va: 't', dy: -7, h: 2.2 });
    return d;
  }

  function bridgeDeck(v, rep) {
    var D = rep.data, d = new Drawing({ title: 'Deck cross-section' });
    var Wt = v.cw + 2 * v.kerb, x0 = -Wt / 2, fm = v.formation, sof = D.soffit, wc = 0.065;
    var slabTop = fm - wc, ng = Math.round(v.nGirders);
    var slabBot = ng > 0 ? slabTop - v.tSlab : sof;
    d.hatch([[x0, slabBot], [-x0, slabBot], [-x0, slabTop], [x0, slabTop]], 'concrete');
    if (ng > 0) {
      var bw = Math.min(0.4, Wt / ng * 0.4), s = Wt / ng;
      for (var i = 0; i < ng; i++) {
        var cx = x0 + s / 2 + i * s;
        d.hatch([[cx - bw / 2, sof], [cx + bw / 2, sof], [cx + bw / 2, slabBot], [cx - bw / 2, slabBot]], 'concrete');
      }
      d.dimH(x0 + s / 2, x0 + s / 2 + s, sof, 6, { dp: 3, text: 'GIRDER SPACING ' + f(s, 3) });
    }
    // wearing coat and crash barriers
    d.line(x0 + v.kerb, fm, -x0 - v.kerb, fm, 'CONCRETE', { w: 0.35 });
    d.text(0, fm, 'WEARING COAT 65 mm', { ha: 'c', va: 'b', dy: 1, h: 2 });
    if (v.kerb > 0) {
      [x0, -x0 - v.kerb].forEach(function (bx) { d.hatch([[bx, slabTop], [bx + v.kerb, slabTop], [bx + v.kerb, slabTop + 1.0], [bx, slabTop + 1.0]], 'concrete'); });
    }
    d.centre(0, sof - 0.6, 0, fm + 1.6);
    d.text(0, fm + 1.6, 'CL', { ha: 'c', va: 'b', dy: 0.5, h: 2.2 });
    d.level(-x0 + 0.2, fm, 'FORMATION ' + f(fm, 3), { side: 'r' });
    d.level(-x0 + 0.2, sof, 'SOFFIT ' + f(sof, 3), { side: 'r' });
    d.dimH(x0, -x0, slabTop + 1.0, -8, { text: 'OVERALL ' + f(Wt, 2) });
    d.dimH(x0 + v.kerb, -x0 - v.kerb, slabTop + 1.0, -2.5, { text: 'CARRIAGEWAY ' + f(v.cw, 2) });
    d.dimV(x0, sof, fm, 8, { dp: 3 });
    d.text(0, sof, 'DECK CROSS-SECTION', { ha: 'c', va: 't', dy: -12, h: 3 });
    return d;
  }

  function bridgeDrawings(v, rep) {
    return [{ key: 'elevation', title: 'Bridge elevation / पुल का उन्नयन', d: bridgeElevation(v, rep) },
      { key: 'deck', title: 'Deck cross-section / डेक अनुप्रस्थ काट', d: bridgeDeck(v, rep) }];
  }

  /* ======================= page 2: culverts ======================= */
  var culvertInputs = [
    { sec: 'प्रकार एवं जलीय आँकड़े / Type and hydraulic data' },
    { key: 'type', hi: 'पुलिया का प्रकार', en: 'Culvert type', type: 'select', def: 'box',
      options: [['box', 'RCC box culvert'], ['slab', 'RCC slab culvert on abutments']] },
    { key: 'Q', hi: 'डिज़ाइन डिस्चार्ज', en: 'Design discharge Q', unit: 'm³/s', def: 12, min: 0.01, max: 2000 },
    { key: 'HFL', hi: 'उच्चतम बाढ़ स्तर (अनुप्रवाह)', en: 'HFL / tailwater level (downstream)', unit: 'm', def: 99.9, min: -500, max: 9000 },
    { key: 'bed', hi: 'नाले का तल स्तर', en: 'Stream bed level (vent floor)', unit: 'm', def: 98.0, min: -500, max: 9000 },
    { key: 'formation', hi: 'सड़क फ़ॉर्मेशन स्तर', en: 'Road formation level', unit: 'm', def: 102.5, min: -500, max: 9000 },
    { key: 'nMan', hi: 'मैनिंग n', en: "Manning's n of vent", unit: '—', def: 0.015, min: 0.009, max: 0.05 },
    { key: 'Vperm', hi: 'अनुमेय वेग', en: 'Permissible velocity in vent', unit: 'm/s', def: 2.5, min: 0.3, max: 8,
      help: 'Rigid floor with protection: about 2.5–3.0 m/s (verify for bed material and protection works).' },
    { key: 'affluxMax', hi: 'अनुमेय एफ़्लक्स', en: 'Allowable afflux (heading up)', unit: 'm', def: 0.3, min: 0.01, max: 3 },
    { key: 'freeboard', hi: 'सड़क हेतु फ्रीबोर्ड', en: 'Freeboard: formation above upstream water level', unit: 'm', def: 0.6, min: 0, max: 5 },
    { sec: 'वेंट / Vents' },
    { key: 'nCells', hi: 'वेंट/सेल की संख्या', en: 'Number of vents / cells', unit: 'nos', def: 2, min: 1, max: 12, step: 1 },
    { key: 'span', hi: 'स्पष्ट स्पैन (प्रत्येक)', en: 'Clear span of each vent', unit: 'm', def: 2.5, min: 0.5, max: 12 },
    { key: 'height', hi: 'स्पष्ट वेंट ऊँचाई', en: 'Clear vent height', unit: 'm', def: 2.5, min: 0.5, max: 10 },
    { key: 'Lb', hi: 'बैरल की लंबाई (प्रवाह दिशा)', en: 'Barrel length along flow (road width)', unit: 'm', def: 12, min: 1, max: 200 },
    { key: 'tSlabIn', hi: 'स्लैब मोटाई (0 = स्वतः)', en: 'Top/bottom slab thickness (0 = auto)', unit: 'm', def: 0, min: 0, max: 2 },
    { key: 'tWallIn', hi: 'दीवार मोटाई (0 = स्वतः)', en: 'Wall / pier thickness (0 = auto)', unit: 'm', def: 0, min: 0, max: 2 },
    { sec: 'स्लैब पुलिया / Slab culvert', show: function (v) { return v.type === 'slab'; } },
    { key: 'fdn', hi: 'तल से नींव की गहराई', en: 'Foundation depth below bed', unit: 'm', def: 1.2, min: 0.3, max: 10, show: function (v) { return v.type === 'slab'; } },
    { key: 'abTop', hi: 'एबटमेंट शीर्ष चौड़ाई', en: 'Abutment top width', unit: 'm', def: 0.6, min: 0.3, max: 3, show: function (v) { return v.type === 'slab'; } },
    { key: 'bearing', hi: 'स्लैब बेयरिंग', en: 'Slab bearing on abutment', unit: 'm', def: 0.4, min: 0.15, max: 1.5, show: function (v) { return v.type === 'slab'; } },
    { sec: 'STAAD भार / Loads for STAAD (box)', show: function (v) { return v.type === 'box'; } },
    { key: 'gammaSoil', hi: 'मिट्टी का इकाई भार', en: 'Unit weight of fill', unit: 'kN/m³', def: 18, min: 10, max: 25, show: function (v) { return v.type === 'box'; } },
    { key: 'K0', hi: 'स्थिर पृथ्वी दाब गुणांक', en: 'Earth pressure coefficient at rest K0', unit: '—', def: 0.5, min: 0.2, max: 1, show: function (v) { return v.type === 'box'; } },
    { key: 'liveUDL', hi: 'सजीव भार (UDL)', en: 'Live load as equivalent UDL', unit: 'kN/m²', def: 25, min: 0, max: 200, show: function (v) { return v.type === 'box'; },
      help: 'Equivalent of IRC:6 vehicle loads dispersed through the cushion — verify.' },
    { key: 'subgrade', hi: 'सबग्रेड प्रतिक्रिया मापांक', en: 'Modulus of subgrade reaction', unit: 'kN/m³', def: 20000, min: 1000, max: 500000, show: function (v) { return v.type === 'box'; } },
    { key: 'fck', hi: 'कंक्रीट ग्रेड fck', en: 'Concrete grade fck', unit: 'MPa', def: 30, min: 20, max: 60, show: function (v) { return v.type === 'box'; } }
  ];

  // Preliminary thicknesses (rules of thumb, not code values).
  function prelimThickness(type, span, height) {
    if (type === 'box') {
      return { slab: up(Math.max(0.25, span / 10)), wall: up(Math.max(0.25, Math.max(span, height) / 12)) };
    }
    return { slab: up(Math.max(0.25, span / 10)), wall: 0 };
  }

  function culvertGeom(v) {
    var n = Math.round(v.nCells), box = v.type === 'box';
    var t = prelimThickness(v.type, v.span, v.height);
    var tS = v.tSlabIn > 0 ? v.tSlabIn : t.slab;
    var tW = v.tWallIn > 0 ? v.tWallIn : (box ? t.wall : 0.6);
    var soffit = v.bed + v.height, top = soffit + tS;
    var cushion = v.formation - top;
    var g = { n: n, box: box, tS: tS, tW: tW, soffit: soffit, top: top, cushion: cushion, autoS: !(v.tSlabIn > 0), autoW: !(v.tWallIn > 0) };
    if (box) g.width = n * v.span + (n + 1) * tW;
    else {
      g.Hab = v.height + v.fdn;
      g.abBase = up(Math.max(v.abTop + 0.3, 0.45 * g.Hab), 0.05);
      g.slabLen = n * v.span + (n - 1) * tW + 2 * v.bearing;
      g.width = n * v.span + (n - 1) * tW + 2 * g.abBase;
    }
    g.embH = v.formation - v.bed;
    g.wing = up(1.5 * Math.max(g.embH, v.height), 0.1);
    return g;
  }

  function culvertDesign(v) {
    var r = new B.Report(), box = v.type === 'box';
    if (v.bed >= v.HFL) throw new Error('तल स्तर HFL से नीचे होना चाहिए / Bed level must be below HFL');
    var g = culvertGeom(v), n = g.n;
    if (g.cushion < -1e-9) throw new Error('फ़ॉर्मेशन स्तर पुलिया के शीर्ष से नीचे है / Formation level is below the top of the culvert (cushion ' + f(g.cushion, 3) + ' m)');

    r.formula('Flow area through vents: a = N × b × y,  y = min(HFL − bed, vent height)');
    r.formula('Velocity V = Q / a;  hydraulic radius R = a / P');
    r.formula('Head loss (afflux): h = (Ke + Kx) V²/2g + n² V² L / R^(4/3),  Ke = 0.5 (entry), Kx = 1.0 (exit)');
    r.formula('Upstream water level = HFL + h;  freeboard = formation − upstream water level');
    r.formula('Preliminary thickness: slabs ≈ span/10 (min 0.25 m); box walls ≈ max(span, height)/12 (min 0.25 m)');
    r.ref('IRC:SP:13 — Guidelines for the design of small bridges and culverts (vent sizing, afflux, clearance; verify clause).');
    r.ref('IRC:5 — vertical clearance table by discharge (verify clause).');
    r.ref('Head loss: standard culvert hydraulics (entrance + friction + exit), e.g. Chow, Open-Channel Hydraulics; USBR Design of Small Canal Structures.');
    if (box) r.ref('IRC:6 loads and IRC:112 design to be applied in the STAAD.Pro analysis of the exported frame (verify).');
    r.assume('Tailwater (downstream HFL) is not changed by the culvert; afflux is added upstream.');
    r.assume('Exit loss taken as one full velocity head (conservative for free-surface flow).');
    r.assume('Thicknesses are preliminary rules of thumb for sizing only; the structural design must confirm them.');
    if (!box) r.assume('Abutment base width ≈ 0.45 × abutment height for mass concrete/masonry (preliminary, verify by stability check).');
    r.limit('Inlet-control and supercritical conditions are not analysed; for steep streams check with HEC-RAS or FHWA HDS-5 methods.');
    r.limit('Preliminary sizing only — not a structural design.');

    r.h('1. Vent geometry');
    r.step('Type: ' + (box ? 'RCC box culvert' : 'RCC slab culvert') + ', ' + n + ' vent(s) of ' + f(v.span, 2) + ' m × ' + f(v.height, 2) + ' m clear');
    r.step('Slab thickness = ' + f(g.tS, 3) + ' m' + (g.autoS ? ' (auto: max(0.25, span/10) = max(0.25, ' + f(v.span / 10, 3) + '), rounded up)' : ' (given)'));
    r.step((box ? 'Wall' : 'Pier') + ' thickness = ' + f(g.tW, 3) + ' m' + (g.autoW ? (box ? ' (auto: max(0.25, max(span, height)/12), rounded up)' : ' (auto: 0.6 m pier)') : ' (given)'));
    var soffit = r.eq('Soffit level', 'bed + vent height', f(v.bed, 3) + ' + ' + f(v.height, 3), g.soffit, 'm', 3);
    var cushion = r.eq('Cushion over top slab', 'formation − top of slab', f(v.formation, 3) + ' − ' + f(g.top, 3), g.cushion, 'm', 3);

    r.h('2. Hydraulics of the vents');
    var depth = v.HFL - v.bed;
    var fl = ventFlow(v.Q, n, v.span, v.height, depth);
    r.step('Depth at HFL = ' + f(depth, 3) + ' m → ' + (fl.full ? 'vents flow full (pressure flow), y = vent height' : 'free-surface flow, y = ' + f(fl.y, 3) + ' m'));
    var a = r.eq('Flow area a', 'N × b × y', n + ' × ' + f(v.span, 2) + ' × ' + f(fl.y, 3), fl.A, 'm²', 3);
    r.eq('Wetted perimeter P', fl.full ? 'N × 2(b + h)' : 'N × (b + 2y)', '', fl.P, 'm', 3);
    var R = r.eq('R', 'a / P', f(a, 3) + ' / ' + f(fl.P, 3), fl.R, 'm', 3);
    var V = r.eq('V', 'Q / a', f(v.Q, 2) + ' / ' + f(a, 3), fl.V, 'm/s', 3);
    var hl = barrelLoss(V, R, v.Lb, v.nMan);
    r.eq('Velocity head', 'V²/2g', f(V, 3) + '² / (2 × 9.81)', hl.hv, 'm', 4);
    r.eq('Entry loss', '0.5 V²/2g', '', hl.he, 'm', 4);
    r.eq('Exit loss', '1.0 V²/2g', '', hl.hx, 'm', 4);
    r.eq('Friction loss', 'n² V² L / R^(4/3)', f(v.nMan, 3) + '² × ' + f(V, 3) + '² × ' + f(v.Lb, 2) + ' / ' + f(R, 3) + '^(4/3)', hl.hf, 'm', 4);
    var h = r.eq('Afflux h', 'entry + exit + friction', '', hl.total, 'm', 3);
    var uwl = r.eq('Upstream water level', 'HFL + h', f(v.HFL, 3) + ' + ' + f(h, 3), v.HFL + h, 'm', 3);
    var fb = r.eq('Freeboard to road', 'formation − upstream WL', f(v.formation, 3) + ' − ' + f(uwl, 3), v.formation - uwl, 'm', 3);
    var cl = clearanceIRC5(v.Q), clp = soffit - v.HFL;
    r.step('Clearance soffit − HFL = ' + f(clp, 3) + ' m; IRC:5 minimum for Q = ' + f(v.Q, 2) + ' m³/s: ' + f(cl, 2) + ' m (verify clause)');

    r.h('3. Preliminary dimensions');
    r.eq('Overall width of structure (across flow)', box ? 'N b + (N + 1) t_w' : 'N b + (N − 1) t_p + 2 × abutment base', '', g.width, 'm', 3);
    if (!box) {
      r.eq('Abutment height', 'vent height + foundation depth', f(v.height, 2) + ' + ' + f(v.fdn, 2), g.Hab, 'm', 3);
      r.eq('Abutment base width', 'max(top + 0.3, 0.45 H)', 'max(' + f(v.abTop + 0.3, 2) + ', 0.45 × ' + f(g.Hab, 3) + ')', g.abBase, 'm', 2);
      r.eq('Slab length (span direction)', 'N b + (N − 1) t_p + 2 × bearing', '', g.slabLen, 'm', 3);
    }
    r.eq('Wing wall length (preliminary)', '1.5 × max(embankment height, vent height)', '1.5 × ' + f(Math.max(g.embH, v.height), 3), g.wing, 'm', 2);

    r.result('Vent flow condition', fl.full ? 'Full (pressure)' : 'Free surface');
    r.result('Velocity in vents', V, 'm/s', 2);
    r.result('Afflux', h, 'm', 3);
    r.result('Upstream water level', uwl, 'm', 3);
    r.result('Slab thickness (preliminary)', g.tS, 'm', 3);
    r.result(box ? 'Wall thickness (preliminary)' : 'Pier thickness', g.tW, 'm', 3);
    r.result('Cushion over top slab', cushion, 'm', 3);
    r.result('Overall width of structure', g.width, 'm', 2);
    if (!box) { r.result('Abutment height', g.Hab, 'm', 2); r.result('Abutment base width', g.abBase, 'm', 2); }
    r.result('Wing wall length (preliminary)', g.wing, 'm', 2);

    r.check('Velocity in vents', V <= v.Vperm, f(V, 2) + ' m/s', '≤ ' + f(v.Vperm, 2) + ' m/s');
    r.check('Afflux within allowable', h <= v.affluxMax, f(h, 3) + ' m', '≤ ' + f(v.affluxMax, 2) + ' m');
    r.check('Freeboard to road formation', fb >= v.freeboard - 1e-9, f(fb, 3) + ' m', '≥ ' + f(v.freeboard, 2) + ' m', 'verify clause');
    r.check(box ? 'Vertical clearance above HFL (free-flow vents)' : 'Vertical clearance above HFL', clp >= cl - 1e-9, f(clp, 3) + ' m', '≥ ' + f(cl, 2) + ' m',
      box ? 'IRC:SP:13 may relax this for box culverts — verify' : 'IRC:5 — verify clause');
    r.check('Slab thickness ≥ span/12 (preliminary)', g.tS >= v.span / 12 - 1e-9, f(g.tS, 3) + ' m', '≥ ' + f(v.span / 12, 3) + ' m');
    if (box) r.check('Minimum cushion for wheel load dispersion', cushion >= 0.6 || cushion === 0, f(cushion, 2) + ' m', '0 (deck type) or ≥ 0.6 m (guidance — verify)');
    if (fl.full) r.warn('Vents flow full at HFL: check inlet/outlet control and pressure on the top slab.');
    if (V < 0.6) r.warn('Low velocity — silting likely; consider fewer or smaller vents.');

    r.table('Hydraulic calculation', ['Quantity', 'Value', 'Unit'], [
      ['Q', v.Q, 'm³/s'], ['Vents', n + ' × ' + f(v.span, 2) + ' × ' + f(v.height, 2), 'm'], ['Flow depth y', B.round(fl.y, 3), 'm'],
      ['Flow area a', B.round(a, 3), 'm²'], ['R', B.round(R, 4), 'm'], ['V', B.round(V, 3), 'm/s'], ['Entry loss', B.round(hl.he, 4), 'm'],
      ['Exit loss', B.round(hl.hx, 4), 'm'], ['Friction loss', B.round(hl.hf, 4), 'm'], ['Afflux', B.round(h, 4), 'm'],
      ['Upstream WL', B.round(uwl, 3), 'm'], ['Freeboard', B.round(fb, 3), 'm']], 'hydraulics');
    r.data = { g: g, uwl: uwl, h: h };
    return r;
  }

  // Section across the road axis is the vent face; drawn as seen along the flow.
  function culvertSection(v, rep) {
    var g = rep.data.g, d = new Drawing({ title: 'Culvert section across vents' });
    var n = g.n, b = v.span, H = v.height, bed = v.bed, fm = v.formation;
    var W = g.width, x0 = -W / 2;
    var bot = g.box ? bed - g.tS : bed - v.fdn;
    var side = 2 * (fm - bed) + 3;
    // ground and embankment fill
    var gl = [[x0 - side, bed], [W / 2 + side, bed], [W / 2 + side, bot - 1.2], [x0 - side, bot - 1.2]];
    d.hatch(gl, 'soil', { outline: false });
    d.line(x0 - side, bed, W / 2 + side, bed, 'SOIL', { w: 0.4 });
    var fill;
    if (g.box) fill = [[x0 - side + 1, bed], [x0, bed], [x0, g.top], [-x0, g.top], [-x0, bed], [-x0 + side - 1, bed], [-x0 + 1.5, fm], [x0 - 1.5, fm]];
    else {
      // fill against the battered back faces of the abutments and over the slab
      var batter = (g.abBase - v.abTop) * (bed - bot) / (g.soffit - bot), xb = x0 + batter, xt = x0 + g.abBase - v.abTop;
      var se = x0 + g.abBase - v.bearing;
      fill = [[x0 - side + 1, bed], [xb, bed], [xt, g.soffit], [se, g.soffit], [se, g.top], [-se, g.top], [-se, g.soffit], [-xt, g.soffit], [-xb, bed],
        [-x0 + side - 1, bed], [-x0 + 1.5, fm], [x0 - 1.5, fm]];
    }
    if (fm - g.top > 0.01) d.hatch(fill, 'soil');
    else d.pline([[x0 - side + 1, bed], [x0 - 1.5, fm]], 'SOIL');
    d.line(x0 - 1.5, fm, W / 2 + 1.5, fm, 'CONCRETE', { w: 0.5 });
    d.text(0, fm, 'ROAD', { ha: 'c', va: 'b', dy: 1, h: 2.2 });
    var ventX = [];
    if (g.box) {
      d.hatch([[x0, bed - g.tS], [-x0, bed - g.tS], [-x0, bed], [x0, bed]], 'concrete');
      d.hatch([[x0, g.soffit], [-x0, g.soffit], [-x0, g.top], [x0, g.top]], 'concrete');
      for (var i = 0; i <= n; i++) {
        var wx = x0 + i * (b + g.tW);
        d.hatch([[wx, bed], [wx + g.tW, bed], [wx + g.tW, g.soffit], [wx, g.soffit]], 'concrete');
        if (i < n) ventX.push(wx + g.tW);
      }
    } else {
      // abutments (trapezoid, vertical water face) and piers on footings
      var ab = g.abBase, at = v.abTop;
      d.hatch([[x0, bot], [x0 + ab, bot], [x0 + ab, g.soffit], [x0 + ab - at, g.soffit]], 'concrete');
      d.hatch([[-x0, bot], [-x0 - ab, bot], [-x0 - ab, g.soffit], [-x0 - ab + at, g.soffit]], 'concrete');
      var xs = x0 + ab;
      for (i = 0; i < n; i++) {
        ventX.push(xs + i * (b + g.tW));
        if (i < n - 1) {
          var px = xs + i * (b + g.tW) + b;
          d.hatch([[px, bot], [px + g.tW, bot], [px + g.tW, g.soffit], [px, g.soffit]], 'concrete');
        }
      }
      var sx = xs - v.bearing, sl = g.slabLen;
      d.hatch([[sx, g.soffit], [sx + sl, g.soffit], [sx + sl, g.top], [sx, g.top]], 'concrete');
      d.dimV(x0, bot, g.soffit, 4, { text: 'H ' + f(g.Hab, 2) });
      d.dimH(x0, x0 + ab, bot, 6, { text: 'BASE ' + f(ab, 2) });
      d.level(-x0 + 1, bot, 'FOUNDATION ' + f(bot, 3), { side: 'r' });
    }
    // water in vents up to min(HFL, soffit)
    var wl = Math.min(v.HFL, g.soffit);
    ventX.forEach(function (vx) { d.hatch([[vx, bed], [vx + b, bed], [vx + b, wl], [vx, wl]], 'water'); });
    ventX.forEach(function (vx, k) { if (k === 0 || k === ventX.length - 1) d.dimH(vx, vx + b, bed, 6, { dp: 2 }); });
    d.dimV(ventX[0] + b * 0.25, bed, g.soffit, -0.1, { dp: 2 });
    if (g.cushion > 0.05) d.dimV(x0 - 0.3, g.top, fm, 4, { text: 'CUSHION ' + f(g.cushion, 2) });
    d.dimH(x0, -x0, fm, -8, { text: 'OVERALL ' + f(W, 2) });
    d.level(x0 - side * 0.35, fm, 'FORMATION ' + f(fm, 3), { side: 'l' });
    d.level(x0 - side * 0.7, v.HFL, 'HFL ' + f(v.HFL, 3), { side: 'l' });
    d.level(-x0 + side * 0.55, bed, 'BED ' + f(bed, 3), { side: 'r' });
    d.level(-x0 + side * 0.2, g.soffit, 'SOFFIT ' + f(g.soffit, 3), { side: 'r' });
    d.text(0, bot - 1.2, (g.box ? 'BOX CULVERT ' : 'SLAB CULVERT ') + n + ' × ' + f(b, 2) + ' × ' + f(H, 2) + ' m — SECTION ACROSS VENTS', { ha: 'c', va: 't', dy: -9, h: 3 });
    d.text(0, bot - 1.2, 'SLABS ' + f(g.tS, 3) + ' m, ' + (g.box ? 'WALLS ' : 'PIERS ') + f(g.tW, 3) + ' m (PRELIMINARY)', { ha: 'c', va: 't', dy: -14, h: 2.2 });
    return d;
  }

  // Longitudinal section along the flow through one vent.
  function culvertLong(v, rep) {
    var D = rep.data, g = D.g, d = new Drawing({ title: 'Culvert longitudinal section' });
    var L = v.Lb, bed = v.bed, fm = v.formation, tS = g.tS;
    var apron = Math.max(1.5, 1.5 * v.height), cut = Math.max(0.6, Math.min(1.5, 0.5 * v.height)), tf = g.box ? tS : 0.3;
    var slope = 2, xl = -apron - 6, xr = L + apron + 6;
    d.hatch([[xl - 3, bed], [xr + 3, bed], [xr + 3, bed - tf - cut - 1.5], [xl - 3, bed - tf - cut - 1.5]], 'soil', { outline: false });
    d.line(xl - 3, bed, xr + 3, bed, 'SOIL', { w: 0.4 });
    // floor / bottom slab with aprons and cut-off walls
    d.hatch([[-apron, bed - tf], [L + apron, bed - tf], [L + apron, bed], [-apron, bed]], 'concrete');
    d.hatch([[-apron, bed - tf - cut], [-apron + 0.3, bed - tf - cut], [-apron + 0.3, bed - tf], [-apron, bed - tf]], 'concrete');
    d.hatch([[L + apron - 0.3, bed - tf - cut], [L + apron, bed - tf - cut], [L + apron, bed - tf], [L + apron - 0.3, bed - tf]], 'concrete');
    // top slab / deck
    d.hatch([[0, g.soffit], [L, g.soffit], [L, g.top], [0, g.top]], 'concrete');
    // head walls / parapets at the ends
    var pw = 0.3, ph = Math.max(0.3, Math.min(1.0, g.cushion + 0.3));
    d.hatch([[-pw, g.soffit], [0, g.soffit], [0, g.top + ph], [-pw, g.top + ph]], 'concrete');
    d.hatch([[L, g.soffit], [L + pw, g.soffit], [L + pw, g.top + ph], [L, g.top + ph]], 'concrete');
    // road embankment over the barrel: crest at formation, 2:1 slopes down to the parapet tops
    var pt = g.top + ph;
    if (fm > pt + 0.01) {
      var run = Math.min((fm - pt) * slope, (L + 2 * pw) * 0.45);
      d.hatch([[-pw, pt], [0, pt], [0, g.top], [L, g.top], [L, pt], [L + pw, pt], [L + pw - run, fm], [-pw + run, fm]], 'soil');
      d.line(-pw + run, fm, L + pw - run, fm, 'CONCRETE', { w: 0.5 });
    } else if (fm > g.top + 0.01) {
      d.hatch([[0, g.top], [L, g.top], [L, fm], [0, fm]], 'soil');
      d.line(-pw, fm, L + pw, fm, 'CONCRETE', { w: 0.5 });
    }
    // water: upstream at HFL + afflux, downstream at HFL
    d.hatch([[xl, bed], [0, bed], [0, Math.min(D.uwl, g.soffit)], [xl, D.uwl]], 'water');
    d.hatch([[0, bed], [L, bed], [L, Math.min(v.HFL, g.soffit)], [0, Math.min(D.uwl, g.soffit)]], 'water');
    d.hatch([[L, bed], [xr, bed], [xr, v.HFL], [L, Math.min(v.HFL, g.soffit)]], 'water');
    d.flow(L / 2, bed + (Math.min(v.HFL, g.soffit) - bed) * 0.45, 0, 'FLOW');
    d.level(xl + 0.5, D.uwl, 'U/S WL ' + f(D.uwl, 3), { side: 'l' });
    d.level(xr - 0.5, v.HFL, 'HFL ' + f(v.HFL, 3), { side: 'r' });
    d.level(L + apron + 0.5, bed, 'BED ' + f(bed, 3), { side: 'r' });
    d.level(L / 2, fm, 'FORMATION ' + f(fm, 3), { side: 'r' });
    d.dimH(0, L, bed - tf - cut, 6, { text: 'BARREL ' + f(L, 2) });
    d.dimH(-apron, 0, bed - tf - cut, 6, { dp: 2 });
    d.dimH(L, L + apron, bed - tf - cut, 6, { dp: 2 });
    d.dimV(L * 0.15, bed, g.soffit, -0.1, { dp: 2 });
    d.text(L / 2, bed - tf - cut - 1.5, 'LONGITUDINAL SECTION ALONG FLOW (aprons and cut-offs indicative)', { ha: 'c', va: 't', dy: -6, h: 2.8 });
    return d;
  }

  function culvertDrawings(v, rep) {
    return [{ key: 'section', title: 'Section across vents / वेंट अनुप्रस्थ काट', d: culvertSection(v, rep) },
      { key: 'long', title: 'Longitudinal section / अनुदैर्ध्य काट', d: culvertLong(v, rep) }];
  }

  function boxModel(v, rep) {
    var g = rep.data.g;
    return DS.staad.boxCulvert({ span: v.span, height: v.height, nCells: g.n, tTop: g.tS, tBot: g.tS, tWall: g.tW, fill: Math.max(0, g.cushion),
      gammaSoil: v.gammaSoil, K0: v.K0, liveUDL: v.liveUDL, subgrade: v.subgrade, fck: v.fck });
  }

  function culvertExports(v, rep) {
    if (v.type !== 'box') return [];
    return [{ label: 'STAAD.Pro .std (box culvert frame)', name: 'box-culvert.std', mime: 'text/plain', text: DS.staad.write(boxModel(v, rep)), preview: true }];
  }

  return {
    fns: { regimeWidth: regimeWidth, siltFactor: siltFactor, normalScour: normalScour, laceyScour: laceyScour, molesworth: molesworth,
      clearanceIRC5: clearanceIRC5, barrelLoss: barrelLoss, ventFlow: ventFlow, prelimThickness: prelimThickness, culvertGeom: culvertGeom, boxModel: boxModel },
    pages: [
      { id: 'bridge-waterway', group: 'E', order: 1, hi: 'पुल जलमार्ग एवं स्कावर', en: 'Bridge waterway, scour and clearance', refs: 'IRC:5, IRC:78, IRC:SP:13',
        intro: 'Linear waterway by Lacey, normal and maximum scour, afflux, vertical clearance and freeboard; soffit, formation and foundation levels.',
        inputs: bridgeInputs, design: bridgeDesign, drawings: bridgeDrawings },
      { id: 'culvert', group: 'E', order: 2, hi: 'बॉक्स एवं स्लैब पुलिया', en: 'Box and slab culvert sizing', refs: 'IRC:SP:13, IRC:5',
        intro: 'Preliminary sizing of RCC box and slab culverts: vents, velocity, afflux, clearance and thicknesses. Box culverts export a STAAD.Pro frame.',
        inputs: culvertInputs, design: culvertDesign, drawings: culvertDrawings, exports: culvertExports,
        guide: ['Choose “RCC box culvert” and adjust vents until velocity, afflux and freeboard are OK.',
          'Download the STAAD.Pro .std file and open it in STAAD.Pro (licensed software, installed separately).',
          'Check soil spring values, live-load UDL and load-combination factors against IRC:6 before running the analysis.',
          'Run the analysis and use the member forces for the slab and wall design.'] }
    ]
  };
});
