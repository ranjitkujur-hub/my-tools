'use strict';
/* Core: solvers and parsing, drawing engine, DXF R12 writer, STAAD .std generator,
 * CSV, GeoJSON, HEC-RAS text and project import/export. */
const test = require('node:test');
const assert = require('node:assert/strict');
const DS = require('../js/core/index.js');
const { base: B, Drawing, dxf, staad, csv, geo, hecras, store, svg } = DS;

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} expected ${b}, got ${a}`);

test('base: bisect, solveUp, interp and parsing of pasted tables', () => {
  close(B.bisect(x => x * x - 2, 0, 2), Math.SQRT2, 1e-8);
  assert.ok(Number.isNaN(B.bisect(x => x * x + 1, 0, 2)), 'no sign change gives NaN');
  close(B.solveUp(x => x * x * x, 27), 3, 1e-8);
  assert.equal(B.interp([0, 10], [0, 100], 2.5), 25);
  assert.equal(B.interp([0, 10], [0, 100], 20), 100, 'clamped');
  assert.deepEqual(B.parseTable('ch, gl\n0, 212.4\n200\t212.3\n400 212.1;x', 2), [[0, 212.4], [200, 212.3], [400, 212.1]]);
  assert.deepEqual(B.parseSeries('12, 15.5\n 18;20'), [12, 15.5, 18, 20]);
  assert.equal(B.f(-0.0001, 2), '0.00');
  assert.equal(B.f(NaN), '—');
});

test('base: coerce and validate inputs against min/max', () => {
  const inputs = [{ key: 'a', def: 2, min: 1, max: 5, unit: 'm' }, { key: 's', type: 'select', def: 'x' }, { key: 'h', def: 1, min: 0, show: v => v.s === 'y' }];
  const v = B.coerce(inputs, { a: '7' });
  assert.equal(v.a, 7);
  assert.equal(v.s, 'x');
  assert.deepEqual(Object.keys(B.validate(inputs, v)), ['a']);
  assert.deepEqual(B.validate(inputs, B.coerce(inputs, { h: 'abc' })), {}, 'hidden inputs are not validated');
});

test('drawing: auto scale picks the smallest standard scale that fits', () => {
  const d = new Drawing();
  d.rect(0, 0, 20, 5, 'CONCRETE');
  const s = d.fitScale(267, 146);
  assert.ok(Drawing.NICE_SCALES.includes(s));
  assert.ok(20 * 1000 / s <= 267 - 56 + 1e-9, 'fits the width');
  const i = Drawing.NICE_SCALES.indexOf(s);
  assert.ok(20 * 1000 / Drawing.NICE_SCALES[i - 1] > 267 - 56, 'next smaller scale would not fit');
});

test('drawing: hatch lines stay inside the polygon', () => {
  const sq = [[0, 0], [10, 0], [10, 10], [0, 10]];
  const lines = Drawing.hatchLines(sq, 45, 1);
  assert.ok(lines.length > 10);
  for (const l of lines) for (const k of [0, 2]) {
    assert.ok(l[k] >= -1e-9 && l[k] <= 10 + 1e-9 && l[k + 1] >= -1e-9 && l[k + 1] <= 10 + 1e-9, 'endpoint inside');
  }
});

test('drawing: dimensions, levels and vertical exaggeration explode to primitives', () => {
  const d = new Drawing({ vex: 10 });
  d.dimH(0, 5, 0, 8);
  d.level(1, 2, 'FSL 210.500');
  const p = d.explode(100);
  const texts = p.filter(x => x.t === 'T').map(x => x.s);
  assert.ok(texts.includes('5.00'), 'dimension text is the true length');
  assert.ok(texts.includes('FSL 210.500'));
  const tri = p.find(x => x.t === 'P' && x.l === 'DIM');
  assert.equal(tri.p[0][1], 20, 'y is exaggerated ×10');
  assert.equal(d.scaleLabel(1000), 'H 1:1000, V 1:100');
});

function sample() {
  const d = new Drawing({ title: 'Test section' });
  d.hatch([[0, 0], [4, 0], [4, 1], [0, 1]], 'concrete');
  d.hatch([[0, 1], [4, 1], [4, 2], [0, 2]], 'water');
  d.hatch([[-1, -1], [5, -1], [5, 0], [-1, 0]], 'soil');
  d.circle(2, 0.5, 0.1, 'REBAR');
  d.arc(2, 2, 1, 0, 90, 'CENTRE');
  d.centre(2, -1, 2, 3);
  d.dimH(0, 4, 0, 8);
  d.text(2, 2.5, 'Ø 12 √ m³ — क');
  return d;
}

test('DXF R12: valid group-code structure, sections, header version and EOF', () => {
  const out = dxf.write(sample(), { scale: 50 });
  const lines = out.split('\r\n');
  assert.equal(lines[lines.length - 1], '');
  assert.equal(lines[lines.length - 2], 'EOF');
  const P = dxf.parse(out);
  assert.deepEqual(P.sections, ['HEADER', 'TABLES', 'BLOCKS', 'ENTITIES']);
  const i = P.pairs.findIndex(p => p[0] === 9 && p[1] === '$ACADVER');
  assert.equal(P.pairs[i + 1][1], 'AC1009');
  // all group codes are integers and every SECTION is closed
  assert.equal(P.pairs.filter(p => p[0] === 0 && p[1] === 'SECTION').length, P.pairs.filter(p => p[0] === 0 && p[1] === 'ENDSEC').length);
  // R12 has no LWPOLYLINE / HATCH / MTEXT
  for (const e of P.entities) assert.ok(['LINE', 'POLYLINE', 'VERTEX', 'SEQEND', 'CIRCLE', 'ARC', 'TEXT'].includes(e.type), e.type);
  assert.ok(/^[\x00-\x7f]*$/.test(out), 'pure ASCII output');
});

test('DXF R12: layer table holds the seven standard layers, entities use them', () => {
  const P = dxf.parse(dxf.write(sample(), { scale: 50 }));
  assert.deepEqual(P.layers, ['0', 'CONCRETE', 'SOIL', 'WATER', 'DIM', 'TEXT', 'CENTRE', 'REBAR']);
  const used = new Set(P.entities.map(e => e.layer));
  for (const l of ['CONCRETE', 'SOIL', 'WATER', 'DIM', 'TEXT', 'CENTRE', 'REBAR']) assert.ok(used.has(l), 'uses layer ' + l);
  const types = new Set(P.entities.map(e => e.type));
  for (const t of ['LINE', 'POLYLINE', 'VERTEX', 'SEQEND', 'CIRCLE', 'ARC', 'TEXT']) assert.ok(types.has(t), 'has ' + t);
  // every POLYLINE is followed by vertices and a SEQEND
  const seq = P.entities.map(e => e.type);
  seq.forEach((t, k) => { if (t === 'POLYLINE') { assert.equal(seq[k + 1], 'VERTEX'); assert.ok(seq.indexOf('SEQEND', k) > k); } });
});

test('DXF R12: coordinates are in metres and text heights follow the scale', () => {
  const d = new Drawing();
  d.line(0, 0, 12.5, 0, 'CONCRETE');
  d.text(0, 0, 'A', { h: 2.5 });
  const P = dxf.parse(dxf.write(d, { scale: 100 }));
  const k = P.pairs.findIndex(p => p[0] === 0 && p[1] === 'LINE');
  const g = {};
  for (let j = k + 1; P.pairs[j][0] !== 0; j++) g[P.pairs[j][0]] = Number(P.pairs[j][1]);
  assert.equal(g[11], 12.5);
  const t = P.pairs.findIndex(p => p[0] === 0 && p[1] === 'TEXT');
  const h = P.pairs.slice(t).find(p => p[0] === 40);
  close(Number(h[1]), 0.25, 1e-9, '2.5 mm at 1:100 = 0.25 m');
  assert.equal(dxf.text('Ø12 √x ³ क'), '%%c12 sqrtx 3 \\U+0915');
});

test('SVG: plain drawing and A3 sheet with title block', () => {
  const r = svg.render(sample());
  assert.match(r.svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
  assert.ok(r.svg.includes('Scale 1:'));
  const s = svg.sheet(sample(), { size: 'A3', office: 'Sample Division <Test>', number: 'DS/1', designed: 'A', checked: 'B', approved: 'C', date: '01-01-2026' });
  assert.ok(s.svg.includes('viewBox="0 0 420 297"'));
  for (const k of ['DESIGNED', 'CHECKED', 'APPROVED', 'DRG. NO.', 'SCALE', 'DATE', 'Sample Division &lt;Test&gt;']) assert.ok(s.svg.includes(k), k);
});

test('STAAD: list compression and every builder passes the command-structure lint', () => {
  assert.equal(staad.list([1, 2, 3, 5, 7, 8, 9, 11]), '1 TO 3 5 7 TO 9 11');
  assert.equal(staad.list([4, 5]), '4 5');
  const models = [
    staad.boxCulvert({ span: 3, height: 2.5, nCells: 2, tTop: 0.3, tBot: 0.35, tWall: 0.3, fill: 1.2, liveUDL: 40 }),
    staad.beam({ spans: [5, 6], b: 0.3, D: 0.5, dl: 15, ll: 10 }),
    staad.portal({ span: 6, height: 4, nBays: 2, colB: 0.3, colD: 0.4, beamB: 0.3, beamD: 0.6, dl: 20, ll: 10, lateral: 15 }),
    staad.trough({ width: 4, depth: 1.8, wallH: 2.3, tWall: 0.3, tSlab: 0.35 })
  ];
  for (const m of models) {
    const t = staad.write(m);
    assert.deepEqual(staad.lint(t), [], m.title);
    for (const k of ['UNIT METER KN', 'JOINT COORDINATES', 'MEMBER INCIDENCES', 'MEMBER PROPERTY', 'CONSTANTS', 'SUPPORTS', 'LOAD 1 ', 'LOAD COMB', 'PERFORM ANALYSIS', 'PRINT MEMBER FORCES', 'FINISH']) assert.ok(t.includes(k), m.title + ' has ' + k);
  }
  assert.ok(staad.lint('STAAD PLANE X\nJOINT COORDINATES\n1 0 0 0;\nMEMBER INCIDENCES\n1 1 2;\nFINISH').some(e => /undefined joint/.test(e)), 'lint catches a bad member');
});

test('STAAD: box culvert frame geometry and loads (independent re-calculation)', () => {
  const p = { span: 3, height: 2.5, nCells: 2, tTop: 0.3, tBot: 0.35, tWall: 0.3, fill: 1.2, gammaSoil: 18, K0: 0.5, liveUDL: 40, nSeg: 6 };
  const m = staad.boxCulvert(p);
  assert.equal(m.joints.length, 2 * 6 + 1 + 3, 'bottom nodes + top nodes');
  assert.equal(m.members.length, 12 + 3 + 2);
  const Hc = 2.5 + (0.3 + 0.35) / 2;
  close(Math.max(...m.joints.map(j => j[2])), Hc, 1e-9, 'frame height on centre lines');
  close(Math.max(...m.joints.map(j => j[1])), 2 * 3.3, 1e-9, 'frame width');
  const fill = m.loads[1].member[0];
  close(fill.w, -18 * 1.2, 1e-9, 'fill on top slab');
  const ep = m.loads[2].member[0];
  close(ep.w1, 0.5 * 18 * (1.2 + 0.15 + Hc), 1e-9, 'earth pressure at bottom of wall');
  close(ep.w2, 0.5 * 18 * (1.2 + 0.15), 1e-9, 'earth pressure at top of wall');
  // spring stiffness: interior node k × trib length
  assert.ok(m.supports[1].spec.includes('KFY ' + String(Math.round(20000 * 3.3 / 6 * 10000) / 10000)));
});

test('CSV: quoting, CRLF and protection against formula injection', () => {
  const t = csv.toCSV(['a', 'b'], [['x,y', 'he said "hi"'], [1.23456789, '=SUM(A1)'], ['-5', -5]]);
  assert.ok(t.endsWith('\r\n'));
  const rows = csv.parse(t);
  assert.deepEqual(rows[0], ['a', 'b']);
  assert.deepEqual(rows[1], ['x,y', 'he said "hi"']);
  assert.deepEqual(rows[2], ['1.234568', "'=SUM(A1)"]);
  assert.deepEqual(rows[3], ['-5', '-5'], 'negative numbers are not escaped');
});

test('GeoJSON: chainages, interpolated points, crs member and CSV rows', () => {
  const g = geo.build({ epsg: 32644, name: 'Test', alignment: [[0, 0], [300, 400], [300, 1000]], interval: 250,
    structures: [{ name: 'Fall', type: 'fall', ch: 500 }, { name: 'Bridge', type: 'bridge', x: 10, y: 20 }] });
  close(g.length, 1100, 1e-9);
  assert.deepEqual(g.points.map(p => p.ch), [0, 250, 500, 750, 1000, 1100]);
  assert.deepEqual(g.points[1].xy, [150, 200]);
  assert.equal(g.geojson.type, 'FeatureCollection');
  assert.equal(g.geojson.crs.properties.name, 'urn:ogc:def:crs:EPSG::32644');
  assert.equal(g.geojson.features[0].geometry.type, 'LineString');
  const fall = g.geojson.features.find(f => f.properties.name === 'Fall');
  assert.deepEqual(fall.geometry.coordinates, [300, 400]);
  assert.equal(fall.properties.label, 'Fall @ 0+500');
  assert.equal(g.csvRows.length, 6 + 2);
  const j = JSON.parse(JSON.stringify(g.geojson));
  for (const f of j.features) { assert.equal(f.type, 'Feature'); assert.ok(Array.isArray(f.geometry.coordinates)); }
  // geographic: no crs member (RFC 7946), haversine length of 0.01° of latitude ≈ 1112 m
  const w = geo.build({ epsg: 4326, alignment: [[85, 23], [85, 23.01]], interval: 1000 });
  assert.equal(w.geojson.crs, undefined);
  close(w.length, 1111.95, 0.5, 'haversine');
  assert.equal(geo.fmtCh(12345.6), '12+346');
});

test('HEC-RAS: canal section, river stations and steady flow text', () => {
  const s = hecras.canalSection({ bed: 100, b: 3, z: 1.5, bankH: 2, bankTop: 3, outer: 2, ground: 101 });
  assert.equal(s.points[0][0], 0);
  assert.ok(s.points.every((p, i) => i === 0 || p[0] > s.points[i - 1][0]), 'stations increase');
  close(s.bankRight - s.bankLeft, 3 + 2 * 1.5 * 2, 1e-9, 'top width at bank level');
  const secs = [{ chainage: 0, points: s.points, bankLeft: s.bankLeft, bankRight: s.bankRight }, { chainage: 400, points: s.points, bankLeft: s.bankLeft, bankRight: s.bankRight }];
  const t = hecras.geometryText('Canal', 'R1', secs);
  assert.ok(t.includes('River Station: 400.0'));
  assert.ok(t.includes('River Station: 0.0'));
  assert.ok(t.includes('Station\tElevation'));
  assert.deepEqual(hecras.reachLengths(secs), [400, 0]);
  const f = hecras.steadyFlowText('Canal', 'R1', 400, [{ name: 'PF 1', Q: 10 }], { upSlope: 0.0002, dnSlope: 0.0002 });
  assert.ok(f.includes('PF 1\t10.000'));
  assert.ok(f.includes('Normal Depth'));
});

test('projects: backup round trip, import validation and id merging', () => {
  const d1 = store.makeDesign({ project: 'Sample Project', structure: 'Fall 1', module: 'canal-fall', inputs: { Q: 5 } });
  const d2 = store.duplicate(d1);
  assert.notEqual(d1.id, d2.id);
  assert.ok(d2.title.endsWith('(copy)'));
  const b = store.backup({ office: 'X' }, [d1, d2]);
  const back = store.parseImport(JSON.stringify(b));
  assert.equal(back.kind, 'backup');
  assert.equal(back.designs.length, 2);
  assert.equal(back.settings.office, 'X');
  assert.throws(() => store.parseImport('not json'), /JSON/);
  assert.throws(() => store.parseImport('{"app":"other"}'), /Design Studio/);
  assert.throws(() => store.parseImport(JSON.stringify({ app: 'design-studio', version: 1, designs: [{ module: 'x' }] })), /invalid/);
  const merged = store.mergeIds([d1], [Object.assign({}, d1)]);
  assert.notEqual(merged[0].id, d1.id, 'clashing id replaced');
  const g = store.group([d1, d2, store.makeDesign({ project: 'A', module: 'm', inputs: {} })]);
  assert.deepEqual(g.map(x => x.name), ['A', 'Sample Project']);
});
