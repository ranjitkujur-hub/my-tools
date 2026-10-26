/* C3. Ogee spillway (IS 6934) and bucket energy dissipator (IS 7365, basic level)
 * WES crest profile, discharge with pier and abutment contraction, design
 * head for the design flood, crest coordinates, ski-jump (trajectory)
 * bucket: velocity, depth, radius guidance, lip level and throw distance. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../core/index.js'));
  else root.DS.register(factory(root.DS));
})(typeof self !== 'undefined' ? self : this, function (DS) {
  'use strict';
  var B = DS.base, Drawing = DS.Drawing, f = B.f, g = B.G;

  /* ---------- formulas ---------- */
  // WES downstream profile (vertical u/s face): x^1.85 = 2 Hd^0.85 y  (y below crest)
  function wesY(x, Hd) { return Math.pow(x, 1.85) / (2 * Math.pow(Hd, 0.85)); }
  // Tangent point with the d/s face of slope z H : 1 V  (dy/dx = 1/z)
  function tangentX(Hd, z) { return Hd * Math.pow(2 / (1.85 * z), 1 / 0.85); }
  function effectiveLength(L, N, Kp, Ka, He) { return L - 2 * (N * Kp + Ka) * He; }
  function discharge(C, L, N, Kp, Ka, He) { return C * effectiveLength(L, N, Kp, Ka, He) * Math.pow(He, 1.5); }
  // Energy head He for a design flood (Le depends on He): bisection
  function headFor(Q, C, L, N, Kp, Ka) {
    var hmax = L / (2 * (N * Kp + Ka) + 1e-9);
    var hi = Math.min(hmax * 0.999, 200);
    if (discharge(C, L, N, Kp, Ka, hi) < Q) return NaN;
    return B.bisect(function (H) { return discharge(C, L, N, Kp, Ka, H) - Q; }, 1e-6, hi, 1e-10);
  }
  /* Upstream three-radius compound curve (WES), radii 0.5, 0.2, 0.04 Hd ending at
   * x = −0.175, −0.276, −0.2818 Hd; arcs are made tangent to one another.
   * Returns arcs [{cx, cy, r, x0, x1}] with y measured upward from the crest. */
  function upstreamArcs(Hd) {
    var R = [0.5, 0.2, 0.04], X = [0, -0.175, -0.276, -0.2818];
    var arcs = [], c = [0, -0.5 * Hd], p = [0, 0];
    for (var i = 0; i < 3; i++) {
      var r = R[i] * Hd;
      if (i > 0) {
        // new centre lies on the line from the joint p towards the previous centre, at distance r
        var dx = c[0] - p[0], dy = c[1] - p[1], len = Math.sqrt(dx * dx + dy * dy);
        c = [p[0] + dx / len * r, p[1] + dy / len * r];
      }
      var x1 = X[i + 1] * Hd, under = r * r - (x1 - c[0]) * (x1 - c[0]);
      var y1 = c[1] + Math.sqrt(Math.max(0, under));
      arcs.push({ cx: c[0], cy: c[1], r: r, x0: p[0], x1: x1, y1: y1 });
      p = [x1, y1];
    }
    return arcs;
  }
  function arcY(a, x) { return a.cy + Math.sqrt(Math.max(0, a.r * a.r - (x - a.cx) * (x - a.cx))); }
  // Ski-jump trajectory: horizontal throw from the lip to the tail-water surface
  function throwDistance(V, thetaDeg, Y) {
    var t = B.rad(thetaDeg), s = Math.sin(t), c = Math.cos(t);
    return V * V / g * c * (s + Math.sqrt(s * s + 2 * g * Y / (V * V)));
  }
  function supercriticalDepth(q, E) {
    var yc = Math.pow(q * q / g, 1 / 3);
    if (E <= 1.5 * yc) return NaN;
    return B.bisect(function (y) { return y + q * q / (2 * g * y * y) - E; }, yc * 1e-5, yc, 1e-12);
  }

  /* ---------- inputs ---------- */
  var inputs = [
    { sec: 'डिज़ाइन बाढ़ एवं क्रेस्ट / Design flood and crest' },
    { key: 'Q', hi: 'डिज़ाइन बाढ़', en: 'Design flood Q', unit: 'm³/s', def: 3000, min: 1, max: 200000 },
    { key: 'L', hi: 'शुद्ध क्रेस्ट लंबाई', en: 'Net clear crest length L (sum of bays)', unit: 'm', def: 90, min: 1, max: 5000 },
    { key: 'N', hi: 'पियरों की संख्या', en: 'Number of piers N', unit: 'nos', def: 5, min: 0, max: 200, step: 1 },
    { key: 'tp', hi: 'पियर की मोटाई', en: 'Pier thickness', unit: 'm', def: 2.5, min: 0, max: 10 },
    { key: 'Kp', hi: 'पियर संकुचन गुणांक', en: 'Pier contraction coefficient Kp', type: 'select', def: '0.01',
      options: [['0.02', 'Square-nosed piers, Kp = 0.02'], ['0.01', 'Round-nosed piers, Kp = 0.01'], ['0', 'Pointed-nose piers, Kp = 0']] },
    { key: 'Ka', hi: 'एबटमेंट संकुचन गुणांक', en: 'Abutment contraction coefficient Ka', type: 'select', def: '0.1',
      options: [['0.2', 'Square abutment, head wall at 90°, Ka = 0.20'], ['0.1', 'Rounded abutment, r = 0.15–0.5 He, Ka = 0.10'], ['0', 'Rounded abutment, r > 0.5 He, Ka = 0']] },
    { key: 'C', hi: 'निस्सरण गुणांक', en: 'Discharge coefficient C (SI)', unit: 'm^½/s', def: 2.18, min: 1.5, max: 2.4,
      help: 'About 2.18 for a high WES crest (P/Hd > 1.33) at design head; lower for low crests or other heads.' },
    { key: 'approach', hi: 'पहुँच वेग शीर्ष', en: 'Approach velocity head', type: 'select', def: 'yes', options: [['yes', 'Include (approach depth P + H)'], ['no', 'Neglect']] },
    { key: 'crest', hi: 'क्रेस्ट स्तर', en: 'Crest level', unit: 'm', def: 250.0, min: -100, max: 9000 },
    { key: 'bed', hi: 'नदी तल / नींव स्तर', en: 'River bed (foundation) level', unit: 'm', def: 200.0, min: -100, max: 9000 },
    { key: 'z', hi: 'डाउनस्ट्रीम ढलान', en: 'Downstream face slope (H:1V)', unit: 'H:V', def: 0.75, min: 0.5, max: 1.5 },
    { sec: 'बकेट ऊर्जा क्षयक / Bucket energy dissipator' },
    { key: 'inv', hi: 'बकेट तल स्तर', en: 'Bucket invert level', unit: 'm', def: 210.0, min: -100, max: 9000 },
    { key: 'R', hi: 'बकेट त्रिज्या', en: 'Bucket radius R', unit: 'm', def: 15, min: 1, max: 100 },
    { key: 'theta', hi: 'लिप कोण', en: 'Lip angle θ', unit: '°', def: 35, min: 10, max: 45 },
    { key: 'TWL', hi: 'टेल वाटर स्तर', en: 'Tail-water level at design flood', unit: 'm', def: 208.0, min: -100, max: 9000 },
    { key: 'loss', hi: 'स्पिलवे सतह पर ऊर्जा हानि', en: 'Energy loss on spillway face', unit: '%', def: 10, min: 0, max: 40 }
  ];

  function design(v) {
    var Kp = B.num(v.Kp), Ka = B.num(v.Ka), N = Math.round(v.N);
    var P = v.crest - v.bed;
    if (P <= 0) throw new Error('क्रेस्ट नदी तल से ऊपर हो / Crest must be above the river bed');
    var He = headFor(v.Q, v.C, v.L, N, Kp, Ka);
    if (!isFinite(He)) throw new Error('क्रेस्ट लंबाई कम है / Crest too short for this flood (effective length becomes ≤ 0)');
    var r = new B.Report();
    r.formula('Q = C · Le · He^(3/2);  Le = L − 2 (N·Kp + Ka) He');
    r.formula('Approach velocity Va = Q / [(L + N·tp)(P + H)], ha = Va²/2g, H = He − ha');
    r.formula('WES downstream profile: x^1.85 = 2 Hd^0.85 · y  (vertical upstream face, Hd = design energy head)');
    r.formula('Tangent point with d/s face z:1 → dy/dx = 1/z → xT = Hd (2/(1.85 z))^(1/0.85)');
    r.formula('Upstream compound curve: radii 0.5 Hd, 0.2 Hd, 0.04 Hd up to x = 0.175, 0.276, 0.2818 Hd upstream of the crest');
    r.formula('Bucket: E = (TEL − invert)(1 − loss) = y1 + q²/(2g y1²); V1 = q/y1; lip level = invert + R(1 − cos θ)');
    r.formula('Throw distance X = (V²/g) cos θ [sin θ + √(sin²θ + 2gY/V²)], Y = lip level − TWL');
    r.ref('IS 6934:1998 Hydraulic design of high ogee overflow spillways — recommendations (verify clause for C, Kp, Ka and the u/s curve).');
    r.ref('IS 7365:2010 Criteria for hydraulic design of bucket type energy dissipators (verify clause for radius and lip angle).');
    r.ref('USBR Design of Small Dams (1987), Ch. 9; US Army Corps of Engineers Hydraulic Design Criteria (WES) charts 111-1 to 111-2.');
    r.assume('Crest shaped for the design energy head Hd = He at the design flood; vertical upstream face.');
    r.assume('Pier and abutment coefficients are the USBR/IS typical values selected above.');
    r.assume('Energy loss on the spillway face taken as ' + f(v.loss, 1) + ' % of the available energy above the bucket invert.');
    r.assume('Flow at the bucket spreads over the gross width L + N·tp.');
    r.limit('C = 2.18 applies near the design head for high crests (P/Hd ≳ 1.33); low crests and other heads need the IS 6934 / USBR charts.');
    r.limit('Ski-jump bucket only works with the lip above tail water and sound rock where the jet lands; scour downstream must be studied (model study for important works).');

    r.h('1. Head over the crest');
    var Le, H = He, ha = 0;
    r.step('Solve Q = C (L − 2(N·Kp + Ka) He) He^1.5 for He: N = ' + N + ', Kp = ' + Kp + ', Ka = ' + Ka + ' → He = ' + f(He, 3) + ' m');
    Le = r.eq('Le', 'L − 2(N·Kp + Ka) He', f(v.L, 2) + ' − 2 × (' + N + ' × ' + Kp + ' + ' + Ka + ') × ' + f(He, 3), effectiveLength(v.L, N, Kp, Ka, He), 'm', 3);
    r.step('Check: Q = ' + f(v.C, 3) + ' × ' + f(Le, 3) + ' × ' + f(He, 3) + '^1.5 = ' + f(discharge(v.C, v.L, N, Kp, Ka, He), 1) + ' m³/s');
    var Wg = v.L + N * v.tp;
    if (v.approach === 'yes') {
      for (var it = 0; it < 60; it++) { var Va = v.Q / (Wg * (P + H)); ha = Va * Va / (2 * g); H = He - ha; }
      r.step('Approach: Va = Q / [(L + N·tp)(P + H)] = ' + f(v.Q, 1) + ' / [' + f(Wg, 2) + ' × (' + f(P, 2) + ' + ' + f(H, 3) + ')] = ' + f(v.Q / (Wg * (P + H)), 3) + ' m/s');
      r.eq('ha', 'Va²/2g', '', ha, 'm', 4);
      r.eq('Head over crest H', 'He − ha', f(He, 3) + ' − ' + f(ha, 4), H, 'm', 3);
    }
    var MWL = v.crest + H, TEL = v.crest + He, Hd = He;
    r.eq('Max water level', 'crest + H', f(v.crest, 3) + ' + ' + f(H, 3), MWL, 'm', 3);
    r.eq('P/Hd', '(crest − bed)/Hd', f(P, 2) + ' / ' + f(Hd, 3), P / Hd, '', 2);

    r.h('2. Crest profile (design head Hd = ' + f(Hd, 3) + ' m)');
    var xT = r.eq('xT', 'Hd (2/(1.85 z))^(1/0.85)', f(Hd, 3) + ' × (2/(1.85 × ' + f(v.z, 2) + '))^(1/0.85)', tangentX(Hd, v.z), 'm', 3);
    var yT = r.eq('yT', 'xT^1.85 / (2 Hd^0.85)', f(xT, 3) + '^1.85 / (2 × ' + f(Hd, 3) + '^0.85)', wesY(xT, Hd), 'm', 3);
    var arcs = upstreamArcs(Hd);
    arcs.forEach(function (a, i) {
      r.step('U/s arc ' + (i + 1) + ': R = ' + f(a.r, 3) + ' m, centre (' + f(a.cx, 3) + ', ' + f(a.cy, 3) + ') from crest, from x = ' + f(a.x0, 3) + ' to ' + f(a.x1, 3) + ' m, y = ' + f(-a.y1, 3) + ' m below crest');
    });
    var step = B.ceilTo(xT / 12, 0.25), rows = [];
    arcs.slice().reverse().forEach(function (a, i) {
      var seg = 'u/s arc R=' + f(a.r, 2);
      rows.push([B.round(a.x1, 3), B.round(-a.y1, 3), B.round(v.crest + a.y1, 3), seg]);
      if (i === 2) { var xm = (a.x0 + a.x1) / 2; rows.push([B.round(xm, 3), B.round(-arcY(a, xm), 3), B.round(v.crest + arcY(a, xm), 3), seg]); }
    });
    for (var x = 0; x < xT - 1e-6; x += step) rows.push([B.round(x, 3), B.round(wesY(x, Hd), 3), B.round(v.crest - wesY(x, Hd), 3), 'WES x^1.85 = 2Hd^0.85 y']);
    rows.push([B.round(xT, 3), B.round(yT, 3), B.round(v.crest - yT, 3), 'tangent point']);
    r.table('Crest profile coordinates (x from crest axis, + downstream; y below crest)', ['x (m)', 'y (m)', 'Level (m)', 'Segment'], rows, 'crest');
    r.step('Coordinates at ' + f(step, 2) + ' m intervals are listed in the table (CSV for AutoCAD/Excel).');

    r.h('3. Bucket (ski-jump) dissipator');
    var q = r.eq('q at bucket', 'Q / (L + N·tp)', f(v.Q, 1) + ' / ' + f(Wg, 2), v.Q / Wg, 'm³/s/m', 3);
    if (v.inv >= v.crest - yT) throw new Error('बकेट तल टैन्जेंट बिंदु से नीचे हो / Bucket invert must be below the tangent point level ' + f(v.crest - yT, 2));
    var E = r.eq('E at invert', '(TEL − invert)(1 − loss)', '(' + f(TEL, 3) + ' − ' + f(v.inv, 3) + ') × ' + f(1 - v.loss / 100, 2), (TEL - v.inv) * (1 - v.loss / 100), 'm', 3);
    var y1 = supercriticalDepth(q, E);
    if (!isFinite(y1)) throw new Error('बकेट पर ऊर्जा अपर्याप्त / Not enough energy at the bucket');
    r.step('Solve y1 + q²/(2g y1²) = E → y1 = ' + f(y1, 3) + ' m');
    var V1 = r.eq('V1', 'q / y1', f(q, 3) + ' / ' + f(y1, 3), q / y1, 'm/s', 2);
    var F1 = r.eq('F1', 'V1/√(g y1)', '', V1 / Math.sqrt(g * y1), '', 2);
    var Rmin = 5 * y1;
    r.eq('Minimum radius (rule of thumb)', '5 y1', '5 × ' + f(y1, 3), Rmin, 'm', 2);
    var pc = r.eq('Centrifugal pressure head on bucket', 'q V1 / (g R)', f(q, 3) + ' × ' + f(V1, 2) + ' / (9.81 × ' + f(v.R, 2) + ')', q * V1 / (g * v.R), 'm', 2);
    var lip = r.eq('Lip level', 'invert + R(1 − cos θ)', f(v.inv, 3) + ' + ' + f(v.R, 2) + ' × (1 − cos ' + f(v.theta, 1) + '°)', v.inv + v.R * (1 - Math.cos(B.rad(v.theta))), 'm', 3);
    var Vl2 = V1 * V1 - 2 * g * (lip - v.inv), Vl = Math.sqrt(Math.max(Vl2, 0));
    r.eq('Velocity at lip', '√(V1² − 2g(lip − invert))', '', Vl, 'm/s', 2);
    var Y = lip - v.TWL, X = NaN;
    if (Y >= 0 && Vl > 0) {
      X = r.eq('Throw distance X', '(V²/g) cos θ [sin θ + √(sin²θ + 2gY/V²)]', 'Y = ' + f(Y, 2) + ' m', throwDistance(Vl, v.theta, Y), 'm', 1);
    } else r.step('Lip is below tail water (Y = ' + f(Y, 2) + ' m): the jet will not spring clear — a roller bucket or stilling basin is needed.');

    r.result('Energy head on crest He (= Hd)', He, 'm', 3);
    if (v.approach === 'yes') r.result('Head over crest H', H, 'm', 3);
    r.result('Maximum water level', MWL, 'm', 3);
    r.result('Effective crest length Le', Le, 'm', 2);
    r.result('Tangent point x, y', f(xT, 2) + ', ' + f(yT, 2), 'm');
    r.result('Tangent point level', v.crest - yT, 'm', 3);
    r.result('Bucket: y1 / V1 / F1', f(y1, 3) + ' / ' + f(V1, 2) + ' / ' + f(F1, 2), 'm, m/s, —');
    r.result('Lip level', lip, 'm', 3);
    r.result('Throw distance from lip', isFinite(X) ? X : 'n/a', 'm', 1);

    r.check('Effective length positive', Le > 0.5 * v.L, f(Le, 2) + ' m', '> 0.5 L');
    r.check('High-crest coefficient valid (P/Hd)', P / Hd >= 1.33, f(P / Hd, 2), '≥ 1.33 for C ≈ 2.18', 'otherwise read C from IS 6934 charts');
    r.check('Bucket radius', v.R >= Rmin, f(v.R, 2) + ' m', '≥ 5 y1 = ' + f(Rmin, 2) + ' m (verify IS 7365)');
    r.check('Lip angle', v.theta >= 20 && v.theta <= 40, f(v.theta, 1) + '°', '20°–40° (usual 30°–35°, verify)');
    r.check('Lip above tail water (ski-jump)', Y > 0, f(Y, 2) + ' m', '> 0');
    r.check('Froude number at bucket', F1 >= 4.5, f(F1, 2), '≥ 4.5 (ski-jump suits high F)');
    if (V1 > 30) r.warn('Velocity at the bucket exceeds 30 m/s: check cavitation and aeration.');
    r.data = { v: v, He: He, Hd: Hd, H: H, MWL: MWL, xT: xT, yT: yT, arcs: arcs, y1: y1, V1: V1, Vl: Vl, lip: lip, X: X, Y: Y, rows: rows, P: P };
    return r;
  }

  /* ---------- drawings ---------- */
  function crestPoints(D, crest, n) {
    var pts = [];
    D.arcs.slice().reverse().forEach(function (a) {
      for (var k = 0; k <= 6; k++) { var x = a.x1 + (a.x0 - a.x1) * k / 6; pts.push([x, crest + arcY(a, x)]); }
    });
    for (var i = 0; i <= n; i++) { var x2 = D.xT * i / n; pts.push([x2, crest - wesY(x2, D.Hd)]); }
    return pts;
  }

  function drawings(v, rep) {
    var D = rep.data, crest = v.crest, Hd = D.Hd, z = v.z, R = v.R, th = B.rad(v.theta);
    var d = new Drawing({ title: 'Ogee spillway section' });
    var xh = D.arcs[2].x1, yh = crest + D.arcs[2].y1;
    // bucket centre so that the d/s face (slope z) is tangent to the bucket circle
    var s = Math.sqrt(1 + z * z), yTl = crest - D.yT;
    var cy = v.inv + R, cx = D.xT + R * s - z * (cy - yTl);
    var nx = 1 / s, ny = z / s;
    var Tx = cx - R * nx, Ty = cy - R * ny;
    var aT = Math.atan2(-ny, -nx), aL = -Math.PI / 2 + th;
    var bucket = [];
    for (var k = 0; k <= 16; k++) { var a = aT + (aL - aT) * k / 16; bucket.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]); }
    var xl = bucket[bucket.length - 1][0], lip = bucket[bucket.length - 1][1];
    var top = [[xh, v.bed], [xh, yh]].concat(crestPoints(D, crest, 14)).concat([[Tx, Ty]]).concat(bucket.slice(1)).concat([[xl, v.bed]]);
    var x0 = xh - Math.max(25, 0.6 * (crest - v.bed)), x1 = xl + Math.max(30, (isFinite(D.X) ? D.X : 0) + 15);
    d.hatch([[x0, v.bed], [x1, v.bed], [x1, v.bed - 5], [x0, v.bed - 5]], 'rock', { outline: false });
    d.line(x0, v.bed, x1, v.bed, 'SOIL');
    d.hatch([[x0, v.bed], [xh, v.bed], [xh, D.MWL], [x0, D.MWL]], 'water');
    if (v.TWL > v.bed) d.hatch([[xl, v.bed], [x1, v.bed], [x1, v.TWL], [xl, Math.min(v.TWL, lip)]], 'water');
    d.hatch(top, 'concrete');
    // upper nappe (approximate) over the crest and down the face
    var nap = [[xh - 2 * Hd, D.MWL], [-Hd, D.MWL - 0.04 * Hd], [0, crest + 0.75 * Hd], [0.5 * D.xT, crest - wesY(0.5 * D.xT, Hd) + 0.45 * Hd],
      [D.xT, yTl + 0.3 * Hd]];
    bucket.forEach(function (p, i) {
      var dep = 0.3 * Hd + (D.y1 - 0.3 * Hd) * Math.min(1, (i + 4) / 8);
      nap.push([p[0] + (cx - p[0]) / R * dep, p[1] + (cy - p[1]) / R * dep]);
    });
    d.pline(nap, 'WATER');
    // trajectory
    if (isFinite(D.X) && D.Vl > 0) {
      var tr = [], Vx = D.Vl * Math.cos(th), Vy = D.Vl * Math.sin(th);
      for (var i = 0; i <= 24; i++) {
        var t = i / 24 * (Vy + Math.sqrt(Vy * Vy + 2 * B.G * D.Y)) / B.G;
        tr.push([xl + Vx * t, lip + Vy * t - B.G * t * t / 2]);
      }
      d.pline(tr, 'WATER', { dash: true });
      d.text(xl + D.X, v.TWL, 'X = ' + f(D.X, 1) + ' m', { ha: 'c', va: 't', dy: -1.5, h: 2.2 });
    }
    d.centre(cx, cy, cx, v.inv);
    d.circle(cx, cy, 0.4, 'CENTRE');
    d.text(cx, cy, 'C, R = ' + f(R, 2), { ha: 'l', va: 'b', dx: 1, dy: 0.5, h: 2.2 });
    d.centre(0, crest + 0.9 * Hd, 0, v.bed);
    // levels
    d.level(x0 + 2, D.MWL, 'MWL ' + f(D.MWL, 3), { side: 'r' });
    d.level(D.xT * 0.5, crest, 'CREST ' + f(crest, 3), { side: 'r' });
    d.level(cx, v.inv, 'BUCKET INVERT ' + f(v.inv, 3), { side: 'l' });
    d.level(xl, lip, 'LIP ' + f(lip, 3), { side: 'r' });
    d.level(x1 - 4, v.TWL, 'TWL ' + f(v.TWL, 3), { side: 'l' });
    d.level(x0 + 2, v.bed, 'BED ' + f(v.bed, 3), { side: 'r' });
    d.dimV(xh, crest, D.MWL, 5, { text: 'H = ' + f(D.H, 2) });
    d.dimV(xh, v.bed, crest, 5, { text: 'P = ' + f(D.P, 2) });
    d.dimH(xh, xl, v.bed - 5, 6);
    d.flow(x0 + 0.5 * (xh - x0), v.bed + 0.4 * (crest - v.bed), 0);

    // crest profile detail with coordinate table
    var c = new Drawing({ title: 'Crest profile coordinates' });
    var pts = crestPoints(D, crest, 24);
    var depth = Math.max(D.yT, 0.3 * Hd);
    var base = crest - depth - 0.2 * Hd;
    c.hatch([[xh, base]].concat(pts).concat([[D.xT, base]]), 'concrete');
    c.line(xh - 0.1 * Hd, crest, D.xT + 0.2 * Hd, crest, 'CENTRE');
    c.line(0, crest + 0.3 * Hd, 0, base, 'CENTRE');
    c.text(0, crest, 'CREST ' + f(crest, 3), { ha: 'l', va: 'b', dx: 1, dy: 1, h: 2.2 });
    c.text(D.xT, crest - D.yT, 'T (' + f(D.xT, 2) + ', ' + f(D.yT, 2) + ')', { ha: 'l', va: 'm', dx: 1.5, h: 2.2 });
    var marks = D.rows.filter(function (row) { return row[0] > 0 && row[3].indexOf('WES') === 0; });
    marks.forEach(function (row) { c.line(row[0], crest, row[0], crest - row[1], 'DIM'); });
    c.text(D.xT + 0.2 * Hd, crest, 'x →', { ha: 'l', va: 'm', dx: 1, h: 2.2 });
    c.text(xh, crest - 0.5 * depth, 'y ↓ below crest', { ha: 'r', va: 'm', dx: -2, h: 2.2 });
    // table
    var tx = D.xT + 0.6 * Hd + 4, rowH = Math.max(0.12 * Hd, depth / 10), ty = crest + 0.3 * Hd;
    var cw = Math.max(0.55 * Hd, 2.5);
    c.text(tx, ty, 'x (m)', { ha: 'l', va: 'b', h: 2.2 });
    c.text(tx + cw, ty, 'y (m)', { ha: 'l', va: 'b', h: 2.2 });
    c.text(tx + 2 * cw, ty, 'Level (m)', { ha: 'l', va: 'b', h: 2.2 });
    D.rows.forEach(function (row, i) {
      var yy = ty - (i + 1) * rowH;
      c.text(tx, yy, f(row[0], 3), { ha: 'l', va: 'b', h: 2 });
      c.text(tx + cw, yy, f(row[1], 3), { ha: 'l', va: 'b', h: 2 });
      c.text(tx + 2 * cw, yy, f(row[2], 3), { ha: 'l', va: 'b', h: 2 });
    });
    c.line(tx - 0.2, ty - 0.25 * rowH, tx + 3.2 * cw, ty - 0.25 * rowH, 'DIM');
    return [
      { key: 'section', title: 'Ogee spillway with bucket — section / ओगी स्पिलवे काट', d: d },
      { key: 'crest', title: 'Crest profile coordinates / क्रेस्ट प्रोफ़ाइल निर्देशांक', d: c }
    ];
  }

  return {
    fns: { wesY: wesY, tangentX: tangentX, effectiveLength: effectiveLength, discharge: discharge, headFor: headFor,
      upstreamArcs: upstreamArcs, arcY: arcY, throwDistance: throwDistance, supercriticalDepth: supercriticalDepth },
    pages: [{
      id: 'ogee-spillway', group: 'C', order: 3, hi: 'ओगी स्पिलवे एवं बकेट', en: 'Ogee spillway and bucket',
      refs: 'IS 6934; IS 7365; USBR / WES',
      intro: 'Design head for the design flood with pier and abutment contraction, WES crest profile and coordinates, and a ski-jump bucket at a basic level.',
      inputs: inputs, design: design, drawings: drawings
    }]
  };
});
