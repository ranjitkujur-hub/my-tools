/* C6. Cross-drainage works / क्रॉस ड्रेनेज कार्य (IS 7784)
 * - Syphon aqueduct / barrels: drain under the canal through box barrels;
 *   barrel head loss (entry + friction + exit), afflux, uplift on roof and floor.
 * - Aqueduct: canal carried in a flumed trough over an open drain; afflux
 *   by Molesworth, trough hydraulics, clearance, STAAD trough frame. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../core/index.js'));
  else root.DS.register(factory(root.DS));
})(typeof self !== 'undefined' ? self : this, function (DS) {
  'use strict';
  var B = DS.base, Drawing = DS.Drawing, f = B.f, G = B.G, GW = B.GAMMA_W;

  /* ---------- formulas ---------- */
  function laceyP(Q) { return 4.75 * Math.sqrt(Q); }
  // Barrel head loss: h = (Ke + Kx + 2g n² L / R^(4/3)) V²/2g
  function barrelLoss(V, n, L, R, Ke, Kx) {
    var Kf = 2 * G * n * n * L / Math.pow(R, 4 / 3);
    return { Kf: Kf, h: (Ke + Kx + Kf) * V * V / (2 * G) };
  }
  // Molesworth: h = (V²/17.88 + 0.0152) ((A/a)² − 1), V = velocity in the unobstructed stream
  function molesworth(V, A, a) { return (V * V / 17.88 + 0.0152) * (Math.pow(A / a, 2) - 1); }
  // Manning normal depth in a rectangular channel of width b
  function normalDepthRect(Q, b, n, S) {
    return B.solveUp(function (y) { var A = b * y, R = A / (b + 2 * y); return A * Math.pow(R, 2 / 3) * Math.sqrt(S) / n; }, Q, 1e-6, 1);
  }
  // Thickness so that slab weight resists uplift head h with factor FS: t = FS γw h / γc
  function roofThickness(h, gc, FS) { return h > 0 ? FS * GW * h / gc : 0; }
  // Floor of an empty barrel: γc t ≥ FS γw (WT − (top − t))  →  t = FS γw (WT − top) / (γc − FS γw)
  function floorThickness(WT, top, gc, FS) { return WT > top ? FS * GW * (WT - top) / (gc - FS * GW) : 0; }

  /* ---------- inputs ---------- */
  var isBarrel = function (v) { return v.type === 'barrel'; };
  var isAq = function (v) { return v.type === 'aqueduct'; };
  var inputs = [
    { sec: 'प्रकार / Type of work' },
    { key: 'type', hi: 'कार्य', en: 'Cross-drainage work', type: 'select', def: 'barrel',
      options: [['barrel', 'Syphon aqueduct — drain through box barrels under the canal'], ['aqueduct', 'Aqueduct — canal in a trough over an open drain']] },
    { sec: 'नाला / Drain' },
    { key: 'Qd', hi: 'नाले का डिज़ाइन डिस्चार्ज', en: 'Drain design discharge', unit: 'm³/s', def: 120, min: 0.5, max: 20000 },
    { key: 'dHFL', hi: 'नाले का HFL (अनुप्रवाह)', en: 'Drain HFL downstream of the work', unit: 'm', def: 100, min: -500, max: 9000 },
    { key: 'dBed', hi: 'नाले का तल स्तर', en: 'Drain bed level', unit: 'm', def: 97, min: -500, max: 9000 },
    { key: 'flumeMin', hi: 'न्यूनतम फ्लूमिंग अनुपात', en: 'Minimum waterway / Lacey P', unit: '—', def: 0.5, min: 0.1, max: 1.5,
      help: 'Drainage waterway is often flumed to 50–75% of Lacey’s perimeter (verify for site).' },
    { sec: 'बैरल (साइफन एक्वाडक्ट) / Barrels (syphon aqueduct only)' },
    { key: 'nb', hi: 'बैरल संख्या', en: 'Number of barrels (cells)', unit: 'nos', def: 9, min: 1, max: 30, show: isBarrel },
    { key: 'Bb', hi: 'बैरल चौड़ाई', en: 'Clear width of each barrel', unit: 'm', def: 3, min: 0.5, max: 10, show: isBarrel },
    { key: 'Hb', hi: 'बैरल ऊँचाई', en: 'Clear height of barrel', unit: 'm', def: 2.5, min: 0.5, max: 8, show: isBarrel },
    { key: 'Lb', hi: 'बैरल लंबाई', en: 'Barrel length (along drain)', unit: 'm', def: 30, min: 2, max: 500, show: isBarrel },
    { key: 'invert', hi: 'बैरल इनवर्ट स्तर', en: 'Barrel invert (floor top) level', unit: 'm', def: 96.5, min: -500, max: 9000, show: isBarrel },
    { key: 'nM', hi: 'मैनिंग n', en: "Manning's n of barrel", unit: '—', def: 0.015, min: 0.009, max: 0.04, show: isBarrel },
    { key: 'Ke', hi: 'प्रवेश हानि गुणांक', en: 'Entry loss coefficient Ke', unit: '—', def: 0.5, min: 0, max: 1.5, show: isBarrel },
    { key: 'Kx', hi: 'निकास हानि गुणांक', en: 'Exit loss coefficient Kx', unit: '—', def: 1, min: 0, max: 1.5, show: isBarrel },
    { key: 'tw', hi: 'दीवार मोटाई', en: 'Wall thickness', unit: 'm', def: 0.4, min: 0.15, max: 2, show: isBarrel },
    { key: 'tr', hi: 'छत मोटाई', en: 'Roof slab thickness', unit: 'm', def: 0.7, min: 0.15, max: 2, show: isBarrel },
    { key: 'tf', hi: 'फ़र्श मोटाई', en: 'Floor slab thickness', unit: 'm', def: 0.6, min: 0.15, max: 3, show: isBarrel },
    { key: 'Vmax', hi: 'अनुमेय वेग', en: 'Permissible barrel velocity', unit: 'm/s', def: 3, min: 0.5, max: 8, show: isBarrel },
    { key: 'affMax', hi: 'अनुमेय एफ़्लक्स', en: 'Permissible afflux', unit: 'm', def: 0.6, min: 0.05, max: 5 },
    { sec: 'खुला जलमार्ग (एक्वाडक्ट) / Open waterway (aqueduct only)' },
    { key: 'nsp', hi: 'स्पैन संख्या', en: 'Number of spans', unit: 'nos', def: 5, min: 1, max: 60, show: isAq },
    { key: 'span', hi: 'स्पैन (स्पष्ट)', en: 'Clear span', unit: 'm', def: 8, min: 1, max: 40, show: isAq },
    { key: 'pierW', hi: 'पियर चौड़ाई', en: 'Pier width', unit: 'm', def: 1.2, min: 0.3, max: 5, show: isAq },
    { key: 'Wnat', hi: 'नाले की प्राकृतिक चौड़ाई (0 = लेसी)', en: 'Natural drain width at HFL (0 = Lacey P)', unit: 'm', def: 0, min: 0, max: 5000, show: isAq },
    { key: 'clear', hi: 'सॉफ़िट निकासी', en: 'Clearance: trough soffit above u/s HFL', unit: 'm', def: 0.6, min: 0, max: 5, show: isAq },
    { sec: 'नहर / Canal' },
    { key: 'Qc', hi: 'नहर डिस्चार्ज', en: 'Canal discharge', unit: 'm³/s', def: 25, min: 0.1, max: 3000 },
    { key: 'cFSL', hi: 'नहर FSL', en: 'Canal FSL', unit: 'm', def: 104, min: -500, max: 9000 },
    { key: 'Dc', hi: 'नहर जल गहराई', en: 'Canal full supply depth', unit: 'm', def: 2, min: 0.2, max: 15 },
    { key: 'bc', hi: 'नहर तल चौड़ाई', en: 'Canal bed width', unit: 'm', def: 12, min: 0.5, max: 300 },
    { key: 'zc', hi: 'नहर पार्श्व ढाल', en: 'Canal side slope (H:V)', unit: 'H:V', def: 1.5, min: 0, max: 4 },
    { key: 'Bt', hi: 'ट्रफ स्पष्ट चौड़ाई', en: 'Trough clear width (flumed)', unit: 'm', def: 8, min: 0.5, max: 100, show: isAq },
    { key: 'nT', hi: 'ट्रफ मैनिंग n', en: "Trough Manning's n", unit: '—', def: 0.016, min: 0.009, max: 0.03, show: isAq },
    { key: 'slopeN', hi: 'ट्रफ ढाल (1 में N)', en: 'Trough bed slope, 1 in N', unit: 'N', def: 2000, min: 100, max: 50000, show: isAq },
    { key: 'tWallT', hi: 'ट्रफ दीवार मोटाई', en: 'Trough wall thickness', unit: 'm', def: 0.35, min: 0.15, max: 2, show: isAq },
    { key: 'tSlabT', hi: 'ट्रफ स्लैब मोटाई', en: 'Trough bottom slab thickness', unit: 'm', def: 0.45, min: 0.15, max: 2, show: isAq },
    { key: 'FBt', hi: 'ट्रफ फ्री बोर्ड', en: 'Trough freeboard', unit: 'm', def: 0.5, min: 0.1, max: 2, show: isAq },
    { sec: 'उत्थान / Uplift' },
    { key: 'gc', hi: 'कंक्रीट इकाई भार', en: 'Unit weight of concrete', unit: 'kN/m³', def: 24, min: 18, max: 26 },
    { key: 'FSu', hi: 'सुरक्षा गुणांक', en: 'Factor of safety against uplift', unit: '—', def: 1.2, min: 1, max: 2 },
    { key: 'WT', hi: 'उप-मृदा जल स्तर (0 = नाला तल)', en: 'Subsoil water level (0 = drain bed level)', unit: 'm', def: 0, min: -500, max: 9000, show: isBarrel },
    { key: 'fck', hi: 'कंक्रीट ग्रेड', en: 'Concrete grade fck (STAAD export)', unit: 'MPa', def: 30, min: 15, max: 60 }
  ];

  /* ---------- design ---------- */
  function design(v) {
    if (v.dHFL <= v.dBed) throw new Error('नाले का HFL तल से ऊपर होना चाहिए / Drain HFL must be above the drain bed');
    var r = new B.Report(), barrel = v.type === 'barrel';
    r.formula('Lacey regime perimeter (drainage waterway): P = 4.75 √Q');
    if (barrel) {
      r.formula('Barrel head loss: h = (Ke + Kx + 2g n² L / R^(4/3)) · V²/2g  (entry + exit + Manning friction)');
      r.formula('Roof uplift: t = FS · γw · (u/s HFL − roof soffit) / γc   (canal empty)');
      r.formula('Floor uplift (barrel empty): t = FS · γw · (WT − invert) / (γc − FS · γw)');
    } else {
      r.formula('Molesworth afflux: h = (V²/17.88 + 0.0152) · [(A/a)² − 1]');
      r.formula("Trough: Manning Q = (1/n) A R^(2/3) S^(1/2); transitions: entry 0.2 Δhv, exit 0.3 Δhv");
      r.formula('Soffit ≥ u/s HFL + clearance; uplift on trough if HFL reaches the soffit');
    }
    r.ref('IS 7784 (Part 1 & 2) — code of practice for design of cross-drainage works (verify clause).');
    r.ref('S.K. Garg, Irrigation Engineering and Hydraulic Structures — aqueducts and syphon aqueducts (Lacey waterway, barrel losses, uplift).');
    if (!barrel) r.ref('Molesworth’s afflux formula (as given in IRC:SP:13 and textbooks — verify).');
    r.assume(barrel ? 'Barrels flow full at design flood; losses: entry Ke, exit Kx and Manning friction.' : 'Unobstructed stream width = natural width at HFL (or Lacey P); velocity V = Qd / (W y).');
    r.assume('Uplift resisted by slab self weight only (no credit for water or fill above) — conservative.');
    if (barrel) r.assume('Roof uplift uses the u/s HFL as the pressure line at entry (velocity head ignored, conservative).');
    else r.assume('Trough flow is uniform at normal depth over the trough length; water surface drops by 1.2 Δhv at entry and recovers 0.7 Δhv at exit.');
    r.limit('Preliminary hydraulic sizing; structural design of barrels/trough to be done separately (see STAAD export).');
    r.limit('Scour, cut-offs, wing walls and canal transitions not covered.');

    var P = laceyP(v.Qd), yd = v.dHFL - v.dBed;
    r.h('1. Drainage waterway (Lacey)');
    r.eq('Lacey P', '4.75 √Qd', '4.75 × √' + f(v.Qd, 2), P, 'm', 2);
    r.data = { barrel: barrel, P: P, yd: yd };
    return barrel ? designBarrel(v, r) : designAqueduct(v, r);
  }

  function designBarrel(v, r) {
    var D = r.data;
    var clear = v.nb * v.Bb;
    r.eq('Clear waterway provided', 'n × B', v.nb + ' × ' + f(v.Bb, 2), clear, 'm', 2);
    r.eq('Fluming ratio', 'waterway / P', '', clear / D.P, '', 3);
    r.h('2. Barrel hydraulics');
    var A = v.nb * v.Bb * v.Hb, V = v.Qd / A, R = v.Bb * v.Hb / (2 * (v.Bb + v.Hb));
    r.eq('Flow area A', 'n B H', '', A, 'm²', 2);
    r.eq('Velocity V', 'Qd / A', f(v.Qd, 2) + ' / ' + f(A, 2), V, 'm/s');
    r.eq('Hydraulic radius R', 'B H / 2(B + H)', '', R, 'm');
    var bl = barrelLoss(V, v.nM, v.Lb, R, v.Ke, v.Kx);
    r.eq('Friction coefficient', '2g n² L / R^(4/3)', '19.62 × ' + v.nM + '² × ' + f(v.Lb, 1) + ' / ' + f(R) + '^(4/3)', bl.Kf, '', 4);
    r.eq('Head loss h', '(Ke + Kx + Kf) V²/2g', '(' + v.Ke + ' + ' + v.Kx + ' + ' + f(bl.Kf, 4) + ') × ' + f(V) + '² / 19.62', bl.h, 'm');
    var uHFL = r.eq('U/s drain HFL', 'd/s HFL + h', '', v.dHFL + bl.h, 'm');
    r.h('3. Uplift');
    var soffit = v.invert + v.Hb, roofTop = soffit + v.tr, cBed = v.cFSL - v.Dc;
    r.eq('Roof soffit level', 'invert + H', '', soffit, 'm');
    var hR = Math.max(uHFL - soffit, 0);
    r.eq('Uplift head on roof', 'u/s HFL − soffit', '', hR, 'm');
    var tRreq = r.eq('Roof thickness required', 'FS γw h / γc', v.FSu + ' × 9.81 × ' + f(hR) + ' / ' + v.gc, roofThickness(hR, v.gc, v.FSu), 'm');
    var WT = v.WT > 0 ? v.WT : v.dBed;
    r.step('Subsoil water level WT = ' + f(WT) + ' m' + (v.WT > 0 ? '' : ' (drain bed level)'));
    var tFreq = r.eq('Floor thickness required', 'FS γw (WT − invert) / (γc − FS γw)', '', floorThickness(WT, v.invert, v.gc, v.FSu), 'm');
    var tFmin = Math.max(tFreq, 0.3);

    r.result('Lacey perimeter P', D.P, 'm', 2);
    r.result('Barrels', v.nb + ' × ' + f(v.Bb, 2) + ' × ' + f(v.Hb, 2), 'm');
    r.result('Barrel velocity', V, 'm/s', 2);
    r.result('Head loss (afflux)', bl.h, 'm');
    r.result('U/s drain HFL', uHFL, 'm');
    r.result('Roof thickness required', tRreq, 'm');
    r.result('Floor thickness required', tFmin, 'm');
    r.check('Waterway vs Lacey (fluming)', clear >= v.flumeMin * D.P - 1e-9, f(clear, 2) + ' m', '≥ ' + f(v.flumeMin * D.P, 2) + ' m', 'verify');
    r.check('Barrel velocity', V <= v.Vmax, f(V, 2) + ' m/s', '≤ ' + f(v.Vmax, 2) + ' m/s', 'verify for lining');
    r.check('Afflux', bl.h <= v.affMax, f(bl.h) + ' m', '≤ ' + f(v.affMax) + ' m');
    r.check('Barrels run full (outlet submerged)', v.dHFL >= soffit, 'd/s HFL ' + f(v.dHFL), '≥ soffit ' + f(soffit));
    r.check('Roof thickness for uplift', v.tr >= tRreq - 1e-9, f(v.tr, 2) + ' m', '≥ ' + f(tRreq) + ' m');
    r.check('Floor thickness for uplift', v.tf >= tFmin - 1e-9, f(v.tf, 2) + ' m', '≥ ' + f(tFmin) + ' m', 'min 0.3 m');
    r.check('Canal bed above barrel roof', cBed >= roofTop - 1e-9, f(cBed) + ' m', '≥ roof top ' + f(roofTop) + ' m');
    if (v.dHFL < soffit) r.warn('Outlet not submerged: barrels may flow part-full; check as a culvert (inlet/outlet control).');
    r.table('Barrel loss components', ['Component', 'Coefficient', 'Loss (m)'], [
      ['Entry', v.Ke, B.round(v.Ke * V * V / (2 * G), 4)], ['Friction', B.round(bl.Kf, 4), B.round(bl.Kf * V * V / (2 * G), 4)],
      ['Exit', v.Kx, B.round(v.Kx * V * V / (2 * G), 4)], ['Total', B.round(v.Ke + v.Kx + bl.Kf, 4), B.round(bl.h, 4)]], 'losses');
    r.table('Levels', ['Item', 'Level (m)'], [['Canal FSL', v.cFSL], ['Canal bed', B.round(cBed, 3)], ['Roof top', B.round(roofTop, 3)],
      ['Roof soffit', B.round(soffit, 3)], ['Barrel invert', v.invert], ['Floor bottom', B.round(v.invert - v.tf, 3)],
      ['U/s drain HFL', B.round(uHFL, 3)], ['D/s drain HFL', v.dHFL], ['Drain bed', v.dBed]], 'levels');
    Object.assign(D, { V: V, h: bl.h, uHFL: uHFL, soffit: soffit, roofTop: roofTop, cBed: cBed, WT: WT });
    return r;
  }

  function designAqueduct(v, r) {
    var D = r.data;
    var W = v.Wnat > 0 ? v.Wnat : D.P, y = D.yd, clear = v.nsp * v.span;
    r.eq('Clear waterway provided', 'n × span', v.nsp + ' × ' + f(v.span, 2), clear, 'm', 2);
    r.eq('Fluming ratio', 'waterway / P', '', clear / D.P, '', 3);
    r.h('2. Afflux (Molesworth)');
    r.step('Unobstructed width W = ' + f(W, 2) + ' m' + (v.Wnat > 0 ? '' : ' (= Lacey P)') + ', depth y = HFL − bed = ' + f(y) + ' m');
    var A = W * y, a = Math.min(clear, W) * y, V = v.Qd / A;
    r.eq('A (unobstructed)', 'W y', '', A, 'm²', 2);
    r.eq('a (at the work)', 'clear waterway × y', '', a, 'm²', 2);
    r.eq('V', 'Qd / A', '', V, 'm/s');
    var h = r.eq('Afflux h', '(V²/17.88 + 0.0152)((A/a)² − 1)', '(' + f(V) + '²/17.88 + 0.0152)((' + f(A, 1) + '/' + f(a, 1) + ')² − 1)', Math.max(molesworth(V, A, a), 0), 'm');
    var uHFL = r.eq('U/s drain HFL', 'd/s HFL + h', '', v.dHFL + h, 'm');
    r.eq('Velocity through openings', 'Qd / a', '', v.Qd / a, 'm/s');

    r.h('3. Canal trough');
    var S = 1 / v.slopeN, Ac = (v.bc + v.zc * v.Dc) * v.Dc, Vc = v.Qc / Ac;
    r.eq('Canal velocity Vc', 'Qc / [(b + zD) D]', '', Vc, 'm/s');
    var yt = normalDepthRect(v.Qc, v.Bt, v.nT, S);
    r.eq('Normal depth in trough yt', 'Manning, b = ' + f(v.Bt, 2) + ' m, S = 1/' + v.slopeN, '', yt, 'm');
    var Vt = v.Qc / (v.Bt * yt), Fr = Vt / Math.sqrt(G * yt);
    r.eq('Trough velocity Vt', 'Qc / (b yt)', '', Vt, 'm/s');
    r.eq('Froude number', 'Vt / √(g yt)', '', Fr, '', 3);
    var dhv = (Vt * Vt - Vc * Vc) / (2 * G);
    r.eq('Δhv', '(Vt² − Vc²) / 2g', '', dhv, 'm', 4);
    var Lt = v.nsp * v.span + (v.nsp - 1) * v.pierW;
    r.eq('Trough length Lt', 'n span + (n − 1) pier', '', Lt, 'm', 2);
    var lossIn = 0.2 * Math.max(dhv, 0), lossOut = 0.3 * Math.max(dhv, 0), lossF = S * Lt, lossT = lossIn + lossF + lossOut;
    r.step('Losses: entry 0.2Δhv = ' + f(lossIn, 4) + ', friction S·Lt = ' + f(lossF, 4) + ', exit 0.3Δhv = ' + f(lossOut, 4) + ' m');
    r.eq('Total head loss', 'sum', '', lossT, 'm', 4);
    var wsIn = v.cFSL - 1.2 * Math.max(dhv, 0), tBed = wsIn - yt, wallH = yt + v.FBt, soffit = tBed - v.tSlabT;
    r.eq('Water level at trough entry', 'FSL − 1.2 Δhv', '', wsIn, 'm');
    r.eq('Trough bed level', 'entry WL − yt', '', tBed, 'm');
    r.eq('Trough wall height (clear)', 'yt + freeboard', '', wallH, 'm');
    r.eq('Trough soffit level', 'trough bed − slab', '', soffit, 'm');
    r.eq('D/s canal FSL', 'FSL − total loss', '', v.cFSL - lossT, 'm');
    r.h('4. Clearance and uplift on trough');
    var clr = soffit - uHFL;
    r.eq('Clearance', 'soffit − u/s HFL', '', clr, 'm');
    var hU = Math.max(uHFL - soffit, 0), tU = roofThickness(hU, v.gc, v.FSu);
    r.eq('Uplift head on trough slab', 'max(u/s HFL − soffit, 0)', '', hU, 'm');
    if (hU > 0) r.eq('Slab thickness for uplift (trough empty)', 'FS γw h / γc', '', tU, 'm');

    r.result('Lacey perimeter P', D.P, 'm', 2);
    r.result('Waterway', v.nsp + ' × ' + f(v.span, 2), 'm');
    r.result('Afflux (Molesworth)', h, 'm');
    r.result('U/s drain HFL', uHFL, 'm');
    r.result('Trough water depth yt', yt, 'm');
    r.result('Trough velocity', Vt, 'm/s', 2);
    r.result('Trough bed level', tBed, 'm');
    r.result('Trough wall height', wallH, 'm', 2);
    r.result('Head loss across work', lossT, 'm', 3);
    r.result('Clearance below soffit', clr, 'm');
    r.check('Waterway vs Lacey (fluming)', clear >= v.flumeMin * D.P - 1e-9, f(clear, 2) + ' m', '≥ ' + f(v.flumeMin * D.P, 2) + ' m', 'verify');
    r.check('Afflux', h <= v.affMax, f(h) + ' m', '≤ ' + f(v.affMax) + ' m');
    r.check('Trough flow subcritical', Fr < 0.8, f(Fr, 3), '< 0.8');
    r.check('Trough velocity', Vt <= 3, f(Vt, 2) + ' m/s', '≤ 3.0 m/s (verify)');
    r.check('Clearance below trough', clr >= v.clear - 1e-9, f(clr) + ' m', '≥ ' + f(v.clear) + ' m');
    r.check('Trough slab vs uplift', hU <= 0 || v.tSlabT >= tU, hU > 0 ? f(v.tSlabT, 2) + ' m' : 'no uplift', hU > 0 ? '≥ ' + f(tU) + ' m' : 'soffit above HFL');
    r.table('Levels', ['Item', 'Level (m)'], [['Canal FSL (u/s)', v.cFSL], ['Water level at trough entry', B.round(wsIn, 3)],
      ['Trough bed', B.round(tBed, 3)], ['Trough soffit', B.round(soffit, 3)], ['Trough wall top', B.round(tBed + wallH, 3)],
      ['U/s drain HFL', B.round(uHFL, 3)], ['D/s drain HFL', v.dHFL], ['Drain bed', v.dBed], ['Canal FSL (d/s)', B.round(v.cFSL - lossT, 3)]], 'levels');
    Object.assign(D, { W: W, h: h, uHFL: uHFL, yt: yt, Vt: Vt, tBed: tBed, wallH: wallH, soffit: soffit, Lt: Lt, wsIn: wsIn });
    return r;
  }

  /* ---------- drawings ---------- */
  function drawBarrel(v, D) {
    var d = new Drawing({ title: 'Syphon aqueduct — section through barrels' });
    var n = v.nb, b = v.Bb, tw = v.tw, Wt = n * b + (n + 1) * tw, inv = v.invert, so = D.soffit, top = D.roofTop, cb = D.cBed;
    var fb = inv - v.tf, ext = Math.max(2, 0.15 * Wt), bot = fb - 1.2;
    d.hatch([[-ext, Math.max(cb, top)], [0, Math.max(cb, top)], [0, fb], [Wt, fb], [Wt, Math.max(cb, top)], [Wt + ext, Math.max(cb, top)], [Wt + ext, bot], [-ext, bot]], 'soil', { outline: false });
    if (cb > top + 1e-6) d.hatch([[0, top], [Wt, top], [Wt, cb], [0, cb]], 'soil');
    d.hatch([[-ext, Math.max(cb, top)], [Wt + ext, Math.max(cb, top)], [Wt + ext, v.cFSL], [-ext, v.cFSL]], 'water');
    var outer = [[0, fb], [Wt, fb], [Wt, top], [0, top]];
    d.hatch(outer, 'concrete', { outline: false });
    d.poly(outer, 'CONCRETE');
    for (var i = 0; i < n; i++) {
      var x0 = tw + i * (b + tw);
      d.hatch([[x0, inv], [x0 + b, inv], [x0 + b, so], [x0, so]], 'water');
    }
    d.centre(Wt / 2, bot, Wt / 2, v.cFSL + 1);
    d.level(Wt + ext - 0.3, v.cFSL, 'Canal FSL ' + f(v.cFSL));
    d.level(Wt + ext - 0.3, Math.max(cb, top), 'Canal bed ' + f(cb));
    d.level(-ext + 0.3, so, 'Soffit ' + f(so), { side: 'l' });
    d.level(-ext + 0.3, inv, 'Invert ' + f(inv), { side: 'l' });
    d.level(-ext + 0.3, D.uHFL, 'Drain HFL (u/s) ' + f(D.uHFL), { side: 'l' });
    d.line(-ext, D.uHFL, 0, D.uHFL, 'WATER', { dash: true });
    d.dimH(tw, tw + b, fb, 6, { text: f(b, 2) });
    d.dimH(0, tw, fb, 6, { text: f(tw, 2) });
    d.dimH(0, Wt, fb, 14, { text: n + ' barrels, overall ' + f(Wt, 2) });
    d.dimV(Wt, inv, so, -6, { text: 'H ' + f(v.Hb, 2) });
    d.dimV(Wt, so, top, -14, { text: 'roof ' + f(v.tr, 2) });
    d.dimV(Wt, fb, inv, -14, { text: 'floor ' + f(v.tf, 2) });
    d.text(Wt / 2, bot, 'SECTION THROUGH BARRELS (looking along the drain), Qd = ' + f(v.Qd, 1) + ' m³/s', { ha: 'c', va: 't', h: 2.8, dy: -20 });
    return d;
  }

  function drawTrough(v, D) {
    var d = new Drawing({ title: 'Aqueduct — trough section' });
    var b = v.Bt, tw = v.tWallT, ts = v.tSlabT, Wt = b + 2 * tw, tb = D.tBed, so = D.soffit, wt = tb + D.wallH;
    d.hatch([[0, so], [Wt, so], [Wt, wt], [Wt - tw, wt], [Wt - tw, tb], [tw, tb], [tw, wt], [0, wt]], 'concrete');
    d.hatch([[tw, tb], [Wt - tw, tb], [Wt - tw, tb + D.yt], [tw, tb + D.yt]], 'water');
    // pier cap below (indicative) and drain HFL
    var cap = Math.min(1.2, Wt * 0.15);
    d.poly([[0, so], [Wt, so], [Wt, so - 0.6], [0, so - 0.6]], 'CONCRETE', { dash: true, w: 0.25 });
    d.text(Wt / 2, so - 0.3, 'pier cap / bearing (indicative)', { ha: 'c', va: 'm', h: 2 });
    d.line(-1.5, D.uHFL, Wt + 1.5, D.uHFL, 'WATER', { dash: true });
    d.centre(Wt / 2, so - 1 - cap, Wt / 2, wt + 1);
    d.level(Wt + 0.5, wt, 'Wall top ' + f(wt));
    d.level(Wt + 0.5, tb + D.yt, 'WL ' + f(tb + D.yt));
    d.level(Wt + 0.5, tb, 'Trough bed ' + f(tb));
    d.level(-1.2, so, 'Soffit ' + f(so), { side: 'l' });
    d.level(-1.2, D.uHFL, 'Drain HFL (u/s) ' + f(D.uHFL), { side: 'l' });
    d.dimH(tw, Wt - tw, wt, -8, { text: 'B ' + f(b, 2) });
    d.dimH(0, Wt, wt, -16, { text: f(Wt, 2) });
    d.dimV(tw, tb, tb + D.yt, -6, { text: 'y ' + f(D.yt, 2) });
    d.dimV(tw, tb + D.yt, wt, -6, { text: 'FB ' + f(v.FBt, 2) });
    d.dimV(0, so, tb, 8, { text: f(ts, 2) });
    d.text(Wt / 2, Math.min(so - 0.6, D.uHFL), 'TROUGH SECTION, Qc = ' + f(v.Qc, 1) + ' m³/s', { ha: 'c', va: 't', h: 2.8, dy: -6 });
    return d;
  }

  function drawElevation(v, D) {
    var d = new Drawing({ title: 'Aqueduct — elevation' });
    var n = v.nsp, s = v.span, p = v.pierW, Lt = D.Lt, so = D.soffit, wt = D.tBed + D.wallH, bed = v.dBed;
    var ab = 1.5, fnd = bed - 1.5, bot = fnd - 0.8;
    d.hatch([[-ab - 3, D.uHFL + 0.3], [-ab, D.uHFL + 0.3], [-ab, bed], [Lt + ab, bed], [Lt + ab, D.uHFL + 0.3], [Lt + ab + 3, D.uHFL + 0.3], [Lt + ab + 3, bot], [-ab - 3, bot]], 'soil', { outline: false });
    d.line(-ab, bed, Lt + ab, bed, 'SOIL');
    for (var i = 0; i < n; i++) d.hatch([[i * (s + p), bed], [i * (s + p) + s, bed], [i * (s + p) + s, v.dHFL], [i * (s + p), v.dHFL]], 'water');
    for (i = 1; i < n; i++) { var x = i * (s + p) - p; d.hatch([[x, fnd], [x + p, fnd], [x + p, so], [x, so]], 'concrete'); }
    d.hatch([[-ab, fnd], [0, fnd], [0, so], [-ab, so]], 'concrete');
    d.hatch([[Lt, fnd], [Lt + ab, fnd], [Lt + ab, so], [Lt, so]], 'concrete');
    d.hatch([[-ab, so], [Lt + ab, so], [Lt + ab, wt], [-ab, wt]], 'concrete');
    d.line(-ab - 3, v.cFSL - v.Dc, -ab, v.cFSL - v.Dc, 'SOIL');
    d.line(0, D.tBed + D.yt, Lt, D.tBed + D.yt, 'WATER', { dash: true });
    d.level(Lt + ab + 0.5, wt, 'Trough top ' + f(wt));
    d.level(Lt + ab + 0.5, so, 'Soffit ' + f(so));
    d.level(-ab - 0.5, v.dHFL, 'HFL u/s ' + f(D.uHFL) + ' / d/s ' + f(v.dHFL), { side: 'l' });
    d.level(-ab - 0.5, bed, 'Drain bed ' + f(bed), { side: 'l' });
    d.dimH(0, s, fnd, 6, { text: 'span ' + f(s, 2) });
    if (n > 1) d.dimH(s, s + p, wt, -8, { text: 'pier ' + f(p, 2) });
    d.dimH(0, Lt, fnd, 14, { text: n + ' spans, trough length ' + f(Lt, 2) });
    d.text(Lt / 2, fnd, 'ELEVATION ALONG CANAL (drain flows towards viewer)', { ha: 'c', va: 't', h: 2.8, dy: -22 });
    return d;
  }

  function drawings(v, rep) {
    var D = rep.data;
    if (D.barrel) return [{ key: 'barrel', title: 'Box barrels — section / बैरल काट', d: drawBarrel(v, D) }];
    return [
      { key: 'trough', title: 'Trough — section / ट्रफ काट', d: drawTrough(v, D) },
      { key: 'elevation', title: 'Aqueduct — elevation / उन्नयन', d: drawElevation(v, D) }
    ];
  }

  function troughModel(v, D) {
    return DS.staad.trough({ width: v.Bt, depth: D.yt, wallH: B.round(D.wallH, 3), tWall: v.tWallT, tSlab: v.tSlabT, fck: v.fck });
  }
  function barrelModel(v, D) {
    // canal water over the roof expressed as an equivalent earth fill of unit weight 18 kN/m³
    var m = DS.staad.boxCulvert({ span: v.Bb, height: v.Hb, nCells: v.nb, tTop: v.tr, tBot: v.tf, tWall: v.tw,
      fill: B.round(Math.max(v.cFSL - D.roofTop, 0) * GW / 18, 3), gammaSoil: 18, K0: 0.5, liveUDL: 0, subgrade: 20000, fck: v.fck });
    m.title = 'SYPHON AQUEDUCT BARRELS PER METRE RUN';
    m.comments.push('Canal water above the roof is entered as an equivalent earth fill (gamma 18 kN/m3) - edit if earth cover exists.');
    return m;
  }
  function exports(v, rep) {
    var D = rep.data;
    if (D.barrel) return [{ label: 'STAAD.Pro .std (barrel box frame)', name: 'syphon-aqueduct-barrels.std', mime: 'text/plain', text: DS.staad.write(barrelModel(v, D)), preview: true }];
    return [{ label: 'STAAD.Pro .std (trough U-frame)', name: 'aqueduct-trough.std', mime: 'text/plain', text: DS.staad.write(troughModel(v, D)), preview: true }];
  }

  return {
    fns: { laceyP: laceyP, barrelLoss: barrelLoss, molesworth: molesworth, normalDepthRect: normalDepthRect, roofThickness: roofThickness,
      floorThickness: floorThickness, troughModel: troughModel },
    pages: [
      { id: 'cross-drainage', group: 'C', order: 6, hi: 'क्रॉस ड्रेनेज कार्य', en: 'Cross-drainage works (aqueduct, syphon aqueduct)', refs: 'IS 7784; Lacey, Molesworth',
        intro: 'Drainage waterway, barrel or open-waterway afflux, canal trough, uplift checks, and a STAAD.Pro frame of the barrel or trough.',
        inputs: inputs, design: design, drawings: drawings, exports: exports,
        guide: ['Download the .std file and open it in STAAD.Pro (licensed software, installed separately).',
          'Check the units (METER KN), member properties, supports and the load cases; edit combination factors to IRC/IS requirements.',
          'Run the analysis and read member forces for the slab and wall design.'] }
    ]
  };
});
