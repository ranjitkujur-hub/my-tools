/* Drawing model shared by the SVG, PNG, print and DXF outputs.
 * Geometry is in world metres (x to the right, y up). Sizes of text,
 * arrows, dimension offsets and hatch spacing are in paper millimetres,
 * so they stay readable at any scale; explode(scale) turns everything
 * into simple primitives in world units for a given drawing scale 1:scale.
 *
 * Layers: CONCRETE, SOIL, WATER, DIM, TEXT, CENTRE, REBAR.
 * Primitives: {t:'L', a:[x1,y1,x2,y2]}, {t:'P', p:[[x,y]..], c:closed, fill},
 *             {t:'C', x,y,r, solid}, {t:'A', x,y,r,a1,a2 (deg, ccw)},
 *             {t:'T', x,y,s,h,ha:'l'|'c'|'r',va:'b'|'m'|'t',rot}
 *             each with l: layer, w: line weight (mm), dash: bool.
 */
(function (root, factory) {
  var m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else { root.DS = root.DS || {}; root.DS.Drawing = m; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var LAYERS = {
    CONCRETE: { color: 8, svg: '#2b2b2b', w: 0.5 },
    SOIL: { color: 34, svg: '#7a5230', w: 0.35 },
    WATER: { color: 5, svg: '#1f6fb5', w: 0.3 },
    DIM: { color: 3, svg: '#2e6b30', w: 0.18 },
    TEXT: { color: 7, svg: '#111111', w: 0.18 },
    CENTRE: { color: 1, svg: '#b3261e', w: 0.18, dash: true },
    REBAR: { color: 1, svg: '#c62828', w: 0.5 }
  };
  var LAYER_NAMES = Object.keys(LAYERS);

  // Hatch patterns: angles (deg) and spacing (paper mm), layer and SVG fill tint.
  var HATCH = {
    concrete: { angles: [45], sp: 2.2, layer: 'CONCRETE', fill: '#e7e7e7' },
    soil: { angles: [135], sp: 3.2, layer: 'SOIL', fill: '#f2e7d5' },
    rock: { angles: [45, 135], sp: 3.5, layer: 'SOIL', fill: '#e2ddd5' },
    water: { angles: [0], sp: 2.5, layer: 'WATER', fill: '#dcecfb' },
    masonry: { angles: [45, 135], sp: 2.2, layer: 'CONCRETE', fill: '#ebe6df' },
    filter: { angles: [0, 90], sp: 1.8, layer: 'SOIL', fill: '#f6f0e3' },
    pressure: { angles: [90], sp: 2.0, layer: 'WATER', fill: '#e9f3fd' }
  };

  var NICE_SCALES = [1, 2, 5, 10, 20, 25, 50, 75, 100, 125, 200, 250, 500, 750, 1000, 1250, 2000, 2500,
    5000, 7500, 10000, 20000, 25000, 50000, 100000, 200000, 250000, 500000];

  function Drawing(opts) {
    opts = opts || {};
    this.title = opts.title || '';
    this.vex = opts.vex || 1;          // vertical exaggeration (L-sections)
    this.nts = !!opts.nts;             // charts and diagrams: not to scale
    this.ents = [];
  }

  var P = Drawing.prototype;
  function add(d, e) { d.ents.push(e); return d; }

  P.line = function (x1, y1, x2, y2, layer, o) { return add(this, { k: 'line', a: [x1, y1, x2, y2], l: layer || 'CONCRETE', o: o || {} }); };
  P.pline = function (pts, layer, o) { o = o || {}; return add(this, { k: 'pline', p: pts.map(function (q) { return [q[0], q[1]]; }), l: layer || 'CONCRETE', o: o }); };
  P.poly = function (pts, layer, o) { o = o || {}; o.closed = true; return this.pline(pts, layer, o); };
  P.rect = function (x, y, w, h, layer, o) { return this.poly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], layer, o); };
  // Hatched area with outline (o.outline === false to omit the outline).
  P.hatch = function (pts, kind, o) { return add(this, { k: 'hatch', p: pts.map(function (q) { return [q[0], q[1]]; }), kind: kind, o: o || {} }); };
  P.circle = function (x, y, r, layer, o) { return add(this, { k: 'circle', x: x, y: y, r: r, l: layer || 'CONCRETE', o: o || {} }); };
  P.arc = function (x, y, r, a1, a2, layer, o) { return add(this, { k: 'arc', x: x, y: y, r: r, a1: a1, a2: a2, l: layer || 'CONCRETE', o: o || {} }); };
  // Text: o = {h (mm, default 2.5), ha, va, rot (deg), dx, dy (mm), layer}
  P.text = function (x, y, s, o) { return add(this, { k: 'text', x: x, y: y, s: String(s), o: o || {} }); };
  // Aligned dimension p1-p2, offset (mm) to the left of p1->p2. o = {text, dp, h}
  P.dim = function (x1, y1, x2, y2, off, o) { return add(this, { k: 'dim', a: [x1, y1, x2, y2], off: off === undefined ? 8 : off, o: o || {} }); };
  P.dimH = function (x1, x2, y, off, o) { return x2 >= x1 ? this.dim(x1, y, x2, y, -(off === undefined ? 8 : off), o) : this.dim(x2, y, x1, y, -(off === undefined ? 8 : off), o); };
  P.dimV = function (x, y1, y2, off, o) { return y2 >= y1 ? this.dim(x, y1, x, y2, off === undefined ? 8 : off, o) : this.dim(x, y2, x, y1, off === undefined ? 8 : off, o); };
  // Level marker (inverted triangle on the surface) with a label like "FSL 210.500".
  P.level = function (x, y, label, o) { return add(this, { k: 'level', x: x, y: y, s: label, o: o || {} }); };
  // Arrow from (x1,y1) to (x2,y2) in world units.
  P.arrow = function (x1, y1, x2, y2, o) { return add(this, { k: 'arrow', a: [x1, y1, x2, y2], o: o || {} }); };
  // Force arrow with its head at (x,y), pointing along angle (deg), tail length in mm.
  P.force = function (x, y, angle, len, label, o) { return add(this, { k: 'force', x: x, y: y, ang: angle, len: len || 15, s: label || '', o: o || {} }); };
  P.flow = function (x, y, angle, label) { return add(this, { k: 'flow', x: x, y: y, ang: angle || 0, s: label === undefined ? 'FLOW' : label, o: {} }); };
  P.north = function (x, y) { return add(this, { k: 'north', x: x, y: y, o: {} }); };
  P.centre = function (x1, y1, x2, y2) { return this.line(x1, y1, x2, y2, 'CENTRE', { dash: true }); };
  P.bar = function (x, y, dia) { return this.circle(x, y, dia / 2, 'REBAR', { solid: true }); };

  // Geometric extents (world units, before vertical exaggeration).
  P.extents = function () {
    var b = [Infinity, Infinity, -Infinity, -Infinity];
    function grow(x, y) { if (!isFinite(x) || !isFinite(y)) return; if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y; }
    this.ents.forEach(function (e) {
      if (e.a) { grow(e.a[0], e.a[1]); grow(e.a[2], e.a[3]); }
      else if (e.p) e.p.forEach(function (q) { grow(q[0], q[1]); });
      else if (e.r !== undefined) { grow(e.x - e.r, e.y - e.r); grow(e.x + e.r, e.y + e.r); }
      else if (e.x !== undefined) grow(e.x, e.y);
    });
    if (!isFinite(b[0])) return [0, 0, 1, 1];
    if (b[2] - b[0] < 1e-6) { b[0] -= 0.5; b[2] += 0.5; }
    if (b[3] - b[1] < 1e-6) { b[1] -= 0.5; b[3] += 0.5; }
    return b;
  };

  // Smallest standard scale 1:s that fits the geometry in w x h mm (leaving room for labels).
  P.fitScale = function (w, h) {
    var e = this.extents();
    var margin = 28;
    var need = Math.max((e[2] - e[0]) * 1000 / Math.max(w - 2 * margin, 20),
      (e[3] - e[1]) * this.vex * 1000 / Math.max(h - 2 * margin, 20));
    for (var i = 0; i < NICE_SCALES.length; i++) if (NICE_SCALES[i] >= need * 0.999) return NICE_SCALES[i];
    return NICE_SCALES[NICE_SCALES.length - 1];
  };

  P.scaleLabel = function (s) {
    if (this.nts) return 'NTS';
    if (this.vex === 1) return '1:' + s;
    return 'H 1:' + s + ', V 1:' + round6(s / this.vex);
  };
  function round6(x) { return Math.round(x * 1e6) / 1e6; }

  function fmt(x, dp) { var s = Number(x).toFixed(dp); return s === '-0.000' ? '0.000' : s; }

  // Hatch lines inside polygon `pts` (already in output coordinates).
  function hatchLines(pts, angle, sp) {
    var a = angle * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
    // rotate by -a so hatch lines become horizontal
    var r = pts.map(function (q) { return [q[0] * ca + q[1] * sa, -q[0] * sa + q[1] * ca]; });
    var ymin = Infinity, ymax = -Infinity;
    r.forEach(function (q) { if (q[1] < ymin) ymin = q[1]; if (q[1] > ymax) ymax = q[1]; });
    var out = [], n = r.length;
    for (var y = Math.ceil(ymin / sp) * sp; y < ymax; y += sp) {
      var xs = [];
      for (var i = 0; i < n; i++) {
        var p1 = r[i], p2 = r[(i + 1) % n];
        if ((p1[1] <= y && p2[1] > y) || (p2[1] <= y && p1[1] > y)) {
          xs.push(p1[0] + (y - p1[1]) * (p2[0] - p1[0]) / (p2[1] - p1[1]));
        }
      }
      xs.sort(function (u, v) { return u - v; });
      for (var j = 0; j + 1 < xs.length; j += 2) {
        if (xs[j + 1] - xs[j] < 1e-9) continue;
        // rotate back
        out.push([xs[j] * ca - y * sa, xs[j] * sa + y * ca, xs[j + 1] * ca - y * sa, xs[j + 1] * sa + y * ca]);
      }
    }
    return out;
  }

  function polyArea(p) {
    var s = 0;
    for (var i = 0; i < p.length; i++) { var a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; }
    return Math.abs(s) / 2;
  }

  // Turn every entity into primitives at drawing scale 1:scale.
  // Output coordinates are world metres with y multiplied by vex.
  P.explode = function (scale) {
    var vex = this.vex, mm = scale / 1000;     // world metres per paper mm
    var out = [];
    function Y(y) { return y * vex; }
    function L(x1, y1, x2, y2, l, o) { out.push({ t: 'L', a: [x1, y1, x2, y2], l: l, w: o && o.w, dash: o && o.dash }); }
    function T(x, y, s, h, ha, va, rot, l) { out.push({ t: 'T', x: x, y: y, s: s, h: h * mm, ha: ha || 'l', va: va || 'b', rot: rot || 0, l: l || 'TEXT' }); }
    function arrowHead(x, y, ux, uy, l, size) {
      size = (size || 2.5) * mm;
      var nx = -uy, ny = ux, bx = x - ux * size, by = y - uy * size, hw = size * 0.35;
      out.push({ t: 'P', p: [[x, y], [bx + nx * hw, by + ny * hw], [bx - nx * hw, by - ny * hw]], c: true, l: l, solid: true });
    }
    var hatchBudget = 6000;

    this.ents.forEach(function (e) {
      var o = e.o || {};
      switch (e.k) {
        case 'line':
          L(e.a[0], Y(e.a[1]), e.a[2], Y(e.a[3]), e.l, o); break;
        case 'pline':
          out.push({ t: 'P', p: e.p.map(function (q) { return [q[0], Y(q[1])]; }), c: !!o.closed, l: e.l, w: o.w, dash: o.dash, fill: o.fill }); break;
        case 'hatch': {
          var hp = HATCH[e.kind] || HATCH.concrete;
          var pts = e.p.map(function (q) { return [q[0], Y(q[1])]; });
          var layer = o.layer || hp.layer;
          out.push({ t: 'P', p: pts, c: true, l: layer, fill: hp.fill, w: o.outline === false ? 0 : o.w, noStroke: o.outline === false });
          var sp = hp.sp * mm, area = polyArea(pts);
          // keep the number of hatch lines bounded on very large areas
          var approxLines = Math.sqrt(area) / sp * hp.angles.length * 1.5;
          if (approxLines > hatchBudget / 4) sp *= approxLines / (hatchBudget / 4);
          hp.angles.forEach(function (ang) {
            hatchLines(pts, ang, sp).forEach(function (s) { out.push({ t: 'L', a: s, l: layer, w: 0.13, hatch: true }); });
          });
          break;
        }
        case 'circle':
          out.push({ t: 'C', x: e.x, y: Y(e.y), r: e.r, l: e.l, solid: !!o.solid }); break;
        case 'arc':
          out.push({ t: 'A', x: e.x, y: Y(e.y), r: e.r, a1: e.a1, a2: e.a2, l: e.l, dash: o.dash }); break;
        case 'text':
          T(e.x + (o.dx || 0) * mm, Y(e.y) + (o.dy || 0) * mm, e.s, o.h || 2.5, o.ha, o.va, o.rot, o.layer); break;
        case 'dim': {
          var x1 = e.a[0], y1 = Y(e.a[1]), x2 = e.a[2], y2 = Y(e.a[3]);
          var dx = x2 - x1, dy = y2 - y1, len = Math.sqrt(dx * dx + dy * dy);
          if (len < 1e-9) break;
          var ux = dx / len, uy = dy / len, nx = -uy, ny = ux, off = e.off * mm;
          var q1 = [x1 + nx * off, y1 + ny * off], q2 = [x2 + nx * off, y2 + ny * off];
          var sgn = off >= 0 ? 1 : -1, gap = 1 * mm * sgn, ext = 1.5 * mm * sgn;
          L(x1 + nx * gap, y1 + ny * gap, q1[0] + nx * ext, q1[1] + ny * ext, 'DIM');
          L(x2 + nx * gap, y2 + ny * gap, q2[0] + nx * ext, q2[1] + ny * ext, 'DIM');
          L(q1[0] - ux * 1.5 * mm, q1[1] - uy * 1.5 * mm, q2[0] + ux * 1.5 * mm, q2[1] + uy * 1.5 * mm, 'DIM');
          var tx = (ux + nx) * 0.7071 * 1.2 * mm, ty = (uy + ny) * 0.7071 * 1.2 * mm;
          L(q1[0] - tx, q1[1] - ty, q1[0] + tx, q1[1] + ty, 'DIM', { w: 0.35 });
          L(q2[0] - tx, q2[1] - ty, q2[0] + tx, q2[1] + ty, 'DIM', { w: 0.35 });
          var trueLen = Math.sqrt(Math.pow(e.a[2] - e.a[0], 2) + Math.pow(e.a[3] - e.a[1], 2));
          var label = o.text !== undefined ? o.text : fmt(trueLen, o.dp === undefined ? 2 : o.dp);
          var ang = Math.atan2(uy, ux) * 180 / Math.PI, rot = ang, tn = 1;
          if (rot > 90.01 || rot <= -89.99) { rot += 180; tn = -1; }
          if (rot > 180) rot -= 360;
          // put the text on the outer side of the dimension line
          var side = sgn, mx = (q1[0] + q2[0]) / 2, my = (q1[1] + q2[1]) / 2;
          var tdx = nx * side * 0.8 * mm, tdy = ny * side * 0.8 * mm;
          var va = (side * tn > 0) ? 'b' : 't';
          T(mx + tdx, my + tdy, label, o.h || 2.2, 'c', va, rot, 'DIM');
          break;
        }
        case 'level': {
          var lx = e.x, ly = Y(e.y), s = 1.6 * mm, dir = o.side === 'l' ? -1 : 1, ll = (o.len || Math.max(18, e.s.length * 1.7)) * mm;
          out.push({ t: 'P', p: [[lx, ly], [lx - s, ly + s * 1.5], [lx + s, ly + s * 1.5]], c: true, l: 'DIM' });
          L(lx, ly, lx + dir * ll, ly, 'DIM');
          T(lx + dir * 1.2 * mm, ly + s * 1.5 + 0.6 * mm, e.s, o.h || 2.2, dir > 0 ? 'l' : 'r', 'b', 0, 'TEXT');
          break;
        }
        case 'arrow': {
          var ax1 = e.a[0], ay1 = Y(e.a[1]), ax2 = e.a[2], ay2 = Y(e.a[3]);
          var al = Math.sqrt(Math.pow(ax2 - ax1, 2) + Math.pow(ay2 - ay1, 2));
          if (al < 1e-9) break;
          var lay = o.layer || 'DIM';
          L(ax1, ay1, ax2, ay2, lay, { w: o.w || 0.3 });
          arrowHead(ax2, ay2, (ax2 - ax1) / al, (ay2 - ay1) / al, lay, o.size);
          if (o.label) T((ax1 + ax2) / 2, (ay1 + ay2) / 2, o.label, o.h || 2.2, 'c', 'b', 0, 'TEXT');
          break;
        }
        case 'force': {
          var fa = e.ang * Math.PI / 180, fux = Math.cos(fa), fuy = Math.sin(fa);
          var hx = e.x, hy = Y(e.y), tlx = hx - fux * e.len * mm, tly = hy - fuy * e.len * mm;
          var fl = o.layer || 'DIM';
          L(tlx, tly, hx, hy, fl, { w: 0.45 });
          arrowHead(hx, hy, fux, fuy, fl, 3);
          if (e.s) {
            var ha = fux > 0.3 ? 'r' : (fux < -0.3 ? 'l' : 'c');
            var va2 = fuy > 0.3 ? 't' : (fuy < -0.3 ? 'b' : 'b');
            T(tlx - fux * 1 * mm, tly - fuy * 1 * mm, e.s, o.h || 2.2, ha, va2, 0, 'TEXT');
          }
          break;
        }
        case 'flow': {
          var fa2 = e.ang * Math.PI / 180, ux2 = Math.cos(fa2), uy2 = Math.sin(fa2), fx = e.x, fy = Y(e.y), flen = 14 * mm;
          L(fx - ux2 * flen / 2, fy - uy2 * flen / 2, fx + ux2 * flen / 2, fy + uy2 * flen / 2, 'WATER', { w: 0.35 });
          arrowHead(fx + ux2 * flen / 2, fy + uy2 * flen / 2, ux2, uy2, 'WATER', 3);
          if (e.s) T(fx, fy + 1.2 * mm, e.s, 2.2, 'c', 'b', 0, 'TEXT');
          break;
        }
        case 'north': {
          var nxp = e.x, nyp = Y(e.y), nl = 12 * mm;
          out.push({ t: 'C', x: nxp, y: nyp, r: 5 * mm, l: 'DIM' });
          L(nxp, nyp - nl / 2, nxp, nyp + nl / 2, 'DIM');
          arrowHead(nxp, nyp + nl / 2, 0, 1, 'DIM', 3.5);
          T(nxp, nyp + nl / 2 + 1 * mm, 'N', 3.5, 'c', 'b', 0, 'TEXT');
          break;
        }
      }
    });
    return out;
  };

  // Bounding box of primitives (includes an estimate of text extents).
  function primExtents(prims) {
    var b = [Infinity, Infinity, -Infinity, -Infinity];
    function grow(x, y) { if (!isFinite(x) || !isFinite(y)) return; if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y; }
    prims.forEach(function (p) {
      if (p.t === 'L') { grow(p.a[0], p.a[1]); grow(p.a[2], p.a[3]); }
      else if (p.t === 'P') p.p.forEach(function (q) { grow(q[0], q[1]); });
      else if (p.t === 'C' || p.t === 'A') { grow(p.x - p.r, p.y - p.r); grow(p.x + p.r, p.y + p.r); }
      else if (p.t === 'T') {
        var w = p.h * 0.62 * p.s.length, h = p.h * 1.3;
        var x0 = p.ha === 'c' ? -w / 2 : (p.ha === 'r' ? -w : 0);
        var y0 = p.va === 'm' ? -h / 2 : (p.va === 't' ? -h : -0.25 * h);
        var a = (p.rot || 0) * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
        [[x0, y0], [x0 + w, y0], [x0, y0 + h], [x0 + w, y0 + h]].forEach(function (c) {
          grow(p.x + c[0] * ca - c[1] * sa, p.y + c[0] * sa + c[1] * ca);
        });
      }
    });
    if (!isFinite(b[0])) return [0, 0, 1, 1];
    return b;
  }

  Drawing.LAYERS = LAYERS;
  Drawing.LAYER_NAMES = LAYER_NAMES;
  Drawing.HATCH = HATCH;
  Drawing.NICE_SCALES = NICE_SCALES;
  Drawing.primExtents = primExtents;
  Drawing.hatchLines = hatchLines;
  return Drawing;
});
