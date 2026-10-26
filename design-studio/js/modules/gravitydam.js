/* D1. Gravity dam stability / गुरुत्व बाँध स्थिरता (IS 6512)
 * User-defined section, forces per metre run (self weight, water, uplift
 * with or without drains, silt, pseudo-static earthquake with Zangar
 * hydrodynamic pressure), load combinations A–G, and checks for
 * overturning, sliding (shear friction factor) and heel/toe stresses. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../core/index.js'));
  else root.DS.register(factory(root.DS));
})(typeof self !== 'undefined' ? self : this, function (DS) {
  'use strict';
  var B = DS.base, Drawing = DS.Drawing, f = B.f;

  /* ---------- polygon helpers ---------- */
  // Signed area and centroid of a polygon [[x,y],..]
  function polyProps(p) {
    var a = 0, cx = 0, cy = 0;
    for (var i = 0; i < p.length; i++) {
      var q = p[i], r = p[(i + 1) % p.length], c = q[0] * r[1] - r[0] * q[1];
      a += c; cx += (q[0] + r[0]) * c; cy += (q[1] + r[1]) * c;
    }
    a /= 2;
    if (Math.abs(a) < 1e-12) return { A: 0, x: 0, y: 0 };
    return { A: Math.abs(a), x: cx / (6 * a), y: cy / (6 * a) };
  }
  // Clip polygon to the half-plane coord[axis] >= v (keep=1) or <= v (keep=-1) (Sutherland–Hodgman).
  function clipHalf(p, axis, v, keep) {
    var out = [];
    function inside(q) { return keep > 0 ? q[axis] >= v - 1e-12 : q[axis] <= v + 1e-12; }
    for (var i = 0; i < p.length; i++) {
      var a = p[i], b = p[(i + 1) % p.length], ia = inside(a), ib = inside(b);
      if (ia) out.push(a);
      if (ia !== ib) {
        var t = (v - a[axis]) / (b[axis] - a[axis]);
        out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
      }
    }
    return out;
  }

  /* ---------- section ---------- */
  // Origin at the heel on the foundation; y up. Returns outline and key points.
  function section(v) {
    var H = v.TL - v.FL;
    var hu = Math.min(Math.max(v.hu, 0), H), xu = v.mu * hu;
    var yb = H - v.hdv, xb = xu + v.a, xt = xb + v.md * yb;
    var pts = [[0, 0], [xt, 0], [xb, yb], [xb, H], [xu, H]];
    if (hu > 1e-9 && xu > 1e-9) pts.push([xu, hu]);
    else if (hu > 1e-9) pts.push([0, hu]);
    // remove duplicate consecutive points
    var clean = [];
    pts.forEach(function (q) { var l = clean[clean.length - 1]; if (!l || Math.abs(l[0] - q[0]) > 1e-9 || Math.abs(l[1] - q[1]) > 1e-9) clean.push(q); });
    if (Math.abs(clean[0][0] - clean[clean.length - 1][0]) < 1e-9 && Math.abs(clean[0][1] - clean[clean.length - 1][1]) < 1e-9) clean.pop();
    var g = null;
    if (v.gallery) g = { x0: v.gx, y0: v.gy, x1: v.gx + v.gwid, y1: v.gy + v.ghgt };
    return { H: H, hu: hu, xu: xu, yb: yb, xb: xb, B: xt, a: v.a, mu: v.mu, md: v.md, pts: clean, gallery: g };
  }
  // x of the u/s face at height y
  function usFaceX(s, y) { return y <= s.hu ? s.mu * y : s.xu; }
  // x of the d/s face at height y
  function dsFaceX(s, y) { return y <= s.yb ? s.B - s.md * y : s.xb; }
  function inside(s, x, y) { return x > usFaceX(s, y) + 1e-9 && x < dsFaceX(s, y) - 1e-9 && y > 1e-9 && y < s.H - 1e-9; }

  // Area/centroid of the dam less the gallery.
  function massProps(s) {
    var m = polyProps(s.pts), A = m.A, Sx = m.A * m.x, Sy = m.A * m.y;
    var g = s.gallery;
    if (g) {
      var ga = (g.x1 - g.x0) * (g.y1 - g.y0);
      A -= ga; Sx -= ga * (g.x0 + g.x1) / 2; Sy -= ga * (g.y0 + g.y1) / 2;
    }
    return { A: A, x: Sx / A, y: Sy / A };
  }

  /* ---------- forces ---------- */
  // Force: {name, Fx (+ downstream), Fy (+ up), x, y (point of action), kind}
  function F(name, Fx, Fy, x, y, kind) { return { name: name, Fx: Fx, Fy: Fy, x: x, y: y, kind: kind }; }

  // Zangar hydrodynamic: pe = Cm αh γw h at base; Pe = 0.726 pe h at 0.412 h above base
  function zangarCm(thetaDeg) { return 0.735 * (1 - thetaDeg / 90); }

  function upliftDiagram(B0, h1, h2, drains, xd) {
    h1 = Math.max(h1, 0); h2 = Math.max(h2, 0);
    if (drains && xd > 0 && xd < B0) {
      var hd = h2 + (h1 - h2) / 3;
      return [[0, 0], [0, h1], [xd, hd], [B0, h2], [B0, 0]];
    }
    return [[0, 0], [0, h1], [B0, h2], [B0, 0]];
  }

  // Combination definition -> forces
  // c = {id, water: 'none'|'FRL'|'MWL', eq: 0|1|-1 (direction), drains: bool}
  function forces(v, s, c) {
    var gw = v.gw, list = [];
    var m = massProps(s), W = v.gc * m.A;
    var eqOn = c.eq !== 0;
    var Wv = eqOn ? W * (1 - v.av) : W;
    list.push(F('Self weight W' + (eqOn ? ' (1 − αv)' : ''), 0, -Wv, m.x, m.y, 'W'));
    if (eqOn) list.push(F('Horizontal inertia αh·W', c.eq * v.ah * W, 0, m.x, m.y, 'EQ'));
    if (c.water === 'none') return { list: list, W: W, mass: m, h1: 0, h2: 0 };
    var wl = c.water === 'MWL' ? v.MWL : v.FRL;
    var tw = c.water === 'MWL' ? v.TWLmax : v.TWL;
    var h1 = Math.max(0, wl - v.FL), h2 = Math.max(0, Math.min(tw - v.FL, s.yb));
    var hs = Math.max(0, Math.min(v.SL - v.FL, h1));
    // horizontal water
    list.push(F('Water pressure u/s P = γw h1²/2', gw * h1 * h1 / 2, 0, usFaceX(s, h1 / 3), h1 / 3, 'Pw'));
    // vertical water on the u/s batter, above the silt
    var top = Math.min(h1, s.H);
    if (s.xu > 1e-9) {
      var yA = Math.min(hs, s.hu), yB = Math.min(top, s.hu);
      if (top > yA) {
        // column between x = 0 and the face, from the silt top yA up to the water surface
        var wpoly = [[s.mu * yA, yA], [s.mu * yB, yB]];
        if (top > yB) wpoly.push([s.xu, top]);
        wpoly.push([0, top], [0, yA]);
        var wp = polyProps(wpoly);
        if (wp.A > 1e-9) list.push(F('Water on u/s batter (vertical)', 0, -gw * wp.A, wp.x, wp.y, 'Pwv'));
      }
      if (hs > 0) {
        var ys = Math.min(hs, s.hu);
        var spoly = [[0, 0], [s.mu * ys, ys]];
        if (hs > ys) spoly.push([s.xu, hs]);
        spoly.push([0, hs]);
        var sp = polyProps(spoly);
        if (sp.A > 1e-9) list.push(F('Silt on u/s batter (vertical, γsv)', 0, -v.gsv * sp.A, sp.x, sp.y, 'Psv'));
      }
    }
    if (hs > 0) list.push(F('Silt pressure Ps = γsh hs²/2', v.gsh * hs * hs / 2, 0, usFaceX(s, hs / 3), hs / 3, 'Ps'));
    // tail water
    if (h2 > 0) {
      list.push(F('Tail water P = γw h2²/2', -gw * h2 * h2 / 2, 0, dsFaceX(s, h2 / 3), h2 / 3, 'Pt'));
      var tp = polyProps([[s.B - s.md * h2, h2], [s.B, h2], [s.B, 0]]);
      if (tp.A > 1e-9) list.push(F('Tail water on d/s slope (vertical)', 0, -gw * tp.A, tp.x, tp.y, 'Ptv'));
    }
    // uplift
    var ud = upliftDiagram(s.B, h1, h2, c.drains, v.xd), up = polyProps(ud);
    list.push(F('Uplift U' + (c.drains ? ' (drains working)' : ' (drains inoperative)'), 0, gw * up.A, up.x, 0, 'U'));
    // hydrodynamic (Zangar)
    var theta = 0;
    if (eqOn && h1 > 0) {
      // vertical portion at least half the depth -> treat face as vertical; else line heel -> water-surface point
      var vertPart = h1 - Math.min(s.hu, h1);
      if (vertPart < h1 / 2) theta = B.deg(Math.atan(usFaceX(s, h1) / h1));
      var Cm = zangarCm(theta), pe = Cm * v.ah * gw * h1;
      var Pe = 0.726 * pe * h1;
      list.push(F('Hydrodynamic (Zangar) Pe = 0.726 pe h', c.eq * Pe, 0, usFaceX(s, 0.412 * h1), 0.412 * h1, 'Pe'));
    }
    return { list: list, W: W, mass: m, h1: h1, h2: h2, hs: hs, uplift: ud, theta: theta };
  }

  /* ---------- stability ---------- */
  // Torque about point (px, 0): t = (x − px)·Fy − y·Fx (positive = anticlockwise).
  function analyze(list, B0, v) {
    var V = 0, Hh = 0, Mheel = 0, rT = 0, oT = 0, rH = 0, oH = 0;
    list.forEach(function (q) {
      V -= q.Fy; Hh += q.Fx;
      var th = q.x * q.Fy - q.y * q.Fx;
      Mheel += th;
      var tt = (q.x - B0) * q.Fy - q.y * q.Fx;
      if (tt >= 0) rT += tt; else oT -= tt;
      if (th <= 0) rH -= th; else oH += th;      // about heel: clockwise restores
    });
    var xbar = V > 0 ? -Mheel / V : NaN, e = xbar - B0 / 2;
    var sm = V / B0;
    var sToe = sm * (1 + 6 * e / B0), sHeel = sm * (1 - 6 * e / B0);
    var aH = Math.abs(Hh);
    var sff = aH > 1e-9 ? (v.mu_f * V + v.coh * B0) / aH : Infinity;
    var sf = aH > 1e-9 ? v.mu_f * V / aH : Infinity;
    return { V: V, H: Hh, Mheel: Mheel, xbar: xbar, e: e, sToe: sToe, sHeel: sHeel, sff: sff, sf: sf,
      fsToe: oT > 1e-9 ? rT / oT : Infinity, fsHeel: oH > 1e-9 ? rH / oH : Infinity, rToe: rT, oToe: oT };
  }

  var COMBOS = [
    { id: 'A', title: 'A — construction, reservoir empty', water: 'none', eq: 0, drains: true, cat: 'normal' },
    { id: 'B', title: 'B — normal operation (FRL)', water: 'FRL', eq: 0, drains: true, cat: 'normal' },
    { id: 'C', title: 'C — B + earthquake', water: 'FRL', eq: 1, drains: true, cat: 'eq' },
    { id: 'D', title: 'D — maximum flood (MWL)', water: 'MWL', eq: 0, drains: true, cat: 'flood' },
    { id: 'E', title: 'E — A + earthquake (towards u/s)', water: 'none', eq: -1, drains: true, cat: 'eq' },
    { id: 'F', title: 'F — C with drains inoperative', water: 'FRL', eq: 1, drains: false, cat: 'eq' },
    { id: 'G', title: 'G — D with drains inoperative', water: 'MWL', eq: 0, drains: false, cat: 'flood' }
  ];

  function fsText(x) { return isFinite(x) ? f(x, 2) : '∞'; }

  /* ---------- page ---------- */
  var inputs = [
    { sec: 'तल एवं जल स्तर / Levels' },
    { key: 'FL', hi: 'नींव स्तर', en: 'Foundation level', unit: 'm', def: 200, min: -500, max: 9000 },
    { key: 'TL', hi: 'बाँध शीर्ष स्तर', en: 'Top of dam level', unit: 'm', def: 252, min: -500, max: 9000 },
    { key: 'FRL', hi: 'पूर्ण जलाशय स्तर', en: 'Full reservoir level FRL', unit: 'm', def: 248, min: -500, max: 9000 },
    { key: 'MWL', hi: 'अधिकतम जल स्तर', en: 'Maximum water level MWL', unit: 'm', def: 250, min: -500, max: 9000 },
    { key: 'TWL', hi: 'सामान्य टेल जल स्तर', en: 'Tail water level, normal', unit: 'm', def: 203, min: -500, max: 9000 },
    { key: 'TWLmax', hi: 'बाढ़ में टेल जल स्तर', en: 'Tail water level at MWL flood', unit: 'm', def: 208, min: -500, max: 9000 },
    { key: 'SL', hi: 'गाद स्तर', en: 'Silt level', unit: 'm', def: 212, min: -500, max: 9000 },
    { sec: 'खंड / Section' },
    { key: 'a', hi: 'शीर्ष चौड़ाई', en: 'Top width', unit: 'm', def: 8, min: 0.5, max: 100 },
    { key: 'mu', hi: 'ऊर्ध्वप्रवाह ढाल (क्षै:ऊर्ध्व)', en: 'U/s batter (H:V)', unit: 'H:1V', def: 0.2, min: 0, max: 1.5 },
    { key: 'hu', hi: 'ऊर्ध्वप्रवाह ढाल की ऊँचाई (आधार से)', en: 'Height of u/s batter above base', unit: 'm', def: 30, min: 0, max: 1000 },
    { key: 'md', hi: 'अनुप्रवाह ढाल (क्षै:ऊर्ध्व)', en: 'D/s slope (H:V)', unit: 'H:1V', def: 0.8, min: 0.3, max: 2 },
    { key: 'hdv', hi: 'अनुप्रवाह ऊर्ध्व भाग (शीर्ष से नीचे)', en: 'Vertical d/s face below top', unit: 'm', def: 8, min: 0, max: 1000 },
    { key: 'gallery', hi: 'जल निकास गैलरी', en: 'Drainage gallery', type: 'check', def: true },
    { key: 'gx', hi: 'गैलरी का ऊर्ध्वप्रवाह किनारा (एड़ी से)', en: 'Gallery u/s edge from heel', unit: 'm', def: 5, min: 0, max: 1000, show: function (v) { return v.gallery; } },
    { key: 'gy', hi: 'गैलरी तल (आधार से ऊपर)', en: 'Gallery floor above base', unit: 'm', def: 4, min: 0, max: 1000, show: function (v) { return v.gallery; } },
    { key: 'gwid', hi: 'गैलरी चौड़ाई', en: 'Gallery width', unit: 'm', def: 2, min: 0.5, max: 10, show: function (v) { return v.gallery; } },
    { key: 'ghgt', hi: 'गैलरी ऊँचाई', en: 'Gallery height', unit: 'm', def: 2.5, min: 0.5, max: 10, show: function (v) { return v.gallery; } },
    { key: 'xd', hi: 'नाली रेखा (एड़ी से)', en: 'Drain line from heel', unit: 'm', def: 7, min: 0.1, max: 1000 },
    { sec: 'सामग्री एवं भूकंप / Materials and earthquake' },
    { key: 'gc', hi: 'कंक्रीट इकाई भार', en: 'Unit weight of concrete γc', unit: 'kN/m³', def: 24, min: 15, max: 30 },
    { key: 'gw', hi: 'जल इकाई भार', en: 'Unit weight of water γw', unit: 'kN/m³', def: 9.81, min: 9, max: 11 },
    { key: 'gsh', hi: 'गाद क्षैतिज तुल्य द्रव भार', en: 'Silt, horizontal equivalent fluid γsh', unit: 'kN/m³', def: 13.34, min: 0, max: 25,
      help: 'IS 6512: 1360 kg/m³ horizontal (verify clause)' },
    { key: 'gsv', hi: 'गाद ऊर्ध्व भार', en: 'Silt, vertical unit weight γsv', unit: 'kN/m³', def: 18.88, min: 0, max: 25,
      help: 'IS 6512: 1925 kg/m³ vertical (verify clause)' },
    { key: 'ah', hi: 'क्षैतिज भूकंप गुणांक', en: 'Horizontal seismic coefficient αh', unit: '—', def: 0.1, min: 0, max: 0.6 },
    { key: 'av', hi: 'ऊर्ध्व भूकंप गुणांक', en: 'Vertical seismic coefficient αv', unit: '—', def: 0.05, min: 0, max: 0.5 },
    { sec: 'नींव एवं अनुमेय मान / Foundation and permissible values' },
    { key: 'mu_f', hi: 'घर्षण गुणांक tan φ', en: 'Friction coefficient μ = tan φ', unit: '—', def: 0.75, min: 0.1, max: 2 },
    { key: 'coh', hi: 'संसंजन', en: 'Cohesion c at base', unit: 'kPa', def: 600, min: 0, max: 5000 },
    { key: 'sall', hi: 'अनुमेय संपीडन प्रतिबल', en: 'Permissible compressive stress', unit: 'kPa', def: 3000, min: 100, max: 20000 },
    { key: 'fsOT', hi: 'आवश्यक पलटाव सुरक्षा गुणक', en: 'Required FS against overturning', unit: '—', def: 1.5, min: 1, max: 5 },
    { key: 'fsOTe', hi: 'आवश्यक पलटाव सुरक्षा गुणक — भूकंप', en: 'Required FS against overturning — earthquake (C, E, F)', unit: '—', def: 1.2, min: 1, max: 5 },
    { key: 'sffN', hi: 'आवश्यक SFF — सामान्य (A, B)', en: 'Required shear friction factor — normal (A, B)', unit: '—', def: 3.0, min: 0.5, max: 10 },
    { key: 'sffF', hi: 'आवश्यक SFF — बाढ़ (D, G)', en: 'Required shear friction factor — flood (D, G)', unit: '—', def: 2.0, min: 0.5, max: 10 },
    { key: 'sffE', hi: 'आवश्यक SFF — भूकंप (C, E, F)', en: 'Required shear friction factor — earthquake (C, E, F)', unit: '—', def: 1.0, min: 0.5, max: 10 }
  ];

  function reqSFF(v, c) { return c.cat === 'normal' ? v.sffN : (c.cat === 'flood' ? v.sffF : v.sffE); }

  function design(v) {
    if (v.TL <= v.FL) throw new Error('बाँध शीर्ष नींव से ऊपर होना चाहिए / Top level must be above foundation level');
    var s = section(v), H = s.H;
    if (v.hu > H) throw new Error('ऊर्ध्वप्रवाह ढाल की ऊँचाई बाँध की ऊँचाई से अधिक / U/s batter height exceeds dam height');
    if (v.hdv >= H) throw new Error('अनुप्रवाह ऊर्ध्व भाग बाँध की ऊँचाई से कम हो / Vertical d/s portion must be less than dam height');
    if (v.MWL < v.FRL) throw new Error('MWL ≥ FRL होना चाहिए / MWL must not be below FRL');
    if (v.FRL <= v.FL) throw new Error('FRL नींव से ऊपर हो / FRL must be above foundation level');
    if (v.xd >= s.B) throw new Error('नाली रेखा आधार के भीतर हो / Drain line must lie within the base width ' + f(s.B, 2) + ' m');
    if (v.gallery) {
      var g = s.gallery;
      if (!(inside(s, g.x0, g.y0) && inside(s, g.x1, g.y0) && inside(s, g.x0, g.y1) && inside(s, g.x1, g.y1)))
        throw new Error('गैलरी खंड के भीतर नहीं / Gallery lies outside the dam section — change its position or size');
    }

    var r = new B.Report();
    r.formula('Self weight W = γc · A (gallery area deducted), acting at the centroid');
    r.formula('Water: P = γw h²/2 at h/3; vertical water/silt on sloping faces = unit weight × area above the face');
    r.formula('Silt: Ps = γsh hs²/2 at hs/3 (equivalent fluid), vertical silt γsv × area');
    r.formula('Uplift: linear h1 (heel) → h2 (toe); with drains h_drain = h2 + (h1 − h2)/3; U = γw × area of diagram');
    r.formula('Earthquake: horizontal αh·W at centroid; weight reduced to W(1 − αv)');
    r.formula('Zangar: pe = Cm αh γw h, Cm = 0.735(1 − θ/90°); Pe = 0.726 pe h at 0.412 h above base');
    r.formula('Resultant from heel x̄ = −ΣM_heel / ΣV; e = x̄ − B/2; σ = (ΣV/B)(1 ± 6e/B)');
    r.formula('Overturning FS = ΣM_restoring / ΣM_overturning (about toe; about heel for reservoir-empty cases)');
    r.formula('Shear friction factor SFF = (μ ΣV + c B) / ΣH');
    r.ref('IS 6512:1984 Criteria for design of solid gravity dams — forces, load combinations A–G, stability criteria (verify clause numbers and Table values).');
    r.ref('IS 1893 (Part 1) / IS 6512 — Zangar hydrodynamic pressure (verify clause).');
    r.ref('USBR, Design of Gravity Dams (1976) — usual/unusual/extreme factors of safety for sliding.');
    r.assume('Two-dimensional analysis per metre run on the horizontal base plane; dam acts as a rigid monolith.');
    r.assume('Uplift acts over 100 % of the base area; drain reduction to one-third of the head difference at the drain line (verify against IS 6512).');
    r.assume('IS 6512 silt values (1360 kg/m³ horizontal, 1925 kg/m³ vertical) are treated as in addition to water pressure horizontally; vertically the silt weight replaces water within the silt depth.');
    r.assume('Earthquake towards d/s when reservoir is full and towards u/s when empty; vertical acceleration taken upwards (reducing weight). Hydrodynamic force on the vertical component of the face and on tail water is neglected.');
    r.assume('Required shear friction factors are editable defaults (normal 3.0, flood 2.0, earthquake 1.0) following usual/unusual/extreme practice — verify against IS 6512 Table.');
    r.assume('Tail water is taken only up to the start of the vertical d/s face.');
    r.limit('Base plane only — check other horizontal planes and the foundation separately.');
    r.limit('No tension is permitted at heel or toe (as required here); IS 6512 allows small tension for some extreme combinations — verify.');
    r.limit('Pseudo-static method; dams in high seismic zones need dynamic analysis (site-specific spectra).');

    r.h('1. Section');
    r.step('Height H = TL − FL = ' + f(v.TL, 3) + ' − ' + f(v.FL, 3) + ' = ' + f(H, 3) + ' m');
    r.step('U/s batter: offset at base = ' + f(v.mu, 3) + ' × ' + f(s.hu, 3) + ' = ' + f(s.xu, 3) + ' m');
    r.step('D/s slope starts ' + f(v.hdv, 2) + ' m below top, at height ' + f(s.yb, 3) + ' m; base width B = ' + f(s.xu, 3) + ' + ' + f(v.a, 3) + ' + ' + f(v.md, 3) + ' × ' + f(s.yb, 3) + ' = ' + f(s.B, 3) + ' m');
    var mp = massProps(s);
    r.step('Area of section' + (s.gallery ? ' less gallery ' + f(v.gwid * v.ghgt, 2) + ' m²' : '') + ' A = ' + f(mp.A, 3) + ' m², centroid ' + f(mp.x, 3) + ' m from heel, ' + f(mp.y, 3) + ' m above base');
    r.eq('W', 'γc · A', f(v.gc, 2) + ' × ' + f(mp.A, 3), v.gc * mp.A, 'kN/m', 1);

    var all = [], forceRows = [], summary = [];
    COMBOS.forEach(function (c) {
      var fr = forces(v, s, c), an = analyze(fr.list, s.B, v);
      all.push({ c: c, fr: fr, an: an });
      fr.list.forEach(function (q) {
        forceRows.push([c.id, q.name, B.round(q.Fx, 1), B.round(-q.Fy, 1), B.round(q.x, 3), B.round(q.y, 3), B.round((q.x - s.B) * q.Fy - q.y * q.Fx, 1)]);
      });
    });

    var cB = all[1];
    r.h('2. Forces for combination B (normal operation, FRL ' + f(v.FRL, 3) + ')');
    r.step('h1 = FRL − FL = ' + f(cB.fr.h1, 3) + ' m; h2 = TWL − FL = ' + f(cB.fr.h2, 3) + ' m; silt depth hs = ' + f(cB.fr.hs, 3) + ' m');
    r.eq('P (u/s water)', 'γw h1²/2', f(v.gw, 2) + ' × ' + f(cB.fr.h1, 3) + '² / 2', v.gw * cB.fr.h1 * cB.fr.h1 / 2, 'kN/m', 1);
    if (cB.fr.hs > 0) r.eq('Ps', 'γsh hs²/2', f(v.gsh, 2) + ' × ' + f(cB.fr.hs, 3) + '² / 2', v.gsh * cB.fr.hs * cB.fr.hs / 2, 'kN/m', 1);
    if (cB.fr.h2 > 0) r.eq('P (tail water)', 'γw h2²/2', f(v.gw, 2) + ' × ' + f(cB.fr.h2, 3) + '² / 2', v.gw * cB.fr.h2 * cB.fr.h2 / 2, 'kN/m', 1);
    var hdr = cB.fr.h2 + (cB.fr.h1 - cB.fr.h2) / 3;
    r.step('Uplift head: heel ' + f(cB.fr.h1, 3) + ' m, at drain line (' + f(v.xd, 2) + ' m) h2 + (h1 − h2)/3 = ' + f(hdr, 3) + ' m, toe ' + f(cB.fr.h2, 3) + ' m');
    cB.fr.list.forEach(function (q) {
      r.step(q.name + ': ' + (q.Fx ? 'H = ' + f(q.Fx, 1) + ' kN/m' : 'V = ' + f(-q.Fy, 1) + ' kN/m') + ' at x = ' + f(q.x, 3) + ' m, y = ' + f(q.y, 3) + ' m');
    });
    var cC = all[2];
    r.h('3. Earthquake terms (combination C)');
    r.eq('αh·W', 'αh × W', f(v.ah, 3) + ' × ' + f(cC.fr.W, 1), v.ah * cC.fr.W, 'kN/m', 1);
    r.eq('W(1 − αv)', 'W × (1 − αv)', f(cC.fr.W, 1) + ' × (1 − ' + f(v.av, 3) + ')', cC.fr.W * (1 - v.av), 'kN/m', 1);
    var Cm = zangarCm(cC.fr.theta), pe = Cm * v.ah * v.gw * cC.fr.h1;
    r.step('u/s face angle with vertical θ = ' + f(cC.fr.theta, 2) + '° (face taken vertical if the vertical part ≥ half the water depth)');
    r.eq('Cm', '0.735 (1 − θ/90)', '0.735 × (1 − ' + f(cC.fr.theta, 2) + '/90)', Cm, '', 4);
    r.eq('pe (base)', 'Cm αh γw h1', f(Cm, 4) + ' × ' + f(v.ah, 3) + ' × ' + f(v.gw, 2) + ' × ' + f(cC.fr.h1, 3), pe, 'kPa', 2);
    r.eq('Pe', '0.726 pe h1', '0.726 × ' + f(pe, 2) + ' × ' + f(cC.fr.h1, 3), 0.726 * pe * cC.fr.h1, 'kN/m', 1);
    r.eq('Me', '0.299 pe h1²', '0.299 × ' + f(pe, 2) + ' × ' + f(cC.fr.h1, 3) + '²', 0.299 * pe * cC.fr.h1 * cC.fr.h1, 'kN·m/m', 1);

    r.h('4. Stability for each load combination');
    var allOk = true, worst = { sff: Infinity }, maxS = -Infinity, minS = Infinity;
    all.forEach(function (o) {
      var c = o.c, an = o.an, req = reqSFF(v, c);
      var empty = c.water === 'none';
      var fs = empty ? an.fsHeel : an.fsToe;
      r.step(c.id + ': ΣV = ' + f(an.V, 1) + ' kN/m, ΣH = ' + f(an.H, 1) + ' kN/m, x̄ = ' + f(an.xbar, 3) + ' m, e = ' + f(an.e, 3) + ' m (B/6 = ' + f(s.B / 6, 3) + ' m); ' +
        'σ heel = ' + f(an.sHeel, 1) + ' kPa, σ toe = ' + f(an.sToe, 1) + ' kPa; FS overturning (' + (empty ? 'heel' : 'toe') + ') = ' + fsText(fs) +
        '; SFF = (' + f(v.mu_f, 3) + ' × ' + f(an.V, 1) + ' + ' + f(v.coh, 0) + ' × ' + f(s.B, 3) + ') / |' + f(an.H, 1) + '|' + ' = ' + (isFinite(an.sff) ? f(an.sff, 2) : '∞'));
      var reqOT = c.cat === 'eq' ? v.fsOTe : v.fsOT;
      var okOT = !isFinite(fs) || fs >= reqOT;
      var okS = !isFinite(an.sff) || an.sff >= req;
      var okT = Math.min(an.sHeel, an.sToe) >= -1e-6;
      var okC = Math.max(an.sHeel, an.sToe) <= v.sall;
      r.check(c.id + ': overturning FS', okOT, fsText(fs), '≥ ' + f(reqOT, 2));
      r.check(c.id + ': shear friction factor', okS, isFinite(an.sff) ? f(an.sff, 2) : '∞', '≥ ' + f(req, 2), c.id === 'A' ? 'required values: verify against IS 6512' : '');
      r.check(c.id + ': no tension (heel/toe)', okT, f(Math.min(an.sHeel, an.sToe), 1) + ' kPa', '≥ 0');
      r.check(c.id + ': max compression', okC, f(Math.max(an.sHeel, an.sToe), 1) + ' kPa', '≤ ' + f(v.sall, 0) + ' kPa');
      allOk = allOk && okOT && okS && okT && okC;
      if (isFinite(an.sff) && an.sff / req < worst.sff) worst = { sff: an.sff / req, id: c.id };
      maxS = Math.max(maxS, an.sHeel, an.sToe); minS = Math.min(minS, an.sHeel, an.sToe);
      summary.push([c.id, c.title, B.round(an.V, 1), B.round(an.H, 1), B.round(an.xbar, 3), B.round(an.e, 3), B.round(an.sHeel, 1), B.round(an.sToe, 1),
        isFinite(fs) ? B.round(fs, 2) : '∞', isFinite(an.sff) ? B.round(an.sff, 2) : '∞', req]);
    });

    r.result('Height of dam H', H, 'm', 2);
    r.result('Base width B', s.B, 'm', 2);
    r.result('Self weight W', all[0].fr.W, 'kN/m', 0);
    r.result('B: σ heel / σ toe', f(all[1].an.sHeel, 0) + ' / ' + f(all[1].an.sToe, 0), 'kPa');
    r.result('B: shear friction factor', all[1].an.sff, '—', 2);
    r.result('D: shear friction factor', all[3].an.sff, '—', 2);
    r.result('Max / min base stress (all)', f(maxS, 0) + ' / ' + f(minS, 0), 'kPa');
    if (worst.id) r.result('Lowest SFF ratio (actual/required)', f(worst.sff, 2) + ' in ' + worst.id, '—');
    r.table('Load combinations — summary', ['Comb.', 'Description', 'ΣV (kN/m)', 'ΣH (kN/m)', 'x̄ from heel (m)', 'e (m)', 'σ heel (kPa)', 'σ toe (kPa)', 'FS overturning', 'SFF', 'SFF required'], summary, 'combos');
    r.table('Forces by combination (per metre run)', ['Comb.', 'Force', 'Fx d/s (kN)', 'Fy down (kN)', 'x from heel (m)', 'y above base (m)', 'Moment about toe (+ restoring) (kN·m)'], forceRows, 'forces');
    if (cB.fr.h2 < Math.max(0, v.TWL - v.FL) - 1e-9 || all[3].fr.h2 < Math.max(0, v.TWLmax - v.FL) - 1e-9) r.warn('Tail water above the start of the vertical d/s face was cut off at that level.');
    if (v.SL > v.FRL) r.warn('Silt level is above FRL; silt depth limited to the water depth.');
    r.data = { s: s, all: all, v: v };
    return r;
  }

  /* ---------- drawing ---------- */
  function drawings(v, rep) {
    var D = rep.data, s = D.s, H = s.H, Bw = s.B, FL = v.FL;
    var d = new Drawing({ title: 'Gravity dam section with forces' });
    var L = Math.max(Bw, H);
    var xl = -0.45 * L, xr = Bw + 0.35 * L, depth = 0.06 * H + 1;
    // foundation rock beside the base
    d.hatch([[xl, 0], [0, 0], [0, -depth], [xl, -depth]], 'rock', { outline: false });
    d.hatch([[Bw, 0], [xr, 0], [xr, -depth], [Bw, -depth]], 'rock', { outline: false });
    d.hatch([[0, 0], [Bw, 0], [Bw, -depth], [0, -depth]], 'rock', { outline: false });
    d.line(xl, 0, xr, 0, 'SOIL');
    // water u/s (FRL) and tail water
    var h1 = D.all[1].fr.h1, h2 = D.all[1].fr.h2, hs = D.all[1].fr.hs;
    function usPoly(h, h0) {
      var p = [[xl, h0], [usFaceX(s, h0), h0]];
      if (s.hu > h0 && s.hu < h) p.push([s.xu, s.hu]);
      p.push([usFaceX(s, h), h], [xl, h]);
      return p;
    }
    if (hs > 0) d.hatch(usPoly(hs, 0), 'soil', { outline: false });
    d.hatch(usPoly(h1, hs > 0 ? hs : 0), 'water', { outline: false });
    d.line(xl, h1, usFaceX(s, h1), h1, 'WATER');
    var hM = Math.max(0, v.MWL - FL);
    d.line(xl, hM, usFaceX(s, hM), hM, 'WATER', { dash: true });
    if (h2 > 0) {
      d.hatch([[s.B - s.md * h2, h2], [xr, h2], [xr, 0], [Bw, 0]], 'water', { outline: false });
      d.line(s.B - s.md * h2, h2, xr, h2, 'WATER');
    }
    // dam body, hatched around the gallery
    var g = s.gallery;
    if (g) {
      var pieces = [clipHalf(s.pts, 0, g.x0, -1), clipHalf(s.pts, 0, g.x1, 1)];
      var mid = clipHalf(clipHalf(s.pts, 0, g.x0, 1), 0, g.x1, -1);
      pieces.push(clipHalf(mid, 1, g.y0, -1), clipHalf(mid, 1, g.y1, 1));
      pieces.forEach(function (p) { if (p.length >= 3 && polyProps(p).A > 1e-6) d.hatch(p, 'concrete', { outline: false }); });
      d.rect(g.x0, g.y0, g.x1 - g.x0, g.y1 - g.y0, 'CONCRETE');
      d.text((g.x0 + g.x1) / 2, g.y1, 'GALLERY', { ha: 'c', va: 'b', dy: 0.8, h: 1.8 });
    } else d.hatch(s.pts, 'concrete', { outline: false });
    d.poly(s.pts, 'CONCRETE');
    // drain line
    d.line(v.xd, 0, v.xd, g ? g.y0 : Math.min(H * 0.3, 10), 'CENTRE', { dash: true });
    // uplift diagram under the base (combination B), scaled to 0.18 H max depth
    var ud = upliftDiagram(Bw, h1, h2, true, v.xd), umax = Math.max(h1, 1e-6), k = 0.18 * H / umax;
    var up = ud.map(function (q) { return [q[0], -depth - q[1] * k]; });
    up[0] = [0, -depth]; up[up.length - 1] = [Bw, -depth];
    d.hatch(up, 'pressure');
    d.text(0, -depth - h1 * k, 'γw h1 = ' + f(v.gw * h1, 1) + ' kPa', { ha: 'l', va: 't', dy: -1, h: 2 });
    if (h2 > 0) d.text(Bw, -depth - h2 * k, f(v.gw * h2, 1) + ' kPa', { ha: 'r', va: 't', dy: -1, h: 2 });
    d.text(v.xd, -depth - ud[2][1] * k, f(v.gw * ud[2][1], 1), { ha: 'l', va: 't', dx: 1, dy: -1, h: 2 });
    d.text(Bw / 2, -depth - h1 * k, 'UPLIFT DIAGRAM (COMB. B, DRAINS WORKING)', { ha: 'c', va: 't', dy: -7, h: 2 });
    // force arrows for combination B, plus EQ from C
    var fb = D.all[1].fr.list;
    function get(list, kind) { return list.filter(function (q) { return q.kind === kind; })[0]; }
    var W = get(fb, 'W'); d.force(W.x, W.y, -90, 16, 'W = ' + f(-W.Fy, 0) + ' kN');
    var Pw = get(fb, 'Pw'); d.force(Pw.x, Pw.y, 0, 22, 'P = ' + f(Pw.Fx, 0) + ' kN');
    var Ps = get(fb, 'Ps'); if (Ps) d.force(Ps.x, Ps.y, 0, 14, 'Ps = ' + f(Ps.Fx, 0) + ' kN');
    var Pt = get(fb, 'Pt'); if (Pt) d.force(Pt.x, Pt.y, 180, 14, 'Pt = ' + f(-Pt.Fx, 0) + ' kN');
    var U = get(fb, 'U'); d.force(U.x, -depth, 90, 10, 'U = ' + f(U.Fy, 0) + ' kN', { layer: 'WATER' });
    var eq = get(D.all[2].fr.list, 'EQ'); d.force(eq.x + 0.06 * L, eq.y + 0.08 * H, 0, 14, 'αh·W = ' + f(eq.Fx, 0) + ' kN (C)');
    var Pe = get(D.all[2].fr.list, 'Pe'); if (Pe) d.force(Pe.x, Pe.y, 0, 12, 'Pe = ' + f(Pe.Fx, 0) + ' (C)');
    // resultant position for B
    var xb = D.all[1].an.xbar;
    if (isFinite(xb)) { d.circle(xb, 0, 0.004 * L + 0.05, 'DIM'); d.text(xb, 0, 'R(B)', { ha: 'c', va: 't', dy: -0.8, h: 1.8 }); }
    d.line(Bw / 3, -0.3, Bw / 3, 0.3, 'CENTRE'); d.line(2 * Bw / 3, -0.3, 2 * Bw / 3, 0.3, 'CENTRE');
    // levels
    d.level(s.xb, H, 'TOP ' + f(v.TL, 3), {});
    d.level(xl + 0.03 * L, h1, 'FRL ' + f(v.FRL, 3), {});
    if (hM > h1 + 1e-6) d.level(xl + 0.26 * L, hM, 'MWL ' + f(v.MWL, 3), {});
    if (hs > 0) d.level(xl + 0.08 * L, hs, 'SILT ' + f(v.SL, 3), {});
    if (h2 > 0) d.level(xr - 0.12 * L, h2, 'TWL ' + f(v.TWL, 3), { side: 'l' });
    d.level(xl, 0, 'FOUNDATION ' + f(FL, 3), { side: 'l' });
    // dims
    d.dimH(0, Bw, -depth - 0.18 * H, 14, {});
    d.dimH(s.xu, s.xb, H, -6);
    d.dimV(xl, 0, H, 6);
    if (g) d.dimH(0, g.x0, g.y1 + 0.05 * H, -4);
    d.flow(xr - 0.1 * L, -depth - 0.05 * H, 0);
    return [{ key: 'section', title: 'Gravity dam section and forces / गुरुत्व बाँध खंड एवं बल', d: d }];
  }

  return {
    fns: { polyProps: polyProps, clipHalf: clipHalf, section: section, massProps: massProps, forces: forces, analyze: analyze,
      upliftDiagram: upliftDiagram, zangarCm: zangarCm, COMBOS: COMBOS },
    pages: [
      { id: 'gravity-dam', group: 'D', order: 1, hi: 'गुरुत्व बाँध स्थिरता', en: 'Gravity dam stability', refs: 'IS 6512; Zangar (IS 1893)',
        intro: 'Stability of a user-defined gravity dam section on its base for load combinations A–G: overturning, sliding (shear friction factor) and heel/toe stresses.',
        inputs: inputs, design: design, drawings: drawings }
    ]
  };
});
