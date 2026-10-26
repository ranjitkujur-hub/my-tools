'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const DS = require('../js/core/index.js');
const M = require('../js/modules/spillway.js');
const F = M.fns;
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} expected ${b}, got ${a}`);

test('WES profile x^1.85 = 2Hd^0.85·y: y = 0.5 Hd at x = Hd (USACE Hydraulic Design Criteria, WES standard crest)', () => {
  near(F.wesY(1, 1), 0.5, 1e-12);
  near(F.wesY(6, 6), 3, 1e-12);
  near(Math.pow(4, 1.85), 2 * Math.pow(6, 0.85) * F.wesY(4, 6), 1e-9);
});

test('Tangent point: slope of the WES curve equals 1/z there (numerical derivative)', () => {
  const Hd = 6.25, z = 0.75, xT = F.tangentX(Hd, z), h = 1e-5;
  near((F.wesY(xT + h, Hd) - F.wesY(xT - h, Hd)) / (2 * h), 1 / z, 1e-6);
});

test('Design head round trip: Q = C·Le·He^1.5 with Le = L − 2(N·Kp + Ka)He', () => {
  const He = F.headFor(3000, 2.18, 90, 5, 0.01, 0.1);
  near(F.effectiveLength(90, 5, 0.01, 0.1, He), 90 - 2 * (0.05 + 0.1) * He, 1e-12);
  near(2.18 * F.effectiveLength(90, 5, 0.01, 0.1, He) * Math.pow(He, 1.5), 3000, 1e-6);
});

test('Upstream compound curve: arcs are continuous and the last one is vertical at x = −0.2818 Hd', () => {
  const Hd = 5, arcs = F.upstreamArcs(Hd);
  for (let i = 1; i < 3; i++) near(F.arcY(arcs[i], arcs[i].x0), F.arcY(arcs[i - 1], arcs[i - 1].x1), 1e-9, 'continuity');
  near(arcs[0].r, 0.5 * Hd, 1e-12); near(arcs[1].r, 0.2 * Hd, 1e-12); near(arcs[2].r, 0.04 * Hd, 1e-12);
  near(arcs[2].cx - arcs[2].r, -0.2818 * Hd, 1e-3 * Hd, 'vertical tangent at the u/s face');
  near(F.arcY(arcs[0], 0), 0, 1e-12, 'arc 1 passes through the crest');
});

test('Ski-jump throw with Y = 0 reduces to the projectile range V² sin 2θ / g', () => {
  near(F.throwDistance(20, 30, 0), 400 * Math.sin(Math.PI / 3) / 9.81, 1e-9);
  assert.ok(F.throwDistance(20, 30, 5) > F.throwDistance(20, 30, 0));
});

test('Ogee spillway page defaults: discharge reproduces Q and checks pass', () => {
  const p = M.pages[0];
  const v = DS.base.coerce(p.inputs, {});
  const r = p.design(v);
  const D = r.data;
  near(F.discharge(2.18, 90, 5, 0.01, 0.1, D.He), 3000, 1e-6);
  near(D.lip, 210 + 15 * (1 - Math.cos(35 * Math.PI / 180)), 1e-9, 'lip level');
  assert.ok(r.tables[0].rows.length > 10, 'coordinate table');
  assert.ok(r.allOk(), r.checks.filter(c => !c.ok).map(c => c.label).join(', '));
});
