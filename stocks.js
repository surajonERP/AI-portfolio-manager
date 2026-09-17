// ============================================================
// stocks.js — builds the Nifty 100 stock basket for one investor.
// Pure logic (no screen code), so every rule can be tested.
//
// Steps:
//  1. Filters: enough history, 5-year CAGR above the risk-free rate, beta
//     within the profile's band, volatility and drawdown within limits.
//  2. Ranking: closest beta to the profile's target beta first.
//  3. Diversification: at most 30% of stocks from one sector group.
//  4. Sizing: equal rupee amount per stock, whole shares only.
// ============================================================

(function (root) {

  function groupOf(industry, C) {
    for (const [group, list] of Object.entries(C.stocks.sectorGroups || {}))
      if (list.includes(industry)) return group;
    return industry || "Other";
  }

  // Largest group allowance for a basket of a given size, e.g. 30% of 10 = 3, of 7 = 2
  function groupCapFor(size, S) {
    return Math.max(1, Math.round(S.maxGroupShare * size));
  }

  function buildBasket(screen, profileName, equityAmount, C, riskFree) {
    const S = C.stocks;
    const target = S.profiles[profileName];
    const base = { profile: profileName, target, equityAmount, universe: screen ? screen.constituents : 0 };

    if (!screen || !Array.isArray(screen.stocks) || !screen.stocks.length) {
      return { ...base, ok: false, reason: "unavailable" };
    }

    const all = screen.stocks.map(s => ({ ...s, group: groupOf(s.industry, C) }));
    const eligibleHistory = all.filter(s => s.years >= S.minYears);
    const passReturn = eligibleHistory.filter(s => s.cagr > riskFree);
    const lo = target.targetBeta - S.betaBand, hi = target.targetBeta + S.betaBand;
    const inBand = passReturn.filter(s => s.beta >= lo && s.beta <= hi);

    const steps = [{ vol: 0, drawdown: 0 }].concat(S.relaxSteps || []);
    let best = null, used = null, passedRisk = [], lastAttempt = null;

    for (let i = 0; i < steps.length && !best; i++) {
      const maxVol = target.maxVol + steps[i].vol;
      const maxDd = target.maxDrawdown + steps[i].drawdown;
      used = { step: i, maxVol, maxDrawdown: maxDd, betaLow: lo, betaHigh: hi };
      passedRisk = inBand.filter(s => s.vol <= maxVol && Math.abs(s.maxDrawdown) <= maxDd);
      const ranked = [...passedRisk].sort((a, b) =>
        Math.abs(a.beta - target.targetBeta) - Math.abs(b.beta - target.targetBeta) || a.vol - b.vol);

      // Try the biggest basket first, then smaller ones
      for (let size = S.count; size >= S.minStocks; size--) {
        const cap = groupCapFor(size, S);
        const perStock = equityAmount / size;
        const perGroup = {};
        const picked = []; let skippedPrice = 0;
        for (const s of ranked) {
          if (picked.length >= size) break;
          if ((perGroup[s.group] || 0) >= cap) continue;
          if (s.price > perStock) { skippedPrice++; continue; }
          perGroup[s.group] = (perGroup[s.group] || 0) + 1;
          picked.push(s);
        }
        const groups = Object.keys(perGroup).length;
        lastAttempt = { picked, skippedPrice, groups, cap };
        if (picked.length === size && groups >= S.minGroups) {
          best = { size, picked, skippedPrice, cap, groups };
          break;
        }
      }
    }

    const stats = {
      screened: screen.count,
      withHistory: eligibleHistory.length,
      passedReturn: passReturn.length,
      inBand: inBand.length,
      passedRisk: passedRisk.length,
      skippedPrice: best ? best.skippedPrice : (lastAttempt ? lastAttempt.skippedPrice : 0)
    };

    if (!best || equityAmount < S.minEquity) {
      const prices = passReturn.map(s => s.price).sort((a, b) => a - b);
      const median = prices.length ? prices[Math.floor(prices.length / 2)] : 0;
      const estimate = Math.ceil(median * S.minStocks / 1000) * 1000;
      const lack = equityAmount < S.minEquity || (lastAttempt && lastAttempt.skippedPrice > 0) ? "money" : "stocks";
      return {
        ...base, ok: false, reason: "too-few", lack, stats, limits: used,
        found: lastAttempt ? lastAttempt.picked.length : 0,
        foundGroups: lastAttempt ? lastAttempt.groups : 0,
        suggestedMinimum: Math.max(S.minEquity, estimate)
      };
    }

    const perAmount = equityAmount / best.size;
    const holdings = best.picked.map(s => {
      const shares = Math.floor(perAmount / s.price);
      return { ...s, shares, invested: shares * s.price };
    });
    const invested = holdings.reduce((t, h) => t + h.invested, 0);
    const wAvg = f => holdings.reduce((t, h) => t + h[f] * h.invested, 0) / invested;

    return {
      ...base, ok: true, holdings, stats,
      limits: used, relaxed: used.step > 0,
      size: best.size, groupCap: best.cap, fullSize: best.size === S.count,
      invested, leftover: equityAmount - invested,
      avgBeta: wAvg("beta"), avgVol: wAvg("vol"), avgDrawdown: wAvg("maxDrawdown"), avgCagr: wAvg("cagr"),
      groups: best.groups
    };
  }

  const API = { buildBasket, groupOf };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.APM_STOCKS = API;

  // Loads the screen only when needed; later calls reuse the same request
  let pending = null;
  root.APM_LOAD_SCREEN = function (timeoutMs) {
    if (!pending) {
      pending = (async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs || 55000);
        try {
          const res = await fetch("/api/screen", { signal: controller.signal });
          const data = await res.json();
          if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
          return data;
        } finally { clearTimeout(timer); }
      })().catch(err => { pending = null; return { error: String(err.message || err) }; });
    }
    return pending;
  };

})(typeof window !== "undefined" ? window : globalThis);
