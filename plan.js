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
  const RADIOS = ["goal", "liquidity", "income", "dependents", "emergency", "emi", "share", "experience", "drop", "range"];

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
    const equity = al.inEq + al.usEq, commodities = al.gold + al.silver;

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

    paras.push(`With this in mind, your best course of action is a <strong>${p.profile.name}</strong> portfolio: ${equity}% in equity (${al.inEq}% Indian, ${al.usEq}% US), ${commodities}% in commodities (${al.gold}% gold, ${al.silver}% silver), ${al.fi}% in fixed income and ${al.cash}% in cash. It is expected to compound at about ${pct(p.stats.geometric)} a year, with annual volatility of about ${pct(p.stats.vol)}.`);

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

  function assumptionNote() {
    const M = window.APM_MARKET;
    if (M && M.window && M.liveAssets && M.liveAssets.length) {
      const all = M.liveAssets.length === C.cma.order.length;
      return `Expected returns blend market history from ${monthLabel(M.window.from)} to ${monthLabel(M.window.to)} with long-run assumptions, and volatility and correlations come from the same history${all ? "" : " where data was available"}. Details are on the Methodology tab.`;
    }
    return "Based on long-run assumptions listed on the Methodology tab, because live market history isn't available right now.";
  }

  // ---------- results markup ----------
  const ORDER = ["inEq", "usEq", "gold", "silver", "fi", "cash"];
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
        ${explanation.map(t => `<p>${t}</p>`).join("")}
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

      const plan = E.buildPlan(inp, effectiveConfig());
      window.APM_STATE.plan = plan;
      document.dispatchEvent(new CustomEvent("apm:plan", { detail: plan }));

      resultsMount.innerHTML = renderResults(plan);
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
