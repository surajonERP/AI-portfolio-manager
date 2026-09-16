// ============================================================
// engine.js — the "brain". Pure calculations, no screen code.
// Every function takes numbers in and gives numbers out, so each
// can be checked against a calculator or an Excel sheet.
// ============================================================

(function (root) {

  // ---------- Risk scoring ----------
  function bandPoints(bands, value) {
    for (const b of bands) if (value <= b.upTo) return b.pts;
    return bands[bands.length - 1].pts;
  }
  function optionPoints(q, value) {
    const o = q.options.find(x => x.value === value);
    return o ? o.pts : 0;
  }

  function scoreAbility(inp, C) {
    const a = C.ability;
    const parts = [
      { label: a.horizon.label,    pts: bandPoints(a.horizon.bands, inp.horizon), max: a.horizon.max },
      { label: a.age.label,        pts: bandPoints(a.age.bands, inp.age),         max: a.age.max },
      { label: a.income.label,     pts: optionPoints(a.income, inp.income),         max: a.income.max },
      { label: a.dependents.label, pts: optionPoints(a.dependents, inp.dependents), max: a.dependents.max },
      { label: a.emergency.label,  pts: optionPoints(a.emergency, inp.emergency),   max: a.emergency.max },
      { label: a.emi.label,        pts: optionPoints(a.emi, inp.emi),               max: a.emi.max },
      { label: a.share.label,      pts: optionPoints(a.share, inp.share),           max: a.share.max }
    ];
    return { total: parts.reduce((s, p) => s + p.pts, 0), parts };
  }

  function scoreWillingness(inp, C) {
    const w = C.willingness;
    const parts = [
      { label: w.experience.label, pts: optionPoints(w.experience, inp.experience), max: w.experience.max },
      { label: w.drop.label,       pts: optionPoints(w.drop, inp.drop),             max: w.drop.max },
      { label: w.range.label,      pts: optionPoints(w.range, inp.range),           max: w.range.max }
    ];
    return { total: parts.reduce((s, p) => s + p.pts, 0), parts };
  }

  function profileIndexForScore(score, C) {
    return C.profiles.findIndex(p => score <= p.upTo);
  }

  // ---------- Allocation with constraints ----------
  function applyMinCash(alloc, minCash) {
    const out = { ...alloc };
    if (out.cash >= minCash) return out;
    const need = minCash - out.cash;
    const others = Object.keys(out).filter(k => k !== "cash");
    const othersTotal = others.reduce((s, k) => s + out[k], 0);
    others.forEach(k => { out[k] = out[k] - need * (out[k] / othersTotal); });
    out.cash = minCash;
    // round to whole percentages that still add to 100
    return roundTo100(out);
  }

  function roundTo100(obj) {
    const keys = Object.keys(obj);
    const floored = {};
    let sum = 0;
    keys.forEach(k => { floored[k] = Math.floor(obj[k]); sum += floored[k]; });
    const remainders = keys
      .map(k => ({ k, r: obj[k] - Math.floor(obj[k]) }))
      .sort((a, b) => b.r - a.r);
    for (let i = 0; i < 100 - sum; i++) floored[remainders[i % keys.length].k] += 1;
    return floored;
  }

  // ---------- Portfolio statistics (mean-variance) ----------
  function portfolioStats(alloc, C) {
    const m = C.cma, keys = m.order;
    const w = keys.map(k => (alloc[k] || 0) / 100);
    const mu = keys.map(k => m.expReturn[k] / 100);
    const sd = keys.map(k => m.volatility[k] / 100);

    const expReturn = w.reduce((s, wi, i) => s + wi * mu[i], 0);   // E(Rp) = Σ wᵢ E(Rᵢ)
    let variance = 0;                                               // σp² = Σ Σ wᵢ wⱼ σᵢ σⱼ ρᵢⱼ
    for (let i = 0; i < keys.length; i++)
      for (let j = 0; j < keys.length; j++)
        variance += w[i] * w[j] * sd[i] * sd[j] * m.correlation[i][j];
    const vol = Math.sqrt(variance);
    const geometric = expReturn - variance / 2;                     // compound growth ≈ μ − σ²/2
    const sharpe = (expReturn - m.riskFree / 100) / vol;            // (E(Rp) − Rf) / σp

    return { expReturn, vol, geometric, sharpe };
  }

  // ---------- Time value of money ----------
  function fvLumpSum(pv, annualRate, years) {
    return pv * Math.pow(1 + annualRate, years);
  }
  // SIP paid at the start of each month (annuity due), compounding at the annual rate
  function sipFactor(annualRate, years) {
    const n = Math.round(years * 12);
    const i = Math.pow(1 + annualRate, 1 / 12) - 1;
    if (i === 0) return n;
    return ((Math.pow(1 + i, n) - 1) / i) * (1 + i);
  }
  function fvTotal(lump, sip, annualRate, years) {
    return fvLumpSum(lump, annualRate, years) + sip * sipFactor(annualRate, years);
  }

  // ---------- Full plan ----------
  function buildPlan(inp, C) {
    const ability = scoreAbility(inp, C);
    const willingness = scoreWillingness(inp, C);
    const governing = ability.total <= willingness.total ? "ability" : "willingness";
    const finalScore = Math.min(ability.total, willingness.total);

    let idx = profileIndexForScore(finalScore, C);
    const notes = [];

    // Constraint: short horizon caps the profile
    if (inp.horizon < C.constraints.shortHorizonYears) {
      const capIdx = C.profiles.findIndex(p => p.name === C.constraints.shortHorizonMaxProfile);
      if (idx > capIdx) {
        idx = capIdx;
        notes.push({ type: "horizon", text: `Your horizon is under ${C.constraints.shortHorizonYears} years, so the profile is capped at ${C.profiles[capIdx].name}. Equity can fall sharply in any single year, and there may not be time to recover.` });
      }
    }

    const profile = C.profiles[idx];
    const minCash = C.constraints.liquidityMinCash[inp.liquidity] || 0;
    let allocation = { ...profile.allocation };
    if (minCash > allocation.cash) {
      allocation = applyMinCash(allocation, minCash);
      notes.push({ type: "liquidity", text: `Because you may need part of this money early, cash is raised to at least ${minCash}%.` });
    }
    if (inp.emergency === "none") {
      notes.push({ type: "emergency", text: "You have no emergency fund. Consider building 3 to 6 months of expenses in a savings account or liquid fund before investing for the long term." });
    }

    const stats = portfolioStats(allocation, C);

    // Feasibility: target vs expected compound return
    const target = inp.targetReturn / 100;
    const gap = target - stats.geometric;
    let verdict;
    if (gap <= 0) verdict = "achievable";
    else if (gap <= C.feasibility.stretchMargin / 100) verdict = "stretch";
    else verdict = "unrealistic";

    // Which profile would the target need?
    const allStats = C.profiles.map(p => ({ name: p.name, stats: portfolioStats(p.allocation, C) }));
    const requiredIdx = allStats.findIndex(p => p.stats.geometric >= target);
    const required = requiredIdx === -1 ? null : { index: requiredIdx, name: allStats[requiredIdx].name };

    // Corpus projections
    const years = inp.horizon;
    const invested = inp.lump + inp.sip * Math.round(years * 12);
    const projected = fvTotal(inp.lump, inp.sip, stats.geometric, years);
    const targetCorpus = fvTotal(inp.lump, inp.sip, target, years);
    const inflation = C.cma.inflation / 100;
    const projectedReal = projected / Math.pow(1 + inflation, years);

    // SIP needed at the expected return to reach the target corpus
    const lumpGrowth = fvLumpSum(inp.lump, stats.geometric, years);
    const requiredSip = Math.max(0, (targetCorpus - lumpGrowth) / sipFactor(stats.geometric, years));

    // Money split
    const split = {};
    Object.keys(allocation).forEach(k => {
      split[k] = { pct: allocation[k], lump: inp.lump * allocation[k] / 100, sip: inp.sip * allocation[k] / 100 };
    });

    return {
      input: inp, ability, willingness, governing, finalScore,
      profile: { index: idx, name: profile.name },
      allocation, split, stats, notes,
      feasibility: { target, gap, verdict, required, profileIndex: idx },
      projection: { years, invested, projected, projectedReal, targetCorpus, requiredSip }
    };
  }

  const API = { scoreAbility, scoreWillingness, portfolioStats, fvLumpSum, sipFactor, fvTotal, buildPlan, roundTo100 };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.APM_ENGINE = API;

})(typeof window !== "undefined" ? window : globalThis);
