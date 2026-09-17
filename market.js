// ============================================================
// market.js — loads live data and turns price history into
// capital market assumptions (expected return, volatility, correlation).
//
// Output:
//   window.APM_MARKET  = { status, cma, estimates, window, cards, errors }
//   event "apm:market" fires when loading finishes (success or fallback)
// ============================================================

(function (root) {

  // ---------- pure maths (no browser needed, so it can be tested) ----------

  // Month-end value for each YYYY-MM, keeping only complete months
  function monthEnd(points, currentMonth) {
    const out = new Map();
    for (const [date, v] of points) {
      const key = date.slice(0, 7);
      if (key >= currentMonth) continue;
      out.set(key, v); // points are oldest first, so the last one per month wins
    }
    return out;
  }

  function nextMonth(key) {
    let [y, m] = key.split("-").map(Number);
    m += 1; if (m === 13) { m = 1; y += 1; }
    return `${y}-${String(m).padStart(2, "0")}`;
  }

  function mean(a) { return a.reduce((s, x) => s + x, 0) / a.length; }
  function sampleSd(a) {
    const m = mean(a);
    return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
  }
  function correl(a, b) {
    const ma = mean(a), mb = mean(b);
    let num = 0, da = 0, db = 0;
    for (let i = 0; i < a.length; i++) {
      num += (a[i] - ma) * (b[i] - mb);
      da += (a[i] - ma) ** 2;
      db += (b[i] - mb) ** 2;
    }
    return num / Math.sqrt(da * db);
  }

  /**
   * seriesByAsset: { assetKey: [[date, priceINR], ...] }   (already in INR)
   * yields:        { assetKey: annual % to add, e.g. 1.3 }
   */
  function estimateCma(seriesByAsset, yields, C, currentMonth) {
    const M = C.market, anchor = C.cma, order = anchor.order;
    const monthly = {};
    for (const k of order) if (seriesByAsset[k]) monthly[k] = monthEnd(seriesByAsset[k], currentMonth);

    // Assets with enough history
    const usable = order.filter(k => monthly[k] && monthly[k].size >= M.minMonths + 1);

    // Common window: months present for ALL usable assets, most recent lookback period
    let keys = usable.length
      ? [...monthly[usable[0]].keys()].filter(key => usable.every(k => monthly[k].has(key))).sort()
      : [];
    keys = keys.slice(-(M.lookbackYears * 12 + 1));

    // Monthly returns only across consecutive months
    const returns = {}; usable.forEach(k => { returns[k] = []; });
    const returnMonths = [];
    let months = 0;
    for (let i = 1; i < keys.length; i++) {
      if (nextMonth(keys[i - 1]) !== keys[i]) continue;
      months++;
      returnMonths.push(keys[i]);
      usable.forEach(k => {
        const r = monthly[k].get(keys[i]) / monthly[k].get(keys[i - 1]) - 1 + (yields[k] || 0) / 100 / 12;
        returns[k].push(r);
      });
    }

    const enough = months >= M.minMonths;
    const live = enough ? usable : [];
    const weightFor = k => (typeof M.historyWeight === "number" ? M.historyWeight : (M.historyWeight[k] ?? 0.5));

    const estimates = {};
    const expReturn = {}, volatility = {};
    for (const k of order) {
      if (live.includes(k)) {
        const r = returns[k];
        const histMean = mean(r) * 12 * 100;             // annualised arithmetic mean, %
        const histVol = sampleSd(r) * Math.sqrt(12) * 100; // annualised volatility, %
        const growth = r.reduce((g, x) => g * (1 + x), 1);
        const histCagr = (Math.pow(growth, 12 / r.length) - 1) * 100;
        const w = weightFor(k);
        const blended = w * histMean + (1 - w) * anchor.expReturn[k];
        estimates[k] = { live: true, histMean, histVol, histCagr, anchor: anchor.expReturn[k], weight: w, used: blended };
        expReturn[k] = blended;
        volatility[k] = histVol;
      } else {
        estimates[k] = { live: false, anchor: anchor.expReturn[k], weight: 0, used: anchor.expReturn[k] };
        expReturn[k] = anchor.expReturn[k];
        volatility[k] = anchor.volatility[k];
      }
    }

    const correlation = order.map((a, i) => order.map((b, j) => {
      if (i === j) return 1;
      if (live.includes(a) && live.includes(b)) return correl(returns[a], returns[b]);
      return anchor.correlation[i][j];
    }));

    return {
      cma: { ...anchor, expReturn, volatility, correlation },
      estimates,
      window: enough && keys.length ? { from: keys[0], to: keys[keys.length - 1], months } : null,
      coverage: Object.fromEntries(order.map(k => [k, monthly[k] ? monthly[k].size : 0])),
      liveAssets: live,
      // Monthly returns used for the estimates; the Analytics and Projections tabs reuse them
      history: enough ? { months: returnMonths, returns: Object.fromEntries(live.map(k => [k, returns[k]])) } : null
    };
  }

  // Convert a USD price series to INR using month-end or daily FX, matched by date
  function toInr(points, fxPoints) {
    if (!fxPoints || !fxPoints.length) return null;
    const fx = new Map(fxPoints.map(([d, v]) => [d.slice(0, 7), v]));
    return points
      .map(([d, v]) => { const rate = fx.get(d.slice(0, 7)); return rate ? [d, v * rate] : null; })
      .filter(Boolean);
  }

  // Price on or before a date
  function valueOnOrBefore(points, isoDate) {
    let found = null;
    for (const p of points) { if (p[0] <= isoDate) found = p; else break; }
    return found;
  }

  function cardFrom(item, def) {
    if (!item || item.error || !item.points || item.points.length < 2) {
      return { ok: false, name: def.name, kind: def.kind, error: item && item.error ? item.error : "No data" };
    }
    const pts = item.points;
    const last = pts[pts.length - 1];
    const d = new Date(last[0] + "T00:00:00Z");
    d.setUTCFullYear(d.getUTCFullYear() - 1);
    const yearAgo = valueOnOrBefore(pts, d.toISOString().slice(0, 10)) || pts[0];
    const lastYear = pts.filter(p => p[0] >= yearAgo[0]);
    const step = Math.max(1, Math.floor(lastYear.length / 60));
    const spark = lastYear.filter((_, i) => i % step === 0 || i === lastYear.length - 1).map(p => p[1]);

    return {
      ok: true,
      name: def.name,
      sourceName: item.name,
      kind: def.kind,
      id: def.symbol || (item.code ? `AMFI ${item.code}` : ""),
      currency: item.currency || "INR",
      price: item.price ?? last[1],
      asOf: item.priceDate || (item.priceTime ? item.priceTime.slice(0, 10) : last[0]),
      oneYear: last[1] / yearAgo[1] - 1,
      spark
    };
  }

  // ---------- browser loading ----------

  async function getJson(url, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async function load() {
    const C = root.APM_CONFIG, M = C.market;
    const state = { status: "loading", cma: C.cma, estimates: null, window: null, cards: {}, errors: [] };
    root.APM_MARKET = state;

    const historyYahoo = Object.values(M.history).filter(h => h.source === "yahoo").map(h => h.symbol).concat(M.fx);
    const cardYahoo = Object.values(M.instruments).filter(i => i.source === "yahoo").map(i => i.symbol);
    const amfiCodes = [...new Set(
      Object.values(M.history).filter(h => h.source === "amfi").map(h => h.code)
        .concat(Object.values(M.instruments).filter(i => i.source === "amfi" && i.code).map(i => i.code))
    )];
    const amfiFinds = Object.values(M.instruments).filter(i => i.source === "amfi" && i.find).map(i => i.find);

    const enc = list => list.map(encodeURIComponent).join(",");
    const years = M.lookbackYears + 1;

    const [hist, cardsY, amfi] = await Promise.allSettled([
      getJson(`/api/yahoo?symbols=${enc(historyYahoo)}&range=${M.lookbackYears}y&interval=1d&reduce=monthEnd`, 15000),
      getJson(`/api/yahoo?symbols=${enc(cardYahoo)}&range=1y&interval=1d`, 15000),
      getJson(`/api/amfi?codes=${amfiCodes.join(",")}${amfiFinds.length ? `&find=${encodeURIComponent(amfiFinds.join("|"))}` : ""}&years=${years}`, 15000)
    ]);

    const Y = hist.status === "fulfilled" ? hist.value.data : {};
    const YC = cardsY.status === "fulfilled" ? cardsY.value.data : {};
    const A = amfi.status === "fulfilled" ? amfi.value.data : {};
    [hist, cardsY, amfi].forEach(r => { if (r.status === "rejected") state.errors.push(String(r.reason && r.reason.message || r.reason)); });

    // Build INR history per asset class
    const fxPoints = Y[M.fx] && !Y[M.fx].error ? Y[M.fx].points : null;
    const series = {}, yields = {};
    for (const [k, h] of Object.entries(M.history)) {
      const item = h.source === "yahoo" ? Y[h.symbol] : A[h.code];
      if (!item || item.error || !item.points) continue;
      const pts = h.currency === "USD" ? toInr(item.points, fxPoints) : item.points;
      if (pts && pts.length) series[k] = pts;
      if (h.addYield) yields[k] = h.addYield;
    }

    const now = new Date();
    const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    const est = estimateCma(series, yields, C, currentMonth);
    state.cma = est.cma;
    state.estimates = est.estimates;
    state.window = est.window;
    state.liveAssets = est.liveAssets;
    state.coverage = est.coverage;
    state.history = est.history;

    // Instrument cards
    for (const [k, def] of Object.entries(M.instruments)) {
      const item = def.source === "yahoo" ? YC[def.symbol] : A[def.code || def.find];
      state.cards[k] = cardFrom(item, def);
    }

    const liveCount = est.liveAssets.length;
    const cardCount = Object.values(state.cards).filter(c => c.ok).length;
    state.status = liveCount === C.cma.order.length && cardCount === Object.keys(M.instruments).length
      ? "live"
      : (liveCount || cardCount ? "partial" : "offline");
    state.loadedAt = new Date().toISOString();

    document.dispatchEvent(new CustomEvent("apm:market", { detail: state }));
    return state;
  }

  const API = { estimateCma, monthEnd, toInr, cardFrom, mean, sampleSd, correl };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.APM_MARKET_LIB = API;

  if (typeof document !== "undefined") {
    root.APM_MARKET_READY = load().catch(err => {
      const state = root.APM_MARKET || {};
      state.status = "offline";
      state.cma = root.APM_CONFIG.cma;
      state.errors = [String(err.message || err)];
      state.cards = state.cards || {};
      document.dispatchEvent(new CustomEvent("apm:market", { detail: state }));
      return state;
    });
  }

})(typeof window !== "undefined" ? window : globalThis);
