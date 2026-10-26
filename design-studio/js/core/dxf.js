/* DXF writer: AutoCAD Release 12 ASCII (AC1009), units metres.
 * Layers CONCRETE, SOIL, WATER, DIM, TEXT, CENTRE, REBAR. Dimensions,
 * level marks and hatching are written as plain LINE / POLYLINE / TEXT
 * entities (R12 has no HATCH entity), so the file opens in AutoCAD,
 * LibreCAD and QGIS without custom blocks or styles. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./drawing.js'));
  else { root.DS = root.DS || {}; root.DS.dxf = factory(root.DS.Drawing); }
})(typeof self !== 'undefined' ? self : this, function (Drawing) {
  'use strict';

  function n(x) {
    if (!isFinite(x)) x = 0;
    var s = (Math.round(x * 1e6) / 1e6).toString();
    return s.indexOf('e') >= 0 ? Number(x).toFixed(6) : s;
  }

  // R12 text is single-byte: replace common symbols, escape the rest as \U+XXXX.
  var MAP = { '²': '2', '³': '3', '×': 'x', '√': 'sqrt', '°': '%%d', '±': '%%p', 'Ø': '%%c', 'φ': 'phi', 'α': 'alpha',
    'β': 'beta', 'γ': 'gamma', 'θ': 'theta', 'λ': 'lambda', 'μ': 'mu', 'σ': 'sigma', 'τ': 'tau', 'Δ': 'delta', '—': '-', '–': '-',
    '≥': '>=', '≤': '<=', '·': '.', '’': "'", '‘': "'", '“': '"', '”': '"' };
  function text(s) {
    return String(s).replace(/[^\x20-\x7e]/g, function (c) {
      if (MAP[c] !== undefined) return MAP[c];
      var h = c.charCodeAt(0).toString(16).toUpperCase();
      while (h.length < 4) h = '0' + h;
      return '\\U+' + h;
    });
  }

  function Writer() { this.o = []; }
  Writer.prototype.g = function (code, val) { this.o.push(String(code), String(val)); return this; };

  // opts: {scale} (drawing scale used for text heights and line-type pattern lengths)
  function write(d, opts) {
    opts = opts || {};
    var scale = opts.scale || d.fitScale(267, 146);
    var mm = scale / 1000;
    var prims = d.explode(scale);
    var ext = Drawing.primExtents(prims);
    var w = new Writer();

    w.g(999, 'Design & Drawing Studio - ' + text(d.title || 'drawing') + ' - units: metres - scale 1:' + scale);
    // HEADER
    w.g(0, 'SECTION').g(2, 'HEADER');
    w.g(9, '$ACADVER').g(1, 'AC1009');
    w.g(9, '$INSBASE').g(10, 0).g(20, 0).g(30, 0);
    w.g(9, '$EXTMIN').g(10, n(ext[0])).g(20, n(ext[1])).g(30, 0);
    w.g(9, '$EXTMAX').g(10, n(ext[2])).g(20, n(ext[3])).g(30, 0);
    w.g(9, '$LIMMIN').g(10, n(ext[0])).g(20, n(ext[1]));
    w.g(9, '$LIMMAX').g(10, n(ext[2])).g(20, n(ext[3]));
    w.g(9, '$LTSCALE').g(40, 1);
    w.g(9, '$TEXTSIZE').g(40, n(2.5 * mm));
    w.g(9, '$LUNITS').g(70, 2);
    w.g(9, '$LUPREC').g(70, 3);
    w.g(0, 'ENDSEC');

    // TABLES
    w.g(0, 'SECTION').g(2, 'TABLES');
    var cx = (ext[0] + ext[2]) / 2, cy = (ext[1] + ext[3]) / 2, vh = (ext[3] - ext[1]) * 1.1 || 1;
    var aspect = Math.max(1, (ext[2] - ext[0]) / Math.max(ext[3] - ext[1], 1e-6) / 1.4);
    w.g(0, 'TABLE').g(2, 'VPORT').g(70, 1);
    w.g(0, 'VPORT').g(2, '*ACTIVE').g(70, 0).g(10, 0).g(20, 0).g(11, 1).g(21, 1).g(12, n(cx)).g(22, n(cy))
      .g(13, 0).g(23, 0).g(14, 1).g(24, 1).g(15, 0).g(25, 0).g(16, 0).g(26, 0).g(36, 1).g(17, 0).g(27, 0).g(37, 0)
      .g(40, n(vh * aspect)).g(41, 1.4).g(42, 50).g(43, 0).g(44, 0).g(50, 0).g(51, 0)
      .g(71, 0).g(72, 100).g(73, 1).g(74, 3).g(75, 0).g(76, 0).g(77, 0).g(78, 0);
    w.g(0, 'ENDTAB');
    var c1 = 6 * mm, c2 = 1.2 * mm;
    w.g(0, 'TABLE').g(2, 'LTYPE').g(70, 3);
    w.g(0, 'LTYPE').g(2, 'CONTINUOUS').g(70, 0).g(3, 'Solid line').g(72, 65).g(73, 0).g(40, 0);
    w.g(0, 'LTYPE').g(2, 'CENTER').g(70, 0).g(3, 'Center ____ _ ____ _').g(72, 65).g(73, 4).g(40, n(c1 + 3 * c2))
      .g(49, n(c1)).g(49, n(-c2)).g(49, n(c2)).g(49, n(-c2));
    w.g(0, 'LTYPE').g(2, 'DASHED').g(70, 0).g(3, 'Dashed __ __ __').g(72, 65).g(73, 2).g(40, n(3.7 * mm))
      .g(49, n(2.5 * mm)).g(49, n(-1.2 * mm));
    w.g(0, 'ENDTAB');
    var names = Drawing.LAYER_NAMES;
    w.g(0, 'TABLE').g(2, 'LAYER').g(70, names.length + 1);
    w.g(0, 'LAYER').g(2, '0').g(70, 0).g(62, 7).g(6, 'CONTINUOUS');
    names.forEach(function (l) {
      var L = Drawing.LAYERS[l];
      w.g(0, 'LAYER').g(2, l).g(70, 0).g(62, L.color).g(6, L.dash ? 'CENTER' : 'CONTINUOUS');
    });
    w.g(0, 'ENDTAB');
    w.g(0, 'TABLE').g(2, 'STYLE').g(70, 1);
    w.g(0, 'STYLE').g(2, 'STANDARD').g(70, 0).g(40, 0).g(41, 1).g(50, 0).g(71, 0).g(42, n(2.5 * mm)).g(3, 'txt').g(4, '');
    w.g(0, 'ENDTAB');
    w.g(0, 'TABLE').g(2, 'APPID').g(70, 1);
    w.g(0, 'APPID').g(2, 'ACAD').g(70, 0);
    w.g(0, 'ENDTAB');
    w.g(0, 'ENDSEC');

    w.g(0, 'SECTION').g(2, 'BLOCKS').g(0, 'ENDSEC');

    // ENTITIES
    w.g(0, 'SECTION').g(2, 'ENTITIES');
    prims.forEach(function (p) {
      var layer = p.l || '0';
      if (p.t === 'L') {
        w.g(0, 'LINE').g(8, layer);
        if (p.dash && !(Drawing.LAYERS[layer] || {}).dash) w.g(6, 'DASHED');
        w.g(10, n(p.a[0])).g(20, n(p.a[1])).g(30, 0).g(11, n(p.a[2])).g(21, n(p.a[3])).g(31, 0);
      } else if (p.t === 'P') {
        if (p.noStroke) return;
        w.g(0, 'POLYLINE').g(8, layer);
        if (p.dash && !(Drawing.LAYERS[layer] || {}).dash) w.g(6, 'DASHED');
        w.g(66, 1).g(10, 0).g(20, 0).g(30, 0).g(70, p.c ? 1 : 0);
        p.p.forEach(function (q) { w.g(0, 'VERTEX').g(8, layer).g(10, n(q[0])).g(20, n(q[1])).g(30, 0); });
        w.g(0, 'SEQEND').g(8, layer);
      } else if (p.t === 'C') {
        w.g(0, 'CIRCLE').g(8, layer).g(10, n(p.x)).g(20, n(p.y)).g(30, 0).g(40, n(p.r));
      } else if (p.t === 'A') {
        w.g(0, 'ARC').g(8, layer);
        if (p.dash && !(Drawing.LAYERS[layer] || {}).dash) w.g(6, 'DASHED');
        w.g(10, n(p.x)).g(20, n(p.y)).g(30, 0).g(40, n(p.r)).g(50, n(p.a1)).g(51, n(p.a2));
      } else if (p.t === 'T') {
        var ha = p.ha === 'c' ? 1 : (p.ha === 'r' ? 2 : 0);
        var va = p.va === 'm' ? 2 : (p.va === 't' ? 3 : 0);
        w.g(0, 'TEXT').g(8, layer).g(10, n(p.x)).g(20, n(p.y)).g(30, 0).g(40, n(p.h)).g(1, text(p.s));
        if (p.rot) w.g(50, n(p.rot));
        if (ha) w.g(72, ha);
        if (ha || va) w.g(11, n(p.x)).g(21, n(p.y)).g(31, 0);
        if (va) w.g(73, va);
      }
    });
    w.g(0, 'ENDSEC');
    w.g(0, 'EOF');
    return w.o.join('\r\n') + '\r\n';
  }

  // Minimal structural parser used by the tests (and handy for debugging):
  // returns {pairs, sections, layers, entities: [{type, layer}]}.
  function parse(str) {
    var lines = str.split(/\r?\n/);
    if (lines[lines.length - 1] === '') lines.pop();
    if (lines.length % 2) throw new Error('odd number of lines');
    var pairs = [];
    for (var i = 0; i < lines.length; i += 2) {
      var code = Number(lines[i].trim());
      if (!Number.isInteger(code)) throw new Error('bad group code at line ' + (i + 1) + ': ' + lines[i]);
      pairs.push([code, lines[i + 1]]);
    }
    var sections = [], layers = [], entities = [], cur = null, inEnt = false, inLayerTable = false, ent = null;
    pairs.forEach(function (p, idx) {
      if (p[0] === 0 && p[1] === 'SECTION') { cur = pairs[idx + 1][1]; sections.push(cur); inEnt = cur === 'ENTITIES'; return; }
      if (p[0] === 0 && p[1] === 'ENDSEC') { cur = null; inEnt = false; ent = null; return; }
      if (p[0] === 0 && p[1] === 'TABLE') { inLayerTable = pairs[idx + 1][1] === 'LAYER'; return; }
      if (p[0] === 0 && p[1] === 'ENDTAB') { inLayerTable = false; return; }
      if (inLayerTable && p[0] === 0 && p[1] === 'LAYER') { layers.push(pairs[idx + 1][1]); return; }
      if (inEnt && p[0] === 0) { ent = { type: p[1], layer: null }; entities.push(ent); return; }
      if (inEnt && ent && p[0] === 8 && ent.layer === null) ent.layer = p[1];
    });
    return { pairs: pairs, sections: sections, layers: layers, entities: entities };
  }

  return { write: write, parse: parse, text: text };
});
