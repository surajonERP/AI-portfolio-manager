// ============================================================
// methodology.js — builds the Methodology tab straight from config.js,
// so the published explanation always matches the actual calculations.
// ============================================================

(function () {
  const C = window.APM_CONFIG;

  function optionTable(q) {
    const rows = q.options
      ? q.options.map(o => `<tr><td>${o.text}</td><td class="num">${o.pts}</td></tr>`).join("")
      : q.bands.map((b, i) => {
          const lo = i === 0 ? null : q.bands[i - 1].upTo + 1;
          const range = b.upTo >= 999 ? `${lo} and above` : (lo === null ? `Up to ${b.upTo}` : `${lo} to ${b.upTo}`);
          return `<tr><td>${range}</td><td class="num">${b.pts}</td></tr>`;
        }).join("");
    return `
      <div class="m-q">
        <h4>${q.label} <span class="muted">(max ${q.max})</span></h4>
        <div class="table-wrap"><table class="m-table"><tbody>${rows}</tbody></table></div>
      </div>`;
  }

  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const monthLabel = key => { const [y, mo] = key.split("-"); return `${MONTHS[Number(mo) - 1]} ${y}`; };
  const f1 = n => n.toFixed(1) + "%";

  function render() {
    const mount = document.getElementById("methodology-mount");
    if (!mount) return;
    const MK = window.APM_MARKET;
    const m = MK && MK.cma ? MK.cma : C.cma;
    const A = C.assets, order = C.cma.order, H = C.market.history;
    const est = MK && MK.estimates;
    const loading = !MK || MK.status === "loading";

    const profileRows = C.profiles.map((p, i) => {
      const lo = i === 0 ? 0 : C.profiles[i - 1].upTo + 1;
      return `<tr><td>${p.name}</td><td class="num">${lo} to ${p.upTo}</td>
        ${order.map(k => `<td class="num">${p.allocation[k]}%</td>`).join("")}</tr>`;
    }).join("");

    const cmaRows = order.map(k => {
      const e = est && est[k];
      const live = e && e.live;
      return `<tr>
        <td>${A[k].name}</td>
        <td class="muted">${H[k].label}</td>
        <td class="num">${live ? f1(e.histMean) : "–"}</td>
        <td class="num">${live ? f1(e.histCagr) : "–"}</td>
        <td class="num">${f1(C.cma.expReturn[k])}</td>
        <td class="num">${Math.round((typeof C.market.historyWeight === "number" ? C.market.historyWeight : C.market.historyWeight[k]) * 100)}%</td>
        <td class="num">${f1(m.expReturn[k])}</td>
        <td class="num">${f1(m.volatility[k])}${live ? "" : "*"}</td>
      </tr>`;
    }).join("");

    const stockRows = Object.entries(C.stocks.profiles).map(([name, t]) => `<tr><td>${name}</td>
      <td class="num">${t.targetBeta.toFixed(2)}</td><td class="num">${t.maxVol}%</td><td class="num">−${t.maxDrawdown}%</td></tr>`).join("");

    let dataStatus;
    if (loading) dataStatus = "Loading market history…";
    else if (MK.window && MK.liveAssets.length) {
      const missing = order.filter(k => !MK.liveAssets.includes(k)).map(k => A[k].name);
      const cov = MK.coverage ? " Month-end prices available: " + order.map(k => `${A[k].name} ${MK.coverage[k]}`).join(", ") + "." : "";
      dataStatus = `Estimated from ${MK.window.months} months of history, ${monthLabel(MK.window.from)} to ${monthLabel(MK.window.to)}.` +
        cov + (missing.length ? ` History for ${missing.join(", ")} couldn't be loaded, so long-run assumptions are used for ${missing.length === 1 ? "it" : "them"} (marked *).` : "");
    } else {
      dataStatus = "Market history couldn't be loaded right now, so every figure below is a long-run assumption (marked *). Live estimates work on the deployed website.";
    }

    const corrRows = order.map((k, i) => `<tr><th scope="row">${A[k].name}</th>
      ${m.correlation[i].map(v => `<td class="num">${v.toFixed(2)}</td>`).join("")}</tr>`).join("");

    mount.innerHTML = `
      <div class="block">
        <h2 class="block-title">Investor profile</h2>
        <div class="m-body">
          <p><strong>CFA concept:</strong> Investment Policy Statement, risk ability versus risk willingness (Portfolio Management).</p>
          <p>Risk ability measures how much loss your finances can absorb. Risk willingness measures how much loss you can tolerate emotionally. Each is scored out of 100. When they differ, the lower score sets the profile, as the CFA curriculum recommends.</p>
          <h3 class="m-sub">Risk ability</h3>
          <div class="m-grid">${Object.values(C.ability).map(optionTable).join("")}</div>
          <h3 class="m-sub">Risk willingness</h3>
          <div class="m-grid">${Object.values(C.willingness).map(optionTable).join("")}</div>
        </div>
      </div>

      <div class="block">
        <h2 class="block-title">Strategic asset allocation</h2>
        <div class="m-body">
          <p><strong>CFA concept:</strong> Strategic asset allocation and constraints (Portfolio Management).</p>
          <p>The final score maps to one of five profiles, each with a fixed long-term allocation. Two constraints can override it: a horizon under ${C.constraints.shortHorizonYears} years caps the profile at ${C.constraints.shortHorizonMaxProfile}, and a need for money before the horizon ends raises cash to at least ${C.constraints.liquidityMinCash.some}% (small part) or ${C.constraints.liquidityMinCash.significant}% (significant part), reducing other assets proportionally.</p>
          <div class="table-wrap"><table class="m-table wide">
            <thead><tr><th>Profile</th><th class="num">Score</th>${order.map(k => `<th class="num">${A[k].name}</th>`).join("")}</tr></thead>
            <tbody>${profileRows}</tbody>
          </table></div>
        </div>
      </div>

      <div class="block">
        <h2 class="block-title">Expected return and risk</h2>
        <div class="m-body">
          <p><strong>CFA concept:</strong> Portfolio return and variance, correlation, Sharpe ratio (Portfolio Management, Quantitative Methods).</p>
          <ul class="formulas">
            <li><span>Expected return</span><code>E(Rₚ) = Σ wᵢ · E(Rᵢ)</code></li>
            <li><span>Portfolio variance</span><code>σₚ² = Σᵢ Σⱼ wᵢ · wⱼ · σᵢ · σⱼ · ρᵢⱼ</code></li>
            <li><span>Expected compound return</span><code>g ≈ E(Rₚ) − σₚ² / 2</code></li>
            <li><span>Sharpe ratio</span><code>(E(Rₚ) − R<sub>f</sub>) / σₚ</code></li>
          </ul>
          <p>Compound return is used for all projections because money grows geometrically: a portfolio with a 10% average return and high volatility ends up with less than 10% compounded.</p>
        </div>
      </div>

      <div class="block">
        <h2 class="block-title">Capital market assumptions</h2>
        <div class="m-body">
          <p><strong>CFA concept:</strong> Estimating expected returns, volatility and correlation from historical data; the limits of using the past to forecast (Quantitative Methods, Portfolio Management).</p>
          <p>Each asset class is measured with a long, clean index or fund history, converted to INR where needed, using month-end values.</p>
          <ul class="formulas">
            <li><span>Monthly return</span><code>rₜ = Pₜ / Pₜ₋₁ − 1</code></li>
            <li><span>Annualised mean</span><code>μ = mean(rₜ) × 12</code></li>
            <li><span>Annualised volatility</span><code>σ = s(rₜ) × √12</code></li>
            <li><span>Expected return used</span><code>E(R) = w × μ + (1 − w) × long-run anchor</code></li>
          </ul>
          <p>Raw historical returns are a poor forecast on their own: ten years can be unusually good or bad for any asset, and recent winners tend to look better than they will be. So historical means are blended with long-run anchors, a simple form of shrinkage. The history weight w depends on the asset. Equity and debt returns are backed by cash flows (earnings, dividends and coupons), so history gets a 50% weight. Gold and silver produce no cash flows, so their past price trends are the weakest guide to future returns: their expected return is the long-run anchor alone. Volatility and correlation are more stable over time, so every asset takes them directly from history.</p>
          <p class="data-status">${dataStatus} Risk-free rate ${m.riskFree}%, inflation ${m.inflation}%.</p>
          <div class="table-wrap"><table class="m-table wide cma">
            <thead><tr><th>Asset class</th><th>History measured with</th><th class="num">Historical mean</th><th class="num">Historical CAGR</th><th class="num">Long-run anchor</th><th class="num">History weight</th><th class="num">Expected return used</th><th class="num">Volatility</th></tr></thead>
            <tbody>${cmaRows}</tbody>
          </table></div>
          <h3 class="m-sub">Correlations</h3>
          <div class="table-wrap"><table class="m-table wide corr">
            <thead><tr><th></th>${order.map(k => `<th class="num">${A[k].name}</th>`).join("")}</tr></thead>
            <tbody>${corrRows}</tbody>
          </table></div>
        </div>
      </div>

      <div class="block">
        <h2 class="block-title">Goal check and SIP planning</h2>
        <div class="m-body">
          <p><strong>CFA concept:</strong> Time value of money, future value of a lump sum and of an annuity due (Quantitative Methods); consistency of return objectives with risk tolerance (Portfolio Management).</p>
          <ul class="formulas">
            <li><span>Lump sum</span><code>FV = PV · (1 + g)ⁿ</code></li>
            <li><span>Monthly rate</span><code>i = (1 + g)^(1/12) − 1</code></li>
            <li><span>SIP (paid at the start of each month)</span><code>FV = P · [((1 + i)ᵐ − 1) / i] · (1 + i)</code></li>
            <li><span>SIP needed</span><code>P = (Target FV − FV of lump sum) / annuity factor</code></li>
            <li><span>Today's money</span><code>Real FV = FV / (1 + inflation)ⁿ</code></li>
          </ul>
          <p>Your target return is compared with the portfolio's expected compound return. It is <em>within reach</em> if the portfolio is expected to match it, <em>a stretch</em> if it falls short by up to ${C.feasibility.stretchMargin} percentage points, and <em>unrealistic</em> beyond that. The tool also checks which profile the target would require, and the monthly SIP that would reach the same end amount at the expected return.</p>
        </div>
      </div>

      <div class="block">
        <h2 class="block-title">Nifty 100 stock screen</h2>
        <div class="m-body">
          <p><strong>CFA concept:</strong> Systematic and unsystematic risk, beta, diversification (Portfolio Management); return measures and drawdown (Quantitative Methods).</p>
          <p>When an investor chooses individual stocks, every company in the current Nifty 100 (read from the official NSE Indices list) is measured over five years of weekly prices, adjusted for dividends and splits.</p>
          <ul class="formulas">
            <li><span>Beta</span><code>β = Cov(Rᵢ, Rₘ) / Var(Rₘ), with Rₘ = Nifty 50</code></li>
            <li><span>Volatility</span><code>σ = s(weekly returns) × √52</code></li>
            <li><span>Maximum drawdown</span><code>min over time of (Pₜ / peak up to t − 1)</code></li>
            <li><span>CAGR</span><code>(P<sub>end</sub> / P<sub>start</sub>)^(1 / years) − 1</code></li>
          </ul>
          <p>Stocks are matched to the investor mainly by <em>risk</em>, because a stock's beta and volatility persist far more than its returns do. The selection runs in four steps:</p>
          <ul class="formulas steps-list">
            <li><span>1. Filter</span><code class="plain">At least ${C.stocks.minYears} years listed, and 5-year CAGR above the ${C.cma.riskFree}% risk-free rate</code></li>
            <li><span>2. Risk limits</span><code class="plain">Volatility and maximum drawdown within the profile's limits (table below)</code></li>
            <li><span>3. Rank</span><code class="plain">Closest beta to the profile's target beta first</code></li>
            <li><span>4. Diversify and size</span><code class="plain">${C.stocks.count} stocks, at most ${C.stocks.sectorCap} per industry, equal rupee amounts, whole shares only</code></li>
          </ul>
          <div class="table-wrap"><table class="m-table">
            <thead><tr><th>Profile</th><th class="num">Target beta</th><th class="num">Max volatility</th><th class="num">Max drawdown</th></tr></thead>
            <tbody>${stockRows}</tbody>
          </table></div>
          <p>If fewer than ${C.stocks.count} stocks pass, the volatility and drawdown limits are loosened in small steps and the plan says so. If the equity amount is below ${C.stocks.minEquity.toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 })}, or the basket would have fewer than ${C.stocks.minStocks} stocks or ${C.stocks.minIndustries} industries in whole shares, company-specific risk would be too concentrated, so the tool uses the index fund instead. Monthly SIPs always go to the index fund.</p>
          <p><strong>Known biases:</strong> today's Nifty 100 contains companies that grew enough to join it, so their past returns overstate what investors actually earned (survivorship bias). Past risk also does not guarantee future risk. This screen is educational and is not a recommendation to buy any security.</p>
        </div>
      </div>

      <div class="block">
        <h2 class="block-title">Data sources</h2>
        <div class="m-body">
          <p>The Nifty 100 constituent list comes from NSE Indices (<a href="https://www.niftyindices.com" target="_blank" rel="noopener">niftyindices.com</a>). Stock, index, ETF, commodity and currency prices come from Yahoo Finance (<a href="https://finance.yahoo.com" target="_blank" rel="noopener">finance.yahoo.com</a>). Mutual fund NAVs are AMFI data served by MFapi (<a href="https://www.mfapi.in" target="_blank" rel="noopener">mfapi.in</a>; original source <a href="https://www.amfiindia.com" target="_blank" rel="noopener">amfiindia.com</a>). Data is fetched by this site's server and reused for up to six hours.</p>
        </div>
      </div>

      <div class="block">
        <h2 class="block-title">Limitations</h2>
        <div class="m-body">
          <p>Expected returns are estimates, not promises, and past returns do not guarantee future ones. Yahoo Finance data is accessed through an unofficial interface and may occasionally be delayed or unavailable. Gold and silver are measured with international prices converted to INR, which leaves out Indian import duty and GST. The model covers Indian investments only, so it carries home bias: no exposure to foreign markets. The questionnaire simplifies a full suitability assessment, and taxes, expense ratios and exit loads are not yet included. This is an educational project, not investment advice.</p>
        </div>
      </div>
    </div>`;
  }

  document.addEventListener("DOMContentLoaded", render);
  document.addEventListener("apm:market", render);
})();
