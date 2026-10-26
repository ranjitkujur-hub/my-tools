/* C2. Hydraulic jump and stilling basins / हाइड्रॉलिक जंप एवं स्टिलिंग बेसिन (IS 4997)
 * Pre-jump depth from the energy equation, Froude number, sequent depth,
 * apron (basin floor) level to suit the tail water, basin type selection
 * (USBR basins, to which the IS 4997 basin types broadly correspond),
 * basin length, chute blocks, baffle piers and end sill. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../core/index.js'));
  else root.DS.register(factory(root.DS));
})(typeof self !== 'undefined' ? self : this, function (DS) {
  'use strict';
  var B = DS.base, Drawing = DS.Drawing, f = B.f, g = B.G;

  /* ---------- formulas ---------- */
  function criticalDepth(q) { return Math.pow(q * q / g, 1 / 3); }
  // Supercritical depth with specific energy E for discharge per metre q
  function supercriticalDepth(q, E) {
    var yc = criticalDepth(q);
    if (E <= 1.5 * yc) return NaN;
    return B.bisect(function (y) { return y + q * q / (2 * g * y * y) - E; }, yc * 1e-5, yc, 1e-12);
  }
  function froude(V, y) { return V / Math.sqrt(g * y); }
  // Bélanger: y2 = y1/2 (√(1 + 8F1²) − 1)
  function sequentDepth(y1, F1) { return y1 / 2 * (Math.sqrt(1 + 8 * F1 * F1) - 1); }
  // Energy loss in the jump ΔE = (y2 − y1)³ / (4 y1 y2)
  function jumpLoss(y1, y2) { return Math.pow(y2 - y1, 3) / (4 * y1 * y2); }

  // State at a floor level z: E1 = (TEL − z)(1 − loss)
  function jumpAt(q, TEL, z, loss) {
    var E1 = (TEL - z) * (1 - (loss || 0));
    var y1 = supercriticalDepth(q, E1);
    if (!isFinite(y1)) return null;
    var V1 = q / y1, F1 = froude(V1, y1), y2 = sequentDepth(y1, F1);
    return { z: z, E1: E1, y1: y1, V1: V1, F1: F1, y2: y2 };
  }

  // Floor level at which the tail-water depth equals k·y2 (bisection on z)
  function requiredFloor(q, TEL, TWL, loss, k) {
    var yc = criticalDepth(q);
    var zHi = Math.min(TWL, TEL - 1.5 * yc - 1e-3);
    var fn = function (z) { var s = jumpAt(q, TEL, z, loss); return s ? (TWL - z) - k * s.y2 : NaN; };
    if (fn(zHi) >= 0) return zHi;     // tail water deep enough even at the highest possible floor
    var zLo = zHi, n = 0;
    while (fn(zLo) < 0 && n++ < 400) zLo -= 0.25;
    if (n >= 400) return NaN;
    return B.bisect(fn, zLo, zLo + 0.25, 1e-7);
  }

  /* USBR (Peterka, EM 25) basin selection. IS 4997 types correspond broadly — verify clause. */
  function basinType(F1, V1) {
    if (F1 < 1.7) return { id: 'none', name: 'No baffled basin needed (undular jump)', Lf: 4.0, tw: 1.0 };
    if (F1 < 2.5) return { id: 'I', name: 'Pre-jump: plain basin (USBR Basin I form)', Lf: 5.0, tw: 1.0 };
    if (F1 < 4.5) return { id: 'IV', name: 'Oscillating jump: USBR Basin IV (deflector blocks)', Lf: 6.0, tw: 1.1 };
    if (V1 < 18) return { id: 'III', name: 'Steady jump: USBR Basin III (chute blocks, baffle piers, end sill)', Lf: 2.7, tw: 1.0 };
    return { id: 'II', name: 'High velocity: USBR Basin II (chute blocks, dentated end sill)', Lf: 4.3, tw: 1.05 };
  }

  /* ---------- inputs ---------- */
  var inputs = [
    { sec: 'प्रवाह / Flow' },
    { key: 'Q', hi: 'डिज़ाइन डिस्चार्ज', en: 'Design discharge Q', unit: 'm³/s', def: 600, min: 0.1, max: 100000 },
    { key: 'Bw', hi: 'बेसिन की चौड़ाई', en: 'Basin width (clear)', unit: 'm', def: 60, min: 0.5, max: 5000 },
    { key: 'usWL', hi: 'अपस्ट्रीम जल स्तर', en: 'Upstream water level', unit: 'm', def: 110.0, min: -100, max: 9000 },
    { key: 'ha', hi: 'पहुँच वेग शीर्ष', en: 'Approach velocity head', unit: 'm', def: 0, min: 0, max: 10 },
    { key: 'loss', hi: 'ग्लेसिस पर ऊर्जा हानि', en: 'Energy loss on glacis/chute (% of available energy)', unit: '%', def: 0, min: 0, max: 40,
      help: '0 % is conservative for the jump (highest velocity).' },
    { key: 'TWL', hi: 'टेल वाटर स्तर', en: 'Tail-water level for this discharge', unit: 'm', def: 103.0, min: -100, max: 9000 },
    { key: 'bed', hi: 'डाउनस्ट्रीम नदी तल', en: 'Downstream river bed level', unit: 'm', def: 99.0, min: -100, max: 9000 },
    { sec: 'बेसिन / Basin' },
    { key: 'mode', hi: 'विधि', en: 'Basin floor level', type: 'select', def: 'design', options: [['design', 'Compute floor level to suit tail water'], ['check', 'Check a given floor level']] },
    { key: 'zGiven', hi: 'दिया गया फर्श स्तर', en: 'Given basin floor level', unit: 'm', def: 97.5, min: -100, max: 9000, show: function (v) { return v.mode === 'check'; } },
    { key: 'k', hi: 'टेल वाटर गुणक', en: 'Tail-water factor (TW depth ≥ k·y2)', unit: '—', def: 1.0, min: 0.8, max: 1.3 },
    { sec: 'चित्र हेतु / For the drawing' },
    { key: 'crest', hi: 'क्रेस्ट स्तर', en: 'Crest level', unit: 'm', def: 107.0, min: -100, max: 9000 },
    { key: 'usFloor', hi: 'अपस्ट्रीम फर्श स्तर', en: 'Upstream floor level', unit: 'm', def: 104.0, min: -100, max: 9000 },
    { key: 'glacis', hi: 'ग्लेसिस ढलान', en: 'Glacis slope (H:1V)', unit: 'H:V', def: 2, min: 0.5, max: 6 },
    { key: 't', hi: 'फर्श मोटाई', en: 'Floor thickness (drawing only)', unit: 'm', def: 1.2, min: 0.2, max: 6 }
  ];

  function design(v) {
    var TEL = v.usWL + v.ha, q = v.Q / v.Bw, loss = v.loss / 100;
    if (v.TWL >= TEL) throw new Error('टेल वाटर ऊर्जा रेखा से नीचे हो / Tail-water level must be below the upstream energy line');
    var r = new B.Report();
    r.formula('Discharge per metre q = Q / B; critical depth yc = (q²/g)^(1/3)');
    r.formula('Energy at the toe: E1 = (TEL − z)(1 − loss) = y1 + q²/(2g y1²)  → solve for the supercritical y1');
    r.formula('F1 = V1 / √(g y1)');
    r.formula('Sequent depth (Bélanger): y2 = (y1/2)[√(1 + 8F1²) − 1]');
    r.formula('Energy loss: ΔE = (y2 − y1)³ / (4 y1 y2); natural jump length Lj ≈ 6.1 y2');
    r.formula('Basin III: chute blocks h = w = s = y1; baffle piers h3 = y1(4 + F1)/6 at 0.8 y2; end sill h4 = y1(18 + F1)/18; L ≈ 2.7 y2');
    r.formula('Basin II: chute blocks h = w = s = y1; dentated end sill 0.2 y2; L ≈ 4.3 y2. Basin IV: deflector blocks 2 y1 high');
    r.ref('IS 4997:1968 Criteria for design of hydraulic jump type stilling basins with horizontal and sloping apron — basin types correspond broadly to the USBR basins (verify clause).');
    r.ref('A.J. Peterka, Hydraulic Design of Stilling Basins and Energy Dissipators, USBR Engineering Monograph 25 (1958/1978).');
    r.ref('V.T. Chow, Open-Channel Hydraulics (1959), Ch. 15 — hydraulic jump.');
    r.assume('Horizontal rectangular basin of uniform width; hydrostatic pressure at the jump ends; friction in the jump neglected.');
    r.assume('Energy loss on the glacis taken as a fixed percentage of the available energy (' + f(v.loss, 1) + ' %).');
    r.assume('Check is for one discharge; repeat for the full range of flows and tail-water rating (worst case governs).');
    r.limit('Basin lengths and appurtenance proportions are from USBR model studies (verify IS 4997 figures); Basin III is not for V1 > 15–18 m/s.');
    r.limit('Froude numbers between 2.5 and 4.5 give an oscillating jump — prefer to avoid by changing the basin width or level.');

    r.h('1. Flow per metre and critical depth');
    r.eq('q', 'Q / B', f(v.Q, 2) + ' / ' + f(v.Bw, 2), q, 'm³/s/m', 3);
    var yc = r.eq('yc', '(q²/g)^(1/3)', '(' + f(q, 3) + '² / 9.81)^(1/3)', criticalDepth(q), 'm', 3);
    r.eq('TEL', 'u/s WL + ha', f(v.usWL, 3) + ' + ' + f(v.ha, 3), TEL, 'm', 3);

    var z, zReq = NaN;
    r.h('2. Basin floor level');
    if (v.mode === 'design') {
      zReq = requiredFloor(q, TEL, v.TWL, loss, v.k);
      if (!isFinite(zReq)) throw new Error('फर्श स्तर नहीं मिला / No floor level found — check levels and discharge');
      r.step('Solve (TWL − z) = k · y2(z) by bisection → z = ' + f(zReq, 3) + ' m');
      z = B.floorTo(Math.min(zReq, v.bed), 0.05);
      r.step('Adopted floor level = lower of required level and river bed, rounded down to 0.05 m = ' + f(z, 3) + ' m');
    } else {
      z = v.zGiven;
      r.step('Given floor level z = ' + f(z, 3) + ' m');
    }
    var s = jumpAt(q, TEL, z, loss);
    if (!s) throw new Error('फर्श पर अतिक्रांतिक प्रवाह संभव नहीं / Not enough energy for supercritical flow at this floor level');
    r.h('3. Jump at the adopted floor');
    r.eq('E1', '(TEL − z)(1 − loss)', '(' + f(TEL, 3) + ' − ' + f(z, 3) + ') × ' + f(1 - loss, 3), s.E1, 'm', 3);
    r.step('Solve y1 + q²/(2g y1²) = E1 → y1 = ' + f(s.y1, 4) + ' m (supercritical root)');
    r.eq('V1', 'q / y1', f(q, 3) + ' / ' + f(s.y1, 4), s.V1, 'm/s', 3);
    r.eq('F1', 'V1 / √(g y1)', f(s.V1, 3) + ' / √(9.81 × ' + f(s.y1, 4) + ')', s.F1, '', 3);
    r.eq('y2', '(y1/2)[√(1 + 8F1²) − 1]', '(' + f(s.y1, 4) + '/2) × [√(1 + 8 × ' + f(s.F1, 3) + '²) − 1]', s.y2, 'm', 3);
    var dE = r.eq('ΔE', '(y2 − y1)³/(4 y1 y2)', '(' + f(s.y2, 3) + ' − ' + f(s.y1, 4) + ')³ / (4 × ' + f(s.y1, 4) + ' × ' + f(s.y2, 3) + ')', jumpLoss(s.y1, s.y2), 'm', 3);
    var Lj = r.eq('Natural jump length Lj', '6.1 y2', '6.1 × ' + f(s.y2, 3), 6.1 * s.y2, 'm', 2);
    var TW = v.TWL - z;
    r.eq('Tail-water depth', 'TWL − z', f(v.TWL, 3) + ' − ' + f(z, 3), TW, 'm', 3);

    r.h('4. Basin type and proportions');
    var bt = basinType(s.F1, s.V1);
    r.warn('Basin type: ' + bt.name + '. IS 4997 basin types correspond broadly to the USBR basins (verify clause).');
    r.step('F1 = ' + f(s.F1, 2) + ', V1 = ' + f(s.V1, 2) + ' m/s → ' + bt.name);
    var L = B.ceilTo(bt.Lf * s.y2, 0.5);
    r.step('Basin length L ≈ ' + bt.Lf + ' y2 = ' + bt.Lf + ' × ' + f(s.y2, 3) + ' = ' + f(bt.Lf * s.y2, 2) + ' m → adopt ' + f(L, 1) + ' m');
    var el = [], els = {};
    if (bt.id === 'III' || bt.id === 'II') {
      els.chute = s.y1;
      el.push(['Chute blocks', 'height = width = spacing = y1', B.round(s.y1, 3), 'at the toe; side spaces 0.5 y1']);
      r.step('Chute blocks: h = w = s = y1 = ' + f(s.y1, 3) + ' m');
    }
    if (bt.id === 'III') {
      els.h3 = s.y1 * (4 + s.F1) / 6; els.x3 = 0.8 * s.y2; els.h4 = s.y1 * (18 + s.F1) / 18;
      r.eq('Baffle pier height h3', 'y1(4 + F1)/6', f(s.y1, 3) + ' × (4 + ' + f(s.F1, 2) + ')/6', els.h3, 'm', 3);
      r.eq('Distance of baffle piers from chute blocks', '0.8 y2', '0.8 × ' + f(s.y2, 3), els.x3, 'm', 2);
      r.eq('End sill height h4', 'y1(18 + F1)/18', f(s.y1, 3) + ' × (18 + ' + f(s.F1, 2) + ')/18', els.h4, 'm', 3);
      el.push(['Baffle piers', 'h3 = y1(4+F1)/6; width = spacing = 0.75 h3', B.round(els.h3, 3), 'at 0.8 y2 = ' + f(els.x3, 2) + ' m from chute blocks']);
      el.push(['End sill', 'h4 = y1(18+F1)/18, u/s slope 2:1', B.round(els.h4, 3), 'at basin end']);
    } else if (bt.id === 'II') {
      els.h4 = 0.2 * s.y2;
      r.eq('Dentated end sill height', '0.2 y2', '0.2 × ' + f(s.y2, 3), els.h4, 'm', 3);
      el.push(['Dentated end sill', 'height 0.2 y2; teeth width and spacing 0.15 y2; slope 2:1', B.round(els.h4, 3), 'at basin end']);
    } else if (bt.id === 'IV') {
      els.def = 2 * s.y1;
      r.eq('Deflector block height', '2 y1', '2 × ' + f(s.y1, 3), els.def, 'm', 3);
      el.push(['Deflector blocks', 'height 2 y1, width ≤ y1, spacing 2.5 × width', B.round(els.def, 3), 'at the toe']);
      els.h4 = 1.25 * s.y1;
      el.push(['End sill (optional)', 'about 1.25 y1', B.round(els.h4, 3), 'at basin end']);
    }
    if (el.length) r.table('Basin appurtenances', ['Element', 'Rule', 'Size (m)', 'Location'], el, 'elements');
    var twReq = Math.max(v.k, bt.tw) * s.y2;

    r.result('Discharge per metre q', q, 'm³/s/m', 3);
    if (v.mode === 'design') r.result('Required floor level (TW = k·y2)', zReq, 'm', 3);
    r.result('Adopted basin floor level', z, 'm', 3);
    r.result('Pre-jump depth y1', s.y1, 'm', 3);
    r.result('Velocity V1', s.V1, 'm/s', 2);
    r.result('Froude number F1', s.F1, '', 2);
    r.result('Sequent depth y2', s.y2, 'm', 3);
    r.result('Tail-water depth', TW, 'm', 3);
    r.result('Energy loss in jump ΔE', dE, 'm', 3);
    r.result('Basin type', bt.id === 'none' ? 'no baffled basin' : (bt.id === 'I' ? 'plain (pre-jump)' : 'USBR Basin ' + bt.id), '');
    r.result('Basin length (adopted)', L, 'm', 1);

    r.check('Tail water ≥ required depth (no sweep-out)', TW >= twReq - 1e-6, f(TW, 3) + ' m', '≥ ' + f(Math.max(v.k, bt.tw), 2) + ' y2 = ' + f(twReq, 3) + ' m');
    r.check('Tail water not excessive (jump not drowned too far)', TW <= 1.3 * s.y2, f(TW / s.y2, 2) + ' y2', '≤ 1.3 y2', 'a deeply drowned jump moves upstream onto the glacis');
    r.check('Avoid oscillating-jump range', !(s.F1 >= 2.5 && s.F1 < 4.5), 'F1 = ' + f(s.F1, 2), 'not 2.5 – 4.5');
    if (bt.id === 'III') r.check('Basin III velocity limit', s.V1 < 18, f(s.V1, 2) + ' m/s', '< 18 m/s (verify; some sources 15 m/s)');
    r.check('Floor not above river bed', z <= v.bed + 1e-6, f(z, 3) + ' m', '≤ ' + f(v.bed, 3) + ' m');
    if (v.mode === 'design' && zReq > v.bed) r.warn('Required level from tail water (' + f(zReq, 2) + ' m) is above the river bed; the floor is kept at bed level.');
    r.data = { v: v, z: z, s: s, bt: bt, L: L, els: els, q: q, yc: yc, Lj: Lj, TEL: TEL };
    return r;
  }

  /* ---------- drawing ---------- */
  function drawings(v, rep) {
    var D = rep.data, s = D.s, z = D.z, L = D.L, E = D.els, t = v.t;
    var d = new Drawing({ title: 'Stilling basin — longitudinal section' });
    var xc0 = -2, crest = Math.max(v.crest, z + 0.5), usF = Math.min(v.usFloor, crest);
    var xg = v.glacis * (crest - z), xe = xg + L;
    var h4 = E.h4 || 0, sillStart = h4 > 0 ? xe - 2 * h4 : xe;
    var xr, xEnd, top = z + h4;
    if (v.bed > top) { xr = xe + 3 * (v.bed - top); } else { xr = xe; }
    xEnd = xr + Math.max(10, 0.3 * L);
    var ybot = Math.min(z - t, v.bed) - 3;
    // soil
    var soil = [[-14, usF - t], [xc0, usF - t], [xc0, z - t], [xe, z - t], [xe, top]];
    if (v.bed > top) soil.push([xr, v.bed]); else soil.push([xe, v.bed]);
    soil.push([xEnd, v.bed], [xEnd, ybot], [-14, ybot]);
    d.hatch(soil, 'soil', { outline: false });
    d.line(xr, v.bed, xEnd, v.bed, 'SOIL');
    if (v.bed > top) d.line(xe, top, xr, v.bed, 'SOIL');
    // water surface
    var ws = [[-14, v.usWL], [xc0, v.usWL], [0, crest + D.yc]];
    [0.25, 0.5, 0.75].forEach(function (k) { ws.push([k * xg, crest - k * (crest - z) + D.yc + (s.y1 - D.yc) * Math.sqrt(k)]); });
    ws = ws.concat([[xg, z + s.y1],
      [xg + 0.25 * L, z + s.y1 + 0.45 * (s.y2 - s.y1)], [xg + 0.6 * L, z + 0.95 * s.y2], [xe, v.TWL], [xEnd, v.TWL]]);
    var wb = [[xEnd, v.bed], [xr, v.bed], [xe, top], [sillStart, z], [xg, z], [0, crest], [xc0, crest], [xc0, usF], [-14, usF]];
    if (v.bed <= top) wb.splice(1, 1, [xe, v.bed]);
    d.hatch(ws.concat(wb), 'water', { outline: false });
    d.pline(ws, 'WATER');
    // concrete body and floor
    var conc = [[-14, usF], [xc0, usF], [xc0, crest], [0, crest], [xg, z], [sillStart, z], [xe, top], [xe, z - t], [xc0, z - t], [xc0, usF - t], [-14, usF - t]];
    d.hatch(conc, 'concrete');
    // appurtenances
    if (E.chute) {
      d.hatch([[xg, z], [xg + E.chute * 2, z], [xg + E.chute * 2, z + E.chute], [xg, z + E.chute]], 'concrete');
    }
    if (E.h3) {
      var xb = xg + E.x3, h3 = E.h3;
      d.hatch([[xb, z], [xb, z + h3], [xb + 0.2 * h3, z + h3], [xb + 1.2 * h3, z]], 'concrete');
      d.text(xb + 0.4 * h3, z + h3, 'BP', { ha: 'c', va: 'b', dy: 0.8, h: 2 });
    }
    if (E.def) d.hatch([[xg, z], [xg + E.def, z], [xg + E.def, z + E.def], [xg, z + E.def]], 'concrete');
    // levels
    d.level(-10, v.usWL, 'U/S WL ' + f(v.usWL, 3), { side: 'r' });
    d.level(-1, crest, 'CREST ' + f(crest, 3), { side: 'r' });
    d.level(xEnd - 2, v.TWL, 'TWL ' + f(v.TWL, 3), { side: 'l' });
    d.level(xEnd - 1, v.bed, 'BED ' + f(v.bed, 3), { side: 'l' });
    if (h4) d.text(xe - h4, top, 'ES', { ha: 'c', va: 'b', dy: 0.8, h: 2 });
    if (E.chute) d.text(xg + E.chute, z + E.chute, 'CB', { ha: 'c', va: 'b', dy: 0.8, h: 2 });
    if (E.def) d.text(xg + E.def / 2, z + E.def, 'DB', { ha: 'c', va: 'b', dy: 0.8, h: 2 });
    d.text(xg + L / 2, z - t, 'BASIN FLOOR ' + f(z, 3), { ha: 'c', va: 't', dy: -1.2, h: 2.2 });
    var legend = [];
    if (E.chute) legend.push('CB chute blocks h = w = s = ' + f(E.chute, 2) + ' m');
    if (E.h3) legend.push('BP baffle piers h3 = ' + f(E.h3, 2) + ' m at ' + f(E.x3, 2) + ' m from CB');
    if (E.def) legend.push('DB deflector blocks h = ' + f(E.def, 2) + ' m');
    if (h4) legend.push('ES end sill h = ' + f(h4, 2) + ' m');
    legend.push(D.bt.name);
    legend.forEach(function (txt, i) { d.text(-14, ybot, txt, { ha: 'l', va: 't', dy: -14 - i * 3.6, h: 2.2 }); });
    // dimensions
    d.dimH(xg, xe, z - t, 9, { text: 'L = ' + f(L, 2) });
    d.dimH(0, xg, z - t, 9);
    d.dimV(xg + 0.72 * L, z, z + s.y2, 0, { text: 'y2 = ' + f(s.y2, 2) });
    d.dimV(xc0, z, crest, 10, { text: f(crest - z, 2) });
    d.flow(-8, usF + 0.4 * (v.usWL - usF), 0);
    d.text(xg + 0.3 * L, z + s.y2 + 0.8, 'JUMP  F1 = ' + f(s.F1, 2), { ha: 'c', va: 'b', dy: 3, h: 2.2 });
    return [{ key: 'section', title: 'Stilling basin — longitudinal section / स्टिलिंग बेसिन अनुदैर्ध्य काट', d: d }];
  }

  return {
    fns: { criticalDepth: criticalDepth, supercriticalDepth: supercriticalDepth, froude: froude, sequentDepth: sequentDepth,
      jumpLoss: jumpLoss, jumpAt: jumpAt, requiredFloor: requiredFloor, basinType: basinType },
    pages: [{
      id: 'stilling-basin', group: 'C', order: 2, hi: 'हाइड्रॉलिक जंप एवं स्टिलिंग बेसिन', en: 'Hydraulic jump and stilling basin',
      refs: 'IS 4997; USBR EM 25 (Peterka)',
      intro: 'Pre-jump depth, Froude number, sequent depth, basin floor level for the tail water, basin type, length and appurtenances.',
      inputs: inputs, design: design, drawings: drawings
    }]
  };
});
