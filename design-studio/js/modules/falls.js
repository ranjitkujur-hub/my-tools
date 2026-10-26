/* C4. Canal falls / नहर प्रपात
 * - Sarda type fall (rectangular or trapezoidal crest) with cistern and
 *   floor length by Bligh's creep theory.
 * - Straight drop with USBR stilling basin (Rand's drop-number equations). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../core/index.js'));
  else root.DS.register(factory(root.DS));
})(typeof self !== 'undefined' ? self : this, function (DS) {
  'use strict';
  var B = DS.base, Drawing = DS.Drawing, f = B.f, G = B.G;

  /* ---------- formulas ---------- */
  function sardaCoef(shape) { return shape === 'trap' ? 1.99 : 1.835; }
  // Top width of crest: rectangular B = 0.55 √d, trapezoidal B = 0.55 √(H + d)
  function sardaCrestWidth(shape, H, d) { return shape === 'trap' ? 0.55 * Math.sqrt(H + d) : 0.55 * Math.sqrt(d); }
  // Q = C L H^1.5 (H/B)^(1/6)
  function sardaQ(shape, L, H, Bw) { return sardaCoef(shape) * L * Math.pow(H, 1.5) * Math.pow(H / Bw, 1 / 6); }
  // Head over crest for a total energy level `tel`; crest width depends on d = crest − d/s bed, so iterate.
  function sardaHead(Q, L, shape, tel, dsBed) {
    var C = sardaCoef(shape), H = Math.pow(Q / (C * L), 2 / 3), Bw, d;
    for (var k = 0; k < 200; k++) {
      d = tel - H - dsBed;
      if (d <= 0) return { H: H, B: NaN, d: d, ok: false };
      Bw = sardaCrestWidth(shape, H, d);
      var Hn = Math.pow(Q * Math.pow(Bw, 1 / 6) / (C * L), 0.6);
      if (Math.abs(Hn - H) < 1e-12) { H = Hn; break; }
      H = Hn;
    }
    d = tel - H - dsBed;
    return { H: H, B: sardaCrestWidth(shape, H, d), d: d, ok: d > 0 };
  }
  // Cistern (Garg): length Lc = 5 √(E·HL), depth x = (E·HL)^(2/3) / 4
  function cistern(E, HL) { return { L: 5 * Math.sqrt(E * HL), x: Math.pow(E * HL, 2 / 3) / 4 }; }
  // Rand (1955) straight-drop equations; h = drop from crest to basin floor
  function rand(q, h) {
    var D = q * q / (G * h * h * h);
    return { D: D, yc: Math.pow(q * q / G, 1 / 3), Ld: 4.30 * h * Math.pow(D, 0.27), yp: 1.00 * h * Math.pow(D, 0.22),
      y1: 0.54 * h * Math.pow(D, 0.425), y2: 1.66 * h * Math.pow(D, 0.27) };
  }
  function trapArea(b, z, y) { return (b + z * y) * y; }

  /* ---------- inputs ---------- */
  var isSarda = function (v) { return v.type === 'sarda'; };
  var isDrop = function (v) { return v.type === 'drop'; };
  var inputs = [
    { sec: 'प्रपात का प्रकार / Type of fall' },
    { key: 'type', hi: 'प्रकार', en: 'Fall type', type: 'select', def: 'sarda',
      options: [['sarda', 'Sarda type (raised crest + cistern)'], ['drop', 'Straight drop with USBR basin']] },
    { key: 'shape', hi: 'क्रेस्ट', en: 'Crest shape', type: 'select', def: 'auto', show: isSarda,
      options: [['auto', 'Auto (rectangular for Q ≤ 14 m³/s, else trapezoidal)'], ['rect', 'Rectangular'], ['trap', 'Trapezoidal']] },
    { sec: 'नहर / Canal' },
    { key: 'Q', hi: 'डिस्चार्ज', en: 'Design discharge Q', unit: 'm³/s', def: 8, min: 0.05, max: 500 },
    { key: 'Bu', hi: 'तल चौड़ाई', en: 'Canal bed width', unit: 'm', def: 6, min: 0.3, max: 200 },
    { key: 'z', hi: 'पार्श्व ढाल', en: 'Canal side slope (H:V)', unit: 'H:V', def: 1.5, min: 0, max: 4 },
    { key: 'usBed', hi: 'ऊर्ध्व तल स्तर', en: 'Upstream bed level', unit: 'm', def: 209.2, min: -500, max: 9000 },
    { key: 'Du', hi: 'ऊर्ध्व जल गहराई', en: 'Upstream full supply depth', unit: 'm', def: 1.3, min: 0.1, max: 15 },
    { key: 'dsBed', hi: 'अनुप्रवाह तल स्तर', en: 'Downstream bed level', unit: 'm', def: 207.7, min: -500, max: 9000 },
    { key: 'Dd', hi: 'अनुप्रवाह जल गहराई', en: 'Downstream full supply depth', unit: 'm', def: 1.3, min: 0.1, max: 15 },
    { sec: 'क्रेस्ट / Crest' },
    { key: 'L', hi: 'क्रेस्ट लंबाई (0 = स्वतः)', en: 'Crest length (0 = auto)', unit: 'm', def: 0, min: 0, max: 200,
      help: 'Sarda: auto = canal bed width. Straight drop: auto = width that keeps the upstream FSL (critical flow at crest).' },
    { key: 'p', hi: 'क्रेस्ट ऊँचाई', en: 'Crest height above upstream bed', unit: 'm', def: 0, min: 0, max: 5, show: isDrop },
    { sec: 'फ़र्श / Floor' },
    { key: 'Cb', hi: 'ब्लाई क्रीप गुणांक', en: "Bligh's creep coefficient C", unit: '—', def: 12, min: 4, max: 20, show: isSarda,
      help: 'Typical: fine sand 15, coarse sand 12, gravel and sand 9, boulders 4–6' },
    { key: 'Gs', hi: 'फ़र्श सामग्री का विशिष्ट गुरुत्व', en: 'Specific gravity of floor material', unit: '—', def: 2.24, min: 1.5, max: 3, show: isSarda },
    { key: 't', hi: 'फ़र्श मोटाई (दी गई)', en: 'Floor thickness provided', unit: 'm', def: 0.9, min: 0.15, max: 5 }
  ];

  /* ---------- design ---------- */
  function design(v) {
    if (v.dsBed >= v.usBed) throw new Error('अनुप्रवाह तल नीचा होना चाहिए / Downstream bed must be lower than upstream bed');
    var r = new B.Report();
    var usFSL = v.usBed + v.Du, dsFSL = v.dsBed + v.Dd, HL = usFSL - dsFSL;
    if (HL <= 0) throw new Error('जल स्तर में गिरावट नहीं / No drop in water level: downstream FSL must be below upstream FSL');
    var Au = trapArea(v.Bu, v.z, v.Du), Va = v.Q / Au, ha = Va * Va / (2 * G), tel = usFSL + ha;
    r.data = { v: v, usFSL: usFSL, dsFSL: dsFSL, HL: HL };
    return v.type === 'drop' ? designDrop(v, r, Au, Va, ha, tel) : designSarda(v, r, Au, Va, ha, tel);
  }

  function common(r, v, Au, Va, ha, tel) {
    var D = r.data;
    r.h('1. Canal levels and approach velocity');
    r.step('U/s FSL = ' + f(v.usBed) + ' + ' + f(v.Du) + ' = ' + f(D.usFSL) + ' m;  D/s FSL = ' + f(v.dsBed) + ' + ' + f(v.Dd) + ' = ' + f(D.dsFSL) + ' m');
    r.eq('Drop in water level HL', 'U/s FSL − D/s FSL', f(D.usFSL) + ' − ' + f(D.dsFSL), D.HL, 'm');
    r.eq('Approach area A', '(b + zD) D', '(' + f(v.Bu, 2) + ' + ' + f(v.z, 2) + ' × ' + f(v.Du, 2) + ') × ' + f(v.Du, 2), Au, 'm²');
    r.eq('Approach velocity Va', 'Q / A', f(v.Q, 2) + ' / ' + f(Au), Va, 'm/s');
    r.eq('Velocity head ha', 'Va² / 2g', '', ha, 'm', 4);
    r.eq('U/s total energy line TEL', 'FSL + ha', '', tel, 'm');
  }

  function designSarda(v, r, Au, Va, ha, tel) {
    var D = r.data;
    var shape = v.shape === 'auto' ? (v.Q <= 14 ? 'rect' : 'trap') : v.shape;
    var L = v.L > 0 ? v.L : v.Bu;
    r.formula('Rectangular crest: Q = 1.835 L H^(3/2) (H/B)^(1/6),  B = 0.55 √d');
    r.formula('Trapezoidal crest: Q = 1.99 L H^(3/2) (H/B)^(1/6),  B = 0.55 √(H + d)');
    r.formula('Cistern: Lc = 5 √(E·HL),  depth x = (E·HL)^(2/3) / 4');
    r.formula("Bligh's creep: L_creep ≥ C · Hs;  uplift h = Hs (1 − l/L);  t = (4/3) h / (G − 1)");
    r.formula('Cut-offs: u/s d1 = D_u/3 + 0.6 m, d/s d2 = D_d/2 + 0.6 m');
    r.ref('S.K. Garg, Irrigation Engineering and Hydraulic Structures — Sarda type fall design (Sarda canal formulae, cistern after UPIRI).');
    r.ref('IS 7114 / canal falls practice: Sarda type falls (verify clause in current Indian Standard for canal falls).');
    r.ref("Bligh's creep theory for floor length and thickness (IS 6966 Part 1 gives Khosla's method for final design — verify).");
    r.assume('H is taken as the energy head over the crest (u/s TEL − crest level).');
    r.assume('Crest length = canal bed width unless given; no end contractions.');
    r.assume('Floor uplift by Bligh with no credit for water standing in the cistern (conservative).');
    r.assume('Crest batters for the trapezoidal crest 1:3 (u/s) and 1:8 (d/s); base of rectangular crest = (H + d)/√G (verify against current practice).');
    r.limit('Sarda falls suit small drops (about up to 1.5–1.8 m) in canals with sandy beds (verify).');
    r.limit('Rectangular crest normally for Q up to about 14 m³/s; trapezoidal beyond.');
    r.limit("Bligh's theory is a preliminary method; check exit gradient by Khosla's theory for final design.");
    common(r, v, Au, Va, ha, tel);

    r.h('2. Crest (' + (shape === 'trap' ? 'trapezoidal' : 'rectangular') + ')');
    r.step('Crest length L = ' + f(L, 2) + ' m' + (v.L > 0 ? ' (given)' : ' (= canal bed width)'));
    var s = sardaHead(v.Q, L, shape, tel, v.dsBed);
    if (!s.ok) throw new Error('क्रेस्ट अनुप्रवाह तल से नीचे / Crest falls below the downstream bed — increase crest length or check levels');
    var crest = tel - s.H;
    r.step('Iterating H with B = ' + (shape === 'trap' ? '0.55 √(H + d)' : '0.55 √d') + ' and d = crest level − d/s bed level:');
    r.eq('Head over crest H', '[Q B^(1/6) / (' + sardaCoef(shape) + ' L)]^(3/5)', '[' + f(v.Q, 2) + ' × ' + f(s.B, 3) + '^(1/6) / (' + sardaCoef(shape) + ' × ' + f(L, 2) + ')]^0.6', s.H, 'm');
    r.eq('Crest level', 'TEL − H', f(tel) + ' − ' + f(s.H), crest, 'm');
    r.eq('Crest height above d/s bed d', 'crest − d/s bed', f(crest) + ' − ' + f(v.dsBed), s.d, 'm');
    r.eq('Crest top width B', shape === 'trap' ? '0.55 √(H + d)' : '0.55 √d', '', s.B, 'm');
    r.eq('Check Q', sardaCoef(shape) + ' L H^1.5 (H/B)^(1/6)', '', sardaQ(shape, L, s.H, s.B), 'm³/s');
    var Bw = Math.max(s.B, 0.4);   // practical minimum top width
    if (Bw > s.B) r.step('Top width rounded up to practical minimum ' + f(Bw, 2) + ' m.');
    var xc1, sds, bw;
    if (shape === 'trap') {
      xc1 = s.d / 3; sds = 1 / 8; bw = xc1 + Bw + s.d * sds;
      r.step('Trapezoidal crest base width = d/3 + B + d/8 = ' + f(bw) + ' m');
    } else {
      xc1 = 0; bw = Math.max((s.H + s.d) / Math.sqrt(v.Gs), Bw + 0.1); sds = (bw - Bw) / s.d;
      r.eq('Rectangular crest base width', '(H + d) / √G', '(' + f(s.H) + ' + ' + f(s.d) + ') / √' + f(v.Gs, 2), bw, 'm');
    }

    r.h('3. Cistern');
    var E = s.H, c = cistern(E, D.HL);
    r.eq('Cistern length Lc', '5 √(E·HL)', '5 × √(' + f(E) + ' × ' + f(D.HL) + ')', c.L, 'm');
    r.eq('Cistern depth x', '(E·HL)^(2/3) / 4', '', c.x, 'm');
    var cf = v.dsBed - c.x;
    r.eq('Cistern floor level', 'd/s bed − x', '', cf, 'm');

    r.h('4. Impervious floor by Bligh');
    var Hs = s.d;
    r.eq('Max seepage head Hs', 'crest − d/s bed (water at crest, d/s dry)', '', Hs, 'm');
    var Lreq = r.eq('Required creep length', 'C · Hs', f(v.Cb, 1) + ' × ' + f(Hs), v.Cb * Hs, 'm');
    var d1 = v.Du / 3 + 0.6, d2 = v.Dd / 2 + 0.6;
    r.eq('U/s cut-off depth d1', 'D_u/3 + 0.6', '', d1, 'm');
    r.eq('D/s cut-off depth d2', 'D_d/2 + 0.6', '', d2, 'm');
    var xE = xc1 + Bw + sds * (crest - cf);         // d/s toe of crest at cistern floor
    var rise = 3 * c.x;                             // 1V:3H rise from cistern to d/s bed
    var LdMin = 2 * v.Dd + D.HL + 2.5;
    var Ld = Math.max(LdMin, c.L + rise + 1.0);
    r.eq('Min d/s floor length (from crest toe)', '2 D_d + HL + 2.5', '', LdMin, 'm');
    r.step('D/s floor adopted Ld = max(' + f(LdMin, 2) + ', Lc + 3x + 1.0 = ' + f(c.L + rise + 1, 2) + ') = ' + f(Ld, 2) + ' m');
    var bReq = Lreq - 2 * d1 - 2 * d2;
    var Lu = Math.max(bReq - xE - Ld, Math.max(2, v.Du));
    r.eq('Horizontal floor required b', 'L_creep − 2(d1 + d2)', '', bReq, 'm');
    r.step('U/s floor Lu = max(b − crest base − Ld, ' + f(Math.max(2, v.Du), 2) + ') = ' + f(Lu, 2) + ' m');
    var bTot = Lu + xE + Ld, Lprov = bTot + 2 * d1 + 2 * d2;
    r.eq('Creep length provided', '2 d1 + Lu + crest base + Ld + 2 d2', '', Lprov, 'm');
    r.h('5. Floor thickness (Bligh)');
    var lE = 2 * d1 + Lu + xE, hE = Hs * (1 - lE / Lprov), tE = 4 / 3 * hE / (v.Gs - 1);
    var lF = lE + c.L, hF = Hs * (1 - lF / Lprov), tF = 4 / 3 * hF / (v.Gs - 1);
    r.eq('Uplift head at crest toe', 'Hs (1 − l/L)', f(Hs) + ' × (1 − ' + f(lE, 2) + '/' + f(Lprov, 2) + ')', hE, 'm');
    r.eq('Thickness required at crest toe', '(4/3) h / (G − 1)', '', tE, 'm');
    r.eq('Uplift head at cistern end', 'Hs (1 − l/L)', '', hF, 'm');
    r.eq('Thickness required at cistern end', '(4/3) h / (G − 1)', '', tF, 'm');
    var tReq = Math.max(tE, 0.3);

    r.result('Crest type', shape === 'trap' ? 'Trapezoidal' : 'Rectangular');
    r.result('Crest length L', L, 'm', 2);
    r.result('Head over crest H', s.H, 'm');
    r.result('Crest level', crest, 'm');
    r.result('Crest top width B', Bw, 'm', 2);
    r.result('Cistern length Lc', c.L, 'm', 2);
    r.result('Cistern depth x', c.x, 'm');
    r.result('Cistern floor level', cf, 'm');
    r.result('U/s floor length', Lu, 'm', 2);
    r.result('D/s floor length (from crest toe)', Ld, 'm', 2);
    r.result('Cut-off depths u/s / d/s', f(d1, 2) + ' / ' + f(d2, 2), 'm');
    r.result('Floor thickness required (crest toe)', tReq, 'm', 2);
    r.check('Creep length (Bligh)', Lprov >= Lreq - 1e-6, f(Lprov, 2) + ' m', '≥ ' + f(Lreq, 2) + ' m');
    r.check('Floor thickness at crest toe', v.t >= tReq - 1e-9, f(v.t, 2) + ' m', '≥ ' + f(tReq, 2) + ' m', 'min. 0.3 m');
    r.check('Crest shape for discharge', shape === 'rect' ? v.Q <= 14 : v.Q > 14 * 0.8, shape === 'rect' ? 'Rectangular' : 'Trapezoidal', 'rect ≤ 14 m³/s < trap', 'Garg guidance');
    r.check('Drop suits Sarda fall', D.HL <= 1.8, f(D.HL, 2) + ' m', '≤ 1.8 m (verify)');
    if (crest < v.usBed) r.warn('Crest level is below the u/s bed: the crest acts as a notch and may cause drawdown at low flows — consider a shorter crest.');
    r.table('Floor and key levels', ['Item', 'Level / length (m)'], [
      ['U/s FSL', B.round(D.usFSL, 3)], ['U/s TEL', B.round(tel, 3)], ['Crest level', B.round(crest, 3)], ['U/s bed', v.usBed],
      ['D/s FSL', B.round(D.dsFSL, 3)], ['D/s bed', v.dsBed], ['Cistern floor', B.round(cf, 3)],
      ['U/s floor length', B.round(Lu, 2)], ['Crest base (to toe at cistern)', B.round(xE, 2)], ['Cistern length', B.round(c.L, 2)],
      ['D/s floor length', B.round(Ld, 2)], ['Total floor length', B.round(bTot, 2)]], 'levels');
    Object.assign(D, { kind: 'sarda', shape: shape, L: L, H: s.H, crest: crest, Bw: Bw, d: s.d, xc1: xc1, sds: sds, xE: xE, cf: cf,
      Lc: c.L, x: c.x, rise: rise, Ld: Ld, Lu: Lu, d1: d1, d2: d2, t: v.t });
    return r;
  }

  function designDrop(v, r, Au, Va, ha, tel) {
    var D = r.data;
    r.formula('Critical depth yc = (q²/g)^(1/3),  q = Q/L');
    r.formula('Crest length to hold u/s FSL: L = Q / (1.705 E^(3/2)),  E = TEL − crest');
    r.formula('Drop number D = q² / (g h³)  (h = crest to basin floor)');
    r.formula('Rand: Ld = 4.30 h D^0.27,  yp = 1.00 h D^0.22,  y1 = 0.54 h D^0.425,  y2 = 1.66 h D^0.27');
    r.formula('USBR basin: L_B = Ld + 2.55 yc; floor blocks 0.8yc high at Ld + 0.8yc; end sill 0.4yc; tail-water ≥ 2.15 yc');
    r.ref('Rand, W. (1955), Flow geometry at straight drop spillways, Proc. ASCE 81.');
    r.ref('USBR, Design of Small Canal Structures (1978) — straight drop with stilling basin (verify figure numbers).');
    r.ref('S.K. Garg, Irrigation Engineering and Hydraulic Structures — canal falls.');
    r.assume('Free over-fall with ventilated nappe; rectangular basin of the same width as the crest.');
    r.assume('Approach velocity head included in the energy over the crest.');
    r.assume('Basin floor is set so that tail-water ≥ 2.15 yc (or at the d/s bed if lower).');
    r.limit("Rand's equations were fitted for drop numbers of roughly 0.0001 – 1 (verify).");
    r.limit('USBR straight drop basins are intended for drops up to about 3–4.5 m (verify); use a stilling basin design for larger drops.');
    common(r, v, Au, Va, ha, tel);

    r.h('2. Crest');
    var crest = v.usBed + v.p, E = tel - crest;
    r.eq('Crest level', 'u/s bed + p', '', crest, 'm');
    r.eq('Energy over crest E', 'TEL − crest', '', E, 'm');
    var Lreq = r.eq('Crest length to hold FSL', 'Q / (1.705 E^1.5)', f(v.Q, 2) + ' / (1.705 × ' + f(E) + '^1.5)', v.Q / (1.705 * Math.pow(E, 1.5)), 'm', 2);
    var L = v.L > 0 ? v.L : Math.ceil(Lreq * 10 - 1e-9) / 10;
    r.step('Crest (basin) width adopted L = ' + f(L, 2) + ' m' + (v.L > 0 ? ' (given)' : ''));
    var Hreq = Math.pow(v.Q / (1.705 * L), 2 / 3), usWL = crest + Hreq - ha;
    r.eq('Energy head needed with L', '[Q / (1.705 L)]^(2/3)', '', Hreq, 'm');
    r.eq('U/s water level at design Q', 'crest + E_req − ha', '', usWL, 'm');
    var q = v.Q / L, yc = Math.pow(q * q / G, 1 / 3);
    r.eq('q', 'Q / L', '', q, 'm²/s');
    r.eq('yc', '(q²/g)^(1/3)', '', yc, 'm');

    r.h('3. Basin floor and drop geometry');
    var floor = Math.min(v.dsBed, B.floorTo(D.dsFSL - 2.15 * yc, 0.05));
    r.step('Basin floor = min(d/s bed ' + f(v.dsBed) + ', D/s FSL − 2.15 yc = ' + f(D.dsFSL - 2.15 * yc) + ' → rounded down to 0.05) = ' + f(floor) + ' m');
    var h = crest - floor;
    if (h <= 0) throw new Error('Basin floor above crest — check levels');
    var g = rand(q, h);
    r.eq('Drop height h', 'crest − basin floor', '', h, 'm');
    r.eq('Drop number D', 'q² / (g h³)', f(q, 3) + '² / (9.81 × ' + f(h) + '³)', g.D, '', 5);
    r.eq('Ld', '4.30 h D^0.27', '', g.Ld, 'm');
    r.eq('Pool depth yp', '1.00 h D^0.22', '', g.yp, 'm');
    r.eq('y1', '0.54 h D^0.425', '', g.y1, 'm');
    r.eq('y2', '1.66 h D^0.27', '', g.y2, 'm');
    var LB = g.Ld + 2.55 * yc, xb = g.Ld + 0.8 * yc, hb = 0.8 * yc, wb = 0.4 * yc, hs = 0.4 * yc;
    r.eq('Basin length L_B', 'Ld + 2.55 yc', '', LB, 'm');
    r.eq('Floor blocks: u/s face at', 'Ld + 0.8 yc', '', xb, 'm');
    r.step('Floor blocks: height 0.8yc = ' + f(hb) + ' m, width and spacing 0.4yc = ' + f(wb) + ' m');
    r.eq('End sill height', '0.4 yc', '', hs, 'm');
    var TW = D.dsFSL - floor, wall = TW + 0.85 * yc;
    r.eq('Tail-water depth TW', 'D/s FSL − floor', '', TW, 'm');
    r.eq('Side wall height above floor', 'TW + 0.85 yc (verify)', '', wall, 'm');

    r.result('Crest level', crest, 'm');
    r.result('Crest / basin width L', L, 'm', 2);
    r.result('Critical depth yc', yc, 'm');
    r.result('Drop number D', g.D, '', 5);
    r.result('Basin floor level', floor, 'm');
    r.result('Basin length L_B', LB, 'm', 2);
    r.result('Floor blocks (h × w)', f(hb, 2) + ' × ' + f(wb, 2), 'm');
    r.result('End sill height', hs, 'm', 2);
    r.result('Side wall height', wall, 'm', 2);
    r.check('Tail-water ≥ 2.15 yc (USBR)', TW >= 2.15 * yc - 1e-9, f(TW) + ' m', '≥ ' + f(2.15 * yc) + ' m');
    r.check('Tail-water ≥ y2 (Rand)', TW >= g.y2 - 1e-9, f(TW) + ' m', '≥ ' + f(g.y2) + ' m');
    r.check('Drop number in fitted range', g.D >= 1e-4 && g.D <= 1, f(g.D, 5), '0.0001 – 1 (verify)');
    r.check('U/s FSL maintained', Math.abs(usWL - D.usFSL) <= 0.05, f(usWL) + ' m', f(D.usFSL) + ' ± 0.05 m');
    r.check('Drop height for straight drop', h <= 4.5, f(h, 2) + ' m', '≤ 4.5 m (verify)');
    r.table('Straight drop dimensions', ['Item', 'Value (m)'], [
      ['Crest level', B.round(crest, 3)], ['Basin floor level', B.round(floor, 3)], ['Drop h', B.round(h, 3)], ['yc', B.round(yc, 3)],
      ['Ld', B.round(g.Ld, 3)], ['yp', B.round(g.yp, 3)], ['y1', B.round(g.y1, 3)], ['y2', B.round(g.y2, 3)], ['L_B', B.round(LB, 3)],
      ['Floor block position', B.round(xb, 3)], ['Floor block height', B.round(hb, 3)], ['End sill height', B.round(hs, 3)],
      ['Tail-water depth', B.round(TW, 3)], ['Side wall height', B.round(wall, 3)]], 'drop');
    Object.assign(D, { kind: 'drop', crest: crest, L: L, yc: yc, floor: floor, h: h, rand: g, LB: LB, xb: xb, hb: hb, wb: wb, hs: hs, t: v.t, ha: ha, usWL: usWL });
    return r;
  }

  /* ---------- drawings ---------- */
  function drawSarda(v, D) {
    var d = new Drawing({ title: 'Sarda fall — longitudinal section' });
    var t = D.t, us = v.usBed, ds = v.dsBed, cf = D.cf, cr = D.crest;
    var xU = D.xc1 * (us - ds) / Math.max(D.d, 1e-6);       // u/s face at u/s bed level
    var xC2 = D.xc1 + D.Bw, xE = D.xE, xF = xE + D.Lc, xG = xF + D.rise, xEnd = xE + D.Ld, xL = -D.Lu;
    var bot = Math.min(us - D.d1, ds - D.d2, cf - t) - 1.2;
    // soil
    d.hatch([[xL - 3, us], [xL, us], [xL, us - t], [0, us - t], [0, cf - t], [xF, cf - t], [xG, ds - t], [xEnd, ds - t], [xEnd, ds], [xEnd + 3, ds],
      [xEnd + 3, bot], [xL - 3, bot]], 'soil', { outline: false });
    d.line(xL - 3, us, xL, us, 'SOIL'); d.line(xEnd, ds, xEnd + 3, ds, 'SOIL');
    // water
    d.hatch([[xL - 3, us], [xU, us], [D.xc1, cr], [xC2, cr], [xC2, cr + 0.6 * D.H], [D.xc1, D.usFSL - 0.15 * D.H], [xL - 3, D.usFSL]], 'water');
    var topL = Math.min(D.dsFSL, cr), xW = xC2 + D.sds * (cr - topL);
    var dw = [[xE, cf], [xF, cf], [xG, ds], [xEnd + 3, ds], [xEnd + 3, D.dsFSL]];
    if (D.dsFSL > cr) dw.push([xC2, D.dsFSL], [xC2, cr]); else dw.push([xW, D.dsFSL]);
    d.hatch(dw, 'water');
    // nappe
    var n0 = [xC2, cr + 0.6 * D.H], n1 = [xE + 0.4 * D.Lc, D.dsFSL], pts = [];
    for (var k = 0; k <= 8; k++) { var s = k / 8; pts.push([n0[0] + (n1[0] - n0[0]) * s, n0[1] - (n0[1] - n1[1]) * s * s]); }
    d.pline(pts, 'WATER', { w: 0.35 });
    // structure
    d.hatch([[xL, us], [xU, us], [D.xc1, cr], [xC2, cr], [xE, cf], [xF, cf], [xG, ds], [xEnd, ds], [xEnd, ds - t], [xG, ds - t], [xF, cf - t],
      [0, cf - t], [0, us - t], [xL, us - t]], 'concrete');
    d.hatch([[xL, us - D.d1], [xL + 0.4, us - D.d1], [xL + 0.4, us - t], [xL, us - t]], 'concrete');
    d.hatch([[xEnd - 0.4, ds - D.d2], [xEnd, ds - D.d2], [xEnd, ds - t], [xEnd - 0.4, ds - t]], 'concrete');
    // levels
    d.level(xL - 2.6, D.usFSL, 'U/s FSL ' + f(D.usFSL), { side: 'l' });
    d.level(xL - 2.6, us, 'U/s bed ' + f(us), { side: 'l' });
    d.level((D.xc1 + xC2) / 2, cr, 'Crest ' + f(cr), { side: 'l', len: 26 });
    d.level(xEnd + 2.4, D.dsFSL, 'D/s FSL ' + f(D.dsFSL));
    d.level(xEnd + 2.4, ds, 'D/s bed ' + f(ds));
    d.level(xE + 0.3 * D.Lc, cf, 'Cistern ' + f(cf));
    // dimensions
    var yd = bot + 0.3;
    d.dimH(xL, 0, yd, 6);
    d.dimH(0, xE, yd, 6);
    d.dimH(xE, xF, yd, 6, { text: 'Lc ' + f(xF - xE, 2) });
    d.dimH(xE, xEnd, yd, 14, { text: 'Ld ' + f(D.Ld, 2) });
    d.dimH(xL, xEnd, yd, 22, { text: 'Total floor ' + f(xEnd - xL, 2) });
    d.dimH(D.xc1, xC2, cr + 0.9 * D.H, -6, { text: 'B ' + f(D.Bw, 2) });
    d.dimV(xL, us - D.d1, us, 8, { text: 'd1 ' + f(D.d1, 2) });
    d.dimV(xEnd, ds - D.d2, ds, -8, { text: 'd2 ' + f(D.d2, 2) });
    d.dimV(xG + 0.3, cf, ds, -6, { text: 'x ' + f(D.x, 2) });
    d.flow(xL - 1, D.usFSL + 0.6, 0);
    d.text((xL + xEnd) / 2, bot - 0.2, 'SARDA FALL (' + (D.shape === 'trap' ? 'TRAPEZOIDAL' : 'RECTANGULAR') + ' CREST), Q = ' + f(v.Q, 2) + ' m³/s, L = ' + f(D.L, 2) + ' m',
      { ha: 'c', va: 't', h: 3, dy: -32 });
    return d;
  }

  function drawDrop(v, D) {
    var d = new Drawing({ title: 'Straight drop — longitudinal section' });
    var t = D.t, us = v.usBed, ds = v.dsBed, fl = D.floor, cr = D.crest, g = D.rand, yc = D.yc;
    var Lu = Math.max(3, 2 * v.Du), xL = -Lu, tw = Math.max(t, 0.4), LB = D.LB;
    var rise = ds > fl ? 2 * (ds - fl) : 0, xEnd = LB + rise + 2;
    var bot = Math.min(fl - t, ds - t) - 1.5;
    d.hatch([[xL - 3, us], [xL, us], [xL, us - t], [-tw, us - t], [-tw, fl - t], [LB, fl - t], [LB + rise, ds - t], [xEnd, ds - t], [xEnd, ds],
      [xEnd + 3, ds], [xEnd + 3, bot], [xL - 3, bot]], 'soil', { outline: false });
    d.line(xL - 3, us, xL, us, 'SOIL'); d.line(xEnd, ds, xEnd + 3, ds, 'SOIL');
    // water: approach, jet, pool, tail-water
    var brink = cr + 0.715 * yc;
    d.hatch([[xL - 3, us], [-0.6, us], [-0.6, cr], [0, cr], [0, brink], [-1.5, D.usWL - 0.1 * (D.usWL - brink)], [xL - 3, D.usWL]], 'water');
    var up = [], lo = [];
    for (var k = 0; k <= 10; k++) {
      var s = k / 10;
      up.push([g.Ld * s, brink - (brink - (fl + g.y1)) * s * s]);
      lo.push([g.Ld * s * 0.92, cr - (cr - fl) * s * s]);
    }
    d.hatch(up.concat(lo.slice().reverse()), 'water', { outline: false });
    d.pline(up, 'WATER', { w: 0.3 }); d.pline(lo, 'WATER', { w: 0.3 });
    var xp = 0.92 * g.Ld * Math.sqrt(Math.max(0, (cr - fl - g.yp) / (cr - fl)));
    d.hatch([[0, fl], [0, fl + g.yp], [xp, fl + g.yp], [g.Ld * 0.92, fl]], 'water');
    d.hatch([[g.Ld, fl], [LB, fl], [LB + rise, ds], [xEnd + 3, ds], [xEnd + 3, D.dsFSL], [g.Ld + 2 * yc, D.dsFSL], [g.Ld, fl + g.y1]], 'water');
    // structure
    var top = [[xL, us]];
    if (cr > us + 1e-6) top.push([-0.6, us], [-0.6, cr]);
    top.push([0, cr], [0, fl], [LB, fl], [LB + rise, ds], [xEnd, ds]);
    var bottom = [[xEnd, ds - t], [LB + rise, ds - t], [LB, fl - t], [-tw, fl - t], [-tw, us - t], [xL, us - t]];
    d.hatch(top.concat(bottom), 'concrete');
    d.hatch([[D.xb, fl], [D.xb + D.wb, fl], [D.xb + D.wb, fl + D.hb], [D.xb, fl + D.hb]], 'concrete');
    var ws = Math.max(0.3, 0.6 * yc);
    d.hatch([[LB - ws, fl], [LB, fl], [LB, fl + D.hs], [LB - ws * 0.4, fl + D.hs]], 'concrete');
    // levels and dims
    d.level(xL - 2.6, D.usFSL, 'U/s FSL ' + f(D.usFSL), { side: 'l' });
    d.level(xL - 2.6, us, 'U/s bed ' + f(us), { side: 'l' });
    d.level(-0.3, cr, 'Crest ' + f(cr), { side: 'l', len: 24 });
    d.level(xEnd + 2.4, D.dsFSL, 'D/s FSL ' + f(D.dsFSL));
    d.level(xEnd + 2.4, ds, 'D/s bed ' + f(ds));
    d.level(g.Ld * 0.45, fl, 'Basin floor ' + f(fl), { len: 24 });
    var yd = bot + 0.3;
    d.dimH(0, g.Ld, yd, 6, { text: 'Ld ' + f(g.Ld, 2) });
    d.dimH(0, D.xb, yd, 14, { text: 'Ld+0.8yc ' + f(D.xb, 2) });
    d.dimH(0, LB, yd, 22, { text: 'L_B ' + f(LB, 2) });
    d.dimV(-tw, fl, cr, 10, { text: 'h ' + f(D.h, 2) });
    d.dimV(LB + rise + 1, fl, D.dsFSL, -10, { text: 'TW ' + f(D.dsFSL - fl, 2) });
    d.text(D.xb + D.wb / 2, fl - t, 'floor blocks', { ha: 'c', va: 't', dy: -1, h: 2 });
    d.text(LB, fl - t, 'end sill', { ha: 'l', va: 't', dy: -1, h: 2 });
    d.flow(xL - 1, D.usFSL + 0.5, 0);
    d.text(LB / 2, bot, 'STRAIGHT DROP WITH USBR BASIN, Q = ' + f(v.Q, 2) + ' m³/s, width ' + f(D.L, 2) + ' m', { ha: 'c', va: 't', h: 3, dy: -32 });
    return d;
  }

  function drawings(v, rep) {
    var D = rep.data;
    if (D.kind === 'drop') return [{ key: 'drop', title: 'Straight drop — L-section / सीधा प्रपात अनुदैर्ध्य काट', d: drawDrop(v, D) }];
    return [{ key: 'sarda', title: 'Sarda fall — L-section / शारदा प्रपात अनुदैर्ध्य काट', d: drawSarda(v, D) }];
  }

  return {
    fns: { sardaCoef: sardaCoef, sardaCrestWidth: sardaCrestWidth, sardaQ: sardaQ, sardaHead: sardaHead, cistern: cistern, rand: rand },
    pages: [
      { id: 'canal-fall', group: 'C', order: 4, hi: 'नहर प्रपात', en: 'Canal falls (Sarda type, straight drop)', refs: 'Sarda formulae (Garg); USBR straight drop (Rand)',
        intro: 'Sarda type fall with cistern and Bligh floor, or a straight drop with a USBR stilling basin.',
        inputs: inputs, design: design, drawings: drawings }
    ]
  };
});
