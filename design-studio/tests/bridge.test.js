'use strict';
/* E. Bridges and culverts: formula checks by independent re-calculation,
 * identities between the IRC:78 and Lacey scour forms, design reports and
 * the STAAD.Pro box-culvert export. */
const test = require('node:test');
const assert = require('node:assert/strict');
const DS = require('../js/core/index.js');
const M = require('../js/modules/bridge.js');
const F = M.fns;

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} ${a} vs ${b}`);
const page = id => M.pages.find(p => p.id === id);
const run = (id, over) => { const p = page(id); const v = DS.base.coerce(p.inputs, over || {}); return { p, v, rep: p.design(v) }; };
const res = (rep, label) => rep.results.find(r => r.label === label).value;

test('Lacey regime width W = 4.8 √Q (IRC:5 / IRC:SP:13 form), independent re-calculation', () => {
  near(F.regimeWidth(450), 4.8 * Math.sqrt(450), 1e-12);
  near(F.regimeWidth(100), 48.0, 1e-12, 'Q = 100 m³/s gives W = 48 m');
});

test('Silt factor Ksf = 1.76 √dm (Lacey), dm in mm', () => {
  near(F.siltFactor(1.0), 1.76, 1e-12);
  near(F.siltFactor(0.3), 0.96399, 1e-5);
});

test('IRC:78 normal scour 1.34 (Db²/Ksf)^(1/3) — hand calculation Db = 6.094, Ksf = 0.964', () => {
  // (6.09375² / 0.963987)^(1/3) = 38.521^(1/3) = 3.3778; × 1.34 = 4.526 m
  near(F.normalScour(585 / 96, F.siltFactor(0.3)), 4.526, 0.001);
});

test('IRC:78 scour with Db = Q/W reduces to Lacey 0.473 (Q/f)^(1/3) (regime identity)', () => {
  for (const Q of [5, 120, 2500]) {
    const fs = F.siltFactor(0.5), Db = Q / F.regimeWidth(Q);
    const a = F.normalScour(Db, fs), b = F.laceyScour(Q, fs);
    assert.ok(Math.abs(a - b) / b < 0.01, `Q=${Q}: ${a} vs ${b}`);
  }
});

test('Molesworth afflux (IRC:SP:13), independent re-calculation', () => {
  const V = 450 / 444, A = 444, a = 355.2;
  const h = (V * V / 17.88 + 0.0152) * ((A / a) ** 2 - 1);
  near(F.molesworth(V, A, a), h, 1e-12);
  near(h, 0.0409, 0.0005, 'about 41 mm');
  assert.equal(F.molesworth(1.5, 100, 120), 0, 'no afflux when waterway is not obstructed');
});

test('IRC:5 vertical clearance table by discharge (verify clause)', () => {
  assert.equal(F.clearanceIRC5(0.2), 0.15);
  assert.equal(F.clearanceIRC5(0.3), 0.45);
  assert.equal(F.clearanceIRC5(12), 0.6);
  assert.equal(F.clearanceIRC5(30), 0.9);
  assert.equal(F.clearanceIRC5(450), 1.2);
  assert.equal(F.clearanceIRC5(5000), 1.5);
});

test('Barrel head loss = entry 0.5 + exit 1.0 velocity heads + Manning friction, independent re-calculation', () => {
  const V = 2.0, R = 0.6, L = 15, n = 0.015;
  const hv = V * V / (2 * 9.81), hf = n * n * V * V * L / Math.pow(R, 4 / 3);
  const r = F.barrelLoss(V, R, L, n);
  near(r.hv, hv, 1e-12); near(r.hf, hf, 1e-12); near(r.total, 1.5 * hv + hf, 1e-12);
});

test('Vent flow: free surface below soffit, full barrel above', () => {
  const a = F.ventFlow(12, 2, 2.5, 2.5, 1.9);
  assert.equal(a.full, false); near(a.A, 9.5, 1e-12); near(a.P, 2 * (2.5 + 3.8), 1e-12); near(a.V, 12 / 9.5, 1e-12);
  const b = F.ventFlow(12, 1, 2.5, 2.5, 3.0);
  assert.equal(b.full, true); near(b.A, 6.25, 1e-12); near(b.P, 10, 1e-12);
});

test('Bridge waterway report: levels follow from scour, afflux and clearance', () => {
  const { v, rep } = run('bridge-waterway');
  const dsm = res(rep, 'Normal scour depth dsm (below HFL)');
  near(res(rep, 'Effective linear waterway L'), 96, 1e-9);
  near(res(rep, 'Overall length between abutments'), 96 + 7 * 1.2, 1e-9);
  near(res(rep, 'Max scour level at piers'), v.HFL - 2 * dsm, 1e-9);
  near(res(rep, 'Max scour level at abutments'), v.HFL - 1.27 * dsm, 1e-9);
  near(res(rep, 'Pier foundation level'), v.HFL - 2 * dsm - v.grip, 1e-9);
  near(res(rep, 'Required soffit level'), v.HFL + res(rep, 'Afflux') + 1.2, 1e-9);
  assert.ok(rep.allOk(), 'defaults pass all checks');
  const all = run('bridge-waterway', { abutCase: 'allround' }).rep;
  near(res(all, 'Max scour level at abutments'), v.HFL - 2 * dsm, 1e-9);
});

test('Bridge waterway: a low formation fails the clearance and freeboard checks', () => {
  const { rep } = run('bridge-waterway', { formation: 113.0 });
  assert.equal(rep.checks.find(c => c.label.startsWith('Vertical clearance')).ok, false);
  assert.equal(rep.checks.find(c => c.label === 'Freeboard').ok, false);
  assert.throws(() => run('bridge-waterway', { bed: 113 }), /Bed level/);
});

test('Culvert (box): defaults pass, preliminary thicknesses and cushion', () => {
  const { v, rep } = run('culvert');
  assert.ok(rep.allOk());
  near(res(rep, 'Slab thickness (preliminary)'), 0.25, 1e-9);
  near(res(rep, 'Cushion over top slab'), v.formation - (v.bed + v.height + 0.25), 1e-9);
  near(res(rep, 'Overall width of structure'), 2 * 2.5 + 3 * 0.25, 1e-9);
  const big = F.prelimThickness('box', 4.2, 3);
  near(big.slab, 0.425, 1e-9, 'span/10 rounded up to 25 mm');
  near(big.wall, 0.35, 1e-9, 'max(span, height)/12 rounded up');
  assert.throws(() => run('culvert', { formation: 100.0 }), /cushion/);
});

test('Culvert: pressure flow and slab culvert variant', () => {
  const full = run('culvert', { HFL: 101, nCells: 1 }).rep;
  assert.equal(res(full, 'Vent flow condition'), 'Full (pressure)');
  assert.ok(full.warnings.length > 0);
  const { p, v, rep } = run('culvert', { type: 'slab' });
  near(res(rep, 'Abutment height'), v.height + v.fdn, 1e-9);
  assert.ok(res(rep, 'Abutment base width') >= 0.45 * (v.height + v.fdn) - 1e-9);
  assert.deepEqual(p.exports(v, rep), [], 'STAAD export only for box culverts');
});

test('STAAD.Pro box culvert export: valid command structure, joints, members and loads', () => {
  const { p, v, rep } = run('culvert');
  const ex = p.exports(v, rep);
  assert.equal(ex.length, 1);
  assert.equal(ex[0].name, 'box-culvert.std');
  const std = ex[0].text;
  assert.deepEqual(DS.staad.lint(std), []);
  const model = F.boxModel(v, rep);
  const nc = 2, nseg = 6;
  assert.equal(model.joints.length, nc * nseg + 1 + (nc + 1));
  assert.equal(model.members.length, nc * nseg + (nc + 1) + nc);
  assert.equal(model.loads.length, 5);
  assert.match(std, /^STAAD PLANE BOX CULVERT 2 CELL PER METRE RUN/);
  assert.match(std, /UNIT METER KN/);
  assert.match(std, /SELFWEIGHT Y -1/);
  // earth fill on top slab: 18 kN/m³ × 1.75 m cushion
  assert.match(std, / UNI GY -31\.5\r?\n/);
  assert.match(std, /KFY /);
  assert.match(std, /LOAD COMB 101/);
  assert.match(std, /PERFORM ANALYSIS/);
  assert.ok(std.trim().endsWith('FINISH'));
});
