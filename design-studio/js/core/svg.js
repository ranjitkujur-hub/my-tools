/* SVG output of a Drawing: a plain drawing (screen, SVG and PNG export)
 * and a print sheet (A4/A3 landscape) with border and title block.
 * Output units are paper millimetres. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./drawing.js'));
  else { root.DS = root.DS || {}; root.DS.svg = factory(root.DS.Drawing); }
})(typeof self !== 'undefined' ? self : this, function (Drawing) {
  'use strict';

  var SHEETS = { A4: { w: 297, h: 210 }, A3: { w: 420, h: 297 } };
  var TB_H = 44; // title block height, mm

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function n(x) { return (Math.round(x * 100) / 100).toString(); }

  // Render primitives into SVG elements. tf(x,y) -> [X,Y] paper mm; k = mm per world unit.
  function renderPrims(prims, tf, k) {
    var out = [];
    var hatch = [], solid = [], rest = [];
    prims.forEach(function (p) { (p.hatch ? hatch : (p.fill ? solid : rest)).push(p); });
    function stroke(p, wOverride) {
      var L = Drawing.LAYERS[p.l] || Drawing.LAYERS.TEXT;
      var w = wOverride || p.w || L.w;
      var s = ' stroke="' + L.svg + '" stroke-width="' + n(w) + '"';
      if (p.dash || L.dash) s += ' stroke-dasharray="' + (L.dash ? '6 1.2 1.2 1.2' : '2.5 1.2') + '"';
      return s;
    }
    // fills first, then hatching, then lines and text on top
    solid.forEach(function (p) {
      var pts = p.p.map(function (q) { var t = tf(q[0], q[1]); return n(t[0]) + ',' + n(t[1]); }).join(' ');
      out.push('<polygon points="' + pts + '" fill="' + p.fill + '" stroke="none"/>');
    });
    if (hatch.length) {
      var d = hatch.map(function (p) {
        var a = tf(p.a[0], p.a[1]), b = tf(p.a[2], p.a[3]);
        return 'M' + n(a[0]) + ' ' + n(a[1]) + 'L' + n(b[0]) + ' ' + n(b[1]);
      });
      // group by layer for colour
      var byLayer = {};
      hatch.forEach(function (p, i) { (byLayer[p.l] = byLayer[p.l] || []).push(d[i]); });
      Object.keys(byLayer).forEach(function (l) {
        var L = Drawing.LAYERS[l] || Drawing.LAYERS.TEXT;
        out.push('<path d="' + byLayer[l].join('') + '" stroke="' + L.svg + '" stroke-opacity="0.55" stroke-width="0.13" fill="none"/>');
      });
    }
    solid.concat(rest).forEach(function (p) {
      var L = Drawing.LAYERS[p.l] || Drawing.LAYERS.TEXT;
      if (p.t === 'L') {
        var a = tf(p.a[0], p.a[1]), b = tf(p.a[2], p.a[3]);
        out.push('<line x1="' + n(a[0]) + '" y1="' + n(a[1]) + '" x2="' + n(b[0]) + '" y2="' + n(b[1]) + '"' + stroke(p) + ' stroke-linecap="round"/>');
      } else if (p.t === 'P') {
        if (p.noStroke) return;
        var pts = p.p.map(function (q) { var t = tf(q[0], q[1]); return n(t[0]) + ',' + n(t[1]); }).join(' ');
        if (p.solid) out.push('<polygon points="' + pts + '" fill="' + L.svg + '" stroke="' + L.svg + '" stroke-width="0.1"/>');
        else out.push('<' + (p.c ? 'polygon' : 'polyline') + ' points="' + pts + '" fill="none"' + stroke(p) + ' stroke-linejoin="round"/>');
      } else if (p.t === 'C') {
        var c = tf(p.x, p.y);
        out.push('<circle cx="' + n(c[0]) + '" cy="' + n(c[1]) + '" r="' + n(Math.max(p.r * k, 0.25)) + '"' +
          (p.solid ? ' fill="' + L.svg + '" stroke="none"' : ' fill="none"' + stroke(p)) + '/>');
      } else if (p.t === 'A') {
        var a1 = p.a1 * Math.PI / 180, a2 = p.a2 * Math.PI / 180;
        var s = tf(p.x + p.r * Math.cos(a1), p.y + p.r * Math.sin(a1));
        var e = tf(p.x + p.r * Math.cos(a2), p.y + p.r * Math.sin(a2));
        var sweep = ((p.a2 - p.a1) % 360 + 360) % 360;
        var R = n(p.r * k);
        out.push('<path d="M' + n(s[0]) + ' ' + n(s[1]) + 'A' + R + ' ' + R + ' 0 ' + (sweep > 180 ? 1 : 0) + ' 0 ' + n(e[0]) + ' ' + n(e[1]) + '" fill="none"' + stroke(p) + '/>');
      } else if (p.t === 'T') {
        var t = tf(p.x, p.y), fs = p.h * k / 0.72;
        var anchor = p.ha === 'c' ? 'middle' : (p.ha === 'r' ? 'end' : 'start');
        var base = p.va === 'm' ? 'central' : (p.va === 't' ? 'hanging' : 'alphabetic');
        var tr = p.rot ? ' transform="rotate(' + n(-p.rot) + ' ' + n(t[0]) + ' ' + n(t[1]) + ')"' : '';
        out.push('<text x="' + n(t[0]) + '" y="' + n(t[1]) + '" font-size="' + n(fs) + '" text-anchor="' + anchor +
          '" dominant-baseline="' + base + '" fill="' + L.svg + '"' + tr + '>' + esc(p.s) + '</text>');
      }
    });
    return out.join('\n');
  }

  // Plain drawing. opts: {scale} or {w, h} area to fit (default A4 drawing area).
  function render(d, opts) {
    opts = opts || {};
    var scale = opts.scale || d.fitScale(opts.w || 267, opts.h || 146);
    var prims = d.explode(scale);
    var k = 1000 / scale, pad = 4;
    var b = Drawing.primExtents(prims);
    var W = (b[2] - b[0]) * k + 2 * pad, H = (b[3] - b[1]) * k + 2 * pad + 6;
    var tf = function (x, y) { return [(x - b[0]) * k + pad, (b[3] - y) * k + pad]; };
    var body = renderPrims(prims, tf, k);
    var label = (d.title ? d.title + '  —  ' : '') + (d.nts ? 'Not to scale' : 'Scale ' + d.scaleLabel(scale) + ' (metres)');
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + n(W) + ' ' + n(H) + '" width="' + n(W) + 'mm" height="' + n(H) + 'mm"' +
      ' font-family="Arial, Helvetica, sans-serif">\n<rect x="0" y="0" width="' + n(W) + '" height="' + n(H) + '" fill="#ffffff"/>\n' + body +
      '\n<text x="' + pad + '" y="' + n(H - 2) + '" font-size="2.6" fill="#555">' + esc(label) + '</text>\n</svg>';
    return { svg: svg, scale: scale, w: W, h: H };
  }

  // Print sheet with border and title block.
  // meta: {office, title, number, scale (optional), date, designed, checked, approved, disclaimer, size}
  function sheet(d, meta) {
    meta = meta || {};
    var S = SHEETS[meta.size] || SHEETS.A4;
    var ml = 20, mo = 10;                          // binding margin left, others 10
    var bx = ml, by = mo, bw = S.w - ml - mo, bh = S.h - 2 * mo;
    var areaW = bw - 8, areaH = bh - TB_H - 10;
    var scale = meta.scale || d.fitScale(areaW, areaH);
    var prims = d.explode(scale), k = 1000 / scale;
    var b = Drawing.primExtents(prims);
    var dw = (b[2] - b[0]) * k, dh = (b[3] - b[1]) * k;
    var ox = bx + 4 + Math.max(0, (areaW - dw) / 2), oy = by + 4 + Math.max(0, (areaH - dh) / 2);
    var tf = function (x, y) { return [(x - b[0]) * k + ox, (b[3] - y) * k + oy]; };
    var o = [];
    o.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + S.w + ' ' + S.h + '" width="' + S.w + 'mm" height="' + S.h + 'mm" font-family="Arial, Helvetica, sans-serif">');
    o.push('<rect x="0" y="0" width="' + S.w + '" height="' + S.h + '" fill="#fff"/>');
    o.push('<rect x="' + bx + '" y="' + by + '" width="' + bw + '" height="' + bh + '" fill="none" stroke="#000" stroke-width="0.7"/>');
    o.push('<g>' + renderPrims(prims, tf, k) + '</g>');
    // title block across the bottom
    var ty = by + bh - TB_H, tw = Math.min(190, bw), tx = bx + bw - tw;
    o.push('<line x1="' + bx + '" y1="' + ty + '" x2="' + (bx + bw) + '" y2="' + ty + '" stroke="#000" stroke-width="0.5"/>');
    o.push('<line x1="' + tx + '" y1="' + ty + '" x2="' + tx + '" y2="' + (by + bh) + '" stroke="#000" stroke-width="0.5"/>');
    function T(x, y, s, size, weight, anchor) {
      o.push('<text x="' + n(x) + '" y="' + n(y) + '" font-size="' + size + '"' + (weight ? ' font-weight="bold"' : '') +
        (anchor ? ' text-anchor="' + anchor + '"' : '') + '>' + esc(s) + '</text>');
    }
    function hl(y, x1, x2) { o.push('<line x1="' + n(x1) + '" y1="' + n(y) + '" x2="' + n(x2) + '" y2="' + n(y) + '" stroke="#000" stroke-width="0.3"/>'); }
    function vl(x, y1, y2) { o.push('<line x1="' + n(x) + '" y1="' + n(y1) + '" x2="' + n(x) + '" y2="' + n(y2) + '" stroke="#000" stroke-width="0.3"/>'); }
    // left part: notes and disclaimer
    var lw = tw === bw ? 0 : tx - bx;
    if (lw > 40) {
      T(bx + 3, ty + 6, 'NOTES / टिप्पणी', 2.8, true);
      var notes = (meta.notes || []).concat(['All dimensions and levels in metres unless noted.', 'Drawing generated by Design & Drawing Studio.']);
      notes.slice(0, 5).forEach(function (s, i) { T(bx + 3, ty + 11 + i * 4.2, (i + 1) + '. ' + s, 2.4); });
      wrap(meta.disclaimer || '', Math.floor((lw - 6) / 1.25)).slice(0, 3).forEach(function (s, i) { T(bx + 3, by + bh - 9.5 + i * 3.4, s, 2.1); });
    }
    // right part rows: office | title | no/scale/date | designed/checked/approved
    var y1 = ty + 9, y2 = ty + 20, y3 = ty + 28;
    hl(y1, tx, tx + tw); hl(y2, tx, tx + tw); hl(y3, tx, tx + tw);
    T(tx + tw / 2, ty + 6.3, meta.office || 'Office name (set in Settings)', 3.4, true, 'middle');
    T(tx + 3, y1 + 4.2, 'DRAWING / चित्र', 2.2);
    T(tx + tw / 2, y1 + 8.6, meta.title || d.title || '', 3.4, true, 'middle');
    var c3 = tw / 3;
    vl(tx + c3, y2, y3); vl(tx + 2 * c3, y2, y3);
    T(tx + 2, y2 + 3.2, 'DRG. NO.', 2); T(tx + 2, y2 + 6.9, meta.number || '—', 2.8, true);
    T(tx + c3 + 2, y2 + 3.2, 'SCALE', 2); T(tx + c3 + 2, y2 + 6.9, d.scaleLabel(scale) + (meta.size ? ' (' + meta.size + ')' : ''), 2.8, true);
    T(tx + 2 * c3 + 2, y2 + 3.2, 'DATE', 2); T(tx + 2 * c3 + 2, y2 + 6.9, meta.date || '', 2.8, true);
    vl(tx + c3, y3, by + bh); vl(tx + 2 * c3, y3, by + bh);
    [['DESIGNED / अभिकल्पित', meta.designed], ['CHECKED / जाँचा', meta.checked], ['APPROVED / अनुमोदित', meta.approved]].forEach(function (r, i) {
      T(tx + i * c3 + 2, y3 + 3.4, r[0], 2.1);
      if (r[1]) T(tx + i * c3 + 2, by + bh - 2.5, r[1], 2.4);
    });
    o.push('</svg>');
    return { svg: o.join('\n'), scale: scale };
  }

  function wrap(s, width) {
    var words = String(s).split(/\s+/), lines = [], cur = '';
    words.forEach(function (w) {
      if ((cur + ' ' + w).trim().length > width) { if (cur) lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
    });
    if (cur) lines.push(cur);
    return lines;
  }

  return { render: render, sheet: sheet, renderPrims: renderPrims, SHEETS: SHEETS, esc: esc };
});
