// ============================================================
// plan.js — the "Your plan" tab: questionnaire, results, explanation.
// Questions are generated from config.js so the wording and the
// scoring can never drift apart.
// ============================================================

(function () {
  const C = window.APM_CONFIG;
  const E = window.APM_ENGINE;
  window.APM_STATE = window.APM_STATE || {};

  // ---------- helpers ----------
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const inr = n => "₹" + Math.round(n).toLocaleString("en-IN");
  const pct = (n, d = 1) => (n * 100).toFixed(d) + "%";
  const roundNice = n => n >= 100000 ? Math.round(n / 1000) * 1000 : Math.round(n / 100) * 100;
  const price = n => "₹" + Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const signedPct = n => (n >= 0 ? "+" : "−") + Math.abs(n * 100).toFixed(1) + "%";
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const monthLabel = key => { const [y, m] = key.split("-"); return `${MONTHS[Number(m) - 1]} ${y}`; };
  const dateLabel = iso => { const [y, m, d] = iso.slice(0, 10).split("-"); return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`; };

  // The config the engine uses: settings from config.js, with market-based estimates when loaded
  function effectiveConfig() {
    const M = window.APM_MARKET;
    return M && M.cma ? { ...C, cma: M.cma } : C;
  }
  function waitForMarket(ms) {
    if (!window.APM_MARKET_READY) return Promise.resolve(null);
    return Promise.race([window.APM_MARKET_READY, new Promise(r => setTimeout(() => r(null), ms))]);
  }

  const GOALS = [
    { value: "wealth", text: "Long-term wealth creation", phrase: "build long-term wealth" },
    { value: "retirement", text: "Retirement", phrase: "plan for retirement" },
    { value: "purchase", text: "A big purchase, like a home or education", phrase: "save for a big purchase" },
    { value: "income", text: "Regular income", phrase: "generate regular income" }
  ];
  const EQUITY_VEHICLE = [
    { value: "fund", text: "Through an index fund" },
    { value: "stocks", text: "Through individual Nifty 100 stocks" }
  ];
  const LIQUIDITY = [
    { value: "no", text: "No" },
    { value: "some", text: "Maybe a small part" },
    { value: "significant", text: "Yes, a significant part" }
  ];

  // ---------- form markup ----------
  function radioGroup(name, legend, options, hint) {
    return `
      <fieldset class="q" data-field="${name}">
        <legend>${legend}</legend>
        ${hint ? `<p class="hint">${hint}</p>` : ""}
        <div class="choices">
          ${options.map(o => `
            <label class="choice">
              <input type="radio" name="${name}" value="${o.value}">
              <span>${o.text}</span>
            </label>`).join("")}
        </div>
        <p class="err" id="err-${name}" hidden>Choose one option.</p>
      </fieldset>`;
  }

  function numberField(name, label, opts) {
    return `
      <div class="q q-num" data-field="${name}">
        <label for="f-${name}">${label}</label>
        <div class="num-wrap">
          ${opts.prefix ? `<span class="affix">${opts.prefix}</span>` : ""}
          <input id="f-${name}" name="${name}" type="number" inputmode="decimal"
                 min="${opts.min}" max="${opts.max}" step="${opts.step || 1}"
                 ${opts.placeholder ? `placeholder="${opts.placeholder}"` : ""}>
          ${opts.suffix ? `<span class="affix">${opts.suffix}</span>` : ""}
        </div>
        ${opts.prefix === "₹" ? `<p class="amount-echo" id="echo-${name}" aria-live="polite"></p>` : ""}
        ${opts.hint ? `<p class="hint">${opts.hint}</p>` : ""}
        <p class="err" id="err-${name}" hidden>${opts.error}</p>
      </div>`;
  }

  function renderForm() {
    const a = C.ability, w = C.willingness;
    return `
      <form id="plan-form" novalidate>
        <div class="form-group">
          <h2 class="group-title">About you</h2>
          <div class="grid-2">
            <div class="q q-num" data-field="name">
              <label for="f-name">Your name</label>
              <div class="num-wrap"><input id="f-name" name="name" type="text" maxlength="40" autocomplete="given-name"></div>
              <p class="hint">Optional. Used only to address you, never saved.</p>
            </div>
            ${numberField("age", "Age", { min: 18, max: 100, suffix: "years", error: "Enter an age between 18 and 100." })}
          </div>
        </div>

        <div class="form-group">
          <h2 class="group-title">Your investment</h2>
          <div class="grid-2">
            ${numberField("lump", "Amount to invest now", { min: 1000, max: 1000000000, prefix: "₹", step: 1000, error: "Enter at least ₹1,000." })}
            ${numberField("sip", "Monthly SIP", { min: 0, max: 10000000, prefix: "₹", step: 500, placeholder: "0", hint: "Optional. Leave empty if you're only investing a lump sum.", error: "Enter 0 or a positive amount." })}
            ${numberField("targetReturn", "Expected annual return", { min: 1, max: 50, suffix: "% a year", step: 0.5, error: "Enter a return between 1% and 50%." })}
            ${numberField("horizon", "Time horizon", { min: 1, max: 50, suffix: "years", error: "Enter a horizon between 1 and 50 years." })}
          </div>
          ${radioGroup("goal", "What is this money for?", GOALS)}
          ${radioGroup("liquidity", "Might you need part of this money before your horizon ends?", LIQUIDITY)}
          ${radioGroup("vehicle", "How would you like to hold your Indian equity?", EQUITY_VEHICLE, "With stocks, the system screens the Nifty 100 for companies whose past risk fits your profile. Your monthly SIP still goes into the index fund, because small monthly amounts can't buy whole shares sensibly.")}
        </div>

        <div class="form-group">
          <h2 class="group-title">Your financial situation</h2>
          ${radioGroup("income", "How stable is your income?", a.income.options)}
          ${radioGroup("dependents", "How many people depend on you financially?", a.dependents.options)}
          ${radioGroup("emergency", "How many months of expenses do you have saved for emergencies?", a.emergency.options)}
          ${radioGroup("emi", "What share of your income goes to loan EMIs?", a.emi.options)}
          ${radioGroup("share", "What share of your total savings is this investment?", a.share.options)}
        </div>

        <div class="form-group">
          <h2 class="group-title">Your comfort with risk</h2>
          ${radioGroup("experience", "What is your investing experience?", w.experience.options)}
          ${radioGroup("drop", "Your portfolio falls 20% in one month. What do you do?", w.drop.options)}
          ${radioGroup("range", "Which one-year outcome range would you choose?", w.range.options, "Higher possible gains come with deeper possible losses.")}
        </div>

        <div class="form-submit">
          <button type="submit" class="btn btn-primary">Build my plan</button>
          <p class="err" id="err-summary" hidden></p>
        </div>
      </form>`;
  }

  // ---------- reading and validating ----------
  const RADIOS = ["goal", "liquidity", "vehicle", "income", "dependents", "emergency", "emi", "share", "experience", "drop", "range"];

  function readForm(form) {
    const fd = new FormData(form);
    const num = k => { const v = fd.get(k); return v === null || v === "" ? NaN : Number(v); };
    const inp = {
      name: (fd.get("name") || "").trim(),
      age: num("age"), lump: num("lump"), sip: isNaN(num("sip")) ? 0 : num("sip"),
      targetReturn: num("targetReturn"), horizon: num("horizon")
    };
    RADIOS.forEach(k => { inp[k] = fd.get(k); });

    const errors = [];
    const check = (k, ok) => {
      const el = document.getElementById("err-" + k);
      const box = form.querySelector(`[data-field="${k}"]`);
      el.hidden = ok;
      box.classList.toggle("invalid", !ok);
      if (!ok) errors.push(k);
    };
    check("age", Number.isInteger(inp.age) && inp.age >= 18 && inp.age <= 100);
    check("lump", inp.lump >= 1000);
    check("sip", inp.sip >= 0);
    check("targetReturn", inp.targetReturn >= 1 && inp.targetReturn <= 50);
    check("horizon", Number.isInteger(inp.horizon) && inp.horizon >= 1 && inp.horizon <= 50);
    RADIOS.forEach(k => check(k, !!inp[k]));
    return { inp, errors };
  }

  // ---------- the written explanation (template version; Gemini replaces this later) ----------
  function weakest(parts) {
    return [...parts].sort((x, y) => x.pts / x.max - y.pts / y.max).slice(0, 2).map(p => p.label.toLowerCase());
  }

  function buildExplanation(p) {
    const i = p.input;
    const who = i.name ? esc(i.name) + ", you" : "You";
    const goal = GOALS.find(g => g.value === i.goal).phrase;
    const al = p.allocation;
    const commodities = al.gold + al.silver;

    const paras = [];

    paras.push(`${who} are ${i.age} years old with ${inr(i.lump)} to invest${i.sip ? ` and ${inr(i.sip)} a month through a SIP` : ""}, over ${i.horizon} ${i.horizon === 1 ? "year" : "years"}, aiming to ${goal} at ${i.targetReturn}% a year.`);

    let risk;
    const gapScore = Math.abs(p.ability.total - p.willingness.total);
    if (gapScore < 10) {
      risk = `Your ability to take risk (${p.ability.total}/100) and your willingness to take it (${p.willingness.total}/100) are closely matched.`;
    } else if (p.governing === "ability") {
      risk = `You are comfortable with risk (willingness ${p.willingness.total}/100), but your circumstances limit how much you can afford to take (ability ${p.ability.total}/100), mainly because of your ${weakest(p.ability.parts).join(" and ")}. Following the CFA framework, the lower of the two sets your profile.`;
    } else {
      risk = `Your finances could support more risk (ability ${p.ability.total}/100), but your answers suggest a sharp fall would be hard to sit through (willingness ${p.willingness.total}/100). Following the CFA framework, the lower of the two sets your profile, because a plan you abandon in a downturn fails.`;
    }
    paras.push(risk);

    paras.push(`With this in mind, your best course of action is a <strong>${p.profile.name}</strong> portfolio: ${al.inEq}% in Indian equity, ${commodities}% in commodities (${al.gold}% gold, ${al.silver}% silver), ${al.fi}% in fixed income and ${al.cash}% in cash. It is expected to compound at about ${pct(p.stats.geometric)} a year, with annual volatility of about ${pct(p.stats.vol)}.`);

    const b = p.basket;
    if (i.vehicle === "stocks" && b) {
      if (b.ok) {
        paras.push(`You chose to hold Indian equity through individual stocks. From the Nifty 100, the system picked ${b.holdings.length} companies across ${b.groups} sector groups whose last five years of risk suit a ${p.profile.name} investor. Their average beta is ${b.avgBeta.toFixed(2)} against a target of ${b.target.targetBeta.toFixed(2)}, meaning they have tended to move ${b.avgBeta < 1 ? "less" : "more"} than the market.`);
      } else if (b.reason === "too-few") {
        paras.push(`You chose individual stocks, but ${inr(b.equityAmount)} in equity is too little to build a properly diversified basket of whole shares, so the plan uses the index fund instead. Stocks become practical from roughly ${inr(b.suggestedMinimum)} in equity.`);
      } else {
        paras.push("You chose individual stocks, but the Nifty 100 screen couldn't be loaded right now, so the plan shows the index fund instead.");
      }
    }

    const f = p.feasibility, pr = p.projection;
    let feas;
    if (f.verdict === "achievable") {
      feas = `Your ${i.targetReturn}% target is within reach of this allocation.`;
    } else {
      const lever = pr.requiredSip > 0
        ? ` To reach the same end amount at the expected return, your monthly SIP would need to be about ${inr(roundNice(pr.requiredSip))}${i.sip ? ` instead of ${inr(i.sip)}` : ""}.`
        : "";
      if (f.verdict === "stretch") {
        feas = `Your ${i.targetReturn}% target is a stretch: it is slightly above what this allocation is expected to deliver.${lever}`;
      } else if (f.required && f.required.index > f.profileIndex) {
        feas = `Your ${i.targetReturn}% target would need a ${f.required.name} portfolio, which carries more risk than your profile supports. Consider a lower target, a longer horizon or a larger SIP.${lever}`;
      } else {
        feas = `Your ${i.targetReturn}% target is above what any diversified allocation in this tool is expected to deliver, so it depends on luck rather than planning. Consider a lower target, a longer horizon or a larger SIP.${lever}`;
      }
    }
    paras.push(feas);

    paras.push(`In total you would invest ${inr(pr.invested)}. At the expected return, that could grow to about ${inr(roundNice(pr.projected))} in ${i.horizon} ${i.horizon === 1 ? "year" : "years"}, worth about ${inr(roundNice(pr.projectedReal))} in today's money after ${C.cma.inflation}% annual inflation.`);

    return paras;
  }

  // ---------- live instrument cards ----------
  function sparkline(values) {
    if (!values || values.length < 2) return "";
    const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
    const pts = values.map((v, i) => `${(i / (values.length - 1) * 100).toFixed(2)},${(38 - (v - min) / span * 36).toFixed(2)}`).join(" ");
    return `<svg class="spark" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" /></svg>`;
  }

  function renderCards(p) {
    const M = window.APM_MARKET || { status: "offline", cards: {} };
    const cards = ORDER.map(k => {
      if (k === "inEq" && p.basket && p.basket.ok) {
        return `<div class="card">
          <p class="card-asset"><span>${C.assets[k].name}</span><span class="num">${p.allocation[k]}%</span></p>
          <h4 class="card-name">Nifty 100 stock basket</h4>
          <p class="card-kind">${p.basket.holdings.length} stocks, ${p.basket.groups} sector groups</p>
          <p class="card-price">β ${p.basket.avgBeta.toFixed(2)}</p>
          <p class="card-change"><span>Average beta against Nifty 50</span></p>
          <p class="card-date"><a href="#stock-basket">See the stocks below</a></p>
        </div>`;
      }
      const c = M.cards && M.cards[k];
      const def = C.market.instruments[k];
      const head = `<p class="card-asset"><span>${C.assets[k].name}</span><span class="num">${p.allocation[k]}%</span></p>
        <h4 class="card-name">${esc(def.name)}</h4>
        <p class="card-kind">${esc(def.kind)}${c && c.ok && c.id ? `<br>${esc(c.id)}` : ""}</p>`;
      if (!c || !c.ok) {
        return `<div class="card card-off">${head}<p class="card-missing">Live price unavailable right now.</p></div>`;
      }
      const up = c.oneYear >= 0;
      return `<div class="card">${head}
        <p class="card-price">${price(c.price)}</p>
        <p class="card-change ${up ? "up" : "down"}">${signedPct(c.oneYear)} <span>over 1 year</span></p>
        ${sparkline(c.spark)}
        <p class="card-date">${def.source === "amfi" ? "NAV" : "Price"} as of ${dateLabel(c.asOf)}</p>
      </div>`;
    }).join("");

    let status;
    if (M.status === "live") status = `Live data loaded ${dateLabel(M.loadedAt)}. Prices refresh every few hours.`;
    else if (M.status === "partial") status = "Some live data couldn't be loaded, so a few prices are missing.";
    else status = "Live data couldn't be loaded, so prices are hidden. Live data works on the deployed website, not when the file is opened directly.";

    return `
      <div class="result-block">
        <h3>Suggested instruments</h3>
        <p class="data-status">${status}</p>
        <div class="cards">${cards}</div>
        <p class="footnote">Representative low-cost examples of each asset class, not recommendations of specific funds. The 1-year change is the price change; for mutual funds it is the change in NAV.</p>
      </div>`;
  }

  function renderBasket(p) {
    const b = p.basket, i = p.input;
    if (i.vehicle !== "stocks" || !b) return "";
    if (!b.ok) {
      const msg = b.reason === "too-few"
        ? (b.lack === "money"
            ? `With ${inr(b.equityAmount)} for equity, a basket of whole shares couldn't reach ${C.stocks.minStocks} suitable stocks across ${C.stocks.minGroups} sector groups. The tool needs at least that, and ${inr(C.stocks.minEquity)} in equity; below that, company-specific risk is too concentrated, so the index fund is used instead. Stocks become practical from roughly ${inr(b.suggestedMinimum)} in equity.`
            : `Too few Nifty 100 stocks currently fit a ${esc(b.profile)} investor's beta band (${b.limits.betaLow.toFixed(2)} to ${b.limits.betaHigh.toFixed(2)}) and risk limits to build a basket of at least ${C.stocks.minStocks} stocks across ${C.stocks.minGroups} sector groups, even after loosening the volatility and drawdown limits. The index fund is used instead.`)
        : "The Nifty 100 screen couldn't be loaded right now, so the index fund is shown instead. Try again in a few minutes.";
      return `<div class="result-block" id="stock-basket"><h3>Nifty 100 stock basket</h3><p class="data-status">${msg}</p></div>`;
    }

    const st = b.stats, lim = b.limits, t = b.target;
    const rows = b.holdings.map(h => `<tr>
      <td>${esc(h.name)}<br><span class="muted small">${esc(h.symbol)}</span></td>
      <td class="muted">${esc(h.group)}<br><span class="small">${esc(h.industry)}</span></td>
      <td class="num">${price(h.price)}</td>
      <td class="num">${h.shares}</td>
      <td class="num">${inr(h.invested)}</td>
      <td class="num">${h.beta.toFixed(2)}</td>
      <td class="num">${h.vol.toFixed(1)}%</td>
      <td class="num">${h.maxDrawdown.toFixed(1)}%</td>
      <td class="num">${h.cagr.toFixed(1)}%</td>
    </tr>`).join("");

    return `
      <div class="result-block" id="stock-basket">
        <h3>Nifty 100 stock basket</h3>
        <p class="basket-lede">Of ${st.screened} Nifty 100 stocks screened, ${st.passedReturn} beat the ${C.cma.riskFree}% risk-free rate over five years, ${st.inBand} of those had a beta between ${lim.betaLow.toFixed(2)} and ${lim.betaHigh.toFixed(2)} (the band around a ${esc(b.profile)} investor's ${t.targetBeta.toFixed(2)} target), and ${st.passedRisk} also stayed within volatility of ${lim.maxVol}% and maximum drawdown of −${lim.maxDrawdown}%. The closest betas were picked first, with no more than ${b.groupCap} ${b.groupCap === 1 ? "stock" : "stocks"} from any sector group.</p>
        ${!b.fullSize ? `<p class="data-status">Only ${b.size} suitable stocks fit these limits with enough spread across sector groups, so the basket holds ${b.size} instead of ${C.stocks.count}, with more money in each. Fewer suitable stocks are better than filling the basket with ones that don't match your risk.</p>` : ""}
        ${b.relaxed ? `<p class="data-status">Too few stocks met the original limits (volatility ${t.maxVol}%, drawdown −${t.maxDrawdown}%), so they were loosened to the levels above.</p>` : ""}
        ${st.skippedPrice ? `<p class="data-status">${st.skippedPrice} otherwise suitable ${st.skippedPrice === 1 ? "stock was" : "stocks were"} skipped because one share costs more than the amount set aside per stock.</p>` : ""}
        <dl class="stats">
          <div><dt>Invested in stocks</dt><dd>${inr(b.invested)}</dd></div>
          <div><dt>Left over for the index fund</dt><dd>${inr(b.leftover)}</dd></div>
          <div><dt>Average beta</dt><dd>${b.avgBeta.toFixed(2)}</dd></div>
          <div><dt>Average volatility</dt><dd>${b.avgVol.toFixed(1)}%</dd></div>
          <div><dt>Average max drawdown</dt><dd>${b.avgDrawdown.toFixed(1)}%</dd></div>
          <div><dt>Average 5-year CAGR</dt><dd>${b.avgCagr.toFixed(1)}%</dd></div>
        </dl>
        <div class="table-wrap basket-wrap">
          <table class="basket-table">
            <thead><tr><th>Company</th><th>Sector group</th><th class="num">Price</th><th class="num">Shares</th><th class="num">Amount</th><th class="num">Beta</th><th class="num">Volatility</th><th class="num">Max drawdown</th><th class="num">5-yr CAGR</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <p class="footnote">A historical screen for education, not a recommendation to buy these stocks. Beta, volatility and drawdown use five years of weekly prices adjusted for dividends and splits. Averages are weighted by amount invested; the basket's true volatility is lower than the average because stocks don't move perfectly together. Today's Nifty 100 contains companies that grew enough to join it, so past returns look better than a real investor would have earned (survivorship bias).${i.sip ? ` Your ${inr(p.split.inEq.sip)} monthly SIP for Indian equity still goes into the index fund.` : ""}</p>
      </div>`;
  }

  // ---------- AI explanation (Gemini, via /api/explain) ----------
  // Only computed results are sent: no name, and nothing Gemini could misuse.
  function buildFacts(p) {
    const i = p.input, pr = p.projection, f = p.feasibility, al = p.allocation;
    const r1 = n => Math.round(n * 1000) / 10;               // 0.1234 -> 12.3 (percent, 1 decimal)
    const gap = Math.abs(p.ability.total - p.willingness.total);
    const facts = {
      age: i.age,
      lumpSumRupees: i.lump,
      monthlySipRupees: i.sip,
      horizonYears: i.horizon,
      targetReturnPct: i.targetReturn,
      goal: GOALS.find(g => g.value === i.goal).text,
      mayNeedMoneyEarly: LIQUIDITY.find(x => x.value === i.liquidity).text,
      riskAbilityScoreOutOf100: p.ability.total,
      riskWillingnessScoreOutOf100: p.willingness.total,
      lowerScoreSetsProfile: gap < 10 ? "closely matched" : p.governing,
      weakestAbilityFactors: weakest(p.ability.parts),
      profile: p.profile.name,
      allocationPct: Object.fromEntries(ORDER.map(k => [C.assets[k].name, al[k]])),
      commoditiesTotalPct: al.gold + al.silver,
      expectedCompoundReturnPct: r1(p.stats.geometric),
      expectedVolatilityPct: r1(p.stats.vol),
      targetVerdict: { achievable: "within reach", stretch: "a stretch", unrealistic: "unrealistic for this profile" }[f.verdict],
      targetNeedsProfile: f.required && f.required.index > f.profileIndex ? f.required.name : null,
      totalInvestedRupees: Math.round(pr.invested),
      projectedAmountRupees: roundNice(pr.projected),
      projectedInTodaysMoneyRupees: roundNice(pr.projectedReal),
      targetAmountRupees: roundNice(pr.targetCorpus),
      inflationPct: C.cma.inflation,
      requiredMonthlySipRupees: f.verdict !== "achievable" && pr.requiredSip > 0 ? roundNice(pr.requiredSip) : null,
      constraintNotes: p.notes.map(n => n.text),
      equityVehicle: i.vehicle === "stocks" ? "individual Nifty 100 stocks" : "index fund"
    };
    if (i.vehicle === "stocks" && p.basket) {
      facts.stockBasket = p.basket.ok
        ? { built: true, numberOfStocks: p.basket.holdings.length, sectorGroups: p.basket.groups,
            averageBeta: Math.round(p.basket.avgBeta * 100) / 100, targetBeta: p.basket.target.targetBeta }
        : { built: false, reason: p.basket.reason === "too-few" ? "not enough money or suitable stocks for a diversified basket" : "stock data unavailable", usesIndexFundInstead: true };
    }
    return facts;
  }

  let aiRequest = 0;
  async function enhanceExplanation(p) {
    if (!C.ai || !C.ai.enabled) return;
    const status = document.getElementById("ai-status");
    const target = document.getElementById("advice-text");
    if (!status || !target) return;
    const myRequest = ++aiRequest;

    status.hidden = false;
    status.textContent = "Gemini is writing a personalised explanation from these numbers…";

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), C.ai.timeoutMs);
    try {
      const res = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ facts: buildFacts(p) }),
        signal: controller.signal
      });
      const data = await res.json();
      if (myRequest !== aiRequest) return;               // a newer plan was built meanwhile
      if (!res.ok || !data.verified || !Array.isArray(data.paragraphs)) throw new Error(data.error || "Unavailable");

      const who = p.input.name ? `<p class="ai-greeting">${esc(p.input.name)},</p>` : "";
      target.innerHTML = who + data.paragraphs.map(t => `<p>${esc(t)}</p>`).join("");
      status.textContent = "Written by Gemini from the calculations on this page. Every number it used was checked against them automatically.";
      status.classList.add("done");
    } catch (err) {
      if (myRequest !== aiRequest) return;
      status.textContent = "Showing the standard explanation; the AI explanation isn't available right now.";
      status.classList.add("done");
    } finally {
      clearTimeout(timer);
    }
  }

  // ---------- custom allocation ----------
  function renderCustomise(p) {
    const rows = ORDER.map(k => `
      <div class="slider-row">
        <label for="sl-${k}">${C.assets[k].name}</label>
        <input type="range" id="sl-${k}" data-asset="${k}" min="0" max="100" step="1" value="${p.allocation[k]}">
        <output id="out-${k}" for="sl-${k}">${p.allocation[k]}%</output>
        <span class="slider-ref">Suggested ${p.allocation[k]}%</span>
      </div>`).join("");
    return `
      <div class="result-block" id="customise">
        <h3>Customise your allocation</h3>
        <p class="basket-lede">Try a different mix. When the weights add up to 100%, the Analytics, Optimisation and Projections tabs show your custom portfolio next to the suggested one.</p>
        <div class="sliders">${rows}</div>
        <div id="custom-status" class="custom-status" aria-live="polite"></div>
        <div class="result-actions">
          <button type="button" class="btn btn-ghost" id="custom-scale" hidden>Scale to 100%</button>
          <button type="button" class="btn btn-ghost" id="custom-reset">Reset to suggested</button>
        </div>
        ${p.input.vehicle === "stocks" && p.basket && p.basket.ok ? `<p class="footnote">Changing the Indian equity weight changes the amount for the stock basket, but the stocks listed above are chosen for your suggested allocation.</p>` : ""}
      </div>`;
  }

  function readSliders() {
    const a = {};
    ORDER.forEach(k => { a[k] = Number(document.getElementById("sl-" + k).value); });
    return a;
  }

  function customStatus(p, alloc) {
    const A = window.APM_ANALYTICS, EC = effectiveConfig();
    const total = ORDER.reduce((t, k) => t + alloc[k], 0);
    if (total !== 100) {
      return { ok: false, html: `<p class="custom-total ${total > 100 ? "over" : "under"}">Total ${total}%. ${total > 100 ? "Reduce" : "Increase"} the weights by ${Math.abs(100 - total)} points, or scale them to 100%.</p>` };
    }
    if (ORDER.every(k => alloc[k] === p.allocation[k])) {
      return { ok: true, same: true, html: `<p class="custom-total">Total 100%. This matches the suggested allocation.</p>` };
    }
    const cs = E.portfolioStats(alloc, EC), ss = E.portfolioStats(p.allocation, EC);
    const ceil = A.riskCeiling(p.profile.index, EC, E);
    const moved = A.drift(alloc, p.allocation, ORDER);
    const over = cs.vol > ceil.vol;
    const cmp = (label, c, s, fmt) => `<div><dt>${label}</dt><dd>${fmt(c)}<span class="vs">Suggested ${fmt(s)}</span></dd></div>`;
    const pc = n => (n * 100).toFixed(1) + "%";
    return {
      ok: true, same: false,
      html: `
        <p class="custom-total">Total 100%. ${Math.round(moved)}% of the portfolio has moved away from the suggestion.</p>
        <dl class="stats compare">
          ${cmp("Expected compound return", cs.geometric, ss.geometric, pc)}
          ${cmp("Expected volatility", cs.vol, ss.vol, pc)}
          ${cmp("Sharpe ratio", cs.sharpe, ss.sharpe, n => n.toFixed(2))}
        </dl>
        ${over ? `<p class="custom-warning">This mix is riskier than your ${esc(p.profile.name)} profile supports: expected volatility of ${pc(cs.vol)} is above ${pc(ceil.vol)}${ceil.basis ? `, the risk of ${/^[AEIOU]/i.test(ceil.basis) ? "an" : "a"} ${esc(ceil.basis)} portfolio` : ""}. Expect deeper falls than your profile is designed for.</p>` : ""}`
    };
  }

  function wireCustomise(p) {
    const status = document.getElementById("custom-status");
    const scaleBtn = document.getElementById("custom-scale");
    if (!status) return;

    const update = commit => {
      const alloc = readSliders();
      ORDER.forEach(k => { document.getElementById("out-" + k).textContent = alloc[k] + "%"; });
      const st = customStatus(p, alloc);
      status.innerHTML = st.html;
      scaleBtn.hidden = st.ok;
      if (commit && st.ok) {
        window.APM_STATE.custom = st.same ? null : { allocation: alloc };
        document.dispatchEvent(new CustomEvent("apm:custom", { detail: window.APM_STATE.custom }));
      }
    };

    document.querySelectorAll("#customise input[type=range]").forEach(el => {
      el.addEventListener("input", () => update(false));
      el.addEventListener("change", () => update(true));
    });
    scaleBtn.addEventListener("click", () => {
      const alloc = readSliders();
      const total = ORDER.reduce((t, k) => t + alloc[k], 0) || 1;
      const scaled = {};
      ORDER.forEach(k => { scaled[k] = alloc[k] * 100 / total; });
      const rounded = E.roundTo100(scaled);
      ORDER.forEach(k => { document.getElementById("sl-" + k).value = rounded[k]; });
      update(true);
    });
    document.getElementById("custom-reset").addEventListener("click", () => {
      ORDER.forEach(k => { document.getElementById("sl-" + k).value = p.allocation[k]; });
      update(true);
    });
    update(false);
  }

  function assumptionNote() {
    const M = window.APM_MARKET;
    if (M && M.window && M.liveAssets && M.liveAssets.length) {
      const all = M.liveAssets.length === C.cma.order.length;
      return `Expected returns blend market history from ${monthLabel(M.window.from)} to ${monthLabel(M.window.to)} with long-run assumptions, and volatility and correlations come from the same history${all ? "" : " where data was available"}. Details are on the Methodology tab.`;
    }
    return "Based on long-run assumptions listed on the Methodology tab, because live market history isn't available right now.";
  }

  // ---------- results markup ----------
  const ORDER = C.cma.order;
  const VERDICT_TEXT = { achievable: "Within reach", stretch: "A stretch", unrealistic: "Unrealistic for this profile" };

  function renderResults(p) {
    const i = p.input;
    const explanation = buildExplanation(p);

    const bar = ORDER.filter(k => p.allocation[k] > 0).map(k =>
      `<span class="seg seg-${k}" style="flex-basis:${p.allocation[k]}%" title="${C.assets[k].name} ${p.allocation[k]}%"></span>`).join("");

    const rows = ORDER.map(k => {
      const s = p.split[k];
      return `<tr>
        <td><span class="key key-${k}" aria-hidden="true"></span>${C.assets[k].name}</td>
        <td class="muted">${C.assets[k].vehicle}</td>
        <td class="num">${s.pct}%</td>
        <td class="num">${inr(s.lump)}</td>
        ${i.sip ? `<td class="num">${inr(s.sip)}</td>` : ""}
      </tr>`;
    }).join("");

    const scoreRow = (label, score, governs) => `
      <div class="score">
        <div class="score-head"><span>${label}${governs ? ' <span class="governs">sets your profile</span>' : ""}</span><span class="num">${score}/100</span></div>
        <div class="track"><span style="width:${score}%"></span></div>
      </div>`;

    return `
      <div class="result-top">
        <p class="result-kicker">Your risk profile</p>
        <h2 class="result-profile">${p.profile.name}</h2>
        <div class="scores">
          ${scoreRow("Risk ability", p.ability.total, p.governing === "ability")}
          ${scoreRow("Risk willingness", p.willingness.total, p.governing === "willingness")}
        </div>
      </div>

      <div class="advice">
        <p class="ai-status" id="ai-status" aria-live="polite" hidden></p>
        <div id="advice-text">${explanation.map(t => `<p>${t}</p>`).join("")}</div>
        ${p.notes.length ? `<ul class="notes">${p.notes.map(n => `<li>${n.text}</li>`).join("")}</ul>` : ""}
      </div>

      <div class="result-block">
        <h3>Suggested allocation</h3>
        <div class="alloc-bar" role="img" aria-label="Allocation: ${ORDER.map(k => C.assets[k].name + " " + p.allocation[k] + "%").join(", ")}">${bar}</div>
        <div class="table-wrap">
          <table class="alloc-table">
            <thead><tr><th>Asset class</th><th>Representative instrument</th><th class="num">Weight</th><th class="num">Invest now</th>${i.sip ? '<th class="num">Monthly SIP</th>' : ""}</tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>

      ${renderCards(p)}

      ${renderBasket(p)}

      ${renderCustomise(p)}

      <div class="result-block">
        <h3>Goal check</h3>
        <dl class="stats">
          <div><dt>Your target</dt><dd>${i.targetReturn}% a year</dd></div>
          <div><dt>Expected compound return</dt><dd>${pct(p.stats.geometric)} a year</dd></div>
          <div><dt>Verdict</dt><dd>${VERDICT_TEXT[p.feasibility.verdict]}</dd></div>
          <div><dt>Total invested</dt><dd>${inr(p.projection.invested)}</dd></div>
          <div><dt>Amount at your target return</dt><dd>${inr(roundNice(p.projection.targetCorpus))}</dd></div>
          <div><dt>Projected amount</dt><dd>${inr(roundNice(p.projection.projected))}</dd></div>
          <div><dt>In today's money</dt><dd>${inr(roundNice(p.projection.projectedReal))}</dd></div>
          <div><dt>Expected volatility</dt><dd>${pct(p.stats.vol)} a year</dd></div>
          <div><dt>Sharpe ratio</dt><dd>${p.stats.sharpe.toFixed(2)}</dd></div>
        </dl>
        <p class="footnote">${assumptionNote()}</p>
      </div>

      <div class="result-actions">
        <a class="btn btn-primary" href="#analytics">See the analytics</a>
        <a class="btn btn-ghost" href="#projections">See projections</a>
        <a class="btn btn-ghost" href="#methodology">See how this was calculated</a>
        <button type="button" class="btn btn-ghost" id="edit-answers">Edit my answers</button>
      </div>`;
  }

  // ---------- wiring ----------
  function init() {
    const formMount = document.getElementById("plan-form-mount");
    const resultsMount = document.getElementById("plan-results");
    if (!formMount) return;
    formMount.innerHTML = renderForm();
    const form = document.getElementById("plan-form");

    form.addEventListener("submit", async e => {
      e.preventDefault();
      const { inp, errors } = readForm(form);
      const summary = document.getElementById("err-summary");
      if (errors.length) {
        summary.textContent = `Answer the ${errors.length === 1 ? "highlighted question" : errors.length + " highlighted questions"} to build your plan.`;
        summary.hidden = false;
        const first = form.querySelector(`[data-field="${errors[0]}"]`);
        first.scrollIntoView({ behavior: "smooth", block: "center" });
        const focusable = first.querySelector("input");
        if (focusable) focusable.focus({ preventScroll: true });
        return;
      }
      summary.hidden = true;

      const button = form.querySelector("button[type=submit]");
      if (window.APM_MARKET && window.APM_MARKET.status === "loading") {
        button.disabled = true;
        button.textContent = "Loading market data…";
        await waitForMarket(12000);
        button.disabled = false;
        button.textContent = "Build my plan";
      }

      const cfg = effectiveConfig();
      const plan = E.buildPlan(inp, cfg);

      if (inp.vehicle === "stocks") {
        button.disabled = true;
        button.textContent = "Screening Nifty 100 stocks…";
        const screen = await window.APM_LOAD_SCREEN(55000);
        button.disabled = false;
        button.textContent = "Build my plan";
        plan.basket = window.APM_STOCKS.buildBasket(screen && !screen.error ? screen : null,
          plan.profile.name, plan.split.inEq.lump, C, cfg.cma.riskFree);
        plan.screen = screen && !screen.error ? { fetchedAt: screen.fetchedAt, constituents: screen.constituents, count: screen.count } : { error: screen && screen.error };
      }
      window.APM_STATE.plan = plan;
      window.APM_STATE.custom = null;
      document.dispatchEvent(new CustomEvent("apm:plan", { detail: plan }));

      resultsMount.innerHTML = renderResults(plan);
      wireCustomise(plan);
      enhanceExplanation(plan);
      resultsMount.hidden = false;
      resultsMount.scrollIntoView({ behavior: "smooth", block: "start" });
      resultsMount.focus({ preventScroll: true });

      document.getElementById("edit-answers").addEventListener("click", () => {
        form.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });

    // clear a field's error as soon as it is answered; echo rupee amounts in Indian format
    form.addEventListener("input", e => {
      const echo = document.getElementById("echo-" + e.target.name);
      if (echo) echo.textContent = e.target.value && Number(e.target.value) > 0 ? inr(Number(e.target.value)) : "";
      const box = e.target.closest("[data-field]");
      if (box && box.classList.contains("invalid")) {
        box.classList.remove("invalid");
        const err = document.getElementById("err-" + box.dataset.field);
        if (err) err.hidden = true;
      }
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
