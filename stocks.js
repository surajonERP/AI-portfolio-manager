// ============================================================
// stocks.js — builds the Nifty 100 stock basket for one investor.
// Pure logic (no screen code), so every rule can be tested.
//
// Steps:
//  1. Filters: enough history, 5-year CAGR above the risk-free rate,
//     volatility and maximum drawdown within the profile's limits.
//  2. Ranking: closest beta to the profile's target beta first.
//  3. Diversification: at most N stocks per industry.
//  4. Sizing: equal rupee amount per stock, whole shares only.
// ============================================================

(function (root) {

  function buildBasket(screen, profileName, equityAmount, C, riskFree) {
    const S = C.stocks;
    const target = S.profiles[profileName];
    const base = { profile: profileName, target, equityAmount, universe: screen ? screen.constituents : 0 };

    if (!screen || !Array.isArray(screen.stocks) || !screen.stocks.length) {
      return { ...base, ok: false, reason: "unavailable" };
    }

    const perStock = equityAmount / S.count;
    const eligibleHistory = screen.stocks.filter(s => s.years >= S.minYears);
    const passReturn = eligibleHistory.filter(s => s.cagr > riskFree);

    // Try the profile limits first. Loosen them ONLY if too few stocks pass on risk grounds
    // (price problems are handled separately and never loosen the risk limits).
    const steps = [{ vol: 0, drawdown: 0 }].concat(S.relaxSteps || []);
    let ranked = [], used = null, passedRisk = [];

    for (let i = 0; i < steps.length; i++) {
      const maxVol = target.maxVol + steps[i].vol;
      const maxDd = target.maxDrawdown + steps[i].drawdown;
      passedRisk = passReturn.filter(s => s.vol <= maxVol && Math.abs(s.maxDrawdown) <= maxDd);
      ranked = [...passedRisk].sort((a, b) =>
        Math.abs(a.beta - target.targetBeta) - Math.abs(b.beta - target.targetBeta) || a.vol - b.vol);
      used = { step: i, maxVol, maxDrawdown: maxDd };

      // how many could be chosen under the industry cap, ignoring price
      const perInd = {}; let capacity = 0;
      for (const s of ranked) {
        if ((perInd[s.industry] || 0) >= S.sectorCap) continue;
        perInd[s.industry] = (perInd[s.industry] || 0) + 1;
        if (++capacity >= S.count) break;
      }
      if (capacity >= S.count) break;
    }

    // Pick in rank order, respecting the industry cap and whole-share affordability
    const perIndustry = {};
    const chosen = []; let skippedPrice = 0;
    for (const s of ranked) {
      if (chosen.length >= S.count) break;
      if ((perIndustry[s.industry] || 0) >= S.sectorCap) continue;
      if (s.price > perStock) { skippedPrice++; continue; }
      perIndustry[s.industry] = (perIndustry[s.industry] || 0) + 1;
      chosen.push(s);
    }

    const stats = {
      screened: screen.count,
      withHistory: eligibleHistory.length,
      passedReturn: passReturn.length,
      passedRisk: passedRisk.length,
      skippedPrice
    };

    const industries = new Set(chosen.map(c => c.industry)).size;
    if (equityAmount < S.minEquity || chosen.length < S.minStocks || industries < S.minIndustries) {
      // Rough minimum: enough to buy one share of each of the cheapest suitable stocks
      const prices = passReturn.map(s => s.price).sort((a, b) => a - b);
      const median = prices.length ? prices[Math.floor(prices.length / 2)] : 0;
      const estimate = Math.ceil(median * S.count / 1000) * 1000;
      return { ...base, ok: false, reason: "too-few", stats, limits: used, found: chosen.length, foundIndustries: industries,
               suggestedMinimum: Math.max(S.minEquity, estimate) };
    }

    const perAmount = equityAmount / chosen.length;
    const holdings = chosen.map(s => {
      const shares = Math.floor(perAmount / s.price);
      return { ...s, shares, invested: shares * s.price };
    });
    const invested = holdings.reduce((t, h) => t + h.invested, 0);
    const wAvg = f => holdings.reduce((t, h) => t + h[f] * h.invested, 0) / invested;

    return {
      ...base, ok: true, holdings, stats,
      limits: used, relaxed: used.step > 0,
      invested, leftover: equityAmount - invested,
      avgBeta: wAvg("beta"), avgVol: wAvg("vol"), avgDrawdown: wAvg("maxDrawdown"), avgCagr: wAvg("cagr"),
      industries: new Set(holdings.map(h => h.industry)).size
    };
  }

  const API = { buildBasket };
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
