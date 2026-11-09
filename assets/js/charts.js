/* ==========================================================================
   js/charts.js — رسوم SVG خفيفة بلا مكتبات: أعمدة، خط/مساحة، دائرة (window.Charts)
   الألوان من tokens عبر الأصناف s0..s4. الرسم يبقى LTR داخل السياق العربي (محور الزمن).
   كل رسم يحمل role="img" مع وصف نصي، ونصوص التلميح (title) لكل نقطة.
   ========================================================================== */
(function () {
  'use strict';

  const W = 640, H = 240, PL = 46, PR = 10, PT = 14, PB = 30;
  const num = (n) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 1 });
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function niceMax(m) {
    if (m <= 0) return 1;
    const e = Math.pow(10, Math.floor(Math.log10(m))), f = m / e;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e;
  }

  function axes(max, labels, fmt) {
    const plotW = W - PL - PR, plotH = H - PT - PB;
    let g = '';
    for (let i = 0; i <= 4; i++) {
      const y = PT + plotH - (plotH * i) / 4;
      g += '<line class="ch-grid" x1="' + PL + '" x2="' + (W - PR) + '" y1="' + y + '" y2="' + y + '"/>' +
           '<text class="ch-tick" x="' + (PL - 8) + '" y="' + (y + 4) + '" text-anchor="end">' + (fmt || num)((max * i) / 4) + '</text>';
    }
    const step = Math.max(1, Math.ceil(labels.length / 8));
    labels.forEach((l, i) => {
      if (i % step !== 0) return;
      const x = PL + (plotW * (i + 0.5)) / labels.length;
      g += '<text class="ch-tick" x="' + x + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(l) + '</text>';
    });
    return g;
  }

  /* أعمدة مجمّعة. o: { labels, series:[{name, values}], fmt, label } */
  function bars(o) {
    const n = o.labels.length, k = o.series.length;
    const max = niceMax(Math.max.apply(null, o.series.map((s) => Math.max.apply(null, s.values)).concat([0])));
    const plotW = W - PL - PR, plotH = H - PT - PB, group = plotW / n, bw = Math.min(26, (group * 0.62) / k);
    let g = axes(max, o.labels, o.fmt);
    o.series.forEach((s, si) => {
      s.values.forEach((v, i) => {
        const h = (plotH * v) / max, x = PL + group * i + (group - bw * k) / 2 + bw * si, y = PT + plotH - h;
        g += '<rect class="ch-bar s' + si + '" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + (bw - 2).toFixed(1) + '" height="' + Math.max(0, h).toFixed(1) + '" rx="3"><title>' +
             esc(o.labels[i]) + ' · ' + esc(s.name) + ': ' + (o.fmt || num)(v) + '</title></rect>';
      });
    });
    return wrap(g, o.label);
  }

  /* خط بمساحة. o: { labels, series:[{name, values, area}], fmt, label } */
  function line(o) {
    const n = o.labels.length;
    const max = niceMax(Math.max.apply(null, o.series.map((s) => Math.max.apply(null, s.values)).concat([0])));
    const plotW = W - PL - PR, plotH = H - PT - PB;
    const X = (i) => PL + (plotW * (i + 0.5)) / n, Y = (v) => PT + plotH - (plotH * v) / max;
    let g = axes(max, o.labels, o.fmt);
    o.series.forEach((s, si) => {
      const pts = s.values.map((v, i) => [X(i), Y(v)]);
      if (!pts.length) return;
      /* منحنى ناعم (Catmull-Rom → Bézier) */
      let d = 'M' + pts[0][0].toFixed(1) + ',' + pts[0][1].toFixed(1);
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
        const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
        d += 'C' + c1[0].toFixed(1) + ',' + c1[1].toFixed(1) + ' ' + c2[0].toFixed(1) + ',' + c2[1].toFixed(1) + ' ' + p2[0].toFixed(1) + ',' + p2[1].toFixed(1);
      }
      if (s.area !== false) g += '<path class="ch-area s' + si + '" d="' + d + 'L' + pts[pts.length - 1][0].toFixed(1) + ',' + (PT + plotH) + 'L' + pts[0][0].toFixed(1) + ',' + (PT + plotH) + 'Z"/>';
      g += '<path class="ch-line s' + si + '" d="' + d + '"/>';
      const every = Math.max(1, Math.ceil(n / 40));
      pts.forEach((p, i) => {
        if (i % every) return;
        g += '<circle class="ch-dot s' + si + '" cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="' + (n > 45 ? 3 : 4) + '"><title>' + esc(o.labels[i]) + ' · ' + esc(s.name) + ': ' + (o.fmt || num)(s.values[i]) + '</title></circle>';
      });
    });
    return wrap(g, o.label);
  }

  /* دائرة مجوّفة. o: { items:[{label, value}], center:{value, label}, label } */
  function donut(o) {
    const total = o.items.reduce((a, i) => a + i.value, 0);
    const R = 42, C = 2 * Math.PI * R;
    let acc = 0, g = '<circle class="ch-ring" cx="60" cy="60" r="' + R + '"/>';
    if (total > 0) {
      o.items.forEach((it, i) => {
        if (!it.value) return;
        const len = (it.value / total) * C;
        g += '<circle class="ch-seg s' + (it.s != null ? it.s : i) + '" cx="60" cy="60" r="' + R + '" stroke-dasharray="' + len.toFixed(2) + ' ' + (C - len).toFixed(2) + '" stroke-dashoffset="' + (-acc).toFixed(2) + '" transform="rotate(-90 60 60)"><title>' + esc(it.label) + ': ' + num(it.value) + ' (' + Math.round((it.value / total) * 100) + '%)</title></circle>';
        acc += len;
      });
    }
    g += '<text class="ch-center" x="60" y="62" text-anchor="middle">' + esc(num(o.center ? o.center.value : total)) + '</text>' +
         '<text class="ch-center-sub" x="60" y="77" text-anchor="middle">' + esc(o.center ? o.center.label : '') + '</text>';
    return '<svg class="ch ch--donut" viewBox="0 0 120 120" role="img" aria-label="' + esc(o.label || '') + '">' + g + '</svg>';
  }

  function wrap(inner, label) {
    return '<svg class="ch" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="' + esc(label || '') + '">' + inner + '</svg>';
  }

  function legend(items) {
    return '<ul class="ch-legend">' + items.map((i, k) => '<li><span class="ch-key s' + (i.s != null ? i.s : k) + '"></span>' + esc(i.label) + (i.value != null ? ' <strong>' + num(i.value) + '</strong>' : '') + '</li>').join('') + '</ul>';
  }

  window.Charts = { bars, line, donut, legend, num };
})();
