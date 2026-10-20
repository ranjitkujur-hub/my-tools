/* Small SVG line charts with shaded range bands. Produces SVG markup
 * strings (no inline styles, so they pass the strict CSP and print well). */
(function (root, factory) {
  var isNode = typeof module === 'object' && module.exports;
  var m = factory(isNode ? require('./calc.js') : root.KT.calc);
  if (isNode) module.exports = m;
  else { root.KT = root.KT || {}; root.KT.charts = m; }
})(typeof self !== 'undefined' ? self : this, function (calc) {
  'use strict';

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function dayNum(iso) {
    var p = calc.parseISO(iso);
    return p ? Date.UTC(p.y, p.m - 1, p.d, 0, 0) / 86400000 + timeFrac(iso) : null;
  }

  function timeFrac(iso) {
    var t = /T(\d{2}):(\d{2})/.exec(iso);
    return t ? (+t[1] * 60 + +t[2]) / 1440 : 0;
  }

  function niceTicks(lo, hi, n) {
    var span = hi - lo || 1;
    var step = Math.pow(10, Math.floor(Math.log10(span / n)));
    var err = span / n / step;
    step *= err >= 7.5 ? 10 : err >= 3 ? 5 : err >= 1.5 ? 2 : 1;
    var t = [], v = Math.ceil(lo / step) * step;
    for (; v <= hi + step * 1e-9; v += step) t.push(+v.toFixed(10));
    return t;
  }

  function fmtNum(v) {
    return Math.abs(v) >= 100 ? String(Math.round(v)) : String(+v.toFixed(2));
  }

  /* opts: {
   *   series: [{label, cls, axis: 'left'|'right', points: [{date, value}]}],
   *   bands: [{lo, hi, cls, axis, label}], title, leftUnit, rightUnit,
   *   width, height }
   * cls picks a colour class from CSS (s1..s4). */
  function lineChart(opts) {
    var W = opts.width || 640, H = opts.height || 260;
    var hasRight = opts.series.some(function (s) { return s.axis === 'right'; });
    var M = { l: 48, r: hasRight ? 48 : 16, t: 12, b: 34 };
    var pw = W - M.l - M.r, ph = H - M.t - M.b;
    var all = [];
    opts.series.forEach(function (s) {
      s.pts = s.points.filter(function (p) { return p.value !== null && p.value !== undefined && isFinite(p.value); })
        .map(function (p) { return { x: dayNum(p.date), v: +p.value, date: p.date }; })
        .filter(function (p) { return p.x !== null; })
        .sort(function (a, b) { return a.x - b.x; });
      all = all.concat(s.pts);
    });
    if (!all.length) {
      return '<p class="empty">कोई डेटा नहीं / No data yet</p>';
    }
    var xs = all.map(function (p) { return p.x; });
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
    if (x1 - x0 < 1) { x0 -= 3; x1 += 3; }
    var pad = (x1 - x0) * 0.04; x0 -= pad; x1 += pad;

    function yDomain(axis) {
      var vals = [];
      opts.series.forEach(function (s) { if ((s.axis || 'left') === axis) s.pts.forEach(function (p) { vals.push(p.v); }); });
      (opts.bands || []).forEach(function (b) {
        if ((b.axis || 'left') !== axis) return;
        if (b.lo !== null && b.lo !== undefined) vals.push(b.lo);
        if (b.hi !== null && b.hi !== undefined) vals.push(b.hi);
      });
      if (!vals.length) return null;
      var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
      if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
      var p = (hi - lo) * 0.08;
      lo = lo - p; hi = hi + p;
      if (lo < 0 && Math.min.apply(null, vals) >= 0) lo = 0;
      var ticks = niceTicks(lo, hi, 5);
      return { lo: Math.min(lo, ticks[0]), hi: Math.max(hi, ticks[ticks.length - 1]), ticks: ticks };
    }
    var dom = { left: yDomain('left'), right: hasRight ? yDomain('right') : null };
    if (!dom.left) dom.left = dom.right;

    function X(x) { return M.l + (x - x0) / (x1 - x0) * pw; }
    function Y(v, axis) { var d = dom[axis || 'left'] || dom.left; return M.t + ph - (v - d.lo) / (d.hi - d.lo) * ph; }
    function r1(n) { return Math.round(n * 10) / 10; }

    var out = ['<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(opts.title || '') + '" xmlns="http://www.w3.org/2000/svg">'];
    // bands
    (opts.bands || []).forEach(function (b) {
      var d = dom[b.axis || 'left']; if (!d) return;
      var lo = b.lo === null || b.lo === undefined ? d.lo : Math.max(b.lo, d.lo);
      var hi = b.hi === null || b.hi === undefined ? d.hi : Math.min(b.hi, d.hi);
      if (hi <= lo) return;
      out.push('<rect class="band ' + (b.cls || '') + '" x="' + M.l + '" width="' + pw + '" y="' + r1(Y(hi, b.axis)) + '" height="' + r1(Y(lo, b.axis) - Y(hi, b.axis)) + '"><title>' + esc(b.label || '') + '</title></rect>');
    });
    // grid + y ticks
    dom.left.ticks.forEach(function (t) {
      var y = r1(Y(t, 'left'));
      out.push('<line class="grid" x1="' + M.l + '" x2="' + (M.l + pw) + '" y1="' + y + '" y2="' + y + '"/>');
      out.push('<text class="tick" x="' + (M.l - 6) + '" y="' + (y + 4) + '" text-anchor="end">' + fmtNum(t) + '</text>');
    });
    if (dom.right) {
      dom.right.ticks.forEach(function (t) {
        out.push('<text class="tick tick-r" x="' + (M.l + pw + 6) + '" y="' + (r1(Y(t, 'right')) + 4) + '">' + fmtNum(t) + '</text>');
      });
    }
    // x ticks: up to 4 dates
    var n = Math.min(4, Math.max(2, Math.floor(pw / 150)));
    for (var i = 0; i < n; i++) {
      var xv = x0 + pad + (x1 - x0 - 2 * pad) * (n === 1 ? 0.5 : i / (n - 1));
      var dt = new Date(Math.round(xv) * 86400000);
      var iso = calc.toISO(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
      out.push('<text class="tick" x="' + r1(X(xv)) + '" y="' + (H - 12) + '" text-anchor="' + (i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle') + '">' + calc.fmtDate(iso) + '</text>');
    }
    out.push('<line class="axis" x1="' + M.l + '" x2="' + (M.l + pw) + '" y1="' + (M.t + ph) + '" y2="' + (M.t + ph) + '"/>');
    if (opts.leftUnit) out.push('<text class="unit" x="4" y="' + (M.t + 8) + '">' + esc(opts.leftUnit) + '</text>');
    if (opts.rightUnit && dom.right) out.push('<text class="unit" x="' + (W - 4) + '" y="' + (M.t + 8) + '" text-anchor="end">' + esc(opts.rightUnit) + '</text>');
    // series
    opts.series.forEach(function (s) {
      if (!s.pts.length) return;
      var d = s.pts.map(function (p, j) { return (j ? 'L' : 'M') + r1(X(p.x)) + ' ' + r1(Y(p.v, s.axis)); }).join(' ');
      out.push('<path class="line ' + (s.cls || 's1') + (s.dashed ? ' dashed' : '') + '" d="' + d + '"/>');
      s.pts.forEach(function (p) {
        out.push('<circle class="dot ' + (s.cls || 's1') + '" cx="' + r1(X(p.x)) + '" cy="' + r1(Y(p.v, s.axis)) + '" r="3.5"><title>' +
          esc(s.label + ': ' + fmtNum(p.v) + ' — ' + (p.date.length > 10 ? calc.fmtDateTime(p.date) : calc.fmtDate(p.date))) + '</title></circle>');
      });
    });
    out.push('</svg>');
    var legend = opts.series.filter(function (s) { return s.pts.length; }).map(function (s) {
      return '<span class="key"><i class="sw ' + (s.cls || 's1') + (s.dashed ? ' dashed' : '') + '"></i>' + esc(s.label) + '</span>';
    }).concat((opts.bands || []).filter(function (b) { return b.label; }).map(function (b) {
      return '<span class="key"><i class="sw band ' + (b.cls || '') + '"></i>' + esc(b.label) + '</span>';
    }));
    return '<div class="chart-wrap">' + out.join('') + '<div class="legend">' + legend.join('') + '</div></div>';
  }

  return { lineChart: lineChart, niceTicks: niceTicks };
});
