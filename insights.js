// ============================================================
// insights.js — the Analytics, Optimisation and Projections tabs.
// Each tab redraws when the plan, the custom allocation or market
// data changes, and when the tab is opened.
// ============================================================

(function () {
  const C = window.APM_CONFIG, E = window.APM_ENGINE, A = window.APM_ANALYTICS, CH = window.APM_CHARTS;
  const ORDER = C.cma.order;

  // ---------- helpers ----------
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const inr = n => "₹" + Math.round(n).toLocaleString("en-IN");
  const inrShort = n => n >= 1e7 ? "₹" + (n / 1e7).toFixed(n >= 1e8 ? 0 : 1) + " cr" : n >= 1e5 ? "₹" + (n / 1e5).toFixed(n >= 1e6 ? 0 : 1) + " L" : inr(n);
  const pct = (n, d = 1) => { const v = (n * 100).toFixed(d); return (Number(v) < 0 ? "−" + v.slice(1) : v.replace(/^-/, "")) + "%"; };
  const signed = (n, d = 1) => { const v = Math.abs(n * 100).toFixed(d); return Number(v) === 0 ? v + "%" : (n >= 0 ? "+" : "−") + v + "%"; };
  const withArticle = w => (/^[AEIOU]/i.test(w) ? "an " : "a ") + w;
  const ml = CH.monthLabel;
  const roundNice = n => n >= 100000 ? Math.round(n / 1000) * 1000 : Math.round(n / 100) * 100;

  function cfg() {
    const M = window.APM_MARKET;
    return M && M.cma ? { ...C, cma: M.cma } : C;
  }
  function state() {
    const S = window.APM_STATE || {};
    return { plan: S.plan || null, custom: S.custom || null };
  }
  function widthOf(el) {
    const w = el ? el.clientWidth : 0;
    return Math.max(300, Math.min(w || 900, 1000));
  }
  function emptyState(mount, text) {
    mount.innerHTML = `<div class="pending"><p>${text}</p><a class="btn btn-primary" href="#profile">Build my plan</a></div>`;
  }
  function legend(items) {
    return `<ul class="legend">${items.map(i => `<li><span class="swatch ${i.cls}"></span>${i.label}</li>`).join("")}</ul>`;
  }
  function portfolios(p, custom) {
    const list = [{ key: "suggested", label: "Suggested", cls: "s-suggested", allocation: p.allocation }];
    if (custom) list.push({ key: "custom", label: "Custom", cls: "s-custom", allocation: custom.allocation });
    return list;
  }
  function stockNote(p) {
    return p.input.vehicle === "stocks" && p.basket && p.basket.ok
      ? `<p class="footnote">Indian equity is measured here with the Nifty 50 index. Your stock basket's own history isn't included, because its stocks were chosen using this same period, which would make the back-test look better than it really was (look-ahead bias).</p>`
      : "";
  }

  // ---------- ANALYTICS ----------
  function renderAnalytics() {
    const mount = document.getElementById("analytics-mount");
    if (!mount) return;
    const { plan: p, custom } = state();
    if (!p) return emptyState(mount, "Build your plan first. This tab then shows how your suggested portfolio, and any custom version of it, would have performed historically.");
    const M = window.APM_MARKET;
    if (!M || M.status === "loading") { mount.innerHTML = `<p class="data-status">Loading market history…</p>`; return; }
    if (!M.history || ORDER.some(k => !M.history.returns[k])) {
      mount.innerHTML = `<div class="pending"><p>Historical data for every asset class is needed for this tab, and it couldn't be loaded right now. It works on the deployed website.</p></div>`;
      return;
    }

    const EC = cfg(), H = M.history;
    const list = portfolios(p, custom);
    const results = list.map(x => ({ ...x, bt: A.backtest(x.allocation, H, EC) }));
    const bench = { key: "benchmark", label: "Nifty 50", cls: "s-benchmark", bt: A.backtest({ inEq: 100 }, H, EC) };
    const cols = results.concat(bench);
    const lump = p.input.lump;
    const labels = [H.months[0]].concat(H.months); // values include a starting point

    const chartBox = mount.querySelector(".chart-box") || null;
    const width = widthOf(chartBox || mount);
    const chart = CH.line({
      labels, width, height: width < 520 ? 240 : 320, fmt: inrShort,
      series: cols.map(c => ({ cls: c.cls, values: c.bt.values.map(v => v * lump) }))
    });

    const s = results[0].bt, b = bench.bt;
    const summary = `Over ${ml(H.months[0])} to ${ml(H.months[H.months.length - 1])}, ${inr(lump)} in your suggested portfolio would have grown to about ${inr(roundNice(s.values[s.values.length - 1] * lump))}, a compound return of ${pct(s.cagr)} a year, with volatility of ${pct(s.vol)}. The same amount in Nifty 50 alone would have reached about ${inr(roundNice(b.values[b.values.length - 1] * lump))} (${pct(b.cagr)} a year, ${pct(b.vol)} volatility). Your portfolio's worst fall was ${pct(s.maxDrawdown)}, against ${pct(b.maxDrawdown)} for Nifty 50: ${Math.abs(s.maxDrawdown) < Math.abs(b.maxDrawdown) ? "that is what diversification into gold, silver, debt and cash bought" : "diversification didn't reduce the worst fall in this period"}.`;

    const row = (label, f, hint) => `<tr><th scope="row">${label}${hint ? `<span class="row-hint">${hint}</span>` : ""}</th>${cols.map(c => `<td class="num">${f(c.bt)}</td>`).join("")}</tr>`;
    const metrics = `
      <div class="table-wrap"><table class="metrics-table">
        <thead><tr><th></th>${cols.map(c => `<th class="num"><span class="swatch ${c.cls}"></span>${c.label}</th>`).join("")}</tr></thead>
        <tbody>
          ${row("Compound annual return (CAGR)", x => pct(x.cagr))}
          ${row("Volatility", x => pct(x.vol), "Annualised standard deviation of monthly returns")}
          ${row("Sharpe ratio", x => x.sharpe.toFixed(2), `Return above the ${EC.cma.riskFree}% risk-free rate per unit of volatility`)}
          ${row("Sortino ratio", x => x.sortino == null ? "–" : x.sortino.toFixed(2), "Like Sharpe, but only counts downside volatility")}
          ${row("Beta against Nifty 50", x => x.beta.toFixed(2))}
          ${row("Maximum drawdown", x => `${pct(x.maxDrawdown)}<span class="cell-hint">${x.drawdownTo ? `${ml(x.drawdownFrom === "start" ? H.months[0] : x.drawdownFrom)} to ${ml(x.drawdownTo)}` : ""}</span>`, "Largest fall from a peak, using month-end values")}
          ${row(`Value at Risk (${Math.round(EC.analytics.var * 100)}%, one month)`, x => `${pct(x.var95)}<span class="cell-hint">${inr(x.var95 * lump)}</span>`, `In ${Math.round((1 - EC.analytics.var) * 100)}% of months, the loss was at least this large`)}
          ${row("Best month", x => signed(x.bestMonth))}
          ${row("Worst month", x => signed(x.worstMonth))}
        </tbody>
      </table></div>`;

    const years = s.calendar.map(y => y.year);
    const calendar = `
      <div class="table-wrap"><table class="calendar-table">
        <thead><tr><th></th>${years.map(y => `<th class="num">${y}${s.calendar.find(c => c.year === y).partial ? "*" : ""}</th>`).join("")}</tr></thead>
        <tbody>${cols.map(c => `<tr><th scope="row"><span class="swatch ${c.cls}"></span>${c.label}</th>${c.bt.calendar.map(y =>
          `<td class="num ${y.ret < 0 ? "neg" : ""}">${signed(y.ret, 0)}</td>`).join("")}</tr>`).join("")}</tbody>
      </table></div>
      <p class="footnote">* Part year: the data covers only some months of that year.</p>`;

    const corr = A.correlationFromHistory(H, ORDER);
    const corrTable = `
      <div class="table-wrap"><table class="corr-heat">
        <thead><tr><th></th>${ORDER.map(k => `<th class="num">${C.assets[k].name}</th>`).join("")}</tr></thead>
        <tbody>${ORDER.map((a, i) => `<tr><th scope="row">${C.assets[a].name}</th>${ORDER.map((_, j) => {
          const v = corr[i][j];
          return `<td class="num" style="--heat:${Math.min(1, Math.abs(v)).toFixed(2)}" data-sign="${v < 0 ? "neg" : "pos"}">${v.toFixed(2)}</td>`;
        }).join("")}</tr>`).join("")}</tbody>
      </table></div>
      <p class="footnote">Correlation of monthly returns. Values near 0 or below mean two assets tend not to move together, which is what makes combining them reduce risk.</p>`;

    mount.innerHTML = `
      <p class="tab-lede">${summary}</p>
      <div class="result-block first">
        <h3>Growth of ${inr(lump)}</h3>
        ${legend(cols)}
        <div class="chart-box">${chart}</div>
        <p class="footnote">Back-test using month-end prices. Holdings drift with the markets during each year and are reset to the target weights every December, as a real investor rebalancing once a year would. Fund costs, brokerage and taxes on rebalancing are not included. Past performance does not guarantee future results.</p>
        ${stockNote(p)}
      </div>
      <div class="result-block"><h3>Risk and return</h3>${metrics}</div>
      <div class="result-block"><h3>Calendar-year returns</h3>${calendar}</div>
      <div class="result-block"><h3>How the asset classes move together</h3>${corrTable}</div>
      ${custom ? "" : `<p class="data-status">Want to compare another mix? Use <a href="#customise">Customise your allocation</a> on the Your plan tab, and it will appear here next to the suggested portfolio.</p>`}`;
  }

  // ---------- OPTIMISATION ----------
  let frontierCache = { key: null, data: null };
  function getFrontier(EC, suggestedVol) {
    const key = JSON.stringify([EC.cma.expReturn, EC.cma.volatility, EC.cma.correlation, suggestedVol.toFixed(6)]);
    if (frontierCache.key !== key) frontierCache = { key, data: A.frontier(EC, E, suggestedVol) };
    return frontierCache.data;
  }

  function renderOptimisation() {
    const mount = document.getElementById("optimisation-mount");
    if (!mount) return;
    const { plan: p, custom } = state();
    if (!p) return emptyState(mount, "Build your plan first. This tab then shows where your portfolio sits against the best achievable trade-offs between risk and return.");
    const M = window.APM_MARKET;
    if (M && M.status === "loading") { mount.innerHTML = `<p class="data-status">Loading market data…</p>`; return; }

    const EC = cfg();
    const sugg = E.portfolioStats(p.allocation, EC);
    const fr = getFrontier(EC, sugg.vol);
    const cust = custom ? E.portfolioStats(custom.allocation, EC) : null;
    const same = fr.atTargetRisk;

    const points = [
      { label: "Min variance", vol: fr.minVar.vol, ret: fr.minVar.ret, cls: "p-minvar", r: 4, dy: 12 },
      { label: "Max Sharpe", vol: fr.maxSharpe.vol, ret: fr.maxSharpe.ret, cls: "p-maxsharpe", r: 5, dy: -12 },
      same ? { label: "Frontier at your risk", vol: same.vol, ret: same.ret, cls: "p-same", r: 5, dy: -12, side: "left" } : null,
      { label: "Suggested", vol: sugg.vol, ret: sugg.expReturn, cls: "p-suggested", dy: 12 },
      cust ? { label: "Custom", vol: cust.vol, ret: cust.expReturn, cls: "p-custom", dy: 12 } : null
    ].filter(Boolean);

    const box = mount.querySelector(".chart-box");
    const width = widthOf(box || mount);
    const chart = CH.frontier({ cloud: fr.cloud, edge: fr.edge, riskFree: fr.riskFree, maxSharpe: fr.maxSharpe, points, width, height: width < 520 ? 300 : 400 });

    const colsData = [
      { label: "Suggested", cls: "s-suggested", w: ORDER.map(k => p.allocation[k] / 100), st: { ret: sugg.expReturn, vol: sugg.vol, sharpe: sugg.sharpe } },
      cust ? { label: "Custom", cls: "s-custom", w: ORDER.map(k => custom.allocation[k] / 100), st: { ret: cust.expReturn, vol: cust.vol, sharpe: cust.sharpe } } : null,
      same ? { label: "Frontier at your risk", cls: "s-same", w: same.w, st: same } : null,
      { label: "Max Sharpe", cls: "s-maxsharpe", w: fr.maxSharpe.w, st: fr.maxSharpe },
      { label: "Min variance", cls: "s-minvar", w: fr.minVar.w, st: fr.minVar }
    ].filter(Boolean);

    const weights = `
      <div class="table-wrap"><table class="metrics-table">
        <thead><tr><th></th>${colsData.map(c => `<th class="num"><span class="swatch ${c.cls}"></span>${c.label}</th>`).join("")}</tr></thead>
        <tbody>
          ${ORDER.map((k, i) => `<tr><th scope="row">${C.assets[k].name}</th>${colsData.map(c => `<td class="num">${Math.round(c.w[i] * 100)}%</td>`).join("")}</tr>`).join("")}
          <tr class="sep"><th scope="row">Expected return (arithmetic)<span class="row-hint">The average annual return used in mean-variance analysis</span></th>${colsData.map(c => `<td class="num">${pct(c.st.ret)}</td>`).join("")}</tr>
          <tr><th scope="row">Expected compound return<span class="row-hint">≈ arithmetic return − volatility² ÷ 2; the figure on Your plan</span></th>${colsData.map(c => `<td class="num">${pct(c.st.ret - c.st.vol * c.st.vol / 2)}</td>`).join("")}</tr>
          <tr><th scope="row">Expected volatility</th>${colsData.map(c => `<td class="num">${pct(c.st.vol)}</td>`).join("")}</tr>
          <tr><th scope="row">Sharpe ratio</th>${colsData.map(c => `<td class="num">${c.st.sharpe.toFixed(2)}</td>`).join("")}</tr>
        </tbody>
      </table></div>`;

    // Commentary
    const paras = [];
    if (same) {
      const gap = same.ret - sugg.expReturn;
      if (gap < 0.003) {
        paras.push(`Your suggested portfolio sits almost on the efficient frontier: at its ${pct(sugg.vol)} expected volatility, no mix of these five asset classes is expected to earn meaningfully more.`);
      } else {
        const diffs = ORDER.map((k, i) => ({ k, d: same.w[i] * 100 - p.allocation[k] })).sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, 2);
        paras.push(`At the same expected volatility as your suggested portfolio (${pct(sugg.vol)}), the frontier portfolio has an expected (arithmetic) return of ${pct(same.ret)} instead of ${pct(sugg.expReturn)}, about ${(gap * 100).toFixed(1)} percentage points more. It gets there mainly by ${diffs.map(x => `${x.d > 0 ? "raising" : "cutting"} ${C.assets[x.k].name.toLowerCase()} by ${Math.abs(Math.round(x.d))} points`).join(" and ")}. The suggested allocation deliberately doesn't chase this: frontier weights swing sharply with small changes in the expected-return estimates, which are uncertain, while the profile allocations are designed to stay stable and diversified.`);
      }
    }
    const fiIdx = ORDER.indexOf("fi"), cashIdx = ORDER.indexOf("cash");
    const lowRisk = fr.maxSharpe.w[fiIdx] + fr.maxSharpe.w[cashIdx];
    if (lowRisk > 0.5) {
      paras.push(`The maximum-Sharpe portfolio is ${Math.round(lowRisk * 100)}% fixed income and cash. That's because debt fund NAVs have been very stable (about ${pct(EC.cma.volatility.fi / 100)} volatility), so each unit of risk earns a lot. But measured volatility understates the real risks of debt funds, such as credit defaults and liquidity freezes, which are rare but sudden. And in theory, an investor would reach a higher return by borrowing to invest along the capital allocation line (the dashed line), which individuals can't do at the risk-free rate. So the tool matches the allocation to your risk profile rather than to the highest Sharpe ratio.`);
    } else {
      paras.push(`The maximum-Sharpe portfolio earns the most expected return per unit of volatility (Sharpe ${fr.maxSharpe.sharpe.toFixed(2)}). The dashed capital allocation line runs from the ${EC.cma.riskFree}% risk-free rate through it: in theory, every investor should hold a mix of that portfolio and the risk-free asset, but that requires borrowing at the risk-free rate to take more risk, which individuals can't do.`);
    }
    if (cust) {
      const ceil = A.riskCeiling(p.profile.index, EC, E);
      paras.push(cust.vol > ceil.vol
        ? `Your custom portfolio's expected volatility of ${pct(cust.vol)} is above what your ${p.profile.name} profile supports (${pct(ceil.vol)}${ceil.basis ? `, the risk of ${withArticle(ceil.basis)} portfolio` : ""}).`
        : `Your custom portfolio's expected volatility of ${pct(cust.vol)} is within what your ${p.profile.name} profile supports.`);
    }

    mount.innerHTML = `
      <div class="result-block first">
        <h3>Efficient frontier</h3>
        ${legend([
          { cls: "s-suggested", label: "Suggested" },
          ...(cust ? [{ cls: "s-custom", label: "Custom" }] : []),
          { cls: "s-same", label: "Frontier at your risk" },
          { cls: "s-maxsharpe", label: "Max Sharpe" },
          { cls: "s-minvar", label: "Min variance" },
          { cls: "s-cal", label: "Capital allocation line" }
        ])}
        <div class="chart-box">${chart}</div>
        <p class="footnote">Each faint dot is one of ${EC.analytics.frontier.samples.toLocaleString("en-IN")} random long-only mixes of the five asset classes. The upper edge is the efficient frontier: the highest expected return for each level of risk. No short selling or borrowing is allowed. Uses the expected returns, volatilities and correlations on the Methodology tab.</p>
      </div>
      <div class="advice">${paras.map(t => `<p>${t}</p>`).join("")}</div>
      <div class="result-block"><h3>Portfolio weights compared</h3>${weights}</div>`;
  }

  // ---------- PROJECTIONS ----------
  let projectionChoice = "suggested";

  function renderProjections() {
    const mount = document.getElementById("projections-mount");
    if (!mount) return;
    const { plan: p, custom } = state();
    if (!p) return emptyState(mount, "Build your plan first. This tab then simulates thousands of possible futures for your investment and replays past market crises.");
    const M = window.APM_MARKET;
    if (M && M.status === "loading") { mount.innerHTML = `<p class="data-status">Loading market data…</p>`; return; }

    const EC = cfg(), i = p.input;
    if (!custom) projectionChoice = "suggested";
    const chosen = projectionChoice === "custom" && custom ? custom.allocation : p.allocation;
    const st = E.portfolioStats(chosen, EC);
    const mc = A.monteCarlo({ lump: i.lump, sip: i.sip, years: i.horizon, geometric: st.geometric, vol: st.vol, targetCorpus: p.projection.targetCorpus }, EC);
    const infl = Math.pow(1 + EC.cma.inflation / 100, i.horizon);

    const box = mount.querySelector(".chart-box");
    const width = widthOf(box || mount);
    const chart = CH.fan({ bands: mc.bands, target: p.projection.targetCorpus, width, height: width < 520 ? 260 : 340, fmt: inrShort });

    const toggle = custom ? `
      <div class="segmented" role="group" aria-label="Portfolio to simulate">
        <button type="button" data-choice="suggested" aria-pressed="${projectionChoice === "suggested"}">Suggested</button>
        <button type="button" data-choice="custom" aria-pressed="${projectionChoice === "custom"}">Custom</button>
      </div>` : "";

    const mcStats = `
      <dl class="stats">
        <div><dt>Pessimistic (10th percentile)</dt><dd>${inr(roundNice(mc.final[10]))}</dd></div>
        <div><dt>Median outcome</dt><dd>${inr(roundNice(mc.final[50]))}</dd></div>
        <div><dt>Optimistic (90th percentile)</dt><dd>${inr(roundNice(mc.final[90]))}</dd></div>
        <div><dt>Chance of reaching your target amount</dt><dd>${Math.round(mc.probTarget * 100)}%</dd></div>
        <div><dt>Chance of ending below what you invested</dt><dd>${mc.probLoss < 0.005 ? "Under 1%" : Math.round(mc.probLoss * 100) + "%"}</dd></div>
        <div><dt>Median in today's money</dt><dd>${inr(roundNice(mc.final[50] / infl))}</dd></div>
      </dl>`;

    const lede = `Across ${EC.analytics.monteCarlo.paths.toLocaleString("en-IN")} simulated futures, investing ${inr(i.lump)}${i.sip ? ` plus ${inr(i.sip)} a month` : ""} for ${i.horizon} ${i.horizon === 1 ? "year" : "years"} in the ${projectionChoice === "custom" && custom ? "custom" : "suggested"} portfolio ends with a median of about ${inr(roundNice(mc.final[50]))}. In the worst tenth of outcomes it ends below ${inr(roundNice(mc.final[10]))}; in the best tenth, above ${inr(roundNice(mc.final[90]))}. Your target amount of ${inr(roundNice(p.projection.targetCorpus))} (what ${i.targetReturn}% a year would give) is reached in ${Math.round(mc.probTarget * 100)}% of simulations.`;

    // Stress tests
    let stressHtml;
    if (M && M.history && ORDER.every(k => M.history.returns[k])) {
      const allocs = { suggested: p.allocation };
      if (custom) allocs.custom = custom.allocation;
      const sr = A.stressTests(allocs, M.history, EC);
      const cols = [{ key: "suggested", label: "Suggested", cls: "s-suggested" }]
        .concat(custom ? [{ key: "custom", label: "Custom", cls: "s-custom" }] : [])
        .concat([{ key: "benchmark", label: "Nifty 50", cls: "s-benchmark" }]);
      const cell = res => {
        if (!res || res.ret == null) return "–";
        const rec = res.recovery === 0 ? "No loss" : res.recovery == null ? "Not yet recovered" : `Recovered in ${res.recovery} ${res.recovery === 1 ? "month" : "months"}`;
        return `${signed(res.ret)}<span class="cell-hint">${inr(i.lump * (1 + res.ret))}</span><span class="cell-hint">${rec}</span>`;
      };
      const rows = sr.tests.map(t => `<tr><th scope="row">${t.name}<span class="row-hint">${ml(t.from)} to ${ml(t.to)}. ${t.note}</span></th>${cols.map(c => `<td class="num">${cell(t.results[c.key])}</td>`).join("")}</tr>`).join("");
      const worstRow = `<tr><th scope="row">Worst 12 months in the data<span class="row-hint">Each portfolio's own worst stretch</span></th>${cols.map(c => {
        const w = sr.worst[c.key];
        return `<td class="num">${w ? `${signed(w.ret)}<span class="cell-hint">${inr(i.lump * (1 + w.ret))}</span><span class="cell-hint">${ml(w.from)} to ${ml(w.to)}</span>` : "–"}</td>`;
      }).join("")}</tr>`;
      stressHtml = `
        <div class="table-wrap"><table class="metrics-table stress-table">
          <thead><tr><th></th>${cols.map(c => `<th class="num"><span class="swatch ${c.cls}"></span>${c.label}</th>`).join("")}</tr></thead>
          <tbody>${rows}${worstRow}</tbody>
        </table></div>
        <p class="footnote">What ${inr(i.lump)} invested at the start of each period would have been worth at its end, using month-end prices, so falls within a month look smaller than they were. Recovery counts months after the period until the portfolio was back to its starting value. The 2008 financial crisis is outside the ${ml(M.history.months[0])} to ${ml(M.history.months[M.history.months.length - 1])} data window.</p>`;
    } else {
      stressHtml = `<p class="data-status">Stress tests need historical data for every asset class, which couldn't be loaded right now. They work on the deployed website.</p>`;
    }

    mount.innerHTML = `
      ${toggle}
      <p class="tab-lede">${lede}</p>
      <div class="result-block first">
        <h3>Range of outcomes</h3>
        ${legend([{ cls: "s-band-outer", label: "10th to 90th percentile" }, { cls: "s-band-inner", label: "25th to 75th percentile" }, { cls: "s-suggested", label: "Median" }, { cls: "s-target", label: "Your target amount" }])}
        <div class="chart-box">${chart}</div>
        ${mcStats}
        <p class="footnote">Each month's return is drawn at random from a distribution with the portfolio's expected compound return (${pct(st.geometric)}) and volatility (${pct(st.vol)}). Real markets have fatter tails than this model: extreme months happen more often than it assumes.</p>
      </div>
      <div class="result-block"><h3>Historical stress tests</h3>${stressHtml}</div>`;

    mount.querySelectorAll(".segmented button").forEach(b => b.addEventListener("click", () => {
      projectionChoice = b.dataset.choice;
      renderProjections();
    }));
  }

  // ---------- wiring ----------
  const RENDER = { analytics: renderAnalytics, optimisation: renderOptimisation, projections: renderProjections };
  const visible = () => Object.keys(RENDER).find(k => { const v = document.getElementById("view-" + k); return v && !v.hidden; });
  const dirty = new Set(Object.keys(RENDER));

  function refresh() {
    Object.keys(RENDER).forEach(k => dirty.add(k));
    const v = visible();
    if (v) { RENDER[v](); dirty.delete(v); }
  }

  ["apm:plan", "apm:custom", "apm:market"].forEach(ev => document.addEventListener(ev, refresh));
  document.addEventListener("apm:view", e => {
    if (RENDER[e.detail] && dirty.has(e.detail)) {
      // wait a frame so the tab has its real width before drawing charts
      requestAnimationFrame(() => { RENDER[e.detail](); dirty.delete(e.detail); });
    }
  });
  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { const v = visible(); if (v) RENDER[v](); }, 200);
  });
  document.addEventListener("DOMContentLoaded", () => {
    const v = visible();
    if (v) { RENDER[v](); dirty.delete(v); }
  });
})();
