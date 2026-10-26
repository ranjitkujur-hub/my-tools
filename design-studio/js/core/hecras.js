/* HEC-RAS helpers: cross-section station–elevation tables, reach lengths
 * and a steady-flow table, as tab-separated text that can be pasted into
 * the HEC-RAS cross-section editor and steady-flow editor (columns paste
 * like Excel cells). HEC-RAS river stations increase upstream. */
(function (root, factory) {
  var m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else { root.DS = root.DS || {}; root.DS.hecras = m; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function n(x, dp) { return Number(x).toFixed(dp === undefined ? 3 : dp); }

  /* Trapezoidal canal cross-section with banks.
   * p = {bed (bed level), b (bed width), z (side slope H:V), bankH (bank top above bed), bankTop (bank top width), outer (outer slope H:V), ground (ground level outside)} */
  function canalSection(p) {
    var hb = p.bankH, w = p.b / 2 + p.z * hb;     // half top width at bank level
    var tb = p.bankTop || 0, out = p.outer || 1.5;
    var gl = p.ground === undefined ? p.bed + hb : Math.min(p.ground, p.bed + hb);
    var drop = p.bed + hb - gl;
    var xs = [];
    var x0 = -(w + tb + out * drop);
    xs.push([x0, gl]);
    xs.push([-(w + tb), p.bed + hb]);
    xs.push([-w, p.bed + hb]);
    xs.push([-p.b / 2, p.bed]);
    xs.push([p.b / 2, p.bed]);
    xs.push([w, p.bed + hb]);
    xs.push([w + tb, p.bed + hb]);
    xs.push([w + tb + out * drop, gl]);
    // shift so stations start at 0 and remove duplicate stations
    var pts = [];
    xs.forEach(function (q) {
      var s = q[0] - x0;
      if (pts.length && Math.abs(pts[pts.length - 1][0] - s) < 1e-6) return;
      pts.push([s, q[1]]);
    });
    return { points: pts, bankLeft: -w - x0, bankRight: w - x0 };
  }

  function stationElevation(points) {
    return ['Station\tElevation'].concat(points.map(function (q) { return n(q[0]) + '\t' + n(q[1]); })).join('\r\n');
  }

  /* sections = [{chainage, points, bankLeft, bankRight, nLOB, nCh, nROB}] in downstream order.
   * Returns text with one block per cross-section and a summary reach-length table. */
  function geometryText(river, reach, sections, totalLength) {
    var L = totalLength === undefined ? sections[sections.length - 1].chainage : totalLength;
    var out = [];
    out.push('HEC-RAS cross-section data — River: ' + river + ', Reach: ' + reach);
    out.push('River stations = distance from the downstream end (m), increasing upstream.');
    out.push('');
    out.push('River Station\tChainage (m)\tLOB (m)\tChannel (m)\tROB (m)');
    var rl = reachLengths(sections);
    sections.forEach(function (s, i) {
      out.push(n(L - s.chainage, 1) + '\t' + n(s.chainage, 1) + '\t' + n(rl[i], 1) + '\t' + n(rl[i], 1) + '\t' + n(rl[i], 1));
    });
    sections.forEach(function (s, i) {
      out.push('');
      out.push('River Station: ' + n(L - s.chainage, 1) + '   (chainage ' + n(s.chainage, 1) + ' m)');
      out.push('Downstream reach lengths LOB / Channel / ROB: ' + n(rl[i], 1) + ' / ' + n(rl[i], 1) + ' / ' + n(rl[i], 1));
      out.push("Manning's n LOB / Channel / ROB: " + (s.nLOB || 0.035) + ' / ' + (s.nCh || 0.018) + ' / ' + (s.nROB || 0.035));
      out.push('Main channel bank stations Left / Right: ' + n(s.bankLeft) + ' / ' + n(s.bankRight));
      out.push(stationElevation(s.points));
    });
    return out.join('\r\n') + '\r\n';
  }

  // Distance to the next section downstream (0 for the last one).
  function reachLengths(sections) {
    return sections.map(function (s, i) { return i + 1 < sections.length ? sections[i + 1].chainage - s.chainage : 0; });
  }

  /* profiles = [{name, Q}], boundary = {upSlope, dnSlope} (normal-depth slopes). */
  function steadyFlowText(river, reach, upstreamRS, profiles, boundary) {
    var out = [];
    out.push('HEC-RAS steady flow data — River: ' + river + ', Reach: ' + reach);
    out.push('Enter at River Station ' + n(upstreamRS, 1) + ' (upstream end).');
    out.push('Profile\tFlow (m3/s)');
    profiles.forEach(function (p) { out.push(p.name + '\t' + n(p.Q)); });
    out.push('');
    out.push('Boundary conditions (Reach Boundary Conditions):');
    out.push('Upstream\tNormal Depth\tSlope ' + n(boundary.upSlope, 6));
    out.push('Downstream\tNormal Depth\tSlope ' + n(boundary.dnSlope, 6));
    return out.join('\r\n') + '\r\n';
  }

  return { canalSection: canalSection, stationElevation: stationElevation, geometryText: geometryText,
    reachLengths: reachLengths, steadyFlowText: steadyFlowText };
});
