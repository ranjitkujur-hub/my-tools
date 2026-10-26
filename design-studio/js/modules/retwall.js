/* F. Cantilever retaining wall / कैंटिलीवर प्रतिधारक दीवार (IS 456:2000, limit state)
 * Stability (overturning, sliding, base pressure) and design of stem, heel and toe.
 * Per metre length of wall. Uses the IS 456 helpers exported by rcc.js. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../core/index.js'), require('./rcc.js').fns);
  else {
    var rcc = (root.DS.modules || []).filter(function (m) { return m.fns && m.fns.tauC; })[0];
    if (rcc) root.DS.register(factory(root.DS, rcc.fns));
  }
})(typeof self !== 'undefined' ? self : this, function (DS, RC) {
  'use strict';
  var B = DS.base, Drawing = DS.Drawing, f = B.f;

  function rankineKa(phiDeg) { var s = Math.sin(B.rad(phiDeg)); return (1 - s) / (1 + s); }

  var inputs = [
    { sec: 'ज्यामिति / Geometry' },
    { key: 'H', hi: 'कुल ऊँचाई (आधार तल से भराव शीर्ष)', en: 'Total height H (base underside to top of backfill)', unit: 'm', def: 5.0, min: 1.5, max: 10 },
    { key: 'Df', hi: 'सामने भूमि तक गहराई', en: 'Depth of base underside below front ground', unit: 'm', def: 1.2, min: 0.3, max: 4 },
    { key: 'Bw', hi: 'आधार चौड़ाई', en: 'Base width B', unit: 'm', def: 3.7, min: 0.8, max: 12, help: 'Typical 0.5 H to 0.7 H' },
    { key: 'toe', hi: 'टो लंबाई', en: 'Toe length (front of stem)', unit: 'm', def: 1.0, min: 0, max: 6, help: 'Typical about B/3' },
    { key: 'ttop', hi: 'स्टेम शीर्ष मोटाई', en: 'Stem thickness at top', unit: 'm', def: 0.2, min: 0.15, max: 1 },
    { key: 'tbot', hi: 'स्टेम तल मोटाई', en: 'Stem thickness at base', unit: 'm', def: 0.45, min: 0.15, max: 2, help: 'Typical H/10 to H/12' },
    { key: 'tb', hi: 'आधार स्लैब मोटाई', en: 'Base slab thickness', unit: 'm', def: 0.45, min: 0.2, max: 2 },
    { sec: 'मिट्टी एवं भार / Soil and loads' },
    { key: 'gs', hi: 'भराव इकाई भार', en: 'Unit weight of backfill γ', unit: 'kN/m³', def: 18, min: 12, max: 24 },
    { key: 'phiS', hi: 'आंतरिक घर्षण कोण', en: 'Angle of internal friction φ', unit: '°', def: 30, min: 15, max: 45 },
    { key: 'q', hi: 'अधिभार', en: 'Surcharge on backfill q', unit: 'kN/m²', def: 10, min: 0, max: 100 },
    { key: 'mu', hi: 'आधार घर्षण गुणांक', en: 'Coefficient of friction at base μ', unit: '—', def: 0.55, min: 0.2, max: 0.8 },
    { key: 'SBC', hi: 'सुरक्षित धारण क्षमता', en: 'Safe bearing capacity', unit: 'kN/m²', def: 200, min: 30, max: 1000 },
    { key: 'gc', hi: 'आरसीसी इकाई भार', en: 'Unit weight of RCC', unit: 'kN/m³', def: 25, min: 20, max: 30 },
    { sec: 'सामग्री / Materials' },
    { key: 'fck', hi: 'कंक्रीट ग्रेड', en: 'Concrete grade', type: 'select', def: '20', options: RC.FCK_OPTIONS },
    { key: 'fy', hi: 'इस्पात ग्रेड', en: 'Steel grade', type: 'select', def: '415', options: RC.FY_OPTIONS },
    { key: 'cover', hi: 'स्पष्ट आवरण', en: 'Clear cover', unit: 'mm', def: 50, min: 40, max: 100 },
    { key: 'phiStem', hi: 'स्टेम छड़ व्यास', en: 'Stem main bar diameter', unit: 'mm', def: 16, min: 10, max: 32 },
    { key: 'phiBase', hi: 'आधार छड़ व्यास', en: 'Base main bar diameter', unit: 'mm', def: 16, min: 10, max: 32 }
  ];

  // Stability of the wall per metre. Returns forces, moments about the toe and base pressures.
  function stability(v) {
    var Ka = rankineKa(v.phiS), H = v.H, hs = H - v.tb, dT = v.tbot - v.ttop;
    var xBack = v.toe + v.tbot, heel = v.Bw - v.toe - v.tbot;
    var W = [
      { name: 'Stem (rectangular part)', w: v.ttop * hs * v.gc, x: xBack - v.ttop / 2 },
      { name: 'Stem (tapered part)', w: 0.5 * dT * hs * v.gc, x: v.toe + 2 * dT / 3 },
      { name: 'Base slab', w: v.Bw * v.tb * v.gc, x: v.Bw / 2 },
      { name: 'Backfill on heel', w: heel * hs * v.gs, x: xBack + heel / 2 }
    ];
    var Wsum = 0, Mr = 0;
    W.forEach(function (o) { o.m = o.w * o.x; Wsum += o.w; Mr += o.m; });
    var P1 = 0.5 * Ka * v.gs * H * H, P2 = Ka * v.q * H;
    var Mo1 = P1 * H / 3, Mo2 = P2 * H / 2, Ph = P1 + P2, Mo = Mo1 + Mo2;
    var Wq = v.q * heel, Mq = Wq * (xBack + heel / 2);          // surcharge on heel: bearing pressure only
    var Wp = Wsum + Wq, xbar = (Mr + Mq - Mo) / Wp, e = v.Bw / 2 - xbar;
    var qmax = Wp / v.Bw * (1 + 6 * e / v.Bw), qmin = Wp / v.Bw * (1 - 6 * e / v.Bw);
    if (e > v.Bw / 6) { qmax = 2 * Wp / (3 * xbar); qmin = 0; }   // partial contact
    return { Ka: Ka, hs: hs, heel: heel, xBack: xBack, W: W, Wsum: Wsum, Mr: Mr, P1: P1, P2: P2, Mo1: Mo1, Mo2: Mo2, Ph: Ph, Mo: Mo,
      Wq: Wq, Mq: Mq, Wp: Wp, xbar: xbar, e: e, qmax: qmax, qmin: qmin };
  }

  // Soil pressure at distance x from the toe (linear, kN/m²)
  function pressureAt(s, B0, x) {
    if (s.qmin > 0 || s.e <= B0 / 6) return s.qmax + (s.qmin - s.qmax) * x / B0;
    var len = 3 * s.xbar;
    return x >= len ? 0 : s.qmax * (1 - x / len);
  }

  function slabSteel(r, label, MuKNm, Dm, cover, phi, fck, fy) {
    var d = Dm * 1000 - cover - phi / 2;
    var fl = (function () {
      var Ml = RC.muLim(fck, fy, 1000, d) / 1e6, ok = MuKNm <= Ml;
      var Ast = ok ? RC.astSingly(MuKNm * 1e6, fck, fy, 1000, d) : NaN;
      r.step(label + ': d = ' + f(d, 0) + ' mm; Mu = ' + f(MuKNm, 2) + ' kN·m/m; Mu,lim = ' + f(Ml, 1) + ' kN·m/m' +
        (ok ? '; Ast = 0.5 fck/fy [1 − √(1 − 4.6 Mu/(fck b d²))] b d = ' + f(Ast, 0) + ' mm²/m' : ' — section too thin'));
      return { Ast: Ast, Ml: Ml, ok: ok };
    })();
    var Amin = RC.minSteelFrac(fy) * 1000 * Dm * 1000;
    var Ast = Math.max(fl.Ast, Amin);
    var s = Math.max(75, RC.floor5(Math.min(1000 * RC.barArea(phi) / Ast, 3 * d, 300)));
    var prov = 1000 * RC.barArea(phi) / s;
    r.step(label + ': Ast,design = max(Ast, ' + (fy === 250 ? '0.15' : '0.12') + ' % bD = ' + f(Amin, 0) + ') = ' + f(Ast, 0) + ' mm²/m → ' + phi + ' mm @ ' + s + ' mm c/c (' + f(prov, 0) + ' mm²/m)');
    return { d: d, Ast: Ast, s: s, prov: prov, ok: fl.ok, Ml: fl.Ml, Amin: Amin };
  }

  function design(v) {
    var r = new B.Report();
    var fck = Number(v.fck), fy = Number(v.fy);
    if (v.toe + v.tbot >= v.Bw) throw new Error('टो + स्टेम आधार से अधिक / Toe + stem thickness must be less than the base width');
    if (v.tbot < v.ttop) throw new Error('स्टेम तल मोटाई शीर्ष से कम नहीं / Stem base thickness must be ≥ top thickness');
    if (v.tb >= v.H - 0.5) throw new Error('आधार मोटाई बहुत अधिक / Base slab too thick for the height');
    r.formula('Rankine: Ka = (1 − sin φ)/(1 + sin φ)');
    r.formula('P1 = ½ Ka γ H² at H/3;  P2 = Ka q H at H/2');
    r.formula('Overturning (IS 456 cl 20.1): 0.9 Mr ≥ 1.2 Mo(earth) + 1.4 Mo(surcharge)');
    r.formula('Sliding (IS 456 cl 20.2): 0.9 μ ΣW / ΣPh ≥ 1.4');
    r.formula('Base pressure: q = ΣW/B (1 ± 6e/B), e = B/2 − x̄,  x̄ = (ΣM_r − ΣM_o)/ΣW');
    r.formula('Stem: Mu = 1.5 (Ka γ h³/6 + Ka q h²/2); slabs: Ast = 0.5 fck/fy [1 − √(1 − 4.6 Mu/(fck b d²))] b d');
    r.ref('IS 456:2000 cl 20.1 and 20.2 (stability against overturning and sliding).');
    r.ref('IS 456:2000 Annex G-1.1 (flexure), cl 40.2 and Table 19 (shear in slabs), cl 26.5.2.1 (min steel).');
    r.ref('Rankine earth pressure; textbook practice (e.g. P.C. Varghese, Limit State Design of Reinforced Concrete — cantilever retaining walls).');
    r.assume('Backfill horizontal, dry, cohesionless; no water pressure behind the wall (provide weep holes and a filter).');
    r.assume('Active pressure on the vertical plane through the heel end; wall friction ignored.');
    r.assume('Passive resistance in front of the toe and soil over the toe ignored (conservative).');
    r.assume('Surcharge on the heel is ignored as a restoring load (overturning, sliding) and included for bearing pressure.');
    r.assume('Earth pressure is treated as dead load and surcharge pressure as imposed load in the cl 20.1 check; load factor 1.5 for design of members.');
    r.limit('Cantilever walls up to about 6–7 m height; taller walls are usually counterfort walls.');
    r.limit('Shear key, drainage, curtailment of stem bars and crack width are not designed here.');

    var s = stability(v);
    r.h('1. Earth pressure');
    r.eq('Ka', '(1 − sin φ)/(1 + sin φ)', '(1 − sin ' + v.phiS + '°)/(1 + sin ' + v.phiS + '°)', s.Ka, '', 4);
    r.eq('P1', '½ Ka γ H²', '0.5 × ' + f(s.Ka, 4) + ' × ' + v.gs + ' × ' + f(v.H, 2) + '²', s.P1, 'kN/m', 2);
    r.eq('P2', 'Ka q H', f(s.Ka, 4) + ' × ' + v.q + ' × ' + f(v.H, 2), s.P2, 'kN/m', 2);
    r.step('Overturning moments about toe: Mo1 = P1·H/3 = ' + f(s.Mo1, 2) + ', Mo2 = P2·H/2 = ' + f(s.Mo2, 2) + ' → Mo = ' + f(s.Mo, 2) + ' kN·m/m');

    r.h('2. Vertical loads and restoring moments about the toe');
    s.W.forEach(function (o) { r.step(o.name + ': W = ' + f(o.w, 2) + ' kN/m at x = ' + f(o.x, 3) + ' m → M = ' + f(o.m, 2) + ' kN·m/m'); });
    r.step('ΣW = ' + f(s.Wsum, 2) + ' kN/m;  ΣMr = ' + f(s.Mr, 2) + ' kN·m/m');

    r.h('3. Overturning');
    var fsOT = s.Mr / s.Mo, lhs = 0.9 * s.Mr, rhs = 1.2 * s.Mo1 + 1.4 * s.Mo2;
    r.step('IS 456 cl 20.1: 0.9 Mr = ' + f(lhs, 2) + ' vs 1.2 Mo1 + 1.4 Mo2 = ' + f(rhs, 2) + ' kN·m/m');
    r.step('Conventional FS = Mr/Mo = ' + f(s.Mr, 2) + ' / ' + f(s.Mo, 2) + ' = ' + f(fsOT, 2));

    r.h('4. Sliding');
    var fsSl = 0.9 * v.mu * s.Wsum / s.Ph;
    r.eq('FS sliding', '0.9 μ ΣW / ΣPh', '0.9 × ' + v.mu + ' × ' + f(s.Wsum, 2) + ' / ' + f(s.Ph, 2), fsSl, '', 2);
    if (fsSl < 1.4) r.warn('Sliding FS below 1.4: provide a shear key below the stem or widen the base (shear key not designed here).');

    r.h('5. Base pressure (service, including surcharge on heel)');
    r.step('ΣW = ' + f(s.Wp, 2) + ' kN/m; x̄ = (ΣMr + Mq − Mo)/ΣW = (' + f(s.Mr, 2) + ' + ' + f(s.Mq, 2) + ' − ' + f(s.Mo, 2) + ')/' + f(s.Wp, 2) + ' = ' + f(s.xbar, 3) + ' m');
    r.step('e = B/2 − x̄ = ' + f(v.Bw / 2, 3) + ' − ' + f(s.xbar, 3) + ' = ' + f(s.e, 3) + ' m (B/6 = ' + f(v.Bw / 6, 3) + ' m)');
    r.step('q,max = ' + f(s.qmax, 2) + ' kN/m² (toe);  q,min = ' + f(s.qmin, 2) + ' kN/m² (heel)');

    r.h('6. Stem design (at top of base)');
    var hs = s.hs, gF = 1.5;
    var MuS = r.eq('Mu,stem', '1.5 (Ka γ h³/6 + Ka q h²/2)', '1.5 × (' + f(s.Ka, 4) + ' × ' + v.gs + ' × ' + f(hs, 2) + '³/6 + ' + f(s.Ka, 4) + ' × ' + v.q + ' × ' + f(hs, 2) + '²/2)',
      gF * (s.Ka * v.gs * Math.pow(hs, 3) / 6 + s.Ka * v.q * hs * hs / 2), 'kN·m/m', 2);
    var VuS = gF * (s.Ka * v.gs * hs * hs / 2 + s.Ka * v.q * hs);
    var stem = slabSteel(r, 'Stem (earth face)', MuS, v.tbot, v.cover, v.phiStem, fck, fy);
    var tvS = VuS * 1e3 / (1000 * stem.d), tcS = RC.tauC(100 * stem.prov / (1000 * stem.d), fck);
    r.step('Stem shear: Vu = 1.5 (Ka γ h²/2 + Ka q h) = ' + f(VuS, 2) + ' kN/m → τv = ' + f(tvS, 3) + ' N/mm²; τc = ' + f(tcS, 3) + ' N/mm² (k = 1 taken, conservative)');
    var distS = RC.minSteelFrac(fy) * 1000 * (v.ttop + v.tbot) / 2 * 1000;
    var sDist = RC.floor5(Math.min(1000 * RC.barArea(10) / distS, 300));
    r.step('Distribution / front face steel: ' + (fy === 250 ? '0.15' : '0.12') + ' % of mean stem section = ' + f(distS, 0) + ' mm²/m → 10 mm @ ' + sDist + ' mm c/c (split between faces as practical)');

    r.h('7. Heel slab (moment at back face of stem)');
    var Bw = v.Bw, n = 60, xB = s.xBack, heel = s.heel;
    var wDown = v.gs * hs + v.q + v.gc * v.tb;
    var MH = 0, VH = 0;
    for (var i = 0; i < n; i++) {
      var dx = heel / n, xm = xB + (i + 0.5) * dx, net = wDown - pressureAt(s, Bw, xm);
      MH += net * dx * (xm - xB); VH += net * dx;
    }
    r.step('Downward load on heel = γ h + q + γc tb = ' + f(wDown, 2) + ' kN/m²; upward soil pressure varies ' + f(pressureAt(s, Bw, xB), 1) + ' → ' + f(pressureAt(s, Bw, Bw), 1) + ' kN/m²');
    var MuH = r.eq('Mu,heel', '1.5 ∫(w − p)(x − x_stem) dx', '1.5 × ' + f(MH, 2), gF * Math.max(MH, 0), 'kN·m/m', 2);
    var heelS = slabSteel(r, 'Heel (top face)', MuH, v.tb, v.cover, v.phiBase, fck, fy);
    var VuH = gF * Math.max(VH, 0), tvH = VuH * 1e3 / (1000 * heelS.d), tcH = RC.tauC(100 * heelS.prov / (1000 * heelS.d), fck) * RC.slabK(v.tb * 1000);
    r.step('Heel shear at stem face (conservative): Vu = ' + f(VuH, 2) + ' kN/m → τv = ' + f(tvH, 3) + ' N/mm²; k τc = ' + f(tcH, 3) + ' N/mm²');

    r.h('8. Toe slab (moment at front face of stem)');
    var MT = 0, VT = 0, toe = v.toe, dToe = (v.tb * 1000 - v.cover - v.phiBase / 2) / 1000;
    for (i = 0; i < n && toe > 0; i++) {
      var dxt = toe / n, xt = (i + 0.5) * dxt, nt = pressureAt(s, Bw, xt) - v.gc * v.tb;
      MT += nt * dxt * (toe - xt);
      if (xt < toe - dToe) VT += nt * dxt;          // shear at d from the stem face (cl 22.6.2.1)
    }
    var MuT = r.eq('Mu,toe', '1.5 ∫(p − γc tb)(x_face − x) dx', '1.5 × ' + f(MT, 2), gF * Math.max(MT, 0), 'kN·m/m', 2);
    var toeS = slabSteel(r, 'Toe (bottom face)', MuT, v.tb, v.cover, v.phiBase, fck, fy);
    var VuT = gF * Math.max(VT, 0), tvT = VuT * 1e3 / (1000 * toeS.d), tcT = RC.tauC(100 * toeS.prov / (1000 * toeS.d), fck) * RC.slabK(v.tb * 1000);
    r.step('Toe shear at d from stem face: Vu = ' + f(VuT, 2) + ' kN/m → τv = ' + f(tvT, 3) + ' N/mm²; k τc = ' + f(tcT, 3) + ' N/mm²');

    r.result('Active pressure coefficient Ka', s.Ka, '', 4);
    r.result('Total horizontal thrust', s.Ph, 'kN/m', 2);
    r.result('FS overturning Mr/Mo', fsOT, '', 2);
    r.result('FS sliding (0.9 μ W/Ph)', fsSl, '', 2);
    r.result('Base pressure max / min', f(s.qmax, 1) + ' / ' + f(s.qmin, 1), 'kN/m²');
    r.result('Stem main bars (earth face)', v.phiStem + ' mm @ ' + stem.s + ' mm c/c');
    r.result('Heel top bars', v.phiBase + ' mm @ ' + heelS.s + ' mm c/c');
    r.result('Toe bottom bars', v.phiBase + ' mm @ ' + toeS.s + ' mm c/c');

    r.check('Overturning IS 456 cl 20.1: 0.9 Mr ≥ 1.2 Mo,DL + 1.4 Mo,LL', lhs >= rhs, f(lhs, 1) + ' kN·m', '≥ ' + f(rhs, 1) + ' kN·m');
    r.check('Overturning FS (textbook practice)', fsOT >= 2.0, f(fsOT, 2), '≥ 2.0', 'for information');
    r.check('Sliding IS 456 cl 20.2', fsSl >= 1.4, f(fsSl, 2), '≥ 1.4', 'else shear key');
    r.check('Max base pressure ≤ SBC', s.qmax <= v.SBC, f(s.qmax, 1) + ' kN/m²', '≤ ' + f(v.SBC, 0) + ' kN/m²');
    r.check('No tension at base (e ≤ B/6)', s.e <= v.Bw / 6 + 1e-9, 'e = ' + f(s.e, 3) + ' m', '≤ ' + f(v.Bw / 6, 3) + ' m');
    r.check('Stem flexure Mu ≤ Mu,lim', stem.ok, f(MuS, 1) + ' kN·m/m', '≤ ' + f(stem.Ml, 1) + ' kN·m/m');
    r.check('Stem shear τv ≤ τc', tvS <= tcS, f(tvS, 3) + ' N/mm²', '≤ ' + f(tcS, 3) + ' N/mm²');
    r.check('Heel flexure Mu ≤ Mu,lim', heelS.ok, f(MuH, 1) + ' kN·m/m', '≤ ' + f(heelS.Ml, 1) + ' kN·m/m');
    r.check('Heel shear τv ≤ k τc', tvH <= tcH, f(tvH, 3) + ' N/mm²', '≤ ' + f(tcH, 3) + ' N/mm²');
    r.check('Toe flexure Mu ≤ Mu,lim', toeS.ok, f(MuT, 1) + ' kN·m/m', '≤ ' + f(toeS.Ml, 1) + ' kN·m/m');
    r.check('Toe shear τv ≤ k τc', tvT <= tcT, f(tvT, 3) + ' N/mm²', '≤ ' + f(tcT, 3) + ' N/mm²');

    r.table('Loads and moments about toe (per m)', ['Item', 'Force (kN/m)', 'Lever arm (m)', 'Moment (kN·m/m)'],
      s.W.map(function (o) { return [o.name, B.round(o.w, 2), B.round(o.x, 3), B.round(o.m, 2)]; }).concat([
        ['Earth pressure P1 (horizontal)', B.round(s.P1, 2), B.round(v.H / 3, 3), B.round(-s.Mo1, 2)],
        ['Surcharge pressure P2 (horizontal)', B.round(s.P2, 2), B.round(v.H / 2, 3), B.round(-s.Mo2, 2)]]), 'loads');
    r.table('Reinforcement', ['Member', 'Mu (kN·m/m)', 'd (mm)', 'Ast req (mm²/m)', 'Provide'], [
      ['Stem, earth face (vertical)', B.round(MuS, 2), B.round(stem.d, 0), B.round(stem.Ast, 0), v.phiStem + ' @ ' + stem.s],
      ['Heel, top (transverse)', B.round(MuH, 2), B.round(heelS.d, 0), B.round(heelS.Ast, 0), v.phiBase + ' @ ' + heelS.s],
      ['Toe, bottom (transverse)', B.round(MuT, 2), B.round(toeS.d, 0), B.round(toeS.Ast, 0), v.phiBase + ' @ ' + toeS.s],
      ['Distribution (both slabs, longitudinal)', '—', '—', B.round(distS, 0), '10 @ ' + sDist]], 'steel');
    r.data = { v: v, s: s, stem: stem, heel: heelS, toe: toeS };
    return r;
  }

  function drawing(v, rep) {
    var s = rep.data.s, H = v.H, tb = v.tb, toe = v.toe, xB = s.xBack, Bw = v.Bw, cv = v.cover / 1000;
    var ps = v.phiStem / 1000, pb = v.phiBase / 1000;
    var d = new Drawing({ title: 'Cantilever retaining wall section' });
    var ext = 1.0, Df = Math.min(v.Df, H - 0.3);
    // backfill behind the stem and over the heel
    d.hatch([[xB, tb], [xB, H], [Bw + ext, H], [Bw + ext, -0.3], [Bw, -0.3], [Bw, tb]], 'soil', { outline: false });
    d.line(xB, H, Bw + ext, H, 'SOIL');
    // foundation soil below and front soil over the toe
    d.hatch([[-ext, -0.3], [Bw, -0.3], [Bw, 0], [0, 0], [0, Df > tb ? tb : Df], [-ext, Df > tb ? tb : Df]], 'soil', { outline: false });
    if (Df > tb) d.hatch([[-ext, tb], [0, tb], [toe, tb], [toe + (v.tbot - v.ttop) * (Df - tb) / (H - tb), Df], [-ext, Df]], 'soil', { outline: false });
    d.line(-ext, Df, toe + (v.tbot - v.ttop) * Math.max(Df - tb, 0) / (H - tb), Df, 'SOIL');
    // concrete
    d.hatch([[0, 0], [Bw, 0], [Bw, tb], [xB, tb], [xB, H], [xB - v.ttop, H], [toe, tb], [0, tb]], 'concrete');
    // stem main bars (earth face) bent into the heel / toe
    var xs = xB - cv - ps / 2;
    d.pline([[xs, H - cv], [xs, cv + pb + ps / 2], [xs - Math.min(0.5, toe), cv + pb + ps / 2]], 'REBAR', { w: 0.5 });
    // front face nominal bars
    var topF = xB - v.ttop + cv;
    d.pline([[toe + cv + 0.03, tb - cv], [topF, H - cv]], 'REBAR');
    // heel top bars and toe bottom bars
    d.pline([[toe + cv, tb - cv - pb / 2], [Bw - cv, tb - cv - pb / 2], [Bw - cv, tb - cv - 0.15]], 'REBAR', { w: 0.5 });
    d.pline([[cv, cv + 0.15], [cv, cv + pb / 2], [Bw - cv, cv + pb / 2]], 'REBAR', { w: 0.5 });
    // distribution bars as dots
    for (var y = tb + 0.3; y < H - 0.1; y += 0.3) d.bar(xs - ps, y, 0.01);
    for (var x = cv + 0.1; x < Bw - cv; x += 0.3) { d.bar(x, cv + pb + 0.005, 0.01); d.bar(x, tb - cv - pb - 0.005, 0.01); }
    // pressure diagram to the right of the backfill
    var px = Bw + ext + 0.4, sc = 1.2 / (s.Ka * v.gs * H + s.Ka * v.q);
    var pTop = s.Ka * v.q * sc, pBot = (s.Ka * v.q + s.Ka * v.gs * H) * sc;
    d.hatch([[px, 0], [px, H], [px + pTop, H], [px + pBot, 0]], 'pressure');
    d.text(px + pBot, 0, f(s.Ka * (v.q + v.gs * H), 1) + ' kN/m²', { ha: 'l', va: 'b', dx: 1, h: 2 });
    if (v.q > 0) d.text(px + pTop, H, f(s.Ka * v.q, 1) + ' kN/m²', { ha: 'l', va: 'b', dx: 1, h: 2 });
    d.text(px, H, 'Earth pressure', { ha: 'l', va: 'b', dy: 5, h: 2.2 });
    // dimensions and levels
    d.dimH(0, Bw, -0.3, 13, { text: 'B = ' + f(Bw, 2) });
    if (toe > 0) d.dimH(0, toe, -0.3, 4, { text: f(toe, 2) });
    d.dimH(xB, Bw, -0.3, 4, { text: f(s.heel, 2) });
    d.dimH(xB - v.ttop, xB, H, -6, { text: f(v.ttop, 2) });
    d.dimV(-ext, 0, H, 8, { text: 'H = ' + f(H, 2) });
    d.dimV(Bw, 0, tb, -6, { text: f(tb, 2) });
    d.level(xB + Math.max(1.0, s.heel * 0.5), H, 'Top of backfill', { side: 'r' });
    d.level(-ext + 0.2, Df, 'Front GL', { side: 'r' });
    d.text(xB, H * 0.6, v.phiStem + 'φ @ ' + rep.data.stem.s + ' (earth face)', { ha: 'l', va: 'm', dx: 2, h: 2 });
    d.text(xB + s.heel / 2, tb, v.phiBase + 'φ @ ' + rep.data.heel.s + ' (heel, top)', { ha: 'c', va: 'b', dy: 2, h: 2 });
    d.text(Bw / 2, -0.3, 'Toe: ' + v.phiBase + 'φ @ ' + rep.data.toe.s + ' (bottom)   Distribution: 10φ', { ha: 'c', va: 't', dy: -20, h: 2 });
    return [{ key: 'section', title: 'Retaining wall section / प्रतिधारक दीवार काट', d: d }];
  }

  return {
    fns: { rankineKa: rankineKa, stability: stability, pressureAt: pressureAt },
    pages: [
      { id: 'retaining-wall', group: 'F', order: 5, hi: 'कैंटिलीवर प्रतिधारक दीवार', en: 'Cantilever retaining wall', refs: 'IS 456:2000 cl 20.1, 20.2; Rankine',
        intro: 'Stability (overturning, sliding, base pressure) and reinforcement of stem, heel and toe, per metre length.',
        inputs: inputs, design: design, drawings: drawing }
    ]
  };
});
