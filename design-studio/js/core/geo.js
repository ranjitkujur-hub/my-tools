/* Alignment geometry for QGIS: chainages along a polyline, points at a
 * chainage, GeoJSON and CSV output. Coordinates are either projected
 * metres (e.g. UTM, EPSG:32643/32644/32645) or WGS 84 lon/lat (EPSG:4326). */
(function (root, factory) {
  var m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else { root.DS = root.DS || {}; root.DS.geo = m; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var R_EARTH = 6371008.8;

  function isGeographic(epsg) { return Number(epsg) === 4326; }

  function dist(a, b, geographic) {
    if (!geographic) return Math.sqrt(Math.pow(b[0] - a[0], 2) + Math.pow(b[1] - a[1], 2));
    var r = Math.PI / 180, p1 = a[1] * r, p2 = b[1] * r, dp = (b[1] - a[1]) * r, dl = (b[0] - a[0]) * r;
    var h = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
    return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  // Cumulative chainage at each vertex (m), starting at ch0.
  function chainages(pts, geographic, ch0) {
    var c = [ch0 || 0];
    for (var i = 1; i < pts.length; i++) c.push(c[i - 1] + dist(pts[i - 1], pts[i], geographic));
    return c;
  }

  // Coordinate at chainage ch (linear between vertices; fine for short segments).
  function pointAt(pts, chs, ch) {
    if (ch <= chs[0]) return pts[0].slice(0, 2);
    for (var i = 1; i < pts.length; i++) {
      if (ch <= chs[i] + 1e-9) {
        var t = (ch - chs[i - 1]) / ((chs[i] - chs[i - 1]) || 1);
        return [pts[i - 1][0] + t * (pts[i][0] - pts[i - 1][0]), pts[i - 1][1] + t * (pts[i][1] - pts[i - 1][1])];
      }
    }
    return pts[pts.length - 1].slice(0, 2);
  }

  // Points every `interval` metres, plus the end point.
  function chainagePoints(pts, geographic, interval, ch0) {
    var chs = chainages(pts, geographic, ch0), out = [], start = chs[0], end = chs[chs.length - 1];
    var first = Math.ceil(start / interval - 1e-9) * interval;
    if (first - start > 1e-6) out.push({ ch: start, xy: pts[0].slice(0, 2) });
    for (var c = first; c <= end + 1e-6; c += interval) out.push({ ch: c, xy: pointAt(pts, chs, c) });
    if (end - out[out.length - 1].ch > 1e-6) out.push({ ch: end, xy: pts[pts.length - 1].slice(0, 2) });
    return out;
  }

  function fmtCh(ch) {
    var km = Math.floor(ch / 1000 + 1e-9), m = ch - km * 1000;
    var ms = m.toFixed(0);
    while (ms.length < 3) ms = '0' + ms;
    return km + '+' + ms;
  }

  function r(x, geographic) { var p = geographic ? 1e7 : 1e3; return Math.round(x * p) / p; }

  /* opts = {epsg, name, alignment: [[x,y]..], interval, ch0, structures: [{name, type, ch?, x?, y?}]} */
  function build(opts) {
    var geo = isGeographic(opts.epsg);
    var pts = opts.alignment;
    if (!pts || pts.length < 2) throw new Error('Alignment needs at least two points / संरेखण में कम से कम दो बिंदु चाहिए');
    var chs = chainages(pts, geo, opts.ch0 || 0);
    var cps = chainagePoints(pts, geo, opts.interval || 100, opts.ch0 || 0);
    var structs = (opts.structures || []).map(function (s) {
      var xy = (isFinite(s.x) && isFinite(s.y)) ? [s.x, s.y] : (isFinite(s.ch) ? pointAt(pts, chs, s.ch) : null);
      return { name: s.name, type: s.type || '', ch: isFinite(s.ch) ? s.ch : null, xy: xy };
    }).filter(function (s) { return s.xy; });
    var features = [];
    features.push({ type: 'Feature', properties: { kind: 'alignment', name: opts.name || 'Canal alignment', length_m: Math.round((chs[chs.length - 1] - chs[0]) * 1000) / 1000 },
      geometry: { type: 'LineString', coordinates: pts.map(function (q) { return [r(q[0], geo), r(q[1], geo)]; }) } });
    cps.forEach(function (c) {
      features.push({ type: 'Feature', properties: { kind: 'chainage', chainage_m: Math.round(c.ch * 1000) / 1000, label: fmtCh(c.ch) },
        geometry: { type: 'Point', coordinates: [r(c.xy[0], geo), r(c.xy[1], geo)] } });
    });
    structs.forEach(function (s) {
      features.push({ type: 'Feature', properties: { kind: 'structure', name: s.name, type: s.type, chainage_m: s.ch, label: s.ch === null ? s.name : s.name + ' @ ' + fmtCh(s.ch) },
        geometry: { type: 'Point', coordinates: [r(s.xy[0], geo), r(s.xy[1], geo)] } });
    });
    var fc = { type: 'FeatureCollection', name: opts.name || 'alignment', features: features };
    // RFC 7946 GeoJSON is WGS 84; for projected data add the legacy "crs" member that QGIS/GDAL read.
    if (!geo) fc.crs = { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::' + opts.epsg } };
    var rows = [];
    cps.forEach(function (c) { rows.push(['chainage', fmtCh(c.ch), '', round3(c.ch), r(c.xy[0], geo), r(c.xy[1], geo)]); });
    structs.forEach(function (s) { rows.push(['structure', s.name, s.type, s.ch === null ? '' : round3(s.ch), r(s.xy[0], geo), r(s.xy[1], geo)]); });
    return { geojson: fc, csvColumns: ['kind', 'name', 'type', 'chainage_m', geo ? 'lon' : 'x', geo ? 'lat' : 'y'], csvRows: rows,
      length: chs[chs.length - 1] - chs[0], chainages: chs, points: cps, structures: structs };
  }
  function round3(x) { return Math.round(x * 1000) / 1000; }

  return { dist: dist, chainages: chainages, pointAt: pointAt, chainagePoints: chainagePoints, build: build, fmtCh: fmtCh, isGeographic: isGeographic };
});
