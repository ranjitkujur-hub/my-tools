/* C5. Head and cross regulators, canal escapes / शीर्ष एवं क्रॉस रेगुलेटर, एस्केप
 * Crest (vent) sizing as a free or drowned broad-crested weir, bays and
 * piers, gate openings for part discharges, Bligh floor, and the
 * length of a surplus escape weir. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../core/index.js'));
  else root.DS.register(factory(root.DS));
})(typeof self !== 'undefined' ? self : this, function (DS) {
  'use strict';
  var B = DS.base, Drawing = DS.Drawing, f = B.f, G = B.G;
  var SQ2G = Math.sqrt(2 * G);

  /* ---------- formulas ---------- */
  // Free broad-crested weir: q = C H^1.5 (per metre)
  function freeWeirQ(C, L, H) { return C * L * Math.pow(H, 1.5); }
  // Drowned weir (Garg): Q = (2/3) Cd1 L √(2g) h^1.5 + Cd2 L hd √(2g h)
  // h = u/s TEL − d/s WL, hd = d/s WL − crest
  function drownedWeirQ(Cd1, Cd2, L, h, hd) { return 2 / 3 * Cd1 * L * SQ2G * Math.pow(h, 1.5) + Cd2 * L * hd * SQ2G * Math.sqrt(h); }
  // Sluice gate: free Q = Cd L a √(2g(h1 − Cc a)); submerged (h3 > Cc a) Q = Cd L a √(2g(h1 − h3))
  function gateQ(Cd, Cc, L, a, h1, h3) {
    var down = Math.max(Cc * a, h3);
    if (h1 - down <= 0) return 0;
    return Cd * L * a * Math.sqrt(2 * G * (h1 - down));
  }
  // Smallest opening a (0 < a ≤ h1) passing Q; NaN if the gate must be fully open.
  function gateOpening(Q, Cd, Cc, L, h1, h3) {
    var n = 400, prev = 0;
    for (var i = 1; i <= n; i++) {
      var a = h1 * i / n;
      if (gateQ(Cd, Cc, L, a, h1, h3) >= Q) {
        return B.bisect(function (x) { return gateQ(Cd, Cc, L, x, h1, h3) - Q; }, prev || 1e-9, a, 1e-9);
      }
      prev = a;
    }
    return NaN;
  }
  // Number of bays so that the effective length ≥ Lreq: Le = n b − 2 (Kp (n−1) + Ka) H
  function bays(Lreq, bay, Kp, Ka, H) {
    for (var n = 1; n <= 500; n++) {
      var Le = n * bay - 2 * (Kp * (n - 1) + Ka) * H;
      if (Le >= Lreq) return { n: n, Le: Le };
    }
    return { n: NaN, Le: NaN };
  }

  /* ---------- inputs ---------- */
  var inputs = [
    { sec: 'प्रकार / Type' },
    { key: 'type', hi: 'रेगुलेटर', en: 'Structure', type: 'select', def: 'head',
      options: [['head', 'Head regulator (IS 6531)'], ['cross', 'Cross regulator (IS 7114)']] },
    { sec: 'डिस्चार्ज एवं स्तर / Discharge and levels' },
    { key: 'Q', hi: 'डिज़ाइन डिस्चार्ज', en: 'Design discharge Q', unit: 'm³/s', def: 20, min: 0.1, max: 3000 },
    { key: 'usFSL', hi: 'ऊर्ध्व जल स्तर (FSL/तालाब)', en: 'Upstream FSL / pond level', unit: 'm', def: 150, min: -500, max: 9000 },
    { key: 'usBed', hi: 'ऊर्ध्व तल स्तर', en: 'Upstream floor (bed) level', unit: 'm', def: 147.8, min: -500, max: 9000 },
    { key: 'crest', hi: 'क्रेस्ट स्तर', en: 'Crest (sill) level', unit: 'm', def: 148.4, min: -500, max: 9000 },
    { key: 'dsFSL', hi: 'अनुप्रवाह FSL', en: 'Downstream FSL at design Q', unit: 'm', def: 149.7, min: -500, max: 9000 },
    { key: 'dsBed', hi: 'अनुप्रवाह तल स्तर', en: 'Downstream bed level', unit: 'm', def: 148.1, min: -500, max: 9000 },
    { key: 'Va', hi: 'पहुँच वेग', en: 'Approach velocity', unit: 'm/s', def: 0.6, min: 0, max: 4 },
    { sec: 'गुणांक / Coefficients' },
    { key: 'Cf', hi: 'मुक्त वियर गुणांक', en: 'Free weir coefficient C (Q = C L H^1.5)', unit: 'm^½/s', def: 1.71, min: 1, max: 2.3 },
    { key: 'Cd1', hi: 'डूबा वियर Cd1', en: 'Drowned weir Cd1 (free part)', unit: '—', def: 0.577, min: 0.3, max: 1 },
    { key: 'Cd2', hi: 'डूबा वियर Cd2', en: 'Drowned weir Cd2 (drowned part)', unit: '—', def: 0.8, min: 0.3, max: 1 },
    { key: 'Kp', hi: 'पियर संकुचन गुणांक', en: 'Pier contraction coefficient Kp', unit: '—', def: 0.01, min: 0, max: 0.1 },
    { key: 'Ka', hi: 'एबटमेंट संकुचन गुणांक', en: 'Abutment contraction coefficient Ka', unit: '—', def: 0.1, min: 0, max: 0.3 },
    { sec: 'खाड़ियाँ एवं गेट / Bays and gates' },
    { key: 'bay', hi: 'खाड़ी चौड़ाई (गेट स्पैन)', en: 'Bay clear width (gate span)', unit: 'm', def: 3, min: 0.3, max: 30 },
    { key: 'pier', hi: 'पियर मोटाई', en: 'Pier thickness', unit: 'm', def: 0.8, min: 0.2, max: 5 },
    { key: 'Wc', hi: 'क्रेस्ट चौड़ाई (प्रवाह दिशा)', en: 'Crest breadth along flow', unit: 'm', def: 2, min: 0.3, max: 20 },
    { key: 'FB', hi: 'डेक हेतु फ्री बोर्ड', en: 'Deck level above u/s FSL', unit: 'm', def: 1, min: 0.2, max: 5 },
    { key: 'Cdg', hi: 'गेट Cd', en: 'Gate discharge coefficient Cd', unit: '—', def: 0.61, min: 0.3, max: 1 },
    { key: 'Cc', hi: 'संकुचन गुणांक Cc', en: 'Contraction coefficient Cc', unit: '—', def: 0.61, min: 0.5, max: 1 },
    { sec: 'फ़र्श / Floor (Bligh)' },
    { key: 'Cb', hi: 'ब्लाई क्रीप गुणांक', en: "Bligh's creep coefficient C", unit: '—', def: 12, min: 4, max: 20 },
    { key: 'Lu', hi: 'ऊर्ध्व फ़र्श लंबाई', en: 'Upstream floor length', unit: 'm', def: 4, min: 0.5, max: 100 },
    { key: 'glacis', hi: 'ग्लेसिस ढाल', en: 'Downstream glacis slope (H per 1 V)', unit: 'H:V', def: 3, min: 1, max: 10 },
    { key: 't', hi: 'फ़र्श मोटाई (दी गई)', en: 'Floor thickness provided', unit: 'm', def: 1.1, min: 0.15, max: 5 },
    { key: 'Gs', hi: 'विशिष्ट गुरुत्व', en: 'Specific gravity of floor', unit: '—', def: 2.24, min: 1.5, max: 3 },
    { sec: 'एस्केप / Canal escape (IS 6936)' },
    { key: 'escPct', hi: 'एस्केप क्षमता', en: 'Escape capacity as % of Q', unit: '%', def: 50, min: 0, max: 100 },
    { key: 'escHead', hi: 'एस्केप वियर पर हेड', en: 'Head over escape weir', unit: 'm', def: 0.3, min: 0.05, max: 3 },
    { key: 'Cesc', hi: 'एस्केप वियर गुणांक', en: 'Escape weir coefficient', unit: 'm^½/s', def: 1.84, min: 1, max: 2.3 }
  ];

  /* ---------- design ---------- */
  function design(v) {
    if (v.crest >= v.usFSL) throw new Error('क्रेस्ट FSL से नीचे होना चाहिए / Crest must be below the upstream FSL');
    if (v.dsFSL > v.usFSL) throw new Error('अनुप्रवाह FSL ऊर्ध्व से अधिक / Downstream FSL is above upstream FSL');
    if (v.crest < v.usBed || v.crest < v.dsBed) throw new Error('क्रेस्ट तल से नीचे / Crest is below the bed — check levels');
    var r = new B.Report(), cross = v.type === 'cross';
    r.formula('Free flow: Q = C L H^(3/2),  H = u/s FSL + ha − crest');
    r.formula('Drowned weir: Q = (2/3) Cd1 L √(2g) h^(3/2) + Cd2 L hd √(2g h),  h = u/s TEL − d/s WL,  hd = d/s WL − crest');
    r.formula('Effective length: Le = n·b − 2 (N Kp + Ka) H');
    r.formula('Sluice gate: Q = Cd L a √(2g (h1 − Cc a)) free;  Q = Cd L a √(2g (h1 − h3)) submerged');
    r.formula("Bligh: L_creep ≥ C · Hs;  t = (4/3) h / (G − 1);  escape weir L = Qe / (C h^(3/2))");
    r.ref(cross ? 'IS 7114 — criteria for hydraulic design of cross regulators for canals (verify clause).' : 'IS 6531 — criteria for design of canal head regulators (verify clause).');
    r.ref('IS 6936 — guide for location, selection and hydraulic design of canal escapes (escape capacity: verify clause).');
    r.ref('S.K. Garg, Irrigation Engineering and Hydraulic Structures — drowned weir formula, regulators, Bligh’s theory.');
    r.assume('Flow is modular (free) when submergence hd/H ≤ 0.67, otherwise the drowned weir formula is used.');
    r.assume('Approach velocity head is added to the u/s head.');
    r.assume('For part discharges the u/s level is held at FSL and the d/s depth varies as Q^0.6 (wide channel, Manning).');
    r.assume('Cut-off depths u/s D/3 + 0.6 m and d/s D/2 + 0.6 m (Garg guidance, verify against scour depth).');
    r.limit('Preliminary sizing only: check exit gradient and uplift by Khosla’s theory (IS 6966) and model the gate operations.');
    r.limit('Weir and gate coefficients depend on crest shape and gate lip; use calibrated values where available.');

    var g2 = 2 * G, ha = v.Va * v.Va / g2;
    var H = v.usFSL + ha - v.crest, hd = v.dsFSL - v.crest, Dd = v.dsFSL - v.dsBed, Du = v.usFSL - v.usBed;
    r.h('1. Head over crest');
    r.eq('ha', 'Va² / 2g', f(v.Va, 2) + '² / 19.62', ha, 'm', 4);
    r.eq('H', 'u/s FSL + ha − crest', f(v.usFSL) + ' + ' + f(ha, 4) + ' − ' + f(v.crest), H, 'm');
    r.eq('hd', 'd/s FSL − crest', f(v.dsFSL) + ' − ' + f(v.crest), hd, 'm');
    var sub = hd / H, drowned = hd > 0 && sub > 0.67, q;
    r.step('Submergence hd/H = ' + f(Math.max(sub, 0)) + (drowned ? ' > 0.67 → drowned weir' : ' ≤ 0.67 → free (modular) flow'));
    r.h('2. Waterway');
    if (drowned) {
      var h = v.usFSL + ha - v.dsFSL;
      r.eq('h', 'u/s TEL − d/s FSL', '', h, 'm');
      var q1 = 2 / 3 * v.Cd1 * SQ2G * Math.pow(h, 1.5), q2 = v.Cd2 * hd * SQ2G * Math.sqrt(h);
      r.eq('q1 (free part)', '(2/3) Cd1 √(2g) h^1.5', '(2/3) × ' + v.Cd1 + ' × 4.429 × ' + f(h) + '^1.5', q1, 'm²/s');
      r.eq('q2 (drowned part)', 'Cd2 hd √(2g h)', v.Cd2 + ' × ' + f(hd) + ' × √(19.62 × ' + f(h) + ')', q2, 'm²/s');
      q = q1 + q2;
    } else {
      q = r.eq('q', 'C H^1.5', v.Cf + ' × ' + f(H) + '^1.5', v.Cf * Math.pow(H, 1.5), 'm²/s');
    }
    var Lreq = r.eq('Effective length required', 'Q / q', f(v.Q, 2) + ' / ' + f(q), v.Q / q, 'm', 2);
    var bb = bays(Lreq, v.bay, v.Kp, v.Ka, H);
    if (!isFinite(bb.n)) throw new Error('बहुत अधिक खाड़ियाँ / Too many bays — increase bay width');
    var Lclear = bb.n * v.bay, overall = Lclear + (bb.n - 1) * v.pier;
    r.step('Bays: n = ' + bb.n + ' of ' + f(v.bay, 2) + ' m;  Le = ' + bb.n + ' × ' + f(v.bay, 2) + ' − 2 × (' + v.Kp + ' × ' + (bb.n - 1) + ' + ' + v.Ka + ') × ' + f(H) + ' = ' + f(bb.Le, 2) + ' m');
    r.eq('Overall length between abutments', 'n b + (n − 1) pier', '', overall, 'm', 2);

    r.h('3. Gate openings (u/s held at FSL)');
    var h1 = v.usFSL - v.crest, rows = [], fullOK = true;
    [0.1, 0.25, 0.5, 0.75, 1].forEach(function (fr) {
      var Qf = fr * v.Q, dwl = v.dsBed + Dd * Math.pow(fr, 0.6), h3 = Math.max(dwl - v.crest, 0);
      var a = gateOpening(Qf, v.Cdg, v.Cc, Lclear, h1, h3);
      var mode = !isFinite(a) ? 'fully open' : (h3 > v.Cc * a ? 'submerged' : 'free');
      if (!isFinite(a)) fullOK = fr < 1 ? fullOK : false;
      r.step(f(fr * 100, 0) + '% Q = ' + f(Qf, 2) + ' m³/s: d/s WL = ' + f(dwl) + ', h3 = ' + f(h3) + ' → a = ' + (isFinite(a) ? f(a) + ' m (' + mode + ')' : 'gate fully open (weir flow)'));
      rows.push([f(fr * 100, 0), B.round(Qf, 3), B.round(dwl, 3), isFinite(a) ? B.round(a, 3) : 'full', mode]);
    });
    r.table('Gate opening schedule', ['% of Q', 'Q (m³/s)', 'D/s WL (m)', 'Opening a (m)', 'Flow'], rows, 'gates');

    r.h('4. Floor by Bligh');
    var Hs = r.eq('Max seepage head Hs', 'u/s FSL − d/s bed (gates closed, d/s dry)', '', v.usFSL - v.dsBed, 'm');
    var Lcreep = r.eq('Creep length required', 'C · Hs', '', v.Cb * Hs, 'm', 2);
    var d1 = Du / 3 + 0.6, d2 = Dd / 2 + 0.6;
    r.eq('U/s cut-off d1', 'D_u/3 + 0.6', '', d1, 'm');
    r.eq('D/s cut-off d2', 'D_d/2 + 0.6', '', d2, 'm');
    var Lus = 2 * Math.max(v.crest - v.usBed, 0), Lg = v.glacis * Math.max(v.crest - v.dsBed, 0);
    r.step('U/s ramp (2:1) ' + f(Lus, 2) + ' m, crest ' + f(v.Wc, 2) + ' m, d/s glacis (' + v.glacis + ':1) ' + f(Lg, 2) + ' m');
    var fixed = v.Lu + Lus + v.Wc + Lg, LdMin = 2 * Dd + 2.5;
    var Ld = Math.max(Lcreep - 2 * (d1 + d2) - fixed, LdMin);
    r.step('D/s floor Ld = max(L_creep − 2(d1 + d2) − ' + f(fixed, 2) + ', 2 D_d + 2.5 = ' + f(LdMin, 2) + ') = ' + f(Ld, 2) + ' m');
    var Lprov = 2 * (d1 + d2) + fixed + Ld;
    var lT = 2 * d1 + fixed, hT = Hs * (1 - lT / Lprov), tReq = Math.max(4 / 3 * hT / (v.Gs - 1), 0.3);
    r.eq('Uplift at glacis toe', 'Hs (1 − l/L)', f(Hs) + ' × (1 − ' + f(lT, 2) + '/' + f(Lprov, 2) + ')', hT, 'm');
    r.eq('Thickness required at toe', '(4/3) h / (G − 1), ≥ 0.3', '', tReq, 'm');

    r.h('5. Canal escape');
    var Qe = v.escPct / 100 * v.Q, Le = Qe > 0 ? Qe / (v.Cesc * Math.pow(v.escHead, 1.5)) : 0;
    r.eq('Escape discharge Qe', v.escPct + '% × Q', '', Qe, 'm³/s', 2);
    r.eq('Escape weir length', 'Qe / (C h^1.5)', f(Qe, 2) + ' / (' + v.Cesc + ' × ' + f(v.escHead) + '^1.5)', Le, 'm', 2);
    r.step('Escape crest at FSL ' + f(v.usFSL) + ' m; water level while escaping ' + f(v.usFSL + v.escHead) + ' m.');

    r.result('Flow condition at design Q', drowned ? 'Drowned weir' : 'Free weir');
    r.result('Effective waterway required', Lreq, 'm', 2);
    r.result('Bays × clear width', bb.n + ' × ' + f(v.bay, 2), 'm');
    r.result('Effective waterway provided', bb.Le, 'm', 2);
    r.result('Overall length (excl. abutments)', overall, 'm', 2);
    r.result('Gate opening at design Q', rows[rows.length - 1][3], 'm');
    r.result('D/s floor length', Ld, 'm', 2);
    r.result('Floor thickness required (toe)', tReq, 'm', 2);
    r.result('Deck level', v.usFSL + v.FB, 'm');
    r.result('Escape weir length', Le, 'm', 2);
    r.check('Effective waterway', bb.Le >= Lreq - 1e-9, f(bb.Le, 2) + ' m', '≥ ' + f(Lreq, 2) + ' m');
    if (!cross) r.check('Gates pass design Q below full opening', fullOK, rows[rows.length - 1][3] + (isFinite(rows[rows.length - 1][3]) ? ' m' : ''), '≤ h1 = ' + f(h1) + ' m');
    r.check('Creep length (Bligh)', Lprov >= Lcreep - 1e-6, f(Lprov, 2) + ' m', '≥ ' + f(Lcreep, 2) + ' m');
    r.check('Floor thickness at glacis toe', v.t >= tReq - 1e-9, f(v.t, 2) + ' m', '≥ ' + f(tReq, 2) + ' m');
    if (cross) r.check('Afflux with gates fully open', v.usFSL - v.dsFSL <= 0.15, f(v.usFSL - v.dsFSL) + ' m', '≤ 0.15 m (verify)');
    else r.check('Working head for head regulator', v.usFSL - v.dsFSL >= 0.05, f(v.usFSL - v.dsFSL) + ' m', '≥ 0.05 m');
    if (v.Va > 1.2) r.warn('Approach velocity above about 1.2 m/s: check scour upstream.');
    r.table('Key levels and lengths', ['Item', 'Value (m)'], [
      ['U/s FSL', v.usFSL], ['Crest level', v.crest], ['D/s FSL', v.dsFSL], ['U/s bed', v.usBed], ['D/s bed', v.dsBed],
      ['Deck level', B.round(v.usFSL + v.FB, 3)], ['U/s floor', v.Lu], ['U/s ramp', B.round(Lus, 2)], ['Crest breadth', v.Wc],
      ['Glacis', B.round(Lg, 2)], ['D/s floor', B.round(Ld, 2)], ['Cut-off u/s / d/s', f(d1, 2) + ' / ' + f(d2, 2)],
      ['Escape weir length', B.round(Le, 2)]], 'levels');
    r.data = { cross: cross, H: H, n: bb.n, Lclear: Lclear, overall: overall, Lus: Lus, Lg: Lg, Ld: Ld, d1: d1, d2: d2,
      aDesign: isFinite(rows[rows.length - 1][3]) ? rows[rows.length - 1][3] : h1, h1: h1 };
    return r;
  }

  /* ---------- drawings ---------- */
  function drawSection(v, D) {
    var d = new Drawing({ title: (D.cross ? 'Cross' : 'Head') + ' regulator — section' });
    var t = v.t, us = v.usBed, ds = v.dsBed, cr = v.crest, deck = v.usFSL + v.FB;
    var xA = -D.Lus - v.Lu, xB = -D.Lus, xD = v.Wc, xE = v.Wc + D.Lg, xF = xE + D.Ld;
    var bot = Math.min(us - D.d1, ds - D.d2) - 1.2;
    d.hatch([[xA - 3, us], [xA, us], [xA, us - t], [xB, us - t], [0, cr - t], [xD, cr - t], [xE, ds - t], [xF, ds - t], [xF, ds], [xF + 3, ds], [xF + 3, bot], [xA - 3, bot]], 'soil', { outline: false });
    d.line(xA - 3, us, xA, us, 'SOIL'); d.line(xF, ds, xF + 3, ds, 'SOIL');
    var gx = v.Wc * 0.35, gw = 0.15;
    d.hatch([[xA - 3, us], [xB, us], [0, cr], [xD, cr], [xE, ds], [xF + 3, ds], [xF + 3, v.dsFSL], [gx + gw, v.dsFSL], [gx, v.usFSL], [xA - 3, v.usFSL]], 'water');
    d.hatch([[xA, us], [xB, us], [0, cr], [xD, cr], [xE, ds], [xF, ds], [xF, ds - t], [xE, ds - t], [xD, cr - t], [0, cr - t], [xB, us - t], [xA, us - t]], 'concrete');
    d.hatch([[xA, us - D.d1], [xA + 0.4, us - D.d1], [xA + 0.4, us - t], [xA, us - t]], 'concrete');
    d.hatch([[xF - 0.4, ds - D.d2], [xF, ds - D.d2], [xF, ds - t], [xF - 0.4, ds - t]], 'concrete');
    // pier behind the section (dashed) and deck
    d.poly([[-0.3, cr], [-0.3, deck - 0.4], [xD + 0.3, deck - 0.4], [xD + 0.3, cr]], 'CONCRETE', { dash: true, w: 0.25 });
    d.hatch([[-0.6, deck - 0.4], [xD + 0.6, deck - 0.4], [xD + 0.6, deck], [-0.6, deck]], 'concrete');
    // gate leaf, raised to the design opening
    var a = Math.min(D.aDesign, D.h1);
    d.rect(gx, cr + a, gw, Math.min(D.h1 + 0.3, deck - 0.4 - cr - a), 'CONCRETE', { w: 0.6 });
    d.text(gx - 0.1, cr + a + 0.3, 'GATE', { ha: 'r', va: 'b', h: 2 });
    d.level(xA - 2.6, v.usFSL, 'U/s FSL ' + f(v.usFSL), { side: 'l' });
    d.level(xA - 2.6, us, 'U/s bed ' + f(us), { side: 'l' });
    d.level(xD * 0.7, cr, 'Crest ' + f(cr), { len: 22 });
    d.level(xD + 0.6, deck, 'Deck ' + f(deck));
    d.level(xF + 2.4, v.dsFSL, 'D/s FSL ' + f(v.dsFSL));
    d.level(xF + 2.4, ds, 'D/s bed ' + f(ds));
    var yd = bot + 0.3;
    d.dimH(xA, xB, yd, 6, { text: 'Lu ' + f(v.Lu, 2) });
    d.dimH(0, xD, yd, 6);
    d.dimH(xD, xE, yd, 14, { text: 'glacis ' + f(D.Lg, 2) });
    d.dimH(xE, xF, yd, 6, { text: 'Ld ' + f(D.Ld, 2) });
    d.dimH(xA, xF, yd, 22, { text: 'Total floor ' + f(xF - xA, 2) });
    d.dimV(xA, us - D.d1, us, 8, { text: 'd1 ' + f(D.d1, 2) });
    d.dimV(xF, ds - D.d2, ds, -8, { text: 'd2 ' + f(D.d2, 2) });
    d.flow(xA - 1, v.usFSL + 0.5, 0);
    return d;
  }

  function drawElevation(v, D) {
    var d = new Drawing({ title: 'Regulator — front elevation' });
    var t = v.t, cr = v.crest, deck = v.usFSL + v.FB, ab = Math.max(1, v.pier), W = D.overall, n = D.n;
    var bot = cr - t - 1.2;
    d.hatch([[-ab - 2, cr], [-ab, cr], [-ab, cr - t], [W + ab, cr - t], [W + ab, cr], [W + ab + 2, cr], [W + ab + 2, bot], [-ab - 2, bot]], 'soil', { outline: false });
    d.hatch([[-ab, cr - t], [W + ab, cr - t], [W + ab, cr], [-ab, cr]], 'concrete');
    d.hatch([[-ab, cr], [0, cr], [0, deck - 0.4], [-ab, deck - 0.4]], 'concrete');
    d.hatch([[W, cr], [W + ab, cr], [W + ab, deck - 0.4], [W, deck - 0.4]], 'concrete');
    d.hatch([[-ab, deck - 0.4], [W + ab, deck - 0.4], [W + ab, deck], [-ab, deck]], 'concrete');
    var a = Math.min(D.aDesign, D.h1), gh = Math.min(D.h1 + 0.3, deck - 0.4 - cr - a);
    for (var i = 0; i < n; i++) {
      var x0 = i * (v.bay + v.pier);
      d.hatch([[x0, cr], [x0 + v.bay, cr], [x0 + v.bay, v.usFSL], [x0, v.usFSL]], 'water', { outline: false });
      d.line(x0, v.usFSL, x0 + v.bay, v.usFSL, 'WATER');
      d.rect(x0 + 0.05, cr + a, v.bay - 0.1, gh, 'CONCRETE', { w: 0.5 });
      d.line(x0 + 0.05, cr + a, x0 + v.bay - 0.05, cr + a + gh, 'CONCRETE', { w: 0.18 });
      if (i < n - 1) d.hatch([[x0 + v.bay, cr], [x0 + v.bay + v.pier, cr], [x0 + v.bay + v.pier, deck - 0.4], [x0 + v.bay, deck - 0.4]], 'concrete');
    }
    d.centre(W / 2, bot, W / 2, deck + 0.8);
    d.level(W + ab + 0.3, deck, 'Deck ' + f(deck));
    d.level(W + ab + 0.3, v.usFSL, 'U/s FSL ' + f(v.usFSL));
    d.level(W + ab + 0.3, cr, 'Crest ' + f(cr));
    d.dimH(0, v.bay, deck, -8, { text: 'bay ' + f(v.bay, 2) });
    if (n > 1) d.dimH(v.bay, v.bay + v.pier, deck, -8, { text: f(v.pier, 2) });
    d.dimH(0, W, bot, 6, { text: n + ' bays, overall ' + f(W, 2) });
    d.text(W / 2, bot, 'FRONT ELEVATION (LOOKING DOWNSTREAM), gates at design opening ' + f(a, 2) + ' m', { ha: 'c', va: 't', h: 2.8, dy: -16 });
    return d;
  }

  function drawings(v, rep) {
    var D = rep.data;
    return [
      { key: 'section', title: 'Regulator — longitudinal section / अनुदैर्ध्य काट', d: drawSection(v, D) },
      { key: 'elevation', title: 'Regulator — front elevation / सम्मुख उन्नयन', d: drawElevation(v, D) }
    ];
  }

  return {
    fns: { freeWeirQ: freeWeirQ, drownedWeirQ: drownedWeirQ, gateQ: gateQ, gateOpening: gateOpening, bays: bays },
    pages: [
      { id: 'regulator', group: 'C', order: 5, hi: 'शीर्ष / क्रॉस रेगुलेटर एवं एस्केप', en: 'Head and cross regulators, escapes', refs: 'IS 6531, IS 7114, IS 6936',
        intro: 'Crest and vent sizing (free or drowned weir), bays and piers, gate openings for part discharges, Bligh floor and escape weir length.',
        inputs: inputs, design: design, drawings: drawings }
    ]
  };
});
