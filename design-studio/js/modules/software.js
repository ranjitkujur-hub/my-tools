/* S. Software bridges / सॉफ़्टवेयर से जोड़
 * - STAAD.Pro .std input files: box culvert frame per metre run, beam / portal, aqueduct trough U-frame.
 * - HEC-RAS: cross-section station–elevation tables, reach lengths and steady-flow table.
 * - QGIS: canal alignment, chainage points and structure locations as GeoJSON and CSV. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../core/index.js'));
  else root.DS.register(factory(root.DS));
})(typeof self !== 'undefined' ? self : this, function (DS) {
  'use strict';
  var B = DS.base, Drawing = DS.Drawing, f = B.f;

  /* ---------- STAAD.Pro ---------- */
  function isM(m) { return function (v) { return v.model === m; }; }
  var staadInputs = [
    { sec: 'मॉडल / Model' },
    { key: 'model', hi: 'संरचना', en: 'Structure', type: 'select', def: 'box',
      options: [['box', 'Box culvert — 2D frame per metre run'], ['beam', 'Simple / continuous beam'], ['portal', 'Portal frame'], ['trough', 'Aqueduct trough — transverse U-frame']] },
    { key: 'fck', hi: 'कंक्रीट श्रेणी', en: 'Concrete grade fck', unit: 'MPa', def: 30, min: 15, max: 60 },
    { sec: 'बॉक्स पुलिया / Box culvert', show: isM('box') },
    { key: 'span', hi: 'स्पष्ट पाट', en: 'Clear span of a cell', unit: 'm', def: 3, min: 0.5, max: 12, show: isM('box') },
    { key: 'height', hi: 'स्पष्ट ऊँचाई', en: 'Clear height', unit: 'm', def: 2.5, min: 0.5, max: 10, show: isM('box') },
    { key: 'nCells', hi: 'सेलों की संख्या', en: 'Number of cells', unit: 'no.', def: 2, min: 1, max: 6, step: 1, show: isM('box') },
    { key: 'tTop', hi: 'ऊपरी स्लैब', en: 'Top slab thickness', unit: 'm', def: 0.3, min: 0.15, max: 1.5, show: isM('box') },
    { key: 'tBot', hi: 'निचला स्लैब', en: 'Bottom slab thickness', unit: 'm', def: 0.35, min: 0.15, max: 1.5, show: isM('box') },
    { key: 'tWall', hi: 'दीवार', en: 'Wall thickness', unit: 'm', def: 0.3, min: 0.15, max: 1.5, show: isM('box') },
    { key: 'fill', hi: 'भराव ऊँचाई', en: 'Earth fill above top slab', unit: 'm', def: 1.2, min: 0, max: 15, show: isM('box') },
    { key: 'gammaSoil', hi: 'मिट्टी इकाई भार', en: 'Unit weight of fill', unit: 'kN/m³', def: 18, min: 10, max: 25, show: isM('box') },
    { key: 'K0', hi: 'स्थिर दाब गुणांक', en: 'Earth pressure coefficient K0', unit: '—', def: 0.5, min: 0.2, max: 1, show: isM('box') },
    { key: 'liveUDL', hi: 'सजीव भार (UDL)', en: 'Live load as UDL on top', unit: 'kN/m²', def: 40, min: 0, max: 300, show: isM('box') },
    { key: 'subgrade', hi: 'सबग्रेड मापांक', en: 'Modulus of subgrade reaction', unit: 'kN/m³', def: 20000, min: 1000, max: 500000, show: isM('box') },
    { sec: 'बीम / Beam', show: isM('beam') },
    { key: 'spans', hi: 'पाट (अल्पविराम से)', en: 'Spans, comma separated', unit: 'm', type: 'text', def: '5, 5, 5', show: isM('beam') },
    { key: 'bb', hi: 'चौड़ाई', en: 'Beam width b', unit: 'm', def: 0.3, min: 0.1, max: 2, show: isM('beam') },
    { key: 'bD', hi: 'गहराई', en: 'Beam depth D', unit: 'm', def: 0.5, min: 0.15, max: 3, show: isM('beam') },
    { key: 'dl', hi: 'स्थायी भार (स्वभार छोड़कर)', en: 'Dead load excl. self weight', unit: 'kN/m', def: 15, min: 0, max: 1000, show: function (v) { return v.model === 'beam' || v.model === 'portal'; } },
    { key: 'll', hi: 'सजीव भार', en: 'Live load', unit: 'kN/m', def: 10, min: 0, max: 1000, show: function (v) { return v.model === 'beam' || v.model === 'portal'; } },
    { sec: 'पोर्टल / Portal', show: isM('portal') },
    { key: 'pspan', hi: 'बे चौड़ाई', en: 'Bay width', unit: 'm', def: 6, min: 1, max: 30, show: isM('portal') },
    { key: 'pheight', hi: 'ऊँचाई', en: 'Column height', unit: 'm', def: 4, min: 1, max: 20, show: isM('portal') },
    { key: 'nBays', hi: 'बे संख्या', en: 'Number of bays', unit: 'no.', def: 1, min: 1, max: 6, show: isM('portal') },
    { key: 'colB', hi: 'स्तंभ b', en: 'Column b', unit: 'm', def: 0.3, min: 0.15, max: 2, show: isM('portal') },
    { key: 'colD', hi: 'स्तंभ D', en: 'Column D', unit: 'm', def: 0.4, min: 0.15, max: 2, show: isM('portal') },
    { key: 'beamB', hi: 'बीम b', en: 'Beam b', unit: 'm', def: 0.3, min: 0.15, max: 2, show: isM('portal') },
    { key: 'beamD', hi: 'बीम D', en: 'Beam D', unit: 'm', def: 0.6, min: 0.15, max: 3, show: isM('portal') },
    { key: 'lateral', hi: 'पार्श्व भार (शीर्ष पर)', en: 'Lateral load at top', unit: 'kN', def: 20, min: 0, max: 5000, show: isM('portal') },
    { sec: 'जलसेतु कुंड / Aqueduct trough', show: isM('trough') },
    { key: 'tw', hi: 'स्पष्ट चौड़ाई', en: 'Clear width', unit: 'm', def: 4, min: 0.5, max: 30, show: isM('trough') },
    { key: 'tdepth', hi: 'जल गहराई', en: 'Water depth', unit: 'm', def: 1.8, min: 0.2, max: 10, show: isM('trough') },
    { key: 'twallH', hi: 'दीवार ऊँचाई (स्पष्ट)', en: 'Clear wall height', unit: 'm', def: 2.3, min: 0.3, max: 12, show: isM('trough') },
    { key: 'ttWall', hi: 'दीवार मोटाई', en: 'Wall thickness', unit: 'm', def: 0.3, min: 0.1, max: 1.5, show: isM('trough') },
    { key: 'ttSlab', hi: 'तल स्लैब मोटाई', en: 'Bottom slab thickness', unit: 'm', def: 0.35, min: 0.1, max: 1.5, show: isM('trough') },
    { key: 'walkway', hi: 'स्लैब पर सजीव भार', en: 'Live load on slab', unit: 'kN/m²', def: 0, min: 0, max: 50, show: isM('trough') }
  ];

  function staadModel(v) {
    if (v.model === 'box') return DS.staad.boxCulvert({ span: v.span, height: v.height, nCells: Math.round(v.nCells), tTop: v.tTop, tBot: v.tBot, tWall: v.tWall,
      fill: v.fill, gammaSoil: v.gammaSoil, K0: v.K0, liveUDL: v.liveUDL, subgrade: v.subgrade, fck: v.fck });
    if (v.model === 'beam') {
      var spans = B.parseSeries(v.spans).filter(function (s) { return s > 0; });
      if (!spans.length) throw new Error('पाट लिखें / Enter at least one span');
      return DS.staad.beam({ spans: spans, b: v.bb, D: v.bD, dl: v.dl, ll: v.ll, fck: v.fck });
    }
    if (v.model === 'portal') return DS.staad.portal({ span: v.pspan, height: v.pheight, nBays: Math.round(v.nBays), colB: v.colB, colD: v.colD,
      beamB: v.beamB, beamD: v.beamD, dl: v.dl, ll: v.ll, lateral: v.lateral, fck: v.fck });
    return DS.staad.trough({ width: v.tw, depth: v.tdepth, wallH: v.twallH, tWall: v.ttWall, tSlab: v.ttSlab, walkway: v.walkway, fck: v.fck });
  }

  function staadDesign(v) {
    var r = new B.Report(), m = staadModel(v), text = DS.staad.write(m);
    r.formula('Frame members on centre lines; properties PRIS YD (depth) ZD (width, 1 m for per-metre models)');
    r.formula('E = 5000 √fck MPa (IS 456 cl 6.2.3.1), Poisson 0.17, density 25 kN/m³');
    if (v.model === 'box') r.formula('Lateral earth pressure p = K0 γ z (trapezoidal on outer walls); water inside p = γw z; fill on top = γ h_fill');
    if (v.model === 'trough') r.formula('Water pressure on walls p = γw z (triangular); water weight on slab = γw × depth');
    r.ref('STAAD.Pro Technical Reference — command file syntax (STAAD PLANE, JOINT COORDINATES, MEMBER INCIDENCES, MEMBER PROPERTY, SUPPORTS, LOAD, LOAD COMB, PERFORM ANALYSIS).');
    if (v.model === 'box') r.ref('IRC:SP:13 and IRC:6 — loads on culverts (combination factors in the file are placeholders: verify IRC:6 tables).');
    r.ref('IS 456:2000 cl 6.2.3.1 — modulus of elasticity.');
    r.assume('STAAD.Pro is licensed software and must be installed separately; this page only writes its input file.');
    r.assume('Per-metre 2D frame; members on centre lines; rigid joints.');
    if (v.model === 'box') r.assume('Bottom slab on Winkler soil springs (node spring = k × tributary length × 1 m); verify k from soil investigation.');
    r.assume('Live load on the box top is a uniform pressure (IRC vehicle loads should be converted to an equivalent UDL by the designer).');
    r.limit('Check the model graphically in STAAD before analysis; refine member subdivision for design moments.');
    r.h('Model summary');
    r.step(m.title);
    m.comments.forEach(function (c) { r.step(c); });
    r.step(m.joints.length + ' joints, ' + m.members.length + ' members, ' + m.loads.length + ' load cases, ' + m.combos.length + ' combinations.');
    var errs = DS.staad.lint(text);
    r.check('Command file structure', !errs.length, errs.length ? errs.join('; ') : 'valid', 'STAAD command order');
    r.result('Joints', m.joints.length, '', 0);
    r.result('Members', m.members.length, '', 0);
    r.result('Load cases', m.loads.length, '', 0);
    r.result('Combinations', m.combos.length, '', 0);
    r.table('Joints', ['Joint', 'X (m)', 'Y (m)'], m.joints.map(function (j) { return [j[0], B.round(j[1], 3), B.round(j[2], 3)]; }), 'joints');
    r.table('Members', ['Member', 'Start joint', 'End joint'], m.members.slice(), 'members');
    var lrows = [];
    m.loads.forEach(function (ld) {
      if (ld.selfweight) lrows.push([ld.id, ld.title, 'SELFWEIGHT Y ' + ld.selfweight, '', '']);
      (ld.member || []).forEach(function (x) { lrows.push([ld.id, ld.title, x.kind + ' ' + x.dir, DS.staad.list(x.members), x.kind === 'TRAP' ? f(x.w1, 2) + ' → ' + f(x.w2, 2) : f(x.w, 2)]); });
      (ld.joint || []).forEach(function (x) { lrows.push([ld.id, ld.title, 'JOINT', DS.staad.list(x.joints), 'FX ' + f(x.fx || 0, 2) + ' FY ' + f(x.fy || 0, 2)]); });
    });
    r.table('Loads (kN, m)', ['Load', 'Title', 'Type', 'Members/joints', 'Intensity'], lrows, 'loads');
    r.table('Combinations', ['No.', 'Title', 'Factors'], m.combos.map(function (c) { return [c.id, c.title, c.factors.map(function (x) { return x[0] + '×' + x[1]; }).join(' + ')]; }), 'combos');
    r.data = { model: m, text: text };
    return r;
  }

  function staadDrawing(v, rep) {
    var m = rep.data.model, d = new Drawing({ title: m.title.toLowerCase().replace(/^./, function (c) { return c.toUpperCase(); }) + ' — analytical model' });
    var J = {};
    m.joints.forEach(function (j) { J[j[0]] = j; });
    m.members.forEach(function (mm) {
      var a = J[mm[1]], b = J[mm[2]];
      d.line(a[1], a[2], b[1], b[2], 'CONCRETE', { w: 0.5 });
      d.text((a[1] + b[1]) / 2, (a[2] + b[2]) / 2, String(mm[0]), { h: 1.8, ha: 'c', va: 'b', dy: 0.8, layer: 'DIM' });
    });
    var xs = m.joints.map(function (j) { return j[1]; }), ys = m.joints.map(function (j) { return j[2]; });
    var span = Math.max(Math.max.apply(null, xs) - Math.min.apply(null, xs), Math.max.apply(null, ys) - Math.min.apply(null, ys), 1);
    var s = span * 0.025;
    m.joints.forEach(function (j) { d.circle(j[1], j[2], s * 0.25, 'DIM'); d.text(j[1], j[2], String(j[0]), { h: 1.6, ha: 'l', va: 't', dx: 0.6, dy: -0.6, layer: 'TEXT' }); });
    m.supports.forEach(function (sp) {
      sp.joints.forEach(function (jid) {
        var j = J[jid];
        if (/KFY/.test(sp.spec)) { d.pline([[j[1], j[2]], [j[1] - s * 0.3, j[2] - s * 0.6], [j[1] + s * 0.3, j[2] - s * 1.2], [j[1] - s * 0.3, j[2] - s * 1.8], [j[1], j[2] - s * 2]], 'SOIL'); }
        else if (/FIXED$/.test(sp.spec)) { d.line(j[1] - s, j[2], j[1] + s, j[2], 'SOIL', { w: 0.6 }); d.hatch([[j[1] - s, j[2] - s * 0.6], [j[1] + s, j[2] - s * 0.6], [j[1] + s, j[2]], [j[1] - s, j[2]]], 'soil'); }
        else d.poly([[j[1], j[2]], [j[1] - s * 0.7, j[2] - s * 1.2], [j[1] + s * 0.7, j[2] - s * 1.2]], 'SOIL');
      });
    });
    d.text(Math.min.apply(null, xs), Math.min.apply(null, ys), 'Centre-line model. Zig-zag = soil spring, triangle = pinned / roller, hatched = fixed.', { h: 2, va: 't', dy: -10 });
    return [{ key: 'model', title: 'STAAD analytical model / विश्लेषण मॉडल', d: d }];
  }

  function staadExports(v, rep) {
    return [{ label: 'STAAD.Pro .std', name: (v.model === 'box' ? 'box-culvert' : v.model === 'trough' ? 'aqueduct-trough' : v.model) + '.std', mime: 'text/plain', text: rep.data.text, preview: true }];
  }

  var staadGuide = [
    'Install STAAD.Pro (licensed software from Bentley) on the office PC — it is not part of this app.',
    'Download the .std file and open it in STAAD.Pro (File → Open), or open the STAAD Editor and paste the text.',
    'Check the geometry, supports and loads in the graphical view; refine member subdivision if design moments are needed at sections.',
    'Replace placeholder combination factors with those from IRC:6 / IS 456 as applicable.',
    'Run Analysis → Run Analysis; read member forces and support reactions from the output file or post-processing.',
    'Use the moments and shears for section design (for example in the RCC pages of this app) and record them in the design note.'
  ];

  /* ---------- HEC-RAS ---------- */
  var SAMPLE_XS = '# chainage, station, elevation  (fictional)\n0, 0, 103.2\n0, 6, 101.8\n0, 10, 99.6\n0, 14, 99.4\n0, 18, 101.7\n0, 25, 103.1\n' +
    '500, 0, 102.9\n500, 7, 101.5\n500, 11, 99.3\n500, 15, 99.1\n500, 19, 101.4\n500, 26, 102.8\n' +
    '1000, 0, 102.6\n1000, 6, 101.2\n1000, 10, 99.0\n1000, 14, 98.8\n1000, 18, 101.1\n1000, 24, 102.5';
  var hecInputs = [
    { sec: 'नदी / River and reach' },
    { key: 'river', hi: 'नदी नाम', en: 'River name', type: 'text', def: 'Sample Nala' },
    { key: 'reach', hi: 'खंड नाम', en: 'Reach name', type: 'text', def: 'Reach 1' },
    { key: 'xs', hi: 'अनुप्रस्थ काट (चेनेज, स्टेशन, स्तर)', en: 'Cross-sections: chainage, station, elevation (chainage increases downstream)', unit: 'm', type: 'textarea', def: SAMPLE_XS, rows: 10 },
    { key: 'nL', hi: 'बायाँ किनारा n', en: "Manning's n — left overbank", unit: '—', def: 0.035, min: 0.01, max: 0.2 },
    { key: 'nC', hi: 'मुख्य धारा n', en: "Manning's n — main channel", unit: '—', def: 0.03, min: 0.01, max: 0.2 },
    { key: 'nR', hi: 'दायाँ किनारा n', en: "Manning's n — right overbank", unit: '—', def: 0.035, min: 0.01, max: 0.2 },
    { sec: 'प्रवाह / Steady flow' },
    { key: 'Q1', hi: 'प्रवाह 1', en: 'Profile 1 flow', unit: 'm³/s', def: 50, min: 0, max: 100000 },
    { key: 'Q2', hi: 'प्रवाह 2', en: 'Profile 2 flow', unit: 'm³/s', def: 120, min: 0, max: 100000 },
    { key: 'Q3', hi: 'प्रवाह 3 (डिज़ाइन)', en: 'Profile 3 flow (design)', unit: 'm³/s', def: 250, min: 0, max: 100000 },
    { key: 'slope', hi: 'सामान्य गहराई ढलान', en: 'Normal-depth boundary slope', unit: 'm/m', def: 0.0006, min: 0.000001, max: 0.2 }
  ];

  function groupXS(text) {
    var by = {}, order = [];
    B.parseTable(text, 3).forEach(function (r) {
      var k = String(r[0]);
      if (!by[k]) { by[k] = []; order.push(r[0]); }
      by[k].push([r[1], r[2]]);
    });
    order.sort(function (a, b) { return a - b; });
    return order.map(function (ch) {
      var pts = by[String(ch)].sort(function (a, b) { return a[0] - b[0]; });
      // bank stations: nearest point on each side of the thalweg that rises 60 % of the lower side height
      var low = 0;
      pts.forEach(function (p, i) { if (p[1] < pts[low][1]) low = i; });
      var maxL = Math.max.apply(null, pts.slice(0, low + 1).map(function (p) { return p[1]; }));
      var maxR = Math.max.apply(null, pts.slice(low).map(function (p) { return p[1]; }));
      var lim = pts[low][1] + 0.6 * (Math.min(maxL, maxR) - pts[low][1]);
      var li = 0, ri = pts.length - 1, i;
      for (i = low; i >= 0; i--) if (pts[i][1] >= lim) { li = i; break; }
      for (i = low; i < pts.length; i++) if (pts[i][1] >= lim) { ri = i; break; }
      return { chainage: ch, points: pts, bankLeft: pts[li][0], bankRight: pts[ri][0], invert: pts[low][1] };
    });
  }

  function hecDesign(v) {
    var r = new B.Report(), xs = groupXS(v.xs);
    if (!xs.length) throw new Error('कोई अनुप्रस्थ काट नहीं / No cross-section rows (chainage, station, elevation)');
    xs.forEach(function (s) { s.nLOB = v.nL; s.nCh = v.nC; s.nROB = v.nR; });
    var total = xs[xs.length - 1].chainage - xs[0].chainage;
    r.formula('River station RS = (last chainage − chainage): HEC-RAS stations increase upstream');
    r.formula('Reach length to next section downstream = chainage(i+1) − chainage(i)');
    r.ref('USACE HEC-RAS Hydraulic Reference Manual and User’s Manual — geometric data and steady flow data editors.');
    r.assume('Cross-sections are entered looking downstream (left bank first); stations increase from left to right.');
    r.assume('Main-channel bank stations: nearest point on each side of the thalweg rising 60 % of the lower bank height — check and edit in HEC-RAS.');
    r.assume('LOB, channel and ROB reach lengths are taken equal (straight reach).');
    r.limit('HEC-RAS limits a cross-section to 500 station–elevation points.');
    r.h('Cross-sections');
    var rl = DS.hecras.reachLengths(xs), rows = [];
    xs.forEach(function (s, i) {
      r.step('Ch ' + f(s.chainage, 1) + ' m → RS ' + f(total - (s.chainage - xs[0].chainage), 1) + ': ' + s.points.length + ' points, invert ' + f(s.invert, 3) + ' m, banks at ' + f(s.bankLeft, 2) + ' / ' + f(s.bankRight, 2) + ' m, reach length ' + f(rl[i], 1) + ' m');
      rows.push([s.chainage, B.round(total - (s.chainage - xs[0].chainage), 1), s.points.length, B.round(s.invert, 3), s.bankLeft, s.bankRight, B.round(rl[i], 1)]);
    });
    var ok500 = xs.every(function (s) { return s.points.length <= 500; });
    var slope = xs.length > 1 ? (xs[0].invert - xs[xs.length - 1].invert) / total : NaN;
    if (isFinite(slope)) r.step('Average invert slope = (' + f(xs[0].invert, 3) + ' − ' + f(xs[xs.length - 1].invert, 3) + ') / ' + f(total, 1) + ' = ' + f(slope, 6));
    r.result('Cross-sections', xs.length, '', 0);
    r.result('Reach length', total, 'm', 1);
    if (isFinite(slope)) r.result('Average invert slope', slope, 'm/m', 6);
    r.check('Points per cross-section', ok500, Math.max.apply(null, xs.map(function (s) { return s.points.length; })), '≤ 500');
    r.check('At least two cross-sections', xs.length >= 2, xs.length, '≥ 2');
    r.table('Cross-section summary', ['Chainage (m)', 'River station', 'Points', 'Invert (m)', 'Left bank sta.', 'Right bank sta.', 'Reach length (m)'], rows, 'xs');
    r.table('Steady flow profiles', ['Profile', 'Q (m³/s)'], [['PF 1', v.Q1], ['PF 2', v.Q2], ['PF 3', v.Q3]], 'flow');
    r.data = { xs: xs, total: total };
    return r;
  }

  function hecDrawing(v, rep) {
    var xs = rep.data.xs.slice(0, 8), d = new Drawing({ title: 'Cross-sections for HEC-RAS', vex: 1 });
    var y0 = 0, gap = 0;
    xs.forEach(function (s) {
      var ys = s.points.map(function (p) { return p[1]; });
      gap = Math.max(gap, Math.max.apply(null, ys) - Math.min.apply(null, ys));
    });
    xs.forEach(function (s, k) {
      var mn = Math.min.apply(null, s.points.map(function (p) { return p[1]; }));
      var off = y0 - k * gap * 1.8 - mn;
      var pts = s.points.map(function (p) { return [p[0], p[1] + off]; });
      var bot = Math.min.apply(null, pts.map(function (p) { return p[1]; })) - gap * 0.2;
      d.hatch(pts.concat([[pts[pts.length - 1][0], bot], [pts[0][0], bot]]), 'soil', { outline: false });
      d.pline(pts, 'SOIL', { w: 0.4 });
      d.line(s.bankLeft, mn + off, s.bankLeft, mn + off + gap * 1.1, 'CENTRE');
      d.line(s.bankRight, mn + off, s.bankRight, mn + off + gap * 1.1, 'CENTRE');
      d.text(pts[0][0], mn + off + gap, 'Ch ' + f(s.chainage, 0) + ' m (RS ' + f(rep.data.total - (s.chainage - rep.data.xs[0].chainage), 0) + ')', { h: 2.2, va: 'b' });
      d.text(pts[pts.length - 1][0], mn + off, 'Invert ' + f(s.invert, 2), { h: 2, ha: 'r', va: 'b', dx: 2 });
    });
    return [{ key: 'sections', title: 'Cross-sections / अनुप्रस्थ काट (bank stations dashed)', d: d }];
  }

  function hecExports(v, rep) {
    var xs = rep.data.xs;
    var geo = DS.hecras.geometryText(v.river, v.reach, xs, xs[xs.length - 1].chainage);
    var flow = DS.hecras.steadyFlowText(v.river, v.reach, rep.data.total, [{ name: 'PF 1', Q: v.Q1 }, { name: 'PF 2', Q: v.Q2 }, { name: 'PF 3', Q: v.Q3 }], { upSlope: v.slope, dnSlope: v.slope });
    return [
      { label: 'HEC-RAS geometry text (.txt)', name: 'hecras-geometry.txt', mime: 'text/plain', text: geo, preview: true },
      { label: 'HEC-RAS steady flow (.txt)', name: 'hecras-steady-flow.txt', mime: 'text/plain', text: flow, preview: true }
    ];
  }

  var hecGuide = [
    'Install HEC-RAS (free, from the US Army Corps of Engineers Hydrologic Engineering Center) and create a new project.',
    'Edit → Geometric Data: draw the river reach with the River and Reach names used here.',
    'Cross Section → Options → Add a new cross section: type the River Station from the export.',
    'Open the geometry .txt in Notepad, copy one Station / Elevation block and paste it into the first cell of the HEC-RAS table.',
    "Enter downstream reach lengths, Manning's n (LOB / Channel / ROB) and bank stations exactly as listed; Apply Data. Repeat for each station.",
    'Edit → Steady Flow Data: set the number of profiles, paste the flows at the upstream station, then Reach Boundary Conditions → Normal Depth with the given slope.',
    'Run → Steady Flow Analysis (subcritical). View profile and cross-section plots; compare HFL with the design.'
  ];

  /* ---------- QGIS ---------- */
  var SAMPLE_ALIGN = '# x, y in metres (UTM, fictional)\n500000, 2500000\n500420, 2500180\n500900, 2500260\n501350, 2500540\n501700, 2500980\n502150, 2501200';
  var SAMPLE_STRUCT = '# name, type, chainage  (or name, type, x, y)\nHead regulator, regulator, 0\nVR bridge 1, bridge, 650\nFall 1, fall, 1100\nCulvert 2, culvert, 1850\nEscape, escape, 2500';
  var qgisInputs = [
    { sec: 'संरेखण / Alignment' },
    { key: 'name', hi: 'नाम', en: 'Canal / alignment name', type: 'text', def: 'Sample Distributary' },
    { key: 'epsg', hi: 'निर्देशांक प्रणाली EPSG', en: 'Coordinate system EPSG code', unit: 'EPSG', def: 32644, min: 1024, max: 99999,
      help: '32643 / 32644 / 32645 = WGS 84 UTM zones 43N / 44N / 45N (metres); 4326 = longitude, latitude (degrees)' },
    { key: 'align', hi: 'संरेखण बिंदु (x, y)', en: 'Alignment points x, y (or lon, lat) in order, head first', unit: 'm / °', type: 'textarea', def: SAMPLE_ALIGN, rows: 7 },
    { key: 'ch0', hi: 'आरंभिक चेनेज', en: 'Chainage at first point', unit: 'm', def: 0, min: 0, max: 1e7 },
    { key: 'interval', hi: 'चेनेज अंतराल', en: 'Chainage point interval', unit: 'm', def: 200, min: 1, max: 100000 },
    { sec: 'संरचनाएँ / Structures' },
    { key: 'structs', hi: 'संरचनाएँ', en: 'Structures: name, type, chainage — or name, type, x, y', unit: 'm', type: 'textarea', def: SAMPLE_STRUCT, rows: 6 }
  ];

  function parseStructs(text) {
    return B.parseRows(text).map(function (c) {
      var n3 = B.num(c[2]), n4 = B.num(c[3]);
      if (c.length >= 4 && isFinite(n3) && isFinite(n4)) return { name: c[0], type: c[1], x: n3, y: n4 };
      if (c.length >= 3 && isFinite(n3)) return { name: c[0], type: c[1], ch: n3 };
      return null;
    }).filter(Boolean);
  }

  function qgisBuild(v) {
    var pts = B.parseTable(v.align, 2).map(function (q) { return [q[0], q[1]]; });
    return DS.geo.build({ epsg: v.epsg, name: v.name, alignment: pts, interval: v.interval, ch0: v.ch0, structures: parseStructs(v.structs) });
  }

  function qgisDesign(v) {
    var r = new B.Report(), g = qgisBuild(v), geog = DS.geo.isGeographic(v.epsg);
    r.formula(geog ? 'Segment length by haversine formula on a sphere R = 6 371 km' : 'Segment length = √(Δx² + Δy²) in projected metres');
    r.formula('Chainage = cumulative length from the first point; points at a chainage are interpolated linearly along the segment');
    r.ref('RFC 7946 GeoJSON; QGIS User Guide — adding vector layers and delimited-text layers.');
    r.assume(geog ? 'Coordinates are WGS 84 longitude, latitude in decimal degrees.' : 'Coordinates are projected metres in EPSG:' + v.epsg + ' (a legacy "crs" member is written so QGIS assigns it).');
    r.assume('Structures given by chainage are placed on the alignment; those given by x, y are used as entered.');
    r.limit(geog ? 'Haversine distances can differ from survey (grid) distances by a few parts in a thousand.' : 'Grid distances; apply the scale factor if ground distances are needed.');
    r.h('Alignment');
    g.chainages.forEach(function (c, i) { if (i) r.step('Vertex ' + (i + 1) + ': chainage ' + DS.geo.fmtCh(c) + ' (' + f(c, 2) + ' m)'); });
    r.step(g.points.length + ' chainage points at ' + v.interval + ' m interval; ' + g.structures.length + ' structures located.');
    r.result('Alignment length', g.length, 'm', 2);
    r.result('Chainage points', g.points.length, '', 0);
    r.result('Structures', g.structures.length, '', 0);
    var beyond = parseStructs(v.structs).filter(function (s) { return isFinite(s.ch) && (s.ch < v.ch0 - 1e-6 || s.ch > v.ch0 + g.length + 1e-6); });
    r.check('Structure chainages within alignment', !beyond.length, beyond.length ? beyond.map(function (s) { return s.name; }).join(', ') : 'all', v.ch0 + ' – ' + f(v.ch0 + g.length, 1) + ' m');
    r.check('Coordinates look ' + (geog ? 'geographic' : 'projected'), geog ? g.points.every(function (p) { return Math.abs(p.xy[0]) <= 180 && Math.abs(p.xy[1]) <= 90; }) : g.points.every(function (p) { return Math.abs(p.xy[0]) > 180 || Math.abs(p.xy[1]) > 90; }),
      'EPSG:' + v.epsg, geog ? '|lon| ≤ 180, |lat| ≤ 90' : 'metres (not degrees)');
    r.table('Chainage points and structures', g.csvColumns, g.csvRows, 'points');
    r.data = { g: g, geog: geog };
    return r;
  }

  function qgisDrawing(v, rep) {
    var g = rep.data.g, d = new Drawing({ title: 'Alignment plan — ' + v.name });
    if (rep.data.geog) { d.nts = true; }
    var pts = g.geojson.features[0].geometry.coordinates;
    var kx = rep.data.geog ? 111320 * Math.cos(pts[0][1] * Math.PI / 180) : 1, ky = rep.data.geog ? 110540 : 1;
    var X = function (p) { return [(p[0] - pts[0][0]) * kx, (p[1] - pts[0][1]) * ky]; };
    d.pline(pts.map(X), 'WATER', { w: 0.6 });
    g.points.forEach(function (c) { var q = X(c.xy); d.circle(q[0], q[1], 0.4 * Math.max(1, g.length / 1000), 'DIM'); d.text(q[0], q[1], DS.geo.fmtCh(c.ch), { h: 1.8, dx: 1, dy: 1 }); });
    g.structures.forEach(function (s) { var q = X(s.xy); d.circle(q[0], q[1], 1.5 * Math.max(1, g.length / 1000), 'CONCRETE'); d.text(q[0], q[1], s.name, { h: 2.2, va: 't', dx: 1.5, dy: -1.5, layer: 'TEXT' }); });
    var e = d.extents();
    d.north(e[0] + (e[2] - e[0]) * 0.02, e[3]);
    d.text(e[0], e[1], rep.data.geog ? 'Local plan from lon/lat (approximate metres)' : 'Coordinates relative to first point; EPSG:' + v.epsg, { h: 2, va: 't', dy: -6 });
    return [{ key: 'plan', title: 'Alignment plan / संरेखण योजना', d: d }];
  }

  function qgisExports(v, rep) {
    var g = rep.data.g, base = (v.name || 'alignment').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    return [
      { label: 'GeoJSON (alignment, chainages, structures)', name: base + '.geojson', mime: 'application/geo+json', text: JSON.stringify(g.geojson, null, 1) },
      { label: 'CSV (points with coordinates)', name: base + '-points.csv', mime: 'text/csv', text: '﻿' + DS.csv.toCSV(g.csvColumns, g.csvRows) }
    ];
  }

  var qgisGuide = [
    'Install QGIS (free, qgis.org). Start a new project and set the project CRS (Project → Properties → CRS) to the same EPSG code used here.',
    'Drag the downloaded .geojson file into the QGIS window (or Layer → Add Layer → Add Vector Layer). Line = alignment, points = chainages and structures.',
    'To label chainages: Layer Properties → Labels → Single labels → value "label".',
    'To style by kind: Symbology → Categorized → column "kind" (alignment / chainage / structure).',
    'For the CSV: Layer → Add Layer → Add Delimited Text Layer, choose x / y (or lon / lat) fields and the same CRS.',
    'Use a satellite or survey base map you already have offline to check the alignment; export maps with Project → New Print Layout.'
  ];

  return {
    fns: { staadModel: staadModel, groupXS: groupXS, parseStructs: parseStructs, qgisBuild: qgisBuild },
    pages: [
      { id: 'staad', group: 'S', order: 1, hi: 'STAAD.Pro इनपुट', en: 'STAAD.Pro input (.std)', refs: 'Box culvert, beam / portal, aqueduct trough',
        intro: 'Generate a STAAD.Pro command file (.std) with units, joints, members, properties, supports, loads, combinations, PERFORM ANALYSIS and print commands. STAAD.Pro is licensed software that must be installed separately.',
        inputs: staadInputs, design: staadDesign, drawings: staadDrawing, exports: staadExports, guide: staadGuide },
      { id: 'hecras', group: 'S', order: 2, hi: 'HEC-RAS निर्यात', en: 'HEC-RAS export', refs: 'Cross-sections, reach lengths, steady flow',
        intro: 'Paste surveyed cross-sections (chainage, station, elevation) to get station–elevation tables, reach lengths and a steady-flow table to paste into HEC-RAS. Canal pages also export their own sections.',
        inputs: hecInputs, design: hecDesign, drawings: hecDrawing, exports: hecExports, guide: hecGuide },
      { id: 'qgis', group: 'S', order: 3, hi: 'QGIS निर्यात', en: 'QGIS export (GeoJSON / CSV)', refs: 'Alignment, chainages, structures',
        intro: 'Canal alignment, chainage points and structure locations (entered coordinates or a pasted CSV) as GeoJSON and CSV for QGIS.',
        inputs: qgisInputs, design: qgisDesign, drawings: qgisDrawing, exports: qgisExports, guide: qgisGuide }
    ]
  };
});
