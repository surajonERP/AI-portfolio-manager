// ============================================================
// analytics-engine.js — calculations for the Analytics, Optimisation
// and Projections tabs. Pure functions: numbers in, numbers out.
// ============================================================

(function (root) {

  const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
  const sd = a => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };

  // Reproducible random numbers, so the same plan always shows the same simulation
  function rng(seed) {
    let t = seed >>> 0;
    return function () {
      t += 0x6D2B79F5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }
  function normal(rand) {
    let u = 0; while (u === 0) u = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
  }
  function hashInputs(obj) {
    const s = JSON.stringify(obj); let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function percentile(sorted, p) {
    const idx = (sorted.length - 1) * p;
    const lo = Math.floor(idx), hi = Math.ceil(idx);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  }

  // ---------- 1. Back-test ----------
  // Portfolio return each month = Σ weight × asset return (weights reset monthly)
  function portfolioReturns(allocation, history, order) {
    return history.months.map((_, t) =>
      order.reduce((s, k) => s + ((allocation[k] || 0) / 100) * history.returns[k][t], 0));
  }

  function riskMetrics(r, bench, rfAnnual, months, varLevel) {
    const n = r.length;
    const values = [1];
    r.forEach(x => values.push(values[values.length - 1] * (1 + x)));
    const cagr = Math.pow(values[n], 12 / n) - 1;
    const annMean = mean(r) * 12;
    const vol = sd(r) * Math.sqrt(12);
    const rfM = rfAnnual / 12;
    const downside = Math.sqrt(r.reduce((s, x) => s + Math.min(0, x - rfM) ** 2, 0) / n) * Math.sqrt(12);
    const sharpe = (annMean - rfAnnual) / vol;
    const sortino = downside > 0 ? (annMean - rfAnnual) / downside : null;

    let peak = values[0], peakIdx = 0, maxDd = 0, ddPeak = 0, ddTrough = 0;
    values.forEach((v, i) => {
      if (v > peak) { peak = v; peakIdx = i; }
      const dd = v / peak - 1;
      if (dd < maxDd) { maxDd = dd; ddPeak = peakIdx; ddTrough = i; }
    });

    let beta = null;
    if (bench) {
      const mr = mean(r), mb = mean(bench);
      let cov = 0, vb = 0;
      for (let i = 0; i < n; i++) { cov += (r[i] - mr) * (bench[i] - mb); vb += (bench[i] - mb) ** 2; }
      beta = cov / vb;
    }

    const sorted = [...r].sort((a, b) => a - b);
    const var95 = -percentile(sorted, 1 - varLevel);   // historical monthly VaR, as a positive loss

    // month labels: values[0] is the month before the first return
    const label = i => i === 0 ? null : months[i - 1];
    const years = {};
    r.forEach((x, i) => {
      const y = months[i].slice(0, 4);
      years[y] = years[y] || { growth: 1, months: 0 };
      years[y].growth *= 1 + x; years[y].months++;
    });

    return {
      cagr, annMean, vol, sharpe, sortino, beta, var95,
      maxDrawdown: maxDd, drawdownFrom: label(ddPeak) || "start", drawdownTo: label(ddTrough),
      bestMonth: sorted[sorted.length - 1], worstMonth: sorted[0],
      calendar: Object.entries(years).map(([y, v]) => ({ year: y, ret: v.growth - 1, partial: v.months < 12 })),
      values
    };
  }

  function backtest(allocation, history, C) {
    const order = C.cma.order;
    const r = portfolioReturns(allocation, history, order);
    const bench = history.returns.inEq;
    return riskMetrics(r, bench, C.cma.riskFree / 100, history.months, C.analytics.var);
  }

  function correlationFromHistory(history, order) {
    return order.map(a => order.map(b => {
      const x = history.returns[a], y = history.returns[b];
      const mx = mean(x), my = mean(y);
      let n = 0, dx = 0, dy = 0;
      for (let i = 0; i < x.length; i++) { n += (x[i] - mx) * (y[i] - my); dx += (x[i] - mx) ** 2; dy += (y[i] - my) ** 2; }
      return n / Math.sqrt(dx * dy);
    }));
  }

  // ---------- 2. Efficient frontier (long-only, fully invested) ----------
  function statsOf(weights, C, E) {
    const alloc = {};
    C.cma.order.forEach((k, i) => { alloc[k] = weights[i] * 100; });
    const s = E.portfolioStats(alloc, C);
    return { w: weights, ret: s.expReturn, vol: s.vol, sharpe: s.sharpe };
  }

  function improve(start, C, E, score, feasible, rand, iterations) {
    let best = start, step = 0.10;
    for (let it = 0; it < iterations; it++) {
      const n = best.w.length;
      const i = Math.floor(rand() * n), j = Math.floor(rand() * n);
      if (i === j || best.w[i] <= 0) continue;
      const d = Math.min(best.w[i], step * rand());
      const w = best.w.slice(); w[i] -= d; w[j] += d;
      const cand = statsOf(w, C, E);
      if (feasible(cand) && score(cand) > score(best)) best = cand;
      if (it % 400 === 399) step = Math.max(0.002, step * 0.6);
    }
    return best;
  }

  function frontier(C, E, targetVol) {
    const F = C.analytics.frontier, n = C.cma.order.length;
    const rand = rng(F.seed);
    const cloud = [];
    for (let s = 0; s < F.samples; s++) {
      const g = Array.from({ length: n }, () => -Math.log(rand() || 1e-12));
      const tot = g.reduce((a, b) => a + b, 0);
      cloud.push(statsOf(g.map(x => x / tot), C, E));
    }
    for (let i = 0; i < n; i++) cloud.push(statsOf(Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)), C, E));

    const bestBy = f => cloud.reduce((a, b) => (f(b) > f(a) ? b : a));
    const maxSharpe = improve(bestBy(p => p.sharpe), C, E, p => p.sharpe, () => true, rand, 4000);
    const minVar = improve(bestBy(p => -p.vol), C, E, p => -p.vol, () => true, rand, 4000);

    // Upper edge of the cloud: highest return for each volatility level, from min-variance upward
    const maxVol = Math.max(...cloud.map(p => p.vol));
    const bins = 48, width = (maxVol - minVar.vol) / bins;
    const edge = [minVar];
    for (let b = 1; b <= bins; b++) {
      const lo = minVar.vol + (b - 1) * width, hi = minVar.vol + b * width;
      const inBin = cloud.filter(p => p.vol > lo && p.vol <= hi);
      if (inBin.length) {
        const top = inBin.reduce((a, c) => (c.ret > a.ret ? c : a));
        if (top.ret > edge[edge.length - 1].ret) edge.push(top);
      }
    }

    let atTargetRisk = null;
    if (targetVol != null) {
      const feasible = p => p.vol <= targetVol + 1e-9;
      const starts = cloud.filter(feasible);
      if (starts.length) {
        const start = starts.reduce((a, c) => (c.ret > a.ret ? c : a));
        atTargetRisk = improve(start, C, E, p => p.ret, feasible, rand, 5000);
      }
    }

    return { cloud, edge, maxSharpe, minVar, atTargetRisk, riskFree: C.cma.riskFree / 100 };
  }

  // ---------- 3. Monte Carlo projection ----------
  // Each month, growth is drawn from a lognormal distribution whose median matches the
  // expected compound return, so the median path lines up with the plan's projection.
  function monteCarlo(opts, C) {
    const M = C.analytics.monteCarlo;
    const months = Math.round(opts.years * 12);
    const mu = Math.log(1 + opts.geometric) / 12;
    const sigma = opts.vol / Math.sqrt(12);
    const rand = rng(hashInputs(opts));
    const yearly = Array.from({ length: opts.years + 1 }, () => []);
    const finals = [];

    for (let p = 0; p < M.paths; p++) {
      let v = opts.lump;
      yearly[0].push(v);
      for (let m = 1; m <= months; m++) {
        v += opts.sip;                                     // SIP at the start of the month
        v *= Math.exp(mu + sigma * normal(rand));
        if (m % 12 === 0) yearly[m / 12].push(v);
      }
      finals.push(v);
    }

    const bands = yearly.map(vals => {
      const s = [...vals].sort((a, b) => a - b);
      const out = {};
      M.percentiles.forEach(q => { out[q] = percentile(s, q / 100); });
      return out;
    });
    const invested = opts.lump + opts.sip * months;
    return {
      bands, invested,
      probTarget: finals.filter(v => v >= opts.targetCorpus).length / finals.length,
      probLoss: finals.filter(v => v < invested).length / finals.length,
      final: bands[bands.length - 1]
    };
  }

  // ---------- 4. Historical stress tests ----------
  function windowReturn(r, months, from, to) {
    let g = 1, used = 0;
    months.forEach((m, i) => { if (m > from && m <= to) { g *= 1 + r[i]; used++; } });
    return used ? g - 1 : null;
  }

  // Months after the stress window until the portfolio was back to its starting value.
  // 0 = no loss over the window; null = not recovered within the data.
  function recoveryMonths(r, months, from, to) {
    if ((windowReturn(r, months, from, to) ?? 0) >= 0) return 0;
    let g = 1;
    for (let i = 0; i < months.length; i++) {
      if (months[i] <= from) continue;
      g *= 1 + r[i];
      if (months[i] > to && g >= 1) {
        const [y1, m1] = to.split("-").map(Number), [y2, m2] = months[i].split("-").map(Number);
        return (y2 - y1) * 12 + (m2 - m1);
      }
    }
    return null;
  }

  function worst12(r, months) {
    let worst = null;
    for (let i = 11; i < r.length; i++) {
      let g = 1;
      for (let j = i - 11; j <= i; j++) g *= 1 + r[j];
      if (!worst || g - 1 < worst.ret) worst = { ret: g - 1, from: months[i - 11], to: months[i] };
    }
    return worst;
  }

  function stressTests(allocations, history, C) {
    const order = C.cma.order;
    const series = Object.fromEntries(Object.entries(allocations).map(([name, a]) => [name, portfolioReturns(a, history, order)]));
    series.benchmark = history.returns.inEq;
    const tests = C.analytics.stressTests
      .filter(t => history.months[0] <= t.from && history.months[history.months.length - 1] >= t.to)
      .map(t => ({
        ...t,
        results: Object.fromEntries(Object.entries(series).map(([name, r]) => [name, {
          ret: windowReturn(r, history.months, t.from, t.to),
          recovery: recoveryMonths(r, history.months, t.from, t.to)
        }]))
      }));
    const worst = Object.fromEntries(Object.entries(series).map(([name, r]) => [name, worst12(r, history.months)]));
    return { tests, worst };
  }

  // ---------- 5. Custom allocation checks ----------
  function riskCeiling(profileIndex, C, E) {
    const P = C.profiles;
    if (profileIndex < P.length - 1) {
      return { vol: E.portfolioStats(P[profileIndex + 1].allocation, C).vol, basis: P[profileIndex + 1].name };
    }
    return { vol: E.portfolioStats(P[profileIndex].allocation, C).vol * C.analytics.aggressiveCeilingFactor, basis: null };
  }

  function drift(custom, suggested, order) {
    return order.reduce((s, k) => s + Math.abs((custom[k] || 0) - (suggested[k] || 0)), 0) / 2;
  }

  const API = { portfolioReturns, riskMetrics, backtest, correlationFromHistory, frontier, monteCarlo, stressTests, riskCeiling, drift, rng, percentile };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.APM_ANALYTICS = API;

})(typeof window !== "undefined" ? window : globalThis);
