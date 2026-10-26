/* F. RCC basics / आरसीसी मूल (IS 456:2000, limit state method)
 * - Singly and doubly reinforced rectangular beams
 * - One-way and two-way slabs (Annex D coefficients)
 * - Short axially loaded columns
 * - Isolated footings
 * Units inside the calculations: N and mm (moments N·mm), converted for display. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../core/index.js'));
  else root.DS.register(factory(root.DS));
})(typeof self !== 'undefined' ? self : this, function (DS) {
  'use strict';
  var B = DS.base, Drawing = DS.Drawing, f = B.f;

  /* ---------- IS 456 helpers ---------- */
  var FCK_OPTIONS = [['15', 'M15'], ['20', 'M20'], ['25', 'M25'], ['30', 'M30'], ['35', 'M35'], ['40', 'M40']];
  var FY_OPTIONS = [['250', 'Fe250 (mild steel)'], ['415', 'Fe415'], ['500', 'Fe500']];

  // xu,max / d (cl 38.1, Note): 0.53, 0.48, 0.46 for Fe250, Fe415, Fe500
  function xuMaxRatio(fy) {
    if (fy === 250) return 0.53;
    if (fy === 415) return 0.48;
    if (fy === 500) return 0.46;
    return 700 / (1100 + 0.87 * fy);
  }
  // Limiting moment of resistance (N·mm): 0.36 fck b xu,max (d − 0.42 xu,max)  (Annex G-1.1)
  function muLim(fck, fy, b, d) {
    var xm = xuMaxRatio(fy) * d;
    return 0.36 * fck * b * xm * (d - 0.42 * xm);
  }
  // Tension steel for a singly reinforced section (mm²), Mu in N·mm (Annex G-1.1 b)
  function astSingly(Mu, fck, fy, b, d) {
    var t = 1 - 4.6 * Mu / (fck * b * d * d);
    if (t < 0) return NaN;
    return 0.5 * fck / fy * (1 - Math.sqrt(t)) * b * d;
  }
  // Depth of neutral axis for a given Ast (mm)
  function xuOf(Ast, fck, fy, b) { return 0.87 * fy * Ast / (0.36 * fck * b); }

  // Stress in compression steel fsc (N/mm²) by d'/d, SP 16 Table F
  var FSC_DD = [0.05, 0.10, 0.15, 0.20];
  var FSC = { 250: [217, 217, 217, 217], 415: [355, 353, 342, 329], 500: [424, 412, 395, 370] };
  function fsc(fy, ddRatio) { return B.interp(FSC_DD, FSC[fy] || FSC[415], ddRatio); }

  // Design shear strength of concrete τc (N/mm²), IS 456 Table 19
  var T19_PT = [0.15, 0.25, 0.50, 0.75, 1.00, 1.25, 1.50, 1.75, 2.00, 2.25, 2.50, 2.75, 3.00];
  var T19_FCK = [15, 20, 25, 30, 35, 40];
  var T19 = [
    [0.28, 0.28, 0.29, 0.29, 0.29, 0.30],
    [0.35, 0.36, 0.36, 0.37, 0.37, 0.38],
    [0.46, 0.48, 0.49, 0.50, 0.50, 0.51],
    [0.54, 0.56, 0.57, 0.59, 0.59, 0.60],
    [0.60, 0.62, 0.64, 0.66, 0.67, 0.68],
    [0.64, 0.67, 0.70, 0.71, 0.73, 0.74],
    [0.68, 0.72, 0.74, 0.76, 0.78, 0.79],
    [0.71, 0.75, 0.78, 0.80, 0.82, 0.84],
    [0.71, 0.79, 0.82, 0.84, 0.86, 0.88],
    [0.71, 0.81, 0.85, 0.88, 0.90, 0.92],
    [0.71, 0.82, 0.88, 0.91, 0.93, 0.95],
    [0.71, 0.82, 0.90, 0.94, 0.96, 0.98],
    [0.71, 0.82, 0.92, 0.96, 0.99, 1.01]
  ];
  function tauC(pt, fck) {
    var col = T19_FCK.map(function (_, j) { return B.interp(T19_PT, T19.map(function (r) { return r[j]; }), pt); });
    return B.interp(T19_FCK, col, fck);
  }
  // Maximum shear stress τc,max (N/mm²), IS 456 Table 20
  function tauCmax(fck) { return B.interp(T19_FCK, [2.5, 2.8, 3.1, 3.5, 3.7, 4.0], fck); }
  // Factor k for solid slabs, cl 40.2.1.1
  function slabK(Dmm) { return B.interp([150, 175, 200, 225, 250, 275, 300], [1.30, 1.25, 1.20, 1.15, 1.10, 1.05, 1.00], Dmm); }
  // Design bond stress τbd for plain bars (cl 26.2.1.1); ×1.6 for deformed bars
  function tauBd(fck, fy) { var t = B.interp(T19_FCK, [1.0, 1.2, 1.4, 1.5, 1.7, 1.9], fck); return fy === 250 ? t : t * 1.6; }
  // Development length Ld = φ σs / (4 τbd), σs = 0.87 fy
  function devLength(phi, fck, fy) { return phi * 0.87 * fy / (4 * tauBd(fck, fy)); }

  // Modification factor for tension steel (approximation of IS 456 Fig. 4), fs in N/mm², pt in %
  function mfTension(fs, pt) {
    pt = Math.max(pt, 0.05);
    var den = 0.225 + 0.00322 * fs - 0.625 * Math.log10(1 / pt);
    if (den <= 0.5) return 2.0;                // very low steel or stress: chart caps at 2
    return Math.min(2.0, 1 / den);
  }
  // Modification factor for compression steel (approximation of IS 456 Fig. 5), pc in %
  function mfCompression(pc) { return Math.min(1.5, 1 + pc / (3 + pc)); }

  function barArea(phi) { return Math.PI * phi * phi / 4; }
  function floor5(x) { return Math.floor(x / 5 + 1e-9) * 5; }
  function minSteelFrac(fy) { return fy === 250 ? 0.0015 : 0.0012; }

  // Adds the flexure steps for a rectangular section; returns {Ast, MuLim, ok}
  function flexure(r, label, MuKNm, b, d, fck, fy) {
    var Mu = MuKNm * 1e6, Ml = muLim(fck, fy, b, d);
    r.eq(label + ': Mu,lim', '0.36 fck b xu,max (d − 0.42 xu,max)', '0.36 × ' + fck + ' × ' + f(b, 0) + ' × ' + f(xuMaxRatio(fy) * d, 1) + ' × (' + f(d, 1) + ' − 0.42 × ' + f(xuMaxRatio(fy) * d, 1) + ') / 10⁶', Ml / 1e6, 'kN·m', 2);
    var ok = Mu <= Ml;
    var Ast = ok ? astSingly(Mu, fck, fy, b, d) : NaN;
    if (ok) r.eq(label + ': Ast', '0.5 fck/fy [1 − √(1 − 4.6 Mu/(fck b d²))] b d', '0.5 × ' + fck + '/' + fy + ' × [1 − √(1 − 4.6 × ' + f(MuKNm, 2) + 'e6/(' + fck + ' × ' + f(b, 0) + ' × ' + f(d, 1) + '²))] × ' + f(b, 0) + ' × ' + f(d, 1), Ast, 'mm²', 0);
    else r.step(label + ': Mu = ' + f(MuKNm, 2) + ' kN·m > Mu,lim — section too shallow for singly reinforced design.');
    return { Ast: Ast, MuLim: Ml / 1e6, ok: ok };
  }

  function commonMethod(r) {
    r.ref('IS 456:2000 Plain and Reinforced Concrete — Code of Practice (limit state method).');
    r.ref('SP 16:1980 Design Aids for Reinforced Concrete to IS 456.');
    r.assume('Partial safety factors γm = 1.5 (concrete) and 1.15 (steel) are built into 0.36 fck, 0.446 fck and 0.87 fy.');
  }

  /* ================= Beam ================= */
  var beamInputs = [
    { sec: 'खंड / Section' },
    { key: 'b', hi: 'चौड़ाई', en: 'Width b', unit: 'mm', def: 300, min: 100, max: 2000 },
    { key: 'D', hi: 'कुल गहराई', en: 'Overall depth D', unit: 'mm', def: 550, min: 150, max: 3000 },
    { key: 'cover', hi: 'तनन इस्पात तक प्रभावी आवरण', en: 'Effective cover to tension steel centroid', unit: 'mm', def: 50, min: 20, max: 200 },
    { key: 'dc', hi: 'संपीडन इस्पात तक प्रभावी आवरण', en: "Effective cover to compression steel d'", unit: 'mm', def: 50, min: 20, max: 200 },
    { key: 'span', hi: 'प्रभावी विस्तार', en: 'Effective span', unit: 'm', def: 6, min: 0.5, max: 30 },
    { key: 'support', hi: 'आधार', en: 'Support condition', type: 'select', def: 'ss',
      options: [['ss', 'Simply supported'], ['cont', 'Continuous'], ['cant', 'Cantilever']] },
    { sec: 'सामग्री / Materials' },
    { key: 'fck', hi: 'कंक्रीट ग्रेड', en: 'Concrete grade', type: 'select', def: '25', options: FCK_OPTIONS },
    { key: 'fy', hi: 'इस्पात ग्रेड', en: 'Steel grade', type: 'select', def: '415', options: FY_OPTIONS },
    { sec: 'भार प्रभाव / Factored actions' },
    { key: 'Mu', hi: 'गुणित आघूर्ण', en: 'Factored moment Mu', unit: 'kN·m', def: 290, min: 0.1, max: 20000 },
    { key: 'Vu', hi: 'गुणित अपरूपण', en: 'Factored shear Vu', unit: 'kN', def: 180, min: 0, max: 20000 },
    { sec: 'छड़ें / Bars' },
    { key: 'phi', hi: 'तनन छड़ व्यास', en: 'Tension bar diameter', unit: 'mm', def: 25, min: 8, max: 40 },
    { key: 'phic', hi: 'संपीडन / हैंगर छड़ व्यास', en: 'Compression / hanger bar diameter', unit: 'mm', def: 16, min: 8, max: 40 },
    { key: 'phis', hi: 'रकाब व्यास', en: 'Stirrup diameter', unit: 'mm', def: 8, min: 6, max: 16 },
    { key: 'legs', hi: 'रकाब पैर', en: 'Stirrup legs', unit: 'nos', def: 2, min: 2, max: 6 }
  ];

  function beamDesign(v) {
    var r = new B.Report();
    var b = v.b, D = v.D, fck = Number(v.fck), fy = Number(v.fy), d = D - v.cover, dc = v.dc;
    if (d <= dc + 20) throw new Error('प्रभावी गहराई बहुत कम / Effective depth too small for the covers given');
    commonMethod(r);
    r.formula('xu,max/d = 0.53 (Fe250), 0.48 (Fe415), 0.46 (Fe500)');
    r.formula('Mu,lim = 0.36 fck b xu,max (d − 0.42 xu,max)');
    r.formula('Singly: Ast = 0.5 fck/fy [1 − √(1 − 4.6 Mu/(fck b d²))] b d');
    r.formula("Doubly: Asc = (Mu − Mu,lim) / [(fsc − 0.446 fck)(d − d')],  Ast = Ast,lim + Asc (fsc − 0.446 fck)/(0.87 fy)");
    r.formula('Shear: τv = Vu/(b d); Vus = Vu − τc b d; sv = 0.87 fy Asv d / Vus');
    r.formula('Deflection: L/d ≤ basic ratio × kt × kc');
    r.ref('IS 456 cl 38.1 and Annex G-1.1 (flexure), G-1.2 (doubly reinforced); SP 16 Table F for fsc.');
    r.ref('IS 456 cl 26.5.1.1 (min/max tension steel), 26.5.1.2 (max compression steel).');
    r.ref('IS 456 cl 40.1–40.4, Tables 19 and 20 (shear); cl 26.5.1.5 and 26.5.1.6 (stirrup spacing, minimum shear steel).');
    r.ref('IS 456 cl 23.2.1 and Figs 4–5 (span/depth); kt from a fitted approximation of Fig. 4 — verify on the chart.');
    r.assume('Rectangular section; flanges (T/L beam action) ignored.');
    r.assume('Vertical stirrups only; no bent-up bars.');
    r.assume('fsc taken from SP 16 Table F by d\'/d (interpolated).');
    r.limit('Spans up to 10 m for the basic span/depth ratios (larger spans: ratio × 10/span, applied here).');
    r.limit('Torsion, crack width and development/anchorage of bars are not checked.');

    r.h('1. Effective depth and limiting moment');
    r.step('d = D − effective cover = ' + f(D, 0) + ' − ' + f(v.cover, 0) + ' = ' + f(d, 0) + ' mm');
    var xmr = xuMaxRatio(fy);
    r.step('xu,max/d = ' + f(xmr, 3) + ' for Fe' + fy + ' → xu,max = ' + f(xmr * d, 1) + ' mm');
    var Ml = muLim(fck, fy, b, d) / 1e6;
    r.eq('Mu,lim', '0.36 fck b xu,max (d − 0.42 xu,max)', '0.36 × ' + fck + ' × ' + b + ' × ' + f(xmr * d, 1) + ' × (' + f(d, 0) + ' − 0.42 × ' + f(xmr * d, 1) + ') / 10⁶', Ml, 'kN·m', 2);
    var Mu = v.Mu, doubly = Mu > Ml, Ast, Asc = 0, fs = NaN, pt;
    r.h('2. Flexural steel');
    if (!doubly) {
      r.step('Mu = ' + f(Mu, 2) + ' kN·m ≤ Mu,lim → singly reinforced');
      Ast = r.eq('Ast,req', '0.5 fck/fy [1 − √(1 − 4.6 Mu/(fck b d²))] b d',
        '0.5 × ' + fck + '/' + fy + ' × [1 − √(1 − 4.6 × ' + f(Mu, 2) + 'e6/(' + fck + ' × ' + b + ' × ' + f(d, 0) + '²))] × ' + b + ' × ' + f(d, 0), astSingly(Mu * 1e6, fck, fy, b, d), 'mm²', 0);
    } else {
      r.step('Mu = ' + f(Mu, 2) + ' kN·m > Mu,lim → doubly reinforced');
      var Mu2 = Mu - Ml, ddr = dc / d;
      fs = fsc(fy, ddr);
      r.step("d'/d = " + f(dc, 0) + ' / ' + f(d, 0) + ' = ' + f(ddr, 3) + ' → fsc = ' + f(fs, 0) + ' N/mm² (SP 16 Table F' + (ddr > 0.2 ? ', d\'/d > 0.2: end value used — verify' : '') + ')');
      var fcc = 0.446 * fck;
      Asc = r.eq('Asc', "(Mu − Mu,lim) / [(fsc − 0.446 fck)(d − d')]", f(Mu2, 2) + 'e6 / [(' + f(fs, 0) + ' − ' + f(fcc, 2) + ') × (' + f(d, 0) + ' − ' + f(dc, 0) + ')]', Mu2 * 1e6 / ((fs - fcc) * (d - dc)), 'mm²', 0);
      var Ast1 = r.eq('Ast,lim', 'Mu,lim / [0.87 fy (d − 0.42 xu,max)]', f(Ml, 2) + 'e6 / [0.87 × ' + fy + ' × (' + f(d, 0) + ' − 0.42 × ' + f(xmr * d, 1) + ')]', Ml * 1e6 / (0.87 * fy * (d - 0.42 * xmr * d)), 'mm²', 0);
      var Ast2 = r.eq('Ast2', 'Asc (fsc − 0.446 fck) / (0.87 fy)', f(Asc, 0) + ' × (' + f(fs, 0) + ' − ' + f(fcc, 2) + ') / (0.87 × ' + fy + ')', Asc * (fs - fcc) / (0.87 * fy), 'mm²', 0);
      Ast = r.eq('Ast,req', 'Ast,lim + Ast2', f(Ast1, 0) + ' + ' + f(Ast2, 0), Ast1 + Ast2, 'mm²', 0);
    }
    var AstMin = 0.85 * b * d / fy, AstMax = 0.04 * b * D;
    r.eq('Ast,min', '0.85 b d / fy (cl 26.5.1.1)', '0.85 × ' + b + ' × ' + f(d, 0) + ' / ' + fy, AstMin, 'mm²', 0);
    var AstDesign = Math.max(Ast, AstMin);
    var nT = Math.max(2, Math.ceil(AstDesign / barArea(v.phi) - 1e-9));
    var AstProv = nT * barArea(v.phi);
    r.step('Provide ' + nT + ' bars of ' + v.phi + ' mm: Ast,prov = ' + nT + ' × ' + f(barArea(v.phi), 1) + ' = ' + f(AstProv, 0) + ' mm²');
    var nC = 2, AscProv = 2 * barArea(v.phic);
    if (doubly) {
      nC = Math.max(2, Math.ceil(Asc / barArea(v.phic) - 1e-9));
      AscProv = nC * barArea(v.phic);
      r.step('Provide ' + nC + ' bars of ' + v.phic + ' mm in compression: Asc,prov = ' + f(AscProv, 0) + ' mm²');
    } else r.step('Provide 2 hanger bars of ' + v.phic + ' mm at the top (nominal).');
    pt = 100 * AstProv / (b * d);

    // bar spacing in one layer
    var clearCover = v.cover - v.phi / 2 - v.phis;
    var clearSp = nT > 1 ? (b - 2 * clearCover - 2 * v.phis - nT * v.phi) / (nT - 1) : Infinity;
    var minSp = Math.max(v.phi, 25);

    r.h('3. Shear');
    var tv = r.eq('τv', 'Vu / (b d)', f(v.Vu, 1) + '×10³ / (' + b + ' × ' + f(d, 0) + ')', v.Vu * 1e3 / (b * d), 'N/mm²', 3);
    r.step('pt = 100 Ast,prov/(b d) = ' + f(pt, 3) + ' %');
    var tc = r.eq('τc', 'Table 19 (pt, M' + fck + ')', '', tauC(pt, fck), 'N/mm²', 3);
    var tmax = tauCmax(fck);
    r.step('τc,max = ' + f(tmax, 2) + ' N/mm² (Table 20)');
    var Asv = v.legs * barArea(v.phis), sv, svMax = Math.min(0.75 * d, 300), Vus = 0;
    r.step('Asv = ' + v.legs + ' × π × ' + v.phis + '²/4 = ' + f(Asv, 1) + ' mm²');
    if (tv > tc) {
      Vus = r.eq('Vus', 'Vu − τc b d', f(v.Vu, 1) + ' − ' + f(tc, 3) + ' × ' + b + ' × ' + f(d, 0) + ' / 10³', v.Vu - tc * b * d / 1e3, 'kN', 1);
      sv = r.eq('sv,req', '0.87 fy Asv d / Vus', '0.87 × ' + Math.min(fy, 415) + ' × ' + f(Asv, 1) + ' × ' + f(d, 0) + ' / (' + f(Vus, 1) + '×10³)', 0.87 * Math.min(fy, 415) * Asv * d / (Vus * 1e3), 'mm', 0);
    } else {
      r.step('τv ≤ τc → minimum shear reinforcement (cl 26.5.1.6)');
      sv = r.eq('sv,req', '0.87 fy Asv / (0.4 b)', '0.87 × ' + Math.min(fy, 415) + ' × ' + f(Asv, 1) + ' / (0.4 × ' + b + ')', 0.87 * Math.min(fy, 415) * Asv / (0.4 * b), 'mm', 0);
    }
    var svProv = floor5(Math.min(sv, svMax));
    r.step('Max spacing = min(0.75 d, 300) = ' + f(svMax, 0) + ' mm → provide ' + v.legs + '-legged ' + v.phis + ' mm stirrups @ ' + f(svProv, 0) + ' mm c/c');
    r.step('fy for stirrups limited to 415 N/mm² (cl 40.4).');

    r.h('4. Deflection (span/depth)');
    var basic = v.support === 'cant' ? 7 : (v.support === 'cont' ? 26 : 20);
    if (v.span > 10 && v.support !== 'cant') { basic = basic * 10 / v.span; r.step('Span > 10 m: basic ratio × 10/span'); }
    var fsServ = 0.58 * fy * AstDesign / AstProv;
    r.eq('fs', '0.58 fy Ast,req / Ast,prov', '0.58 × ' + fy + ' × ' + f(AstDesign, 0) + ' / ' + f(AstProv, 0), fsServ, 'N/mm²', 0);
    var kt = r.eq('kt', '1 / [0.225 + 0.00322 fs − 0.625 log10(1/pt)] ≤ 2', '', mfTension(fsServ, pt), '', 3);
    var pc = 100 * AscProv / (b * d);
    var kc = doubly ? r.eq('kc', '1 + pc/(3 + pc) ≤ 1.5', 'pc = ' + f(pc, 3) + ' %', mfCompression(pc), '', 3) : 1;
    var allow = basic * kt * kc, actual = v.span * 1000 / d;
    r.step('Allowable L/d = ' + f(basic, 2) + ' × ' + f(kt, 3) + ' × ' + f(kc, 3) + ' = ' + f(allow, 2) + ';  actual L/d = ' + f(v.span * 1000, 0) + ' / ' + f(d, 0) + ' = ' + f(actual, 2));

    r.result('Effective depth d', d, 'mm', 0);
    r.result('Mu,lim', Ml, 'kN·m', 2);
    r.result('Section type', doubly ? 'Doubly reinforced' : 'Singly reinforced');
    r.result('Ast required', AstDesign, 'mm²', 0);
    r.result('Tension steel', nT + ' – ' + v.phi + ' mm (' + f(AstProv, 0) + ' mm²)');
    r.result(doubly ? 'Compression steel' : 'Hanger bars', nC + ' – ' + v.phic + ' mm (' + f(AscProv, 0) + ' mm²)');
    r.result('Stirrups', v.legs + 'L – ' + v.phis + ' mm @ ' + f(svProv, 0) + ' mm c/c');
    r.result('pt provided', pt, '%', 3);

    r.check('Ast ≥ Ast,min (cl 26.5.1.1)', AstProv >= AstMin, f(AstProv, 0) + ' mm²', '≥ ' + f(AstMin, 0) + ' mm²');
    r.check('Ast ≤ 0.04 b D (cl 26.5.1.1)', AstProv <= AstMax, f(AstProv, 0) + ' mm²', '≤ ' + f(AstMax, 0) + ' mm²');
    if (doubly) r.check('Asc ≤ 0.04 b D (cl 26.5.1.2)', AscProv <= AstMax, f(AscProv, 0) + ' mm²', '≤ ' + f(AstMax, 0) + ' mm²');
    if (doubly) r.check('Doubly reinforced only up to ~1.5 Mu,lim (practical)', Mu <= 1.5 * Ml, f(Mu / Ml, 2) + ' × Mu,lim', '≤ 1.5', 'deeper section is better practice');
    r.check('τv ≤ τc,max (Table 20)', tv <= tmax, f(tv, 3) + ' N/mm²', '≤ ' + f(tmax, 2) + ' N/mm²', 'otherwise increase section');
    r.check('Stirrup spacing ≤ min(0.75d, 300)', svProv <= svMax && svProv >= 50, f(svProv, 0) + ' mm', '50 – ' + f(svMax, 0) + ' mm');
    r.check('Span/depth ratio (cl 23.2.1)', actual <= allow, f(actual, 2), '≤ ' + f(allow, 2));
    r.check('Bars fit in one layer (clear spacing ≥ max(φ, 25))', clearSp >= minSp, f(clearSp, 0) + ' mm', '≥ ' + f(minSp, 0) + ' mm', 'if not, use two layers and increase effective cover');

    r.table('Reinforcement schedule', ['Bars', 'Number', 'Dia (mm)', 'Area (mm²)', 'Location'], [
      ['Tension (bottom)', nT, v.phi, B.round(AstProv, 0), 'Bottom' + (v.support === 'cant' ? ' (top for cantilever)' : '')],
      [doubly ? 'Compression' : 'Hanger', nC, v.phic, B.round(AscProv, 0), 'Top'],
      ['Stirrups', v.legs + ' legs', v.phis, B.round(Asv, 1), '@ ' + svProv + ' mm c/c']], 'schedule');

    r.data = { b: b, D: D, d: d, cover: v.cover, dc: dc, nT: nT, nC: nC, phi: v.phi, phic: v.phic, phis: v.phis, sv: svProv,
      legs: v.legs, clearCover: clearCover, fits: clearSp >= minSp, cant: v.support === 'cant' };
    return r;
  }

  function beamDrawing(v, rep) {
    var s = rep.data, m = 0.001;
    var b = s.b * m, D = s.D * m, cc = Math.max(s.clearCover, 15) * m, ps = s.phis * m;
    var d = new Drawing({ title: 'Beam cross-section' });
    d.hatch([[0, 0], [b, 0], [b, D], [0, D]], 'concrete');
    // stirrup (centre line of the stirrup bar)
    var sx0 = cc + ps / 2, sy0 = cc + ps / 2, sx1 = b - cc - ps / 2, sy1 = D - cc - ps / 2;
    d.poly([[sx0, sy0], [sx1, sy0], [sx1, sy1], [sx0, sy1]], 'REBAR');
    d.pline([[sx0 + 0.06, sy1 - 0.06], [sx0, sy1]], 'REBAR');
    // tension bars (bottom; top for cantilever)
    var phi = s.phi * m, phic = s.phic * m;
    function row(n, dia, y, maxPerLayer, dir) {
      var inner0 = cc + ps + dia / 2, inner1 = b - cc - ps - dia / 2;
      var perLayer = Math.min(n, maxPerLayer), layer = 0, left = n;
      while (left > 0) {
        var k = Math.min(left, perLayer);
        for (var i = 0; i < k; i++) d.bar(k === 1 ? b / 2 : inner0 + (inner1 - inner0) * i / (k - 1), y + dir * layer * (dia + 0.025), dia);
        left -= k; layer++;
      }
    }
    var fitN = Math.max(2, Math.floor((b - 2 * cc - 2 * ps + 0.025) / (phi + Math.max(phi, 0.025))));
    var yT = s.cant ? D - cc - ps - phi / 2 : cc + ps + phi / 2, yC = s.cant ? cc + ps + phic / 2 : D - cc - ps - phic / 2;
    row(s.nT, phi, yT, s.fits ? s.nT : fitN, s.cant ? -1 : 1);
    row(s.nC, phic, yC, s.nC, s.cant ? 1 : -1);
    d.dimH(0, b, 0, 10, { text: f(s.b, 0) });
    d.dimV(0, 0, D, 10, { text: f(s.D, 0) });
    if (s.cant) d.dimV(b, D - s.d * m, D, -10, { text: 'd = ' + f(s.d, 0) }); else d.dimV(b, 0, s.d * m, -10, { text: 'd = ' + f(s.d, 0) });
    d.text(b / 2, yT, s.nT + ' – ' + s.phi + 'φ', { ha: 'c', va: s.cant ? 'b' : 't', dy: s.cant ? 6 : -6, h: 2.2, layer: 'TEXT' });
    d.text(b / 2, yC, s.nC + ' – ' + s.phic + 'φ', { ha: 'c', va: s.cant ? 't' : 'b', dy: s.cant ? -6 : 6, h: 2.2 });
    d.text(b + 0.02, D / 2, s.legs + 'L – ' + s.phis + 'φ @ ' + s.sv + ' c/c', { ha: 'l', va: 'm', dx: 14, h: 2.2 });
    d.text(b / 2, 0, 'Dimensions in mm', { ha: 'c', va: 't', dy: -20, h: 2 });
    return [{ key: 'section', title: 'Beam cross-section / बीम काट', d: d }];
  }

  /* ================= Slab ================= */
  var T26_R = [1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.75, 2.0];
  // [short negative, short positive, long negative, long positive]; null = not applicable.
  // Coefficients transcribed from IS 456 Table 26 — verify.
  var T26 = {
    1: { name: 'Interior panel', sn: [0.032, 0.037, 0.043, 0.047, 0.051, 0.053, 0.060, 0.065], sp: [0.024, 0.028, 0.032, 0.036, 0.039, 0.041, 0.045, 0.049], ln: 0.032, lp: 0.024, contLong: 2 },
    2: { name: 'One short edge discontinuous', sn: [0.037, 0.043, 0.048, 0.051, 0.055, 0.057, 0.064, 0.068], sp: [0.028, 0.032, 0.036, 0.039, 0.041, 0.044, 0.048, 0.052], ln: 0.037, lp: 0.028, contLong: 2 },
    3: { name: 'One long edge discontinuous', sn: [0.037, 0.044, 0.052, 0.057, 0.063, 0.067, 0.077, 0.085], sp: [0.028, 0.033, 0.039, 0.044, 0.047, 0.051, 0.059, 0.065], ln: 0.037, lp: 0.028, contLong: 1 },
    4: { name: 'Two adjacent edges discontinuous', sn: [0.047, 0.053, 0.060, 0.065, 0.071, 0.075, 0.084, 0.091], sp: [0.035, 0.040, 0.045, 0.049, 0.053, 0.056, 0.063, 0.069], ln: 0.047, lp: 0.035, contLong: 1 },
    5: { name: 'Two short edges discontinuous', sn: [0.045, 0.049, 0.052, 0.056, 0.059, 0.060, 0.065, 0.069], sp: [0.035, 0.037, 0.040, 0.043, 0.044, 0.045, 0.049, 0.052], ln: null, lp: 0.035, contLong: 2 },
    6: { name: 'Two long edges discontinuous', sn: null, sp: [0.035, 0.043, 0.051, 0.057, 0.063, 0.068, 0.080, 0.088], ln: 0.045, lp: 0.035, contLong: 0 },
    7: { name: 'Three edges discontinuous (one long edge continuous)', sn: [0.057, 0.064, 0.071, 0.076, 0.080, 0.084, 0.091, 0.097], sp: [0.043, 0.048, 0.053, 0.057, 0.060, 0.064, 0.069, 0.073], ln: null, lp: 0.043, contLong: 1 },
    8: { name: 'Three edges discontinuous (one short edge continuous)', sn: null, sp: [0.043, 0.051, 0.059, 0.065, 0.071, 0.076, 0.087, 0.096], ln: 0.057, lp: 0.043, contLong: 0 },
    9: { name: 'Four edges discontinuous', sn: null, sp: [0.056, 0.064, 0.072, 0.079, 0.085, 0.089, 0.100, 0.107], ln: null, lp: 0.056, contLong: 0 }
  };
  // Simply supported, corners not held down — IS 456 Table 27 (transcribed — verify)
  var T27_AX = [0.062, 0.074, 0.084, 0.093, 0.099, 0.104, 0.113, 0.118];
  var T27_AY = [0.062, 0.061, 0.059, 0.055, 0.051, 0.046, 0.037, 0.029];

  function twoWayCoeffs(edge, ratio) {
    if (edge === 'ss') return { ax: B.interp(T26_R, T27_AX, ratio), ay: B.interp(T26_R, T27_AY, ratio), axn: 0, ayn: 0, name: 'Simply supported, corners not held down (Table 27)', contLong: 0 };
    var c = T26[edge];
    return { ax: B.interp(T26_R, c.sp, ratio), axn: c.sn ? B.interp(T26_R, c.sn, ratio) : 0, ay: c.lp, ayn: c.ln || 0, name: c.name + ' (Table 26 case ' + edge + ')', contLong: c.contLong };
  }

  var slabInputs = [
    { sec: 'पैनल / Panel' },
    { key: 'lx', hi: 'लघु प्रभावी विस्तार', en: 'Short effective span lx', unit: 'm', def: 4, min: 0.5, max: 12 },
    { key: 'ly', hi: 'दीर्घ प्रभावी विस्तार', en: 'Long effective span ly', unit: 'm', def: 5, min: 0.5, max: 40 },
    { key: 'edge', hi: 'किनारे की स्थिति', en: 'Edge condition', type: 'select', def: '4', options: [['ss', 'Simply supported, corners free (Table 27)']]
      .concat([1, 2, 3, 4, 5, 6, 7, 8, 9].map(function (k) { return [String(k), 'Restrained ' + k + ': ' + T26[k].name + ' (Table 26)']; })),
      help: 'For ly/lx > 2 the slab is designed as one-way; restrained cases then use IS 456 Table 12 coefficients.' },
    { key: 'D', hi: 'स्लैब मोटाई', en: 'Overall thickness D', unit: 'mm', def: 150, min: 75, max: 600 },
    { key: 'cover', hi: 'स्पष्ट आवरण', en: 'Clear cover', unit: 'mm', def: 20, min: 15, max: 75 },
    { sec: 'भार / Loads' },
    { key: 'LL', hi: 'सजीव भार', en: 'Live load', unit: 'kN/m²', def: 3, min: 0, max: 50 },
    { key: 'FF', hi: 'फ़र्श फ़िनिश', en: 'Floor finish', unit: 'kN/m²', def: 1, min: 0, max: 20 },
    { key: 'gc', hi: 'कंक्रीट इकाई भार', en: 'Unit weight of RCC', unit: 'kN/m³', def: 25, min: 20, max: 30 },
    { sec: 'सामग्री / Materials' },
    { key: 'fck', hi: 'कंक्रीट ग्रेड', en: 'Concrete grade', type: 'select', def: '20', options: FCK_OPTIONS },
    { key: 'fy', hi: 'इस्पात ग्रेड', en: 'Steel grade', type: 'select', def: '415', options: FY_OPTIONS },
    { key: 'phi', hi: 'छड़ व्यास', en: 'Bar diameter', unit: 'mm', def: 10, min: 6, max: 20 }
  ];

  function spacing(Ast, phi, smax) { return Math.max(50, floor5(Math.min(1000 * barArea(phi) / Ast, smax))); }

  function slabDesign(v) {
    var r = new B.Report();
    var lx = Math.min(v.lx, v.ly), ly = Math.max(v.lx, v.ly), ratio = ly / lx, oneWay = ratio > 2;
    var fck = Number(v.fck), fy = Number(v.fy), D = v.D, b = 1000;
    var dx = D - v.cover - v.phi / 2, dy = dx - v.phi;
    if (dy <= 30) throw new Error('स्लैब बहुत पतला / Slab too thin for the cover and bars');
    commonMethod(r);
    r.formula('wu = 1.5 (D·γc + finish + LL)');
    if (oneWay) r.formula('One-way: M = α wu lx² (α = 1/8 simply supported; IS 456 Table 12 for continuous)');
    else r.formula('Two-way: Mx = αx wu lx², My = αy wu lx² (IS 456 Annex D)');
    r.formula('Ast = 0.5 fck/fy [1 − √(1 − 4.6 Mu/(fck b d²))] b d,  b = 1000 mm');
    r.formula('Shear: τv = Vu/(b d) ≤ k τc;  deflection: lx/d ≤ basic × kt');
    r.ref('IS 456 Annex D-1 (restrained slabs, Table 26) and D-2 (simply supported, Table 27); coefficients transcribed from IS 456 — verify.');
    r.ref('IS 456 cl 22.5 and Table 12 (one-way continuous slabs) — verify clause.');
    r.ref('IS 456 cl 26.5.2.1 (min steel 0.12 % / 0.15 %), 26.3.3 b (max spacing 3d or 300 mm main; 5d or 450 mm distribution).');
    r.ref('IS 456 cl 40.2.1.1 (k factor for slabs), cl 23.2.1 (span/depth).');
    r.assume('Uniformly distributed load over the whole panel; partial safety factor 1.5 on dead and live load.');
    r.assume('Shear Vu ≈ wu lx / 2 per metre width (conservative for two-way slabs).');
    if (!oneWay && v.edge !== 'ss') r.assume('Restrained slab: torsion steel at corners per IS 456 D-1.8 (not computed here).');
    r.limit('Annex D tables cover ly/lx ≤ 2; above 2 the slab is one-way.');
    r.limit('Table 26 coefficients assume adjacent panels with similar spans and loads (D-1.1) — verify.');

    r.h('1. Loads');
    var sw = D / 1000 * v.gc;
    r.step('Self weight = ' + f(D / 1000, 3) + ' × ' + f(v.gc, 1) + ' = ' + f(sw, 2) + ' kN/m²');
    var w = sw + v.FF + v.LL;
    r.step('Service load w = ' + f(sw, 2) + ' + ' + f(v.FF, 2) + ' + ' + f(v.LL, 2) + ' = ' + f(w, 2) + ' kN/m²');
    var wu = r.eq('wu', '1.5 w', '1.5 × ' + f(w, 2), 1.5 * w, 'kN/m²', 2);
    r.step('ly/lx = ' + f(ly, 2) + ' / ' + f(lx, 2) + ' = ' + f(ratio, 3) + (oneWay ? ' > 2 → one-way slab' : ' ≤ 2 → two-way slab'));
    r.step('dx = D − cover − φ/2 = ' + f(dx, 1) + ' mm;  dy = dx − φ = ' + f(dy, 1) + ' mm');

    var moments = []; // [label, Mu kNm/m, d, direction]
    r.h('2. Design moments (per metre width)');
    var contLong = 0, wd = 1.5 * (sw + v.FF), wl = 1.5 * v.LL;
    if (oneWay) {
      if (v.edge === 'ss' || v.edge === '9') {
        moments.push(['Short span midspan (+)', r.eq('Mx', 'wu lx²/8', f(wu, 2) + ' × ' + f(lx, 2) + '²/8', wu * lx * lx / 8, 'kN·m/m', 2), dx, 'x+']);
      } else {
        moments.push(['Short span midspan (+)', r.eq('Mx+', 'wd lx²/12 + wl lx²/10', f(wd, 2) + ' × ' + f(lx, 2) + '²/12 + ' + f(wl, 2) + ' × ' + f(lx, 2) + '²/10', wd * lx * lx / 12 + wl * lx * lx / 10, 'kN·m/m', 2), dx, 'x+']);
        moments.push(['Support (−)', r.eq('Mx−', 'wd lx²/10 + wl lx²/9', f(wd, 2) + ' × ' + f(lx, 2) + '²/10 + ' + f(wl, 2) + ' × ' + f(lx, 2) + '²/9', wd * lx * lx / 10 + wl * lx * lx / 9, 'kN·m/m', 2), dx, 'x-']);
        contLong = T26[v.edge] ? T26[v.edge].contLong : 1;
        if (!contLong) contLong = 1;
        r.step('Table 12 coefficients (end span middle and support next to end support) — verify clause.');
      }
    } else {
      var c = twoWayCoeffs(v.edge === 'ss' ? 'ss' : Number(v.edge), ratio);
      contLong = c.contLong;
      r.step(c.name + ': αx+ = ' + f(c.ax, 4) + (c.axn ? ', αx− = ' + f(c.axn, 4) : '') + ', αy+ = ' + f(c.ay, 4) + (c.ayn ? ', αy− = ' + f(c.ayn, 4) : ''));
      moments.push(['Short span midspan (+)', r.eq('Mx+', 'αx wu lx²', f(c.ax, 4) + ' × ' + f(wu, 2) + ' × ' + f(lx, 2) + '²', c.ax * wu * lx * lx, 'kN·m/m', 2), dx, 'x+']);
      if (c.axn) moments.push(['Short span support (−)', r.eq('Mx−', 'αx− wu lx²', f(c.axn, 4) + ' × ' + f(wu, 2) + ' × ' + f(lx, 2) + '²', c.axn * wu * lx * lx, 'kN·m/m', 2), dx, 'x-']);
      moments.push(['Long span midspan (+)', r.eq('My+', 'αy wu lx²', f(c.ay, 4) + ' × ' + f(wu, 2) + ' × ' + f(lx, 2) + '²', c.ay * wu * lx * lx, 'kN·m/m', 2), dy, 'y+']);
      if (c.ayn) moments.push(['Long span support (−)', r.eq('My−', 'αy− wu lx²', f(c.ayn, 4) + ' × ' + f(wu, 2) + ' × ' + f(lx, 2) + '²', c.ayn * wu * lx * lx, 'kN·m/m', 2), dx, 'y-']);
    }

    r.h('3. Reinforcement');
    var AstMin = minSteelFrac(fy) * b * D;
    r.eq('Ast,min', (fy === 250 ? '0.15' : '0.12') + ' % b D', '', AstMin, 'mm²/m', 0);
    var rows = [], allFlexOk = true, spMain = Math.min(3 * dx, 300), spDist = Math.min(5 * dy, 450);
    var res = {};
    moments.forEach(function (mm) {
      var fl = flexure(r, mm[0], mm[1], b, mm[2], fck, fy);
      if (!fl.ok) allFlexOk = false;
      var Ast = Math.max(fl.ok ? fl.Ast : NaN, AstMin);
      var smax = mm[3].charAt(0) === 'x' ? spMain : (oneWay ? spDist : spMain);
      var s = spacing(Ast, v.phi, smax), prov = 1000 * barArea(v.phi) / s;
      r.step(mm[0] + ': Ast,design = ' + f(Ast, 0) + ' mm²/m → ' + v.phi + ' mm @ ' + s + ' mm c/c (' + f(prov, 0) + ' mm²/m)');
      rows.push([mm[0], B.round(mm[1], 2), B.round(mm[2], 1), B.round(Ast, 0), v.phi + ' @ ' + s, B.round(prov, 0)]);
      res[mm[3]] = { Ast: Ast, s: s, prov: prov };
    });
    if (oneWay) {
      var ddia = v.phi < 8 ? v.phi : 8, sd = spacing(AstMin, ddia, spDist), pd = 1000 * barArea(ddia) / sd;
      r.step('Distribution steel (long direction): Ast,min = ' + f(AstMin, 0) + ' mm²/m → ' + ddia + ' mm @ ' + sd + ' mm c/c (max min(5d, 450) = ' + f(spDist, 0) + ')');
      rows.push(['Distribution (long)', '—', B.round(dy, 1), B.round(AstMin, 0), ddia + ' @ ' + sd, B.round(pd, 0)]);
      res['y+'] = { Ast: AstMin, s: sd, prov: pd, dia: ddia };
    }

    r.h('4. Shear');
    var Vu = r.eq('Vu', 'wu lx / 2', f(wu, 2) + ' × ' + f(lx, 2) + ' / 2', wu * lx / 2, 'kN/m', 2);
    var tv = r.eq('τv', 'Vu / (b d)', f(Vu, 2) + '×10³ / (1000 × ' + f(dx, 1) + ')', Vu * 1e3 / (b * dx), 'N/mm²', 3);
    var pt = 100 * res['x+'].prov / (b * dx);
    var k = slabK(D), tc = tauC(pt, fck);
    r.step('pt = ' + f(pt, 3) + ' % → τc = ' + f(tc, 3) + ' N/mm²; k = ' + f(k, 2) + ' (cl 40.2.1.1) → k τc = ' + f(k * tc, 3) + ' N/mm²');

    r.h('5. Deflection');
    var basic = (v.edge === 'ss' || v.edge === '9') ? 20 : 26;
    var fsS = 0.58 * fy * res['x+'].Ast / res['x+'].prov;
    var kt = mfTension(fsS, pt), allow = basic * kt, actual = lx * 1000 / dx;
    r.step('Basic lx/d = ' + basic + (basic === 26 ? ' (continuous)' : ' (simply supported)') + '; fs = 0.58 fy Ast,req/Ast,prov = ' + f(fsS, 0) + ' N/mm² → kt = ' + f(kt, 3));
    r.step('Allowable = ' + f(allow, 2) + ';  actual lx/d = ' + f(lx * 1000, 0) + ' / ' + f(dx, 1) + ' = ' + f(actual, 2));

    r.result('Slab type', oneWay ? 'One-way' : 'Two-way');
    r.result('Factored load wu', wu, 'kN/m²', 2);
    moments.forEach(function (mm) { r.result(mm[0] + ' Mu', mm[1], 'kN·m/m', 2); });
    r.result('Short-span bottom bars', v.phi + ' mm @ ' + res['x+'].s + ' mm c/c');
    r.result(oneWay ? 'Distribution bars' : 'Long-span bottom bars', (res['y+'].dia || v.phi) + ' mm @ ' + res['y+'].s + ' mm c/c');
    if (res['x-']) r.result('Top bars at continuous long edges', v.phi + ' mm @ ' + res['x-'].s + ' mm c/c');
    if (res['y-']) r.result('Top bars at continuous short edges', v.phi + ' mm @ ' + res['y-'].s + ' mm c/c');

    r.check('Depth adequate for flexure (Mu ≤ Mu,lim)', allFlexOk, allFlexOk ? 'yes' : 'no', 'Mu ≤ Mu,lim');
    r.check('Shear τv ≤ k τc (no shear steel in slab)', tv <= k * tc, f(tv, 3) + ' N/mm²', '≤ ' + f(k * tc, 3) + ' N/mm²');
    r.check('Span/depth ratio (cl 23.2.1)', actual <= allow, f(actual, 2), '≤ ' + f(allow, 2));
    r.check('Main bar spacing ≤ min(3d, 300)', res['x+'].s <= spMain, res['x+'].s + ' mm', '≤ ' + f(spMain, 0) + ' mm');
    r.check('Bar diameter ≤ D/8 (cl 26.5.2.2)', v.phi <= D / 8, v.phi + ' mm', '≤ ' + f(D / 8, 1) + ' mm');
    r.table('Slab reinforcement', ['Location', 'Mu (kN·m/m)', 'd (mm)', 'Ast req (mm²/m)', 'Provide (φ @ s)', 'Ast prov (mm²/m)'], rows, 'slab');
    r.data = { lx: lx, ly: ly, D: D, cover: v.cover, phi: v.phi, res: res, contLong: contLong, oneWay: oneWay };
    return r;
  }

  function slabDrawing(v, rep) {
    var s = rep.data, m = 0.001, D = s.D * m, L = s.lx, cv = s.cover * m, phi = s.phi * m;
    var d = new Drawing({ title: 'Slab section along short span' });
    var wall = 0.23, wh = 0.6;
    d.hatch([[-wall, -wh], [0, -wh], [0, 0], [-wall, 0]], 'masonry');
    d.hatch([[L, -wh], [L + wall, -wh], [L + wall, 0], [L, 0]], 'masonry');
    var ext = 0.3;
    var x0 = s.contLong >= 1 ? -wall - ext : -wall, x1 = s.contLong >= 2 ? L + wall + ext : L + wall;
    d.hatch([[x0, 0], [x1, 0], [x1, D], [x0, D]], 'concrete');
    var yb = cv + phi / 2;
    // main bottom bars with end hooks
    d.pline([[-wall + cv, yb + 0.05], [-wall + cv, yb], [L + wall - cv, yb], [L + wall - cv, yb + 0.05]], 'REBAR', { w: 0.5 });
    // distribution / long-span bars as dots above the main bars
    var dy2 = yb + phi, sp = (s.res['y+'].s || 200) * m, n = Math.floor((L + 2 * wall - 2 * cv) / sp);
    for (var i = 0; i <= n; i++) d.bar(-wall + cv + i * sp, dy2, (s.res['y+'].dia || s.phi) * m);
    // top bars at continuous edges, extending 0.3 lx into the span (detailing rule of thumb — verify)
    var yt = D - cv - phi / 2;
    if (s.res['x-']) {
      if (s.contLong >= 1) d.pline([[x0, yt], [0.3 * L, yt], [0.3 * L, yt - 0.05]], 'REBAR', { w: 0.5 });
      if (s.contLong >= 2) d.pline([[x1, yt], [L - 0.3 * L, yt], [L - 0.3 * L, yt - 0.05]], 'REBAR', { w: 0.5 });
    }
    d.dimH(0, L, -wh, 8, { text: 'lx = ' + f(s.lx, 2) + ' m' });
    d.dimV(x1, 0, D, -8, { text: f(s.D, 0) });
    d.text(L / 2, yb, s.phi + 'φ @ ' + s.res['x+'].s + ' c/c (main, bottom)', { ha: 'c', va: 't', dy: -12, h: 2.2 });
    d.text(L / 2, D, (s.res['y+'].dia || s.phi) + 'φ @ ' + s.res['y+'].s + ' c/c (' + (s.oneWay ? 'distribution' : 'long span') + ')', { ha: 'c', va: 'b', dy: 6, h: 2.2 });
    if (s.res['x-']) d.text(0.15 * L, D, s.phi + 'φ @ ' + s.res['x-'].s + ' c/c top', { ha: 'c', va: 'b', dy: 12, h: 2.2 });
    d.centre(L / 2, -wh - 0.05, L / 2, D + 0.15);
    return [{ key: 'section', title: 'Slab section / स्लैब काट', d: d }];
  }

  /* ================= Column ================= */
  var colInputs = [
    { sec: 'खंड / Section' },
    { key: 'b', hi: 'चौड़ाई', en: 'Width b', unit: 'mm', def: 400, min: 200, max: 2000 },
    { key: 'D', hi: 'गहराई', en: 'Depth D', unit: 'mm', def: 400, min: 200, max: 2000 },
    { key: 'lex', hi: 'प्रभावी लंबाई (D दिशा)', en: 'Effective length about D (lex)', unit: 'm', def: 3.2, min: 0.5, max: 30 },
    { key: 'ley', hi: 'प्रभावी लंबाई (b दिशा)', en: 'Effective length about b (ley)', unit: 'm', def: 3.2, min: 0.5, max: 30 },
    { key: 'l', hi: 'अनाधारित लंबाई', en: 'Unsupported length l', unit: 'm', def: 3.2, min: 0.5, max: 30 },
    { key: 'cover', hi: 'स्पष्ट आवरण', en: 'Clear cover', unit: 'mm', def: 40, min: 25, max: 75 },
    { sec: 'भार एवं सामग्री / Load and materials' },
    { key: 'Pu', hi: 'गुणित अक्षीय भार', en: 'Factored axial load Pu', unit: 'kN', def: 1800, min: 1, max: 100000 },
    { key: 'fck', hi: 'कंक्रीट ग्रेड', en: 'Concrete grade', type: 'select', def: '25', options: FCK_OPTIONS },
    { key: 'fy', hi: 'इस्पात ग्रेड', en: 'Steel grade', type: 'select', def: '415', options: FY_OPTIONS },
    { key: 'phi', hi: 'मुख्य छड़ व्यास', en: 'Longitudinal bar diameter', unit: 'mm', def: 16, min: 12, max: 40 },
    { key: 'phit', hi: 'टाई व्यास', en: 'Tie diameter', unit: 'mm', def: 8, min: 6, max: 16 }
  ];

  // Bar positions around the perimeter: nb bars on each b face (incl. corners), nd on each D face.
  function perimeterLayout(n, b, D) {
    var nb = 2, nd = 2, total = 4;
    while (total < n) { if ((b / (nb - 1)) >= (D / (nd - 1))) nb++; else nd++; total = 2 * nb + 2 * (nd - 2); }
    return { nb: nb, nd: nd, total: total };
  }

  function columnDesign(v) {
    var r = new B.Report();
    var b = Math.min(v.b, v.D), D = Math.max(v.b, v.D), fck = Number(v.fck), fy = Number(v.fy);
    var lexD = v.lex * 1000 / v.D, leyb = v.ley * 1000 / v.b;
    commonMethod(r);
    r.formula('Pu = 0.4 fck Ac + 0.67 fy Asc,  Ac = Ag − Asc');
    r.formula('Asc = (Pu − 0.4 fck Ag) / (0.67 fy − 0.4 fck)');
    r.formula('emin = l/500 + D/30 ≥ 20 mm; formula valid when emin ≤ 0.05 D');
    r.formula('Short column: lex/D < 12 and ley/b < 12');
    r.ref('IS 456 cl 25.1.2 (short column), cl 25.4 (minimum eccentricity), cl 39.3 (short axially loaded members).');
    r.ref('IS 456 cl 26.5.3.1 (longitudinal steel 0.8 % – 6 %, min 4 bars of 12 mm), cl 26.5.3.2 (transverse ties).');
    r.assume('Load is axial; minimum eccentricity condition of cl 39.3 is checked, not designed for.');
    r.assume('Steel above 4 % is avoided for practical placing and lapping (code maximum 6 %).');
    r.limit('Not valid for slender columns (lex/D ≥ 12) or for uniaxial/biaxial bending — use interaction charts (SP 16).');

    r.h('1. Slenderness and eccentricity');
    r.step('lex/D = ' + f(v.lex * 1000, 0) + ' / ' + f(v.D, 0) + ' = ' + f(lexD, 2) + ';  ley/b = ' + f(v.ley * 1000, 0) + ' / ' + f(v.b, 0) + ' = ' + f(leyb, 2));
    var ex = Math.max(v.l * 1000 / 500 + v.D / 30, 20), ey = Math.max(v.l * 1000 / 500 + v.b / 30, 20);
    r.step('ex,min = l/500 + D/30 = ' + f(v.l * 1000 / 500, 1) + ' + ' + f(v.D / 30, 1) + ' = ' + f(ex, 1) + ' mm (≥ 20) vs 0.05 D = ' + f(0.05 * v.D, 1) + ' mm');
    r.step('ey,min = l/500 + b/30 = ' + f(v.l * 1000 / 500, 1) + ' + ' + f(v.b / 30, 1) + ' = ' + f(ey, 1) + ' mm (≥ 20) vs 0.05 b = ' + f(0.05 * v.b, 1) + ' mm');

    r.h('2. Longitudinal steel');
    var Ag = v.b * v.D;
    r.step('Ag = ' + f(v.b, 0) + ' × ' + f(v.D, 0) + ' = ' + f(Ag, 0) + ' mm²');
    var AscReq = r.eq('Asc,req', '(Pu − 0.4 fck Ag)/(0.67 fy − 0.4 fck)', '(' + f(v.Pu, 1) + '×10³ − 0.4 × ' + fck + ' × ' + f(Ag, 0) + ') / (0.67 × ' + fy + ' − 0.4 × ' + fck + ')', (v.Pu * 1e3 - 0.4 * fck * Ag) / (0.67 * fy - 0.4 * fck), 'mm²', 0);
    var AscMin = 0.008 * Ag;
    r.step('Asc,min = 0.8 % Ag = ' + f(AscMin, 0) + ' mm²');
    var AscD = Math.max(AscReq, AscMin);
    var n = Math.max(4, Math.ceil(AscD / barArea(v.phi) - 1e-9));
    if (n % 2) n++;
    var lay = perimeterLayout(n, v.b, v.D);
    n = lay.total;
    var AscProv = n * barArea(v.phi), pPct = 100 * AscProv / Ag;
    r.step('Provide ' + n + ' bars of ' + v.phi + ' mm = ' + f(AscProv, 0) + ' mm² (' + f(pPct, 2) + ' %)');
    var Pcap = r.eq('Pu,capacity', '0.4 fck (Ag − Asc) + 0.67 fy Asc', '0.4 × ' + fck + ' × (' + f(Ag, 0) + ' − ' + f(AscProv, 0) + ') + 0.67 × ' + fy + ' × ' + f(AscProv, 0), (0.4 * fck * (Ag - AscProv) + 0.67 * fy * AscProv) / 1e3, 'kN', 1);

    r.h('3. Lateral ties (cl 26.5.3.2)');
    var tieMin = Math.max(v.phi / 4, 6);
    var pitch = Math.min(b, 16 * v.phi, 300);
    var pitchProv = floor5(pitch);
    r.step('Tie diameter ≥ max(φ/4, 6) = ' + f(tieMin, 1) + ' mm; provided ' + v.phit + ' mm');
    r.step('Pitch ≤ min(least lateral dimension ' + f(b, 0) + ', 16φ = ' + f(16 * v.phi, 0) + ', 300) = ' + f(pitch, 0) + ' mm → ' + pitchProv + ' mm c/c');
    var clearCov = v.cover;
    var sb = (v.b - 2 * clearCov - 2 * v.phit - v.phi) / (lay.nb - 1), sd = (v.D - 2 * clearCov - 2 * v.phit - v.phi) / (lay.nd - 1);
    r.step('Bar spacing c/c: along b = ' + f(sb, 0) + ' mm, along D = ' + f(sd, 0) + ' mm (max 300 mm, cl 26.5.3.1 g)');

    r.result('Short / slender', lexD < 12 && leyb < 12 ? 'Short column' : 'Slender — not covered');
    r.result('Asc required', AscD, 'mm²', 0);
    r.result('Longitudinal steel', n + ' – ' + v.phi + ' mm (' + f(pPct, 2) + ' %)');
    r.result('Axial capacity Pu', Pcap, 'kN', 1);
    r.result('Ties', v.phit + ' mm @ ' + pitchProv + ' mm c/c');

    r.check('Short column lex/D < 12 (cl 25.1.2)', lexD < 12, f(lexD, 2), '< 12');
    r.check('Short column ley/b < 12 (cl 25.1.2)', leyb < 12, f(leyb, 2), '< 12');
    r.check('emin ≤ 0.05 D (cl 39.3 condition)', ex <= 0.05 * v.D + 1e-9, f(ex, 1) + ' mm', '≤ ' + f(0.05 * v.D, 1) + ' mm', 'else design for moment Pu·emin');
    r.check('emin ≤ 0.05 b (cl 39.3 condition)', ey <= 0.05 * v.b + 1e-9, f(ey, 1) + ' mm', '≤ ' + f(0.05 * v.b, 1) + ' mm', 'else design for moment Pu·emin');
    r.check('Steel ≥ 0.8 % (cl 26.5.3.1 a)', pPct >= 0.8 - 1e-9, f(pPct, 2) + ' %', '≥ 0.8 %');
    r.check('Steel ≤ 4 % (practical; code max 6 %)', pPct <= 4, f(pPct, 2) + ' %', '≤ 4 %', 'increase section');
    r.check('Capacity ≥ Pu', Pcap >= v.Pu, f(Pcap, 0) + ' kN', '≥ ' + f(v.Pu, 0) + ' kN');
    r.check('Tie diameter ≥ max(φ/4, 6 mm)', v.phit >= tieMin, v.phit + ' mm', '≥ ' + f(tieMin, 1) + ' mm');
    r.check('Longitudinal bar spacing ≤ 300 mm', Math.max(sb, sd) <= 300, f(Math.max(sb, sd), 0) + ' mm', '≤ 300 mm');
    r.check('Bar diameter ≥ 12 mm (cl 26.5.3.1 c)', v.phi >= 12, v.phi + ' mm', '≥ 12 mm');
    r.table('Column schedule', ['Item', 'Value'], [['Section', v.b + ' × ' + v.D + ' mm'], ['Main bars', n + ' – ' + v.phi + ' mm'], ['Ties', v.phit + ' mm @ ' + pitchProv + ' mm c/c'],
      ['Clear cover', v.cover + ' mm'], ['Capacity Pu', B.round(Pcap, 1) + ' kN']], 'schedule');
    r.data = { b: v.b, D: v.D, cover: v.cover, phi: v.phi, phit: v.phit, nb: lay.nb, nd: lay.nd, n: n, pitch: pitchProv };
    return r;
  }

  function columnDrawing(v, rep) {
    var s = rep.data, m = 0.001, b = s.b * m, D = s.D * m, cv = s.cover * m, pt = s.phit * m, phi = s.phi * m;
    var d = new Drawing({ title: 'Column cross-section' });
    d.hatch([[0, 0], [b, 0], [b, D], [0, D]], 'concrete');
    var t0 = cv + pt / 2;
    d.poly([[t0, t0], [b - t0, t0], [b - t0, D - t0], [t0, D - t0]], 'REBAR');
    var x0 = cv + pt + phi / 2, x1 = b - x0, y0 = x0, y1 = D - x0, i;
    for (i = 0; i < s.nb; i++) { var x = x0 + (x1 - x0) * i / (s.nb - 1); d.bar(x, y0, phi); d.bar(x, y1, phi); }
    for (i = 1; i < s.nd - 1; i++) { var y = y0 + (y1 - y0) * i / (s.nd - 1); d.bar(x0, y, phi); d.bar(x1, y, phi); }
    if (s.nb > 2 || s.nd > 2) d.text(b / 2, 0, 'Add ties so every alternate bar is held at a tie corner (cl 26.5.3.2 b)', { ha: 'c', va: 't', dy: -20, h: 2 });
    d.dimH(0, b, 0, 10, { text: f(s.b, 0) });
    d.dimV(0, 0, D, 10, { text: f(s.D, 0) });
    d.text(b, D, s.n + ' – ' + s.phi + 'φ, ties ' + s.phit + 'φ @ ' + s.pitch + ' c/c', { ha: 'r', va: 'b', dy: 4, h: 2.2 });
    d.centre(b / 2, -0.04, b / 2, D + 0.04);
    d.centre(-0.04, D / 2, b + 0.04, D / 2);
    return [{ key: 'section', title: 'Column cross-section / स्तंभ काट', d: d }];
  }

  /* ================= Isolated footing ================= */
  var ftgInputs = [
    { sec: 'स्तंभ एवं भार / Column and load' },
    { key: 'cb', hi: 'स्तंभ चौड़ाई', en: 'Column width b', unit: 'mm', def: 400, min: 150, max: 2000 },
    { key: 'cd', hi: 'स्तंभ गहराई', en: 'Column depth D', unit: 'mm', def: 400, min: 150, max: 2000 },
    { key: 'P', hi: 'सेवा अक्षीय भार', en: 'Service axial load P', unit: 'kN', def: 1000, min: 1, max: 50000 },
    { key: 'gf', hi: 'भार गुणक', en: 'Load factor', unit: '—', def: 1.5, min: 1, max: 2 },
    { key: 'sw', hi: 'स्व-भार हेतु वृद्धि', en: 'Allowance for footing self weight and backfill', unit: '%', def: 10, min: 0, max: 50 },
    { sec: 'मिट्टी / Soil' },
    { key: 'SBC', hi: 'सुरक्षित धारण क्षमता', en: 'Safe bearing capacity', unit: 'kN/m²', def: 200, min: 20, max: 2000 },
    { key: 'Df', hi: 'नींव की गहराई', en: 'Depth of foundation below ground', unit: 'm', def: 1.5, min: 0.5, max: 10 },
    { key: 'shape', hi: 'आकार', en: 'Footing shape', type: 'select', def: 'square', options: [['square', 'Square'], ['rect', 'Rectangular (proportional to column)']] },
    { sec: 'सामग्री / Materials' },
    { key: 'fck', hi: 'कंक्रीट ग्रेड', en: 'Concrete grade', type: 'select', def: '20', options: FCK_OPTIONS },
    { key: 'fy', hi: 'इस्पात ग्रेड', en: 'Steel grade', type: 'select', def: '415', options: FY_OPTIONS },
    { key: 'cover', hi: 'स्पष्ट आवरण', en: 'Clear cover', unit: 'mm', def: 50, min: 40, max: 100 },
    { key: 'phi', hi: 'छड़ व्यास', en: 'Bar diameter', unit: 'mm', def: 12, min: 8, max: 32 },
    { key: 'Dmin', hi: 'न्यूनतम मोटाई', en: 'Minimum thickness to try', unit: 'mm', def: 300, min: 150, max: 3000 }
  ];

  function ceil05(x) { return Math.ceil(x / 0.05 - 1e-9) * 0.05; }

  // One footing check for depth Dmm; returns all quantities.
  function footingAt(p, Dmm) {
    var d = Dmm - p.cover - p.phi;           // mean of the two layers
    var dL = Dmm - p.cover - p.phi / 2, dB = dL - p.phi;
    var cb = p.cb / 1000, cd = p.cd / 1000;
    var aL = (p.L - cd) / 2, aB = (p.B - cb) / 2;
    var MuL = p.qu * p.B * aL * aL / 2, MuB = p.qu * p.L * aB * aB / 2;     // kN·m
    var MlL = muLim(p.fck, p.fy, p.B * 1000, dL) / 1e6, MlB = muLim(p.fck, p.fy, p.L * 1000, dB) / 1e6;
    var AstL = Math.max(astSingly(MuL * 1e6, p.fck, p.fy, p.B * 1000, dL), minSteelFrac(p.fy) * p.B * 1000 * Dmm);
    var AstB = Math.max(astSingly(MuB * 1e6, p.fck, p.fy, p.L * 1000, dB), minSteelFrac(p.fy) * p.L * 1000 * Dmm);
    // one-way shear at d from the column face (critical direction)
    var VL = p.qu * p.B * Math.max(aL - dL / 1000, 0), VB = p.qu * p.L * Math.max(aB - dB / 1000, 0);
    var tvL = VL * 1e3 / (p.B * 1000 * dL), tvB = VB * 1e3 / (p.L * 1000 * dB);
    var tcL = tauC(100 * AstL / (p.B * 1000 * dL), p.fck), tcB = tauC(100 * AstB / (p.L * 1000 * dB), p.fck);
    // two-way (punching) at d/2 from the column faces
    var b0 = 2 * ((p.cb + d) + (p.cd + d));
    var Vp = p.Pu - p.qu * (p.cb + d) * (p.cd + d) / 1e6;
    var tvp = Vp * 1e3 / (b0 * d);
    var bc = Math.min(p.cb, p.cd) / Math.max(p.cb, p.cd), ks = Math.min(1, 0.5 + bc), tcp = ks * 0.25 * Math.sqrt(p.fck);
    var ok = MuL <= MlL && MuB <= MlB && tvL <= tcL && tvB <= tcB && tvp <= tcp;
    return { D: Dmm, d: d, dL: dL, dB: dB, aL: aL, aB: aB, MuL: MuL, MuB: MuB, MlL: MlL, MlB: MlB, AstL: AstL, AstB: AstB, VL: VL, VB: VB,
      tvL: tvL, tvB: tvB, tcL: tcL, tcB: tcB, b0: b0, Vp: Vp, tvp: tvp, ks: ks, tcp: tcp, ok: ok };
  }

  function footingDesign(v) {
    var r = new B.Report();
    var fck = Number(v.fck), fy = Number(v.fy);
    commonMethod(r);
    r.formula('Area A = P (1 + allowance) / SBC');
    r.formula('Net factored upward pressure qu = Pu / (L B)');
    r.formula('Mu = qu B a² / 2 at the column face (a = projection)');
    r.formula('One-way shear at d from the face: τv = qu B (a − d) / (B d) ≤ τc');
    r.formula('Punching at d/2: τv = [Pu − qu (b + d)(D + d)] / (b0 d) ≤ ks 0.25 √fck, ks = 0.5 + βc ≤ 1');
    r.formula('Bearing at column base: 0.45 fck √(A1/A2), √(A1/A2) ≤ 2');
    r.ref('IS 456 cl 34.1–34.4 (footings: thickness, moments, shear, bearing); cl 31.6.3.1 (punching shear strength).');
    r.ref('IS 456 cl 34.3.1 c (central band steel in rectangular footings); cl 26.2.1 (development length).');
    r.assume('Uniform soil pressure (concentric load, rigid footing); footing of uniform thickness.');
    r.assume('Self weight of footing and backfill taken as a percentage of the column load for sizing only.');
    r.assume('Effective depths: long direction bars in the bottom layer, short direction bars above them.');
    r.limit('Concentric axial load only; moments at the column base are not considered.');
    r.limit('Settlement, sliding and uplift are not checked; SBC must come from a soil investigation.');

    r.h('1. Plan size');
    var A = r.eq('A,req', 'P (1 + allowance)/SBC', f(v.P, 1) + ' × ' + f(1 + v.sw / 100, 2) + ' / ' + f(v.SBC, 1), v.P * (1 + v.sw / 100) / v.SBC, 'm²', 3);
    var L, Bw;
    if (v.shape === 'rect') {
      Bw = ceil05(Math.sqrt(A * v.cb / v.cd)); L = ceil05(A / Bw);
      r.step('Rectangular, L/B = D/b of column: B = √(A b/D) → ' + f(Bw, 2) + ' m, L = A/B → ' + f(L, 2) + ' m (rounded up to 0.05 m)');
    } else {
      L = Bw = ceil05(Math.sqrt(A));
      r.step('Square: L = B = √A → ' + f(L, 2) + ' m (rounded up to 0.05 m)');
    }
    var Pu = r.eq('Pu', 'factor × P', f(v.gf, 2) + ' × ' + f(v.P, 1), v.gf * v.P, 'kN', 1);
    var qu = r.eq('qu', 'Pu / (L B)', f(Pu, 1) + ' / (' + f(L, 2) + ' × ' + f(Bw, 2) + ')', Pu / (L * Bw), 'kN/m²', 2);

    r.h('2. Depth (smallest thickness meeting flexure, one-way and punching shear)');
    var p = { cb: v.cb, cd: v.cd, L: L, B: Bw, qu: qu, Pu: Pu, fck: fck, fy: fy, cover: v.cover, phi: v.phi };
    var trial = Math.max(v.Dmin, 150), res = footingAt(p, trial), tries = [];
    tries.push([trial, B.round(res.tvL, 3), B.round(res.tcL, 3), B.round(res.tvp, 3), B.round(res.tcp, 3), res.ok ? 'OK' : 'NOT OK']);
    while (!res.ok && trial < 4000) { trial += 50; res = footingAt(p, trial); tries.push([trial, B.round(res.tvL, 3), B.round(res.tcL, 3), B.round(res.tvp, 3), B.round(res.tcp, 3), res.ok ? 'OK' : 'NOT OK']); }
    r.step('Trial thicknesses from ' + Math.max(v.Dmin, 150) + ' mm in 50 mm steps — see table; adopted D = ' + trial + ' mm');
    r.step('dL = D − cover − φ/2 = ' + f(res.dL, 1) + ' mm (long bars, bottom layer); dB = dL − φ = ' + f(res.dB, 1) + ' mm');

    r.h('3. Bending at the column face');
    r.eq('Projection aL', '(L − D_col)/2', '(' + f(L, 2) + ' − ' + f(v.cd / 1000, 3) + ')/2', res.aL, 'm', 3);
    r.eq('MuL', 'qu B aL²/2', f(qu, 2) + ' × ' + f(Bw, 2) + ' × ' + f(res.aL, 3) + '²/2', res.MuL, 'kN·m', 2);
    r.eq('Projection aB', '(B − b_col)/2', '(' + f(Bw, 2) + ' − ' + f(v.cb / 1000, 3) + ')/2', res.aB, 'm', 3);
    r.eq('MuB', 'qu L aB²/2', f(qu, 2) + ' × ' + f(L, 2) + ' × ' + f(res.aB, 3) + '²/2', res.MuB, 'kN·m', 2);
    r.step('Mu,lim (long) = ' + f(res.MlL, 1) + ' kN·m, (short) = ' + f(res.MlB, 1) + ' kN·m');
    r.step('Ast (long bars, width B) = ' + f(res.AstL, 0) + ' mm²; Ast (short bars, width L) = ' + f(res.AstB, 0) + ' mm² (each ≥ ' + (fy === 250 ? '0.15' : '0.12') + ' % B D)');
    var a = barArea(v.phi);
    function barsFor(Ast, width) {
      var n = Math.max(2, Math.ceil(Ast / a - 1e-9));
      var sp = (width * 1000 - 2 * v.cover - v.phi) / (n - 1);
      while (sp > 300) { n++; sp = (width * 1000 - 2 * v.cover - v.phi) / (n - 1); }
      return { n: n, s: sp };
    }
    var bl = barsFor(res.AstL, Bw), bs = barsFor(res.AstB, L);
    r.step('Long direction: ' + bl.n + ' – ' + v.phi + ' mm, spacing ≈ ' + f(bl.s, 0) + ' mm');
    var band = null;
    if (v.shape === 'rect' && L > Bw) {
      var beta = L / Bw, frac = 2 / (beta + 1), nBand = Math.ceil(bs.n * frac);
      band = { frac: frac, nBand: nBand, nOut: bs.n - nBand };
      r.step('Short direction (cl 34.3.1 c): β = L/B = ' + f(beta, 3) + '; central band of width B gets 2/(β+1) = ' + f(frac, 3) + ' of the steel → ' + nBand + ' bars in band, ' + (bs.n - nBand) + ' bars outside');
    } else r.step('Short direction: ' + bs.n + ' – ' + v.phi + ' mm, spacing ≈ ' + f(bs.s, 0) + ' mm');

    r.h('4. Shear');
    r.step('One-way (long direction): V = qu B (aL − dL) = ' + f(res.VL, 1) + ' kN → τv = ' + f(res.tvL, 3) + ' N/mm²; τc = ' + f(res.tcL, 3) + ' N/mm²');
    r.step('One-way (short direction): V = ' + f(res.VB, 1) + ' kN → τv = ' + f(res.tvB, 3) + ' N/mm²; τc = ' + f(res.tcB, 3) + ' N/mm²');
    r.step('Punching: b0 = 2[(b + d) + (D + d)] = ' + f(res.b0, 0) + ' mm; Vp = ' + f(res.Vp, 1) + ' kN; τv = ' + f(res.tvp, 3) + ' N/mm²; ks = ' + f(res.ks, 2) + ' → τc\' = ' + f(res.tcp, 3) + ' N/mm²');

    r.h('5. Bearing and development length');
    var A1 = L * Bw, A2 = v.cb * v.cd / 1e6, ratio = Math.min(2, Math.sqrt(A1 / A2));
    var bear = 0.45 * fck * ratio, sbear = Pu * 1e3 / (v.cb * v.cd);
    r.step('Bearing: √(A1/A2) = min(2, √(' + f(A1, 3) + '/' + f(A2, 4) + ')) = ' + f(ratio, 2) + ' → permissible = 0.45 × ' + fck + ' × ' + f(ratio, 2) + ' = ' + f(bear, 2) + ' N/mm²; actual = ' + f(sbear, 2) + ' N/mm²');
    var Ld = devLength(v.phi, fck, fy), avail = Math.min(res.aL, res.aB) * 1000 - v.cover;
    r.step('Ld = φ 0.87 fy / (4 τbd) = ' + f(Ld, 0) + ' mm; available beyond column face = ' + f(avail, 0) + ' mm');

    r.result('Footing size L × B', f(L, 2) + ' × ' + f(Bw, 2), 'm');
    r.result('Thickness D', trial, 'mm', 0);
    r.result('Net upward pressure qu', qu, 'kN/m²', 2);
    r.result('Long-direction bars', bl.n + ' – ' + v.phi + ' mm @ ' + f(bl.s, 0) + ' mm');
    r.result('Short-direction bars', bs.n + ' – ' + v.phi + ' mm' + (band ? ' (' + band.nBand + ' in central band)' : ' @ ' + f(bs.s, 0) + ' mm'));
    r.check('Soil pressure ≤ SBC (service, incl. allowance)', v.P * (1 + v.sw / 100) / (L * Bw) <= v.SBC + 1e-9, f(v.P * (1 + v.sw / 100) / (L * Bw), 1) + ' kN/m²', '≤ ' + f(v.SBC, 0) + ' kN/m²');
    r.check('Flexure: Mu ≤ Mu,lim', res.MuL <= res.MlL && res.MuB <= res.MlB, f(Math.max(res.MuL / res.MlL, res.MuB / res.MlB), 2) + ' × Mu,lim', '≤ 1.0');
    r.check('One-way shear τv ≤ τc', res.tvL <= res.tcL && res.tvB <= res.tcB, f(Math.max(res.tvL, res.tvB), 3) + ' N/mm²', '≤ ' + f(Math.min(res.tcL, res.tcB), 3) + ' N/mm²');
    r.check('Punching shear τv ≤ ks 0.25 √fck (cl 31.6.3.1)', res.tvp <= res.tcp, f(res.tvp, 3) + ' N/mm²', '≤ ' + f(res.tcp, 3) + ' N/mm²');
    r.check('Bearing at column base (cl 34.4)', sbear <= bear, f(sbear, 2) + ' N/mm²', '≤ ' + f(bear, 2) + ' N/mm²', 'else provide dowels / starter bars for the excess');
    r.check('Development length available', avail >= Ld, f(avail, 0) + ' mm', '≥ ' + f(Ld, 0) + ' mm', 'else bend bars up at the ends');
    r.check('Thickness at edge ≥ 150 mm (cl 34.1.2)', trial >= 150, trial + ' mm', '≥ 150 mm');
    r.table('Depth trials', ['D (mm)', 'τv one-way', 'τc', 'τv punching', 'ks 0.25√fck', 'Status'], tries, 'trials');
    r.table('Footing reinforcement', ['Direction', 'Mu (kN·m)', 'd (mm)', 'Ast req (mm²)', 'Bars'], [
      ['Long (L), bottom layer', B.round(res.MuL, 2), B.round(res.dL, 1), B.round(res.AstL, 0), bl.n + ' – ' + v.phi],
      ['Short (B), second layer', B.round(res.MuB, 2), B.round(res.dB, 1), B.round(res.AstB, 0), bs.n + ' – ' + v.phi]], 'steel');
    r.data = { L: L, B: Bw, D: trial, cb: v.cb, cd: v.cd, cover: v.cover, phi: v.phi, nL: bl.n, nB: bs.n, sL: bl.s, Df: v.Df };
    return r;
  }

  function footingDrawing(v, rep) {
    var s = rep.data, m = 0.001, L = s.L, D = s.D * m, cd = s.cd * m, cv = s.cover * m, phi = s.phi * m;
    var d = new Drawing({ title: 'Footing section' });
    var Df = Math.max(s.Df, D + 0.3), ext = 0.6, x0 = -L / 2, x1 = L / 2;
    // soil around and above the footing
    d.hatch([[x0 - ext, -0.3], [x1 + ext, -0.3], [x1 + ext, Df], [cd / 2, Df], [cd / 2, D], [x1, D], [x1, 0], [x0, 0], [x0, D], [-cd / 2, D], [-cd / 2, Df], [x0 - ext, Df]], 'soil', { outline: false });
    d.line(x0 - ext, Df, -cd / 2, Df, 'SOIL'); d.line(cd / 2, Df, x1 + ext, Df, 'SOIL');
    d.hatch([[x0, 0], [x1, 0], [x1, D], [x0, D]], 'concrete');
    var colTop = Df + 0.5;
    d.hatch([[-cd / 2, D], [cd / 2, D], [cd / 2, colTop], [-cd / 2, colTop]], 'concrete');
    d.line(-cd / 2 - 0.05, colTop, cd / 2 + 0.05, colTop, 'CONCRETE', { dash: true });
    // bottom bars along L with up-turned ends
    var yb = cv + phi / 2;
    d.pline([[x0 + cv, yb + 0.15], [x0 + cv, yb], [x1 - cv, yb], [x1 - cv, yb + 0.15]], 'REBAR', { w: 0.5 });
    // short-direction bars (dots) above
    var n = s.nB, sp = (L - 2 * cv - phi) / Math.max(n - 1, 1);
    for (var i = 0; i < n; i++) d.bar(x0 + cv + phi / 2 + i * sp, yb + phi, phi);
    // column starter bars with L-bend
    var cbx = cd / 2 - 0.04 - 0.008;
    d.pline([[-cbx - 0.25, yb + 2 * phi], [-cbx, yb + 2 * phi], [-cbx, colTop]], 'REBAR');
    d.pline([[cbx + 0.25, yb + 2 * phi], [cbx, yb + 2 * phi], [cbx, colTop]], 'REBAR');
    d.dimH(x0, x1, -0.3, 8, { text: 'L = ' + f(L, 2) + ' m' });
    d.dimV(x1, 0, D, -8, { text: f(s.D, 0) + ' mm' });
    d.dimH(-cd / 2, cd / 2, colTop, -6, { text: f(s.cd, 0) });
    d.level(x0 - ext * 0.6, Df, 'GL', { side: 'r' });
    d.level(x0 - ext * 0.3, 0, 'Founding level (GL − ' + f(Df, 2) + ')', { side: 'l' });
    d.text(0, -0.3, s.nL + ' – ' + s.phi + 'φ (long) and ' + s.nB + ' – ' + s.phi + 'φ (short), bottom mesh', { ha: 'c', va: 't', dy: -18, h: 2.2 });
    d.centre(0, -0.4, 0, colTop + 0.2);
    return [{ key: 'section', title: 'Footing section / नींव काट', d: d }];
  }

  return {
    fns: { xuMaxRatio: xuMaxRatio, muLim: muLim, astSingly: astSingly, xuOf: xuOf, fsc: fsc, tauC: tauC, tauCmax: tauCmax, slabK: slabK,
      tauBd: tauBd, devLength: devLength, mfTension: mfTension, mfCompression: mfCompression, barArea: barArea, twoWayCoeffs: twoWayCoeffs,
      perimeterLayout: perimeterLayout, footingAt: footingAt, minSteelFrac: minSteelFrac, floor5: floor5, FCK_OPTIONS: FCK_OPTIONS, FY_OPTIONS: FY_OPTIONS },
    pages: [
      { id: 'rcc-beam', group: 'F', order: 1, hi: 'आरसीसी बीम', en: 'RCC beam (singly / doubly reinforced)', refs: 'IS 456:2000 cl 38, 40, 23.2, 26.5; SP 16',
        intro: 'Flexure, shear and deflection of a rectangular beam by the limit state method, with bar and stirrup selection.',
        inputs: beamInputs, design: beamDesign, drawings: beamDrawing },
      { id: 'rcc-slab', group: 'F', order: 2, hi: 'आरसीसी स्लैब', en: 'RCC slab (one-way / two-way)', refs: 'IS 456:2000 Annex D (Tables 26, 27), cl 40.2, 26.3, 26.5.2',
        intro: 'One-way slabs and two-way slabs by IS 456 Annex D moment coefficients.',
        inputs: slabInputs, design: slabDesign, drawings: slabDrawing },
      { id: 'rcc-column', group: 'F', order: 3, hi: 'लघु स्तंभ', en: 'Short axially loaded column', refs: 'IS 456:2000 cl 25, 39.3, 26.5.3',
        intro: 'Longitudinal steel and ties for a short column carrying axial load (with the minimum-eccentricity condition).',
        inputs: colInputs, design: columnDesign, drawings: columnDrawing },
      { id: 'rcc-footing', group: 'F', order: 4, hi: 'पृथक नींव', en: 'Isolated column footing', refs: 'IS 456:2000 cl 34, 31.6',
        intro: 'Plan size from SBC, thickness from flexure, one-way and punching shear, and reinforcement for a column footing.',
        inputs: ftgInputs, design: footingDesign, drawings: footingDrawing }
    ]
  };
});
