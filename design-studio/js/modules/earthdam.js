/* D2. Earth dam / मिट्टी का बाँध
 * - Phreatic line (Kozeny base parabola with toe filter; Schaffernak or
 *   Casagrande without filter) and seepage discharge.
 * - Freeboard (IS 10635): wave height, wind set-up, run-up.
 * - Slope stability (IS 7894) of the d/s slope under steady seepage:
 *   Fellenius and Bishop simplified for a given circle, and a coarse grid
 *   search for the minimum Bishop factor of safety. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../core/index.js'));
  else root.DS.register(factory(root.DS));
})(typeof self !== 'undefined' ? self : this, function (DS) {
  'use strict';
  var B = DS.base, Drawing = DS.Drawing, f = B.f;
  var GW = 9.81;

  /* ---------- geometry ---------- */
  // Origin at the u/s toe on the base (foundation level); y up.
  function geometry(p) {
    var Hd = p.crest - p.FL;
    var xa = p.zu * Hd, xb = xa + p.bc, xT = xb + p.zd * Hd;
    return { Hd: Hd, xa: xa, xb: xb, xT: xT, zu: p.zu, zd: p.zd, bc: p.bc };
  }
  function ground(g, x) {
    if (x <= 0 || x >= g.xT) return 0;
    if (x < g.xa) return x / g.zu;
    if (x <= g.xb) return g.Hd;
    return g.Hd - (x - g.xb) / g.zd;
  }

  /* ---------- phreatic line ---------- */
  // p = {h (water depth above base), filter: bool, Lf, k}
  // Returns {S, q, xB, xF, exit: [x,y], y(x), method, a, alpha}
  function phreatic(g, p) {
    var out = phreaticBase(g, p);
    if (out.none) return out;
    // Casagrande entry correction: the line leaves the u/s face at A (water level) and
    // blends smoothly into the base curve over 0.3Δ.
    var base = out.y, xA = out.xA, h = out.h, Lb = 0.3 * xA;
    out.yBase = base;
    out.y = function (x) {
      if (x <= xA) return h;
      if (x < xA + Lb) { var t = (x - xA) / Lb, w = t * t * (3 - 2 * t); return h * (1 - w) + base(x) * w; }
      return base(x);
    };
    return out;
  }
  function phreaticBase(g, p) {
    var h = p.h;
    if (!(h > 0)) return { none: true, y: function () { return 0; }, q: 0 };
    var xA = g.zu * h, delta = xA, xB = xA - 0.3 * delta;
    var alpha = Math.atan(1 / g.zd), out = { h: h, xA: xA, xB: xB, alpha: alpha };
    if (p.filter) {
      var xF = g.xT - p.Lf, d = xF - xB;
      var S = Math.sqrt(d * d + h * h) - d;
      out.method = 'kozeny'; out.xF = xF; out.d = d; out.S = S; out.q = p.k * S;
      out.exit = [xF + S / 2, 0];
      out.y = function (x) {
        if (x <= xA) return h;
        var X = xF - x;                       // positive upstream of the focus
        var y2 = S * S + 2 * S * X;
        return y2 > 0 ? Math.sqrt(y2) : 0;
      };
      return out;
    }
    var dT = g.xT - xB, ca = Math.cos(alpha), sa = Math.sin(alpha);
    out.d = dT;
    if (B.deg(alpha) < 30) {
      // Schaffernak: a = d/cosα − √(d²/cos²α − h²/sin²α); q = k a sinα tanα
      var disc = dT * dT / (ca * ca) - h * h / (sa * sa);
      if (disc < 0) throw new Error('Schaffernak solution not possible for this section (d/s slope too steep for its length) / अनुप्रवाह ढाल हेतु हल संभव नहीं');
      var a = dT / ca - Math.sqrt(disc);
      var xe = g.xT - a * ca, ye = a * sa, q = p.k * a * sa * Math.tan(alpha);
      out.method = 'schaffernak'; out.a = a; out.q = q; out.exit = [xe, ye];
      out.y = function (x) {
        if (x <= xA) return h;
        if (x >= g.xT) return 0;
        if (x >= xe) return ground(g, x);
        var y2 = h * h - 2 * (q / p.k) * (x - xB);
        return Math.sqrt(Math.max(y2, ye * ye));
      };
      return out;
    }
    // Casagrande, base parabola with focus at the d/s toe; a + Δa = S/(1 − cos α)
    var S2 = Math.sqrt(dT * dT + h * h) - dT;
    var ratio = B.interp([30, 60, 90, 120, 150, 180], [0.36, 0.32, 0.26, 0.18, 0.10, 0], B.deg(alpha));
    var aa = S2 / (1 - ca), a2 = aa * (1 - ratio);
    var xe2 = g.xT - a2 * ca, ye2 = a2 * sa;
    out.method = 'casagrande'; out.S = S2; out.a = a2; out.ratio = ratio; out.q = p.k * a2 * sa * sa; out.exit = [xe2, ye2];
    out.y = function (x) {
      if (x <= xA) return h;
      if (x >= g.xT) return 0;
      if (x >= xe2) return ground(g, x);
      var yb = Math.sqrt(Math.max(0, S2 * S2 + 2 * S2 * (g.xT - x)));
      return Math.max(yb, ye2);
    };
    return out;
  }

  /* ---------- freeboard ---------- */
  // Molitor–Stevenson wave height (m): V km/h over water, F km
  function waveHeight(V, F) { return F < 32 ? 0.032 * Math.sqrt(V * F) + 0.763 - 0.271 * Math.pow(F, 0.25) : 0.032 * Math.sqrt(V * F); }
  // Zuider Zee wind set-up (m): V km/h, F km, D average depth m
  function windSetup(V, F, D) { return V * V * F / (62000 * D); }

  /* ---------- slope stability ---------- */
  // s = {g, phr (phreatic or null), gm, gs (sat), c, phi (deg), Df, n}
  // Returns null for an invalid circle, else {fel, bishop, slices, xL, xR}
  function circleFS(s, xc, yc, R, keepSlices) {
    var g = s.g, n = s.n || 24;
    if (!(R > 0)) return null;
    function low(x) { var t = R * R - (x - xc) * (x - xc); return t >= 0 ? yc - Math.sqrt(t) : NaN; }
    function hgt(x) { var y = low(x); return isFinite(y) ? ground(g, x) - y : -1; }
    // scan for the region where the circle is below the ground surface
    var x0 = xc - R, x1 = xc + R, N = 160, xL = null, xR = null, prev = hgt(x0), px = x0;
    for (var i = 1; i <= N; i++) {
      var x = x0 + (x1 - x0) * i / N, h = hgt(x);
      if (prev <= 0 && h > 0 && xL === null) xL = B.bisect(hgt, px, x, 1e-6) || px;
      if (prev > 0 && h <= 0 && xL !== null) { xR = B.bisect(hgt, px, x, 1e-6) || x; break; }
      prev = h; px = x;
    }
    if (xL === null || xR === null || xR - xL < 1e-3) return null;
    if (yc - R < -s.Df - 1e-9) return null;                 // below the firm stratum
    var tphi = Math.tan(B.rad(s.phi)), b = (xR - xL) / n;
    var sl = [], drive = 0;
    for (var k = 0; k < n; k++) {
      var xm = xL + (k + 0.5) * b, yt = ground(g, xm), yb = low(xm);
      var hh = yt - yb;
      if (!(hh > 0)) continue;
      var yp = s.phr ? s.phr.y(xm) : -Infinity;            // phreatic level above base (0 beyond the dam)
      if (s.phr && xm >= g.xT) yp = 0;
      var hw = Math.max(0, Math.min(yt, yp) - yb);          // saturated height in slice
      var W = b * (s.gm * (hh - hw) + s.gs * hw);
      var u = GW * Math.max(0, yp - yb);
      var sa = (xc - xm) / R, al = Math.asin(Math.max(-1, Math.min(1, sa)));
      sl.push({ x: xm, b: b, h: hh, W: W, u: u, al: al });
      drive += W * Math.sin(al);
    }
    if (!(drive > 1e-9)) return null;
    var res = 0;
    sl.forEach(function (q) {
      var l = q.b / Math.cos(q.al);
      res += s.c * l + Math.max(0, q.W * Math.cos(q.al) - q.u * l) * tphi;
    });
    var fel = res / drive, F = Math.max(fel, 0.3);
    for (var it = 0; it < 60; it++) {
      var num = 0;
      sl.forEach(function (q) {
        var ma = Math.cos(q.al) + Math.sin(q.al) * tphi / F;
        ma = Math.max(ma, 0.2);                               // guard against tiny mα at steep negative angles
        q.ma = ma;
        num += (s.c * q.b + Math.max(0, q.W - q.u * q.b) * tphi) / ma;
      });
      var Fn = num / drive;
      if (Math.abs(Fn - F) < 1e-6) { F = Fn; break; }
      F = Fn;
    }
    return { fel: fel, bishop: F, slices: keepSlices ? sl : null, xL: xL, xR: xR, drive: drive, xc: xc, yc: yc, R: R };
  }

  // Coarse grid of centres over the d/s slope; for each centre try a toe circle,
  // a smaller circle, a base-tangent circle and deeper circles to the firm stratum.
  function gridSearch(s) {
    var g = s.g, L = g.zd * g.Hd;
    var best = null, count = 0;
    function tryC(xc, yc, R) {
      var r = circleFS(s, xc, yc, R, false);
      count++;
      if (r && (!best || r.bishop < best.bishop)) best = r;
    }
    function centre(xc, yc) {
      var Rt = Math.sqrt((g.xT - xc) * (g.xT - xc) + yc * yc);
      [0.8 * Rt, Rt].forEach(function (R) { tryC(xc, yc, R); });
      [0, s.Df / 2, s.Df].forEach(function (dep) { var R = yc + dep; if (R > Rt) tryC(xc, yc, R); });
    }
    var nx = 12, ny = 10, x0 = g.xb - 0.3 * L, x1 = g.xT + 0.1 * L, y0 = 0.8 * g.Hd, y1 = 2.6 * g.Hd;
    for (var i = 0; i <= nx; i++) for (var j = 0; j <= ny; j++) centre(x0 + (x1 - x0) * i / nx, y0 + (y1 - y0) * j / ny);
    if (best) {
      // refine around the best centre
      var dx = (x1 - x0) / nx, dy = (y1 - y0) / ny, bx = best.xc, by = best.yc;
      for (i = -4; i <= 4; i++) for (j = -4; j <= 4; j++) {
        var xc = bx + i * dx / 4, yc = by + j * dy / 4;
        if (yc > 0.2 * g.Hd) centre(xc, yc);
      }
    }
    return { best: best, count: count };
  }

  /* ---------- page ---------- */
  var inputs = [
    { sec: 'खंड / Section' },
    { key: 'FL', hi: 'नींव (आधार) स्तर', en: 'Foundation (base) level', unit: 'm', def: 100, min: -500, max: 9000 },
    { key: 'crest', hi: 'शिखर स्तर', en: 'Crest level', unit: 'm', def: 125, min: -500, max: 9000 },
    { key: 'bc', hi: 'शिखर चौड़ाई', en: 'Crest width', unit: 'm', def: 7, min: 1, max: 50 },
    { key: 'zu', hi: 'ऊर्ध्वप्रवाह ढाल (क्षै:ऊर्ध्व)', en: 'U/s slope (H:V)', unit: 'H:1V', def: 3, min: 1, max: 8 },
    { key: 'zd', hi: 'अनुप्रवाह ढाल (क्षै:ऊर्ध्व)', en: 'D/s slope (H:V)', unit: 'H:1V', def: 3, min: 1, max: 8 },
    { key: 'Df', hi: 'दृढ़ स्तर तक नींव की गहराई', en: 'Depth of foundation soil to firm stratum', unit: 'm', def: 5, min: 0, max: 100,
      help: 'Foundation soil is taken with the same properties as the dam; slip circles stop at the firm stratum.' },
    { sec: 'जल एवं रिसाव / Water and seepage' },
    { key: 'FRL', hi: 'पूर्ण जलाशय स्तर', en: 'Full reservoir level FRL', unit: 'm', def: 121, min: -500, max: 9000 },
    { key: 'MWL', hi: 'अधिकतम जल स्तर', en: 'Maximum water level MWL', unit: 'm', def: 122.5, min: -500, max: 9000 },
    { key: 'drain', hi: 'जल निकास', en: 'Drainage', type: 'select', def: 'filter',
      options: [['filter', 'Horizontal toe filter (Kozeny parabola)'], ['none', 'No filter — seepage exits on d/s face']] },
    { key: 'Lf', hi: 'टो फ़िल्टर की लंबाई', en: 'Length of horizontal toe filter', unit: 'm', def: 20, min: 0.5, max: 500, show: function (v) { return v.drain === 'filter'; } },
    { key: 'k', hi: 'पारगम्यता गुणांक', en: 'Coefficient of permeability k', unit: 'm/s', def: 1e-7, min: 1e-12, max: 1 },
    { sec: 'मिट्टी के गुण / Soil properties' },
    { key: 'gm', hi: 'नम इकाई भार', en: 'Unit weight above phreatic line γ', unit: 'kN/m³', def: 19, min: 10, max: 25 },
    { key: 'gs', hi: 'संतृप्त इकाई भार', en: 'Saturated unit weight γsat', unit: 'kN/m³', def: 20.5, min: 10, max: 26 },
    { key: 'c', hi: 'प्रभावी संसंजन', en: "Effective cohesion c'", unit: 'kPa', def: 15, min: 0, max: 500 },
    { key: 'phi', hi: 'प्रभावी घर्षण कोण', en: "Effective friction angle φ'", unit: '°', def: 28, min: 0, max: 50 },
    { sec: 'स्खलन वृत्त / Slip circle (d/s slope)' },
    { key: 'mode', hi: 'वृत्त', en: 'Circle', type: 'select', def: 'search',
      options: [['search', 'Grid search for minimum FS (and check it)'], ['given', 'Check a given circle (plus grid search)']] },
    { key: 'xc', hi: 'केंद्र x (ऊर्ध्वप्रवाह टो से)', en: 'Centre x from u/s toe', unit: 'm', def: 136, min: -2000, max: 5000, show: function (v) { return v.mode === 'given'; } },
    { key: 'yc', hi: 'केंद्र y (आधार से ऊपर)', en: 'Centre y above base', unit: 'm', def: 68, min: 0.1, max: 5000, show: function (v) { return v.mode === 'given'; } },
    { key: 'R', hi: 'त्रिज्या', en: 'Radius R', unit: 'm', def: 72, min: 0.5, max: 5000, show: function (v) { return v.mode === 'given'; } },
    { key: 'FSreq', hi: 'आवश्यक सुरक्षा गुणक', en: 'Required FS (steady seepage, d/s)', unit: '—', def: 1.5, min: 1, max: 3, help: 'IS 7894: 1.5 for steady seepage, d/s slope (verify Table).' },
    { sec: 'मुक्त उच्चता / Freeboard (IS 10635)' },
    { key: 'V', hi: 'जल पर पवन वेग', en: 'Wind velocity over water V', unit: 'km/h', def: 80, min: 0, max: 300 },
    { key: 'F', hi: 'फ़ेच', en: 'Fetch F', unit: 'km', def: 3, min: 0.05, max: 500 },
    { key: 'Dav', hi: 'औसत जल गहराई', en: 'Average depth along fetch', unit: 'm', def: 12, min: 0.5, max: 500 },
    { key: 'ru', hi: 'तरंग चढ़ाव गुणक', en: 'Run-up factor (× wave height)', unit: '—', def: 1.5, min: 0.5, max: 3, help: 'About 1.5 for rip-rap on the u/s face (verify).' },
    { key: 'fbMin', hi: 'न्यूनतम मुक्त उच्चता (FRL से)', en: 'Minimum freeboard above FRL', unit: 'm', def: 2.0, min: 0, max: 10, help: 'Verify against IS 10635 / project criteria.' },
    { key: 'fbMinM', hi: 'न्यूनतम मुक्त उच्चता (MWL से)', en: 'Minimum freeboard above MWL', unit: 'm', def: 1.0, min: 0, max: 10, help: 'Verify against IS 10635 / project criteria.' }
  ];

  function design(v) {
    if (v.crest <= v.FL) throw new Error('शिखर नींव से ऊपर हो / Crest must be above the base level');
    if (v.FRL <= v.FL || v.FRL >= v.crest) throw new Error('FRL आधार और शिखर के बीच हो / FRL must lie between base and crest');
    if (v.MWL < v.FRL || v.MWL >= v.crest) throw new Error('MWL, FRL और शिखर के बीच हो / MWL must lie between FRL and crest');
    if (v.gs < v.gm) throw new Error('γsat ≥ γ होना चाहिए / Saturated unit weight must not be less than moist unit weight');
    var g = geometry(v), h = v.FRL - v.FL, filter = v.drain === 'filter';
    if (filter && v.Lf >= g.xT - g.xb) throw new Error('फ़िल्टर बहुत लंबा / Toe filter must end before the d/s crest edge (≤ ' + f(g.xT - g.xb, 1) + ' m)');
    var r = new B.Report();
    r.formula('Base parabola (Kozeny/Casagrande): focus F, S = √(d² + h²) − d, y² = S² + 2 S X (X measured upstream of F)');
    r.formula('Point B at 0.3 Δ upstream of the water–slope intersection (Casagrande entry correction)');
    r.formula(filter ? 'Seepage with toe filter q = k S' : 'No filter: Schaffernak (α < 30°) a = d/cosα − √(d²/cos²α − h²/sin²α), q = k a sinα tanα; Casagrande (α ≥ 30°) a + Δa = S/(1 − cosα), q = k a sin²α');
    r.formula('Wave height (Molitor–Stevenson): hw = 0.032√(VF) + 0.763 − 0.271 F^¼ (F < 32 km); hw = 0.032√(VF) (F ≥ 32 km)');
    r.formula('Wind set-up (Zuider Zee): S = V² F / (62000 D)');
    r.formula("Fellenius: FS = Σ[c'l + (W cosα − u l) tanφ'] / Σ W sinα");
    r.formula("Bishop simplified: FS = Σ{[c'b + (W − u b) tanφ'] / mα} / Σ W sinα, mα = cosα + sinα tanφ'/FS");
    r.ref('Casagrande, A. (1937) Seepage through dams; Kozeny (1931); Schaffernak (1917) — as in S.K. Garg, Irrigation Engineering and Hydraulic Structures, earth dams.');
    r.ref('IS 10635 — Guidelines for freeboard requirement in embankment dams (verify clause and minimum values).');
    r.ref('IS 7894 — Code of practice for stability analysis of earth dams: method of slices, required factors of safety (verify Table).');
    r.ref('Bishop, A.W. (1955) The use of the slip circle in the stability analysis of slopes, Géotechnique 5(1).');
    r.assume('Homogeneous, isotropic dam on a foundation of the same soil down to a firm stratum; plane strain per metre length.');
    r.assume('Steady seepage from FRL; tail water at d/s ground level; pore pressure = γw × height of phreatic line above the slice base (beyond the toe: hydrostatic to ground).');
    r.assume('Phreatic line near the u/s face is taken at reservoir level up to the water–slope intersection; entry transition drawn approximately.');
    r.assume('Negative effective normal force on a slice is set to zero; mα is limited to ≥ 0.2.');
    r.limit('Only the d/s slope under steady seepage is analysed; check end of construction, sudden drawdown (u/s) and earthquake cases separately (IS 7894).');
    r.limit('Grid search is coarse (about 1000 circles); refine with SLOPE/W or similar for final design.');
    r.limit('Zoned dams, anisotropic permeability and non-circular slips are not covered.');

    // seepage
    r.h('1. Phreatic line and seepage');
    var ph = phreatic(g, { h: h, filter: filter, Lf: v.Lf, k: v.k });
    r.step('Dam height = ' + f(v.crest, 3) + ' − ' + f(v.FL, 3) + ' = ' + f(g.Hd, 3) + ' m; water depth h = FRL − base = ' + f(h, 3) + ' m');
    r.step('Base width = ' + f(v.zu, 2) + ' × ' + f(g.Hd, 3) + ' + ' + f(v.bc, 2) + ' + ' + f(v.zd, 2) + ' × ' + f(g.Hd, 3) + ' = ' + f(g.xT, 3) + ' m');
    r.eq('Δ (horizontal projection of wetted u/s slope)', 'zu × h', f(v.zu, 2) + ' × ' + f(h, 3), ph.xA, 'm', 3);
    r.step('Point B is 0.3Δ = ' + f(0.3 * ph.xA, 3) + ' m upstream of the water line on the slope: x_B = ' + f(ph.xB, 3) + ' m from the u/s toe');
    if (ph.method === 'kozeny') {
      r.step('Focus at the u/s end of the toe filter: x_F = ' + f(g.xT, 3) + ' − ' + f(v.Lf, 2) + ' = ' + f(ph.xF, 3) + ' m');
      r.eq('d', 'x_F − x_B', f(ph.xF, 3) + ' − ' + f(ph.xB, 3), ph.d, 'm', 3);
      r.eq('S', '√(d² + h²) − d', '√(' + f(ph.d, 3) + '² + ' + f(h, 3) + '²) − ' + f(ph.d, 3), ph.S, 'm', 3);
      r.eq('q', 'k S', v.k.toExponential(2) + ' × ' + f(ph.S, 3), ph.q, 'm³/s per m', 9);
      r.step('Phreatic line meets the filter at the vertex, S/2 = ' + f(ph.S / 2, 3) + ' m downstream of the focus');
    } else if (ph.method === 'schaffernak') {
      r.step('d/s slope angle α = atan(1/' + f(v.zd, 2) + ') = ' + f(B.deg(ph.alpha), 2) + '° (< 30°: Schaffernak)');
      r.eq('d', 'x_toe − x_B', f(g.xT, 3) + ' − ' + f(ph.xB, 3), ph.d, 'm', 3);
      r.eq('a', 'd/cosα − √(d²/cos²α − h²/sin²α)', '', ph.a, 'm', 3);
      r.eq('q', 'k a sinα tanα', '', ph.q, 'm³/s per m', 9);
      r.step('Exit point on d/s face at ' + f(ph.a, 3) + ' m along the slope from the toe, ' + f(ph.exit[1], 3) + ' m above base');
    } else {
      r.step('d/s slope angle α = ' + f(B.deg(ph.alpha), 2) + '° (≥ 30°: Casagrande)');
      r.eq('S', '√(d² + h²) − d', '', ph.S, 'm', 3);
      r.step('Δa/(a + Δa) from Casagrande chart = ' + f(ph.ratio, 3) + '; a + Δa = S/(1 − cosα) = ' + f(ph.S / (1 - Math.cos(ph.alpha)), 3) + ' m; a = ' + f(ph.a, 3) + ' m');
      r.eq('q', 'k a sin²α', '', ph.q, 'm³/s per m', 9);
    }
    var qDay = ph.q * 86400;
    r.step('Seepage per metre length = ' + f(qDay, 4) + ' m³/day');

    // freeboard
    r.h('2. Freeboard (IS 10635)');
    var hw = r.eq('Wave height hw', v.F < 32 ? '0.032√(VF) + 0.763 − 0.271 F^¼' : '0.032√(VF)', 'V = ' + f(v.V, 1) + ' km/h, F = ' + f(v.F, 2) + ' km', waveHeight(v.V, v.F), 'm', 3);
    var su = r.eq('Wind set-up S', 'V² F / (62000 D)', f(v.V, 1) + '² × ' + f(v.F, 2) + ' / (62000 × ' + f(v.Dav, 2) + ')', windSetup(v.V, v.F, v.Dav), 'm', 3);
    var ru = r.eq('Run-up', v.ru + ' × hw', '', v.ru * hw, 'm', 3);
    var fbReq = r.eq('Required freeboard (wave)', 'S + run-up', f(su, 3) + ' + ' + f(ru, 3), su + ru, 'm', 3);
    var fbF = v.crest - v.FRL, fbM = v.crest - v.MWL;
    r.step('Provided: above FRL = ' + f(fbF, 3) + ' m; above MWL = ' + f(fbM, 3) + ' m');

    // stability
    r.h('3. Slope stability of d/s slope (steady seepage)');
    var st = { g: g, phr: ph, gm: v.gm, gs: v.gs, c: v.c, phi: v.phi, Df: v.Df, n: 24 };
    var gs = gridSearch(st);
    if (!gs.best) throw new Error('कोई वैध स्खलन वृत्त नहीं मिला / No valid slip circle found');
    var crit = circleFS(st, gs.best.xc, gs.best.yc, gs.best.R, true);
    r.step('Grid search: ' + gs.count + ' circles tried (toe, smaller, base-tangent and deeper circles; centres over the d/s slope)');
    r.step('Critical circle: centre (' + f(crit.xc, 2) + ', ' + f(crit.yc, 2) + ') m, R = ' + f(crit.R, 2) + ' m; Fellenius FS = ' + f(crit.fel, 3) + ', Bishop FS = ' + f(crit.bishop, 3));
    var given = null;
    if (v.mode === 'given') {
      given = circleFS(st, v.xc, v.yc, v.R, true);
      if (!given) throw new Error('दिया वृत्त ढाल को नहीं काटता या दृढ़ स्तर से नीचे जाता है / Given circle does not cut the slope properly or goes below the firm stratum');
      r.step('Given circle: centre (' + f(v.xc, 2) + ', ' + f(v.yc, 2) + ') m, R = ' + f(v.R, 2) + ' m; enters at x = ' + f(given.xL, 2) + ' m, exits at x = ' + f(given.xR, 2) + ' m');
      r.step('Σ W sinα = ' + f(given.drive, 1) + ' kN/m; Fellenius FS = ' + f(given.fel, 3) + '; Bishop FS (iterated) = ' + f(given.bishop, 3));
    }
    var show = given || crit;
    var rows = show.slices.map(function (q, i) {
      return [i + 1, B.round(q.x, 2), B.round(q.b, 3), B.round(q.h, 3), B.round(q.W, 2), B.round(B.deg(q.al), 2), B.round(q.u, 2), B.round(q.ma, 4)];
    });
    r.table('Slices — ' + (given ? 'given circle' : 'critical circle') + ' (Bishop simplified)', ['Slice', 'x mid (m)', 'b (m)', 'h (m)', 'W (kN/m)', 'α (°)', 'u (kPa)', 'mα'], rows, 'slices');

    // phreatic coordinates table
    var pts = [];
    var xEnd = ph.method === 'kozeny' ? ph.exit[0] : ph.exit[0];
    for (var i = 0; i <= 12; i++) { var x = ph.xA + (xEnd - ph.xA) * i / 12; pts.push([B.round(x, 2), B.round(ph.y(x), 3), B.round(v.FL + ph.y(x), 3)]); }
    r.table('Phreatic line coordinates', ['x from u/s toe (m)', 'y above base (m)', 'Level (m)'], pts, 'phreatic');

    r.result('Seepage q per metre', ph.q, 'm³/s', 9);
    r.result('Seepage per metre per day', qDay, 'm³/day', 4);
    r.result('Wave height hw', hw, 'm', 3);
    r.result('Required freeboard (set-up + run-up)', fbReq, 'm', 3);
    r.result('Freeboard provided above FRL', fbF, 'm', 3);
    r.result('Minimum Bishop FS (grid)', crit.bishop, '—', 3);
    r.result('Fellenius FS on that circle', crit.fel, '—', 3);
    if (given) { r.result('Given circle — Bishop FS', given.bishop, '—', 3); r.result('Given circle — Fellenius FS', given.fel, '—', 3); }

    r.check('Freeboard above FRL ≥ wave requirement', fbF >= fbReq, f(fbF, 2) + ' m', '≥ ' + f(fbReq, 2) + ' m');
    r.check('Freeboard above FRL ≥ minimum', fbF >= v.fbMin, f(fbF, 2) + ' m', '≥ ' + f(v.fbMin, 2) + ' m', 'verify clause');
    r.check('Freeboard above MWL ≥ minimum', fbM >= v.fbMinM, f(fbM, 2) + ' m', '≥ ' + f(v.fbMinM, 2) + ' m', 'verify clause');
    r.check('Minimum Bishop FS, d/s slope', crit.bishop >= v.FSreq, f(crit.bishop, 3), '≥ ' + f(v.FSreq, 2), 'IS 7894 (verify Table)');
    if (given) r.check('Given circle — Bishop FS', given.bishop >= v.FSreq, f(given.bishop, 3), '≥ ' + f(v.FSreq, 2));
    if (!filter) r.check('Phreatic line exit on d/s face', false, f(ph.exit[1], 2) + ' m above toe', 'should be intercepted by a filter', 'seepage face can cause sloughing — provide a toe filter');
    if (filter) r.check('Phreatic line stays inside the dam (meets filter)', ph.exit[0] <= g.xT, 'vertex x = ' + f(ph.exit[0], 2) + ' m', '≤ toe ' + f(g.xT, 2) + ' m');
    if (h / g.Hd > 0.95) r.warn('Water depth is very close to the dam height.');
    r.data = { g: g, ph: ph, crit: crit, given: given, v: v, h: h };
    return r;
  }

  function drawings(v, rep) {
    var D = rep.data, g = D.g, ph = D.ph, Hd = g.Hd, FL = v.FL;
    var d = new Drawing({ title: 'Earth dam section, phreatic line and slip circle' });
    var xl = -0.15 * g.xT, xr = g.xT * 1.15, dep = Math.max(v.Df, 0.08 * Hd);
    var body = [[0, 0], [g.xT, 0], [g.xb, Hd], [g.xa, Hd]];
    d.hatch([[xl, 0], [xr, 0], [xr, -dep], [xl, -dep]], 'soil', { outline: false });
    d.line(xl, 0, xr, 0, 'SOIL');
    d.line(xl, -v.Df, xr, -v.Df, 'SOIL', { dash: true });
    d.text(xr, -v.Df, 'FIRM STRATUM', { ha: 'r', va: 't', dy: -0.8, h: 2 });
    d.hatch(body, 'soil');
    if (v.drain === 'filter') {
      var t = Math.min(1.0, Hd * 0.1), x0 = g.xT - v.Lf;
      d.hatch([[x0, 0], [g.xT, 0], [g.xT - g.zd * t, t], [x0, t]], 'filter');
      d.text(x0 + v.Lf / 2, t, 'TOE FILTER', { ha: 'c', va: 'b', dy: 0.8, h: 2 });
    }
    // reservoir
    var h = D.h;
    d.hatch([[xl, 0], [0, 0], [g.zu * h, h], [xl, h]], 'water', { outline: false });
    d.line(xl, h, g.zu * h, h, 'WATER');
    // phreatic line
    var pts = [], xe = ph.exit[0];
    for (var i = 0; i <= 40; i++) { var x = ph.xA + (xe - ph.xA) * i / 40; pts.push([x, ph.y(x)]); }
    if (ph.method !== 'kozeny') pts.push([xe, ph.exit[1]]);
    d.pline(pts, 'WATER', { dash: true, w: 0.4 });
    var mid = pts[Math.floor(pts.length * 0.45)];
    d.text(mid[0], mid[1], 'PHREATIC LINE', { ha: 'l', va: 'b', dy: 1, h: 2 });
    // slip circle(s)
    function circ(c, label, below) {
      var aL = B.deg(Math.atan2(ground(g, c.xL) - c.yc, c.xL - c.xc)), aR = B.deg(Math.atan2(ground(g, c.xR) - c.yc, c.xR - c.xc));
      d.arc(c.xc, c.yc, c.R, Math.min(aL, aR), Math.max(aL, aR), 'CENTRE');
      d.line(c.xc, c.yc, c.xL, ground(g, c.xL), 'CENTRE', { dash: true });
      d.line(c.xc, c.yc, c.xR, ground(g, c.xR), 'CENTRE', { dash: true });
      d.circle(c.xc, c.yc, Math.max(0.3, 0.006 * g.xT), 'CENTRE');
      d.text(c.xc, c.yc, label, { ha: 'l', va: below ? 't' : 'b', dx: 2, dy: below ? -1 : 1, h: 2.2 });
    }
    circ(D.crit, 'CRITICAL: Bishop FS = ' + f(D.crit.bishop, 2) + ', Fellenius ' + f(D.crit.fel, 2), !!D.given);
    if (D.given) circ(D.given, 'GIVEN: Bishop FS = ' + f(D.given.bishop, 2) + ', Fellenius ' + f(D.given.fel, 2), false);
    // levels and dims
    d.level(g.xa + g.bc / 2, Hd, 'CREST ' + f(v.crest, 3), {});
    d.level(xl + 0.02 * g.xT, h, 'FRL ' + f(v.FRL, 3), {});
    var hM = v.MWL - FL;
    if (hM > h + 1e-6) { d.line(xl, hM, g.zu * hM, hM, 'WATER', { dash: true }); d.level(g.zu * hM - 0.01 * g.xT, hM, 'MWL ' + f(v.MWL, 3), { side: 'l' }); }
    d.level(xr, 0, 'BASE ' + f(FL, 3), {});
    d.dimH(g.xa, g.xb, Hd, -6);
    d.dimH(0, g.xT, -dep, 10);
    d.dimV(xl, 0, Hd, 8);
    d.text(g.xa / 2, Hd / 2, f(v.zu, 1) + ' : 1', { ha: 'r', va: 'b', h: 2.2 });
    d.text(g.xb + (g.xT - g.xb) / 2, Hd / 2, f(v.zd, 1) + ' : 1', { ha: 'l', va: 'b', dx: 2, h: 2.2 });
    d.flow(xl + 0.05 * g.xT, -dep * 0.5, 0, '');
    return [{ key: 'section', title: 'Earth dam — seepage and slope stability / मिट्टी का बाँध', d: d }];
  }

  return {
    fns: { geometry: geometry, ground: ground, phreatic: phreatic, waveHeight: waveHeight, windSetup: windSetup, circleFS: circleFS, gridSearch: gridSearch },
    pages: [
      { id: 'earth-dam', group: 'D', order: 2, hi: 'मिट्टी का बाँध', en: 'Earth dam: seepage, freeboard, slope stability', refs: 'Casagrande/Kozeny; IS 10635; IS 7894 (Fellenius, Bishop)',
        intro: 'Homogeneous earth dam: phreatic line and seepage, freeboard by wave height and wind set-up, and d/s slope stability by the method of slices.',
        inputs: inputs, design: design, drawings: drawings }
    ]
  };
});
