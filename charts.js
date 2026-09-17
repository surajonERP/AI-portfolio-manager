// ============================================================
// charts.js — small SVG charts drawn to match the site's style.
// No chart library: each function returns an SVG string sized to
// the container width, so text stays readable on phones.
// ============================================================

(function (root) {

  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  function niceTicks(min, max, count) {
    const span = max - min || Math.abs(max) || 1;
    const raw = span / count;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) || 10 * mag;
    const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
    const ticks = [];
    for (let v = lo; v <= hi + step / 2; v += step) ticks.push(+v.toFixed(10));
    return ticks;
  }

  function frame(width, height, pad) {
    return { w: width, h: height, x0: pad.l, x1: width - pad.r, y0: height - pad.b, y1: pad.t };
  }

  function yAxis(f, ticks, scaleY, fmt) {
    return ticks.map(t => {
      const y = scaleY(t).toFixed(1);
      return `<line class="grid" x1="${f.x0}" x2="${f.x1}" y1="${y}" y2="${y}"/>
        <text class="tick" x="${f.x0 - 8}" y="${y}" text-anchor="end" dominant-baseline="middle">${fmt(t)}</text>`;
    }).join("");
  }

  // Line chart over monthly labels ("YYYY-MM"). series: [{ values, cls }]
  function line({ labels, series, width, height = 300, fmt = v => v }) {
    const compact = width < 520;
    const f = frame(width, height, { l: compact ? 58 : 72, r: 12, t: 12, b: 28 });
    const all = series.flatMap(s => s.values);
    const ticks = niceTicks(Math.min(...all), Math.max(...all), compact ? 4 : 5);
    const yMin = ticks[0], yMax = ticks[ticks.length - 1];
    const n = labels.length;
    const sx = i => f.x0 + (i / (n - 1)) * (f.x1 - f.x0);
    const sy = v => f.y0 - ((v - yMin) / (yMax - yMin)) * (f.y0 - f.y1);

    const years = [];
    labels.forEach((l, i) => { if (l.endsWith("-01")) years.push({ i, y: l.slice(0, 4) }); });
    const every = Math.ceil(years.length / (compact ? 4 : 10));
    const xLabels = years.filter((_, k) => k % every === 0).map(({ i, y }) =>
      `<text class="tick" x="${sx(i).toFixed(1)}" y="${f.y0 + 18}" text-anchor="middle">${y}</text>`).join("");

    const paths = series.map(s => {
      const d = s.values.map((v, i) => `${i ? "L" : "M"}${sx(i).toFixed(1)},${sy(v).toFixed(1)}`).join("");
      return `<path class="series ${s.cls}" d="${d}"/>`;
    }).join("");

    return `<svg class="chart" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img">
      ${yAxis(f, ticks, sy, fmt)}${xLabels}${paths}</svg>`;
  }

  // Efficient frontier: cloud, frontier edge, capital allocation line, labelled points
  function frontier({ cloud, edge, riskFree, maxSharpe, points, width, height = 380 }) {
    const compact = width < 520;
    const f = frame(width, height, { l: compact ? 44 : 56, r: 16, t: 16, b: 40 });
    const vols = cloud.map(p => p.vol).concat(points.map(p => p.vol));
    const rets = cloud.map(p => p.ret).concat(points.map(p => p.ret), [riskFree]);
    const xt = niceTicks(0, Math.max(...vols), compact ? 4 : 6);
    const yt = niceTicks(Math.min(...rets), Math.max(...rets), compact ? 4 : 5);
    const sx = v => f.x0 + ((v - xt[0]) / (xt[xt.length - 1] - xt[0])) * (f.x1 - f.x0);
    const sy = v => f.y0 - ((v - yt[0]) / (yt[yt.length - 1] - yt[0])) * (f.y0 - f.y1);
    const pct = v => (v * 100).toFixed(0) + "%";

    const xAxis = xt.map(t => `<text class="tick" x="${sx(t).toFixed(1)}" y="${f.y0 + 18}" text-anchor="middle">${pct(t)}</text>`).join("");
    const dots = cloud.filter((_, i) => i % 2 === 0).map(p =>
      `<circle class="cloud" cx="${sx(p.vol).toFixed(1)}" cy="${sy(p.ret).toFixed(1)}" r="1.3"/>`).join("");
    const edgePath = edge.map((p, i) => `${i ? "L" : "M"}${sx(p.vol).toFixed(1)},${sy(p.ret).toFixed(1)}`).join("");

    // CAL from the risk-free rate through the maximum-Sharpe portfolio, to the chart edge
    const slope = (maxSharpe.ret - riskFree) / maxSharpe.vol;
    const xEnd = xt[xt.length - 1];
    let yEnd = riskFree + slope * xEnd, xStop = xEnd;
    if (yEnd > yt[yt.length - 1]) { xStop = (yt[yt.length - 1] - riskFree) / slope; yEnd = yt[yt.length - 1]; }
    const cal = `<line class="cal" x1="${sx(0)}" y1="${sy(riskFree).toFixed(1)}" x2="${sx(xStop).toFixed(1)}" y2="${sy(yEnd).toFixed(1)}"/>`;

    // Place labels, nudging any that would overlap an earlier label
    const placed = [];
    const marks = points.map(p => {
      const x = sx(p.vol), y = sy(p.ret);
      const right = p.side === "left" ? false : p.side === "right" ? true : x < f.x1 - 150;
      const lx = x + (right ? 11 : -11);
      const w = p.label.length * 6.6;
      const box = ly => right ? [lx, ly - 8, lx + w, ly + 8] : [lx - w, ly - 8, lx, ly + 8];
      const hits = b => placed.some(o => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]);
      let ly = y + (p.dy || 0);
      for (const shift of [0, 16, -16, 32, -32, 48]) {
        if (!hits(box(y + (p.dy || 0) + shift))) { ly = y + (p.dy || 0) + shift; break; }
      }
      placed.push(box(ly));
      return `<g class="pt ${p.cls}"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${p.r || 6}"/>
        <text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="${right ? "start" : "end"}" dominant-baseline="middle">${p.label}</text></g>`;
    }).join("");

    return `<svg class="chart" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img">
      ${yAxis(f, yt, sy, pct)}${xAxis}
      <text class="axis-title" x="${(f.x0 + f.x1) / 2}" y="${height - 4}" text-anchor="middle">Expected volatility</text>
      ${dots}<path class="edge" d="${edgePath}"/>${cal}${marks}</svg>`;
  }

  // Monte Carlo fan: 10–90 and 25–75 bands, median line, optional target line
  function fan({ bands, target, width, height = 320, fmt }) {
    const compact = width < 520;
    const f = frame(width, height, { l: compact ? 64 : 84, r: 12, t: 12, b: 28 });
    const n = bands.length;
    const top = Math.max(...bands.map(b => b[90]), target || 0);
    const ticks = niceTicks(0, top, compact ? 4 : 5);
    const sx = i => f.x0 + (i / (n - 1)) * (f.x1 - f.x0);
    const sy = v => f.y0 - (v / ticks[ticks.length - 1]) * (f.y0 - f.y1);
    const area = (lo, hi) => {
      const up = bands.map((b, i) => `${i ? "L" : "M"}${sx(i).toFixed(1)},${sy(b[hi]).toFixed(1)}`).join("");
      const down = bands.map((b, i) => `L${sx(n - 1 - i).toFixed(1)},${sy(bands[n - 1 - i][lo]).toFixed(1)}`).join("");
      return up + down + "Z";
    };
    const median = bands.map((b, i) => `${i ? "L" : "M"}${sx(i).toFixed(1)},${sy(b[50]).toFixed(1)}`).join("");
    const every = Math.ceil((n - 1) / (compact ? 5 : 10));
    const xLabels = bands.map((_, i) => i % every === 0 || i === n - 1
      ? `<text class="tick" x="${sx(i).toFixed(1)}" y="${f.y0 + 18}" text-anchor="${i === n - 1 ? "end" : i === 0 ? "start" : "middle"}">${i === 0 ? "Now" : "Yr " + i}</text>` : "").join("");
    const tgt = target ? `<line class="target" x1="${f.x0}" x2="${f.x1}" y1="${sy(target).toFixed(1)}" y2="${sy(target).toFixed(1)}"/>` : "";

    return `<svg class="chart" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img">
      ${yAxis(f, ticks, sy, fmt)}${xLabels}
      <path class="band-outer" d="${area(10, 90)}"/><path class="band-inner" d="${area(25, 75)}"/>
      ${tgt}<path class="series median" d="${median}"/></svg>`;
  }

  function monthLabel(key) {
    const [y, m] = key.split("-");
    return `${MONTHS[Number(m) - 1]} ${y}`;
  }

  root.APM_CHARTS = { line, frontier, fan, monthLabel };
})(typeof window !== "undefined" ? window : globalThis);
