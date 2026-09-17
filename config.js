// ============================================================
// config.js — EVERY finance assumption in the system lives here.
// You can change any number in this file without touching the logic.
// ============================================================

window.APM_CONFIG = {

  // ---------- 1. Risk ABILITY questions (total 100 points) ----------
  // CFA: ability depends on horizon, income stability, wealth, liabilities and liquidity.
  ability: {
    horizon: {            // years -> points (max 30)
      label: "Time horizon", max: 30,
      bands: [ { upTo: 2, pts: 3 }, { upTo: 4, pts: 9 }, { upTo: 7, pts: 17 },
               { upTo: 10, pts: 23 }, { upTo: 15, pts: 27 }, { upTo: 999, pts: 30 } ]
    },
    age: {                // years -> points (max 10)
      label: "Age", max: 10,
      bands: [ { upTo: 29, pts: 10 }, { upTo: 39, pts: 8 }, { upTo: 49, pts: 6 },
               { upTo: 59, pts: 3 }, { upTo: 999, pts: 1 } ]
    },
    income: {
      label: "Income stability", max: 15,
      options: [
        { value: "very", text: "Very stable (permanent salaried job)", pts: 15 },
        { value: "fair", text: "Fairly stable", pts: 11 },
        { value: "variable", text: "Variable (freelance or business)", pts: 6 },
        { value: "none", text: "No regular income (student or retired)", pts: 3 }
      ]
    },
    dependents: {
      label: "Dependents", max: 10,
      options: [
        { value: "0", text: "None", pts: 10 },
        { value: "1-2", text: "1 or 2", pts: 6 },
        { value: "3+", text: "3 or more", pts: 2 }
      ]
    },
    emergency: {
      label: "Emergency fund", max: 10,
      options: [
        { value: "none", text: "None", pts: 0 },
        { value: "lt3", text: "Less than 3 months", pts: 4 },
        { value: "3to6", text: "3 to 6 months", pts: 8 },
        { value: "gt6", text: "More than 6 months", pts: 10 }
      ]
    },
    emi: {
      label: "Loan EMIs as share of income", max: 10,
      options: [
        { value: "none", text: "No loans", pts: 10 },
        { value: "lt20", text: "Under 20%", pts: 7 },
        { value: "20to40", text: "20% to 40%", pts: 4 },
        { value: "gt40", text: "Over 40%", pts: 0 }
      ]
    },
    share: {
      label: "Share of total savings", max: 15,
      options: [
        { value: "lt25", text: "Under 25%", pts: 15 },
        { value: "25to50", text: "25% to 50%", pts: 10 },
        { value: "50to75", text: "50% to 75%", pts: 5 },
        { value: "gt75", text: "Over 75%", pts: 2 }
      ]
    }
  },

  // ---------- 2. Risk WILLINGNESS questions (total 100 points) ----------
  willingness: {
    experience: {
      label: "Investing experience", max: 30,
      options: [
        { value: "none", text: "None yet", pts: 5 },
        { value: "some", text: "FDs or a few mutual funds", pts: 13 },
        { value: "experienced", text: "Stocks and mutual funds for several years", pts: 22 },
        { value: "advanced", text: "Active trading, including derivatives", pts: 30 }
      ]
    },
    drop: {
      label: "Reaction to a 20% fall", max: 40,
      options: [
        { value: "sellall", text: "Sell everything", pts: 0 },
        { value: "sellsome", text: "Sell some", pts: 13 },
        { value: "hold", text: "Hold and wait", pts: 27 },
        { value: "buymore", text: "Invest more", pts: 40 }
      ]
    },
    range: {
      label: "Preferred one-year outcome range", max: 30,
      options: [
        { value: "a", text: "Best year +8%, worst year −2%", pts: 3 },
        { value: "b", text: "Best year +15%, worst year −8%", pts: 12 },
        { value: "c", text: "Best year +25%, worst year −18%", pts: 21 },
        { value: "d", text: "Best year +40%, worst year −30%", pts: 30 }
      ]
    }
  },

  // ---------- 3. Profiles: final score = LOWER of ability and willingness ----------
  profiles: [
    { name: "Conservative",            upTo: 20,  allocation: { inEq: 20, gold: 8,  silver: 2, fi: 55, cash: 15 } },
    { name: "Moderately Conservative", upTo: 40,  allocation: { inEq: 33, gold: 8,  silver: 2, fi: 45, cash: 12 } },
    { name: "Balanced",                upTo: 60,  allocation: { inEq: 47, gold: 10, silver: 2, fi: 33, cash: 8 } },
    { name: "Growth",                  upTo: 80,  allocation: { inEq: 62, gold: 10, silver: 2, fi: 21, cash: 5 } },
    { name: "Aggressive",              upTo: 100, allocation: { inEq: 77, gold: 8,  silver: 2, fi: 10, cash: 3 } }
  ],

  // ---------- 4. Constraints that override the score ----------
  constraints: {
    shortHorizonYears: 3,                          // horizon under this...
    shortHorizonMaxProfile: "Moderately Conservative", // ...caps the profile here
    liquidityMinCash: { no: 0, some: 10, significant: 20 } // minimum cash % by liquidity need
  },

  // ---------- 5. Asset classes and representative vehicles ----------
  // Live tickers and NAVs are connected in Phase 3.
  assets: {
    inEq:   { name: "Indian equity",  group: "Equity",       vehicle: "Nifty 50 index fund or ETF" },
    gold:   { name: "Gold",           group: "Commodities",  vehicle: "Gold ETF (NSE-listed)" },
    silver: { name: "Silver",         group: "Commodities",  vehicle: "Silver ETF (NSE-listed)" },
    fi:     { name: "Fixed income",   group: "Fixed income", vehicle: "Short-duration debt mutual fund" },
    cash:   { name: "Cash",           group: "Cash",         vehicle: "Liquid mutual fund" }
  },

  // ---------- 6. Long-run capital market assumptions (annual, INR) ----------
  // These are the ANCHORS. When live data loads, expected returns become a blend of
  // these anchors and 10 years of market history (see section 8). Volatility and
  // correlation are then taken from history. If live data fails, these are used as they are.
  cma: {
    expReturn:  { inEq: 13.5, gold: 10.0, silver: 10.0, fi: 7.0, cash: 6.0 },
    volatility: { inEq: 17.0, gold: 14.0, silver: 25.0, fi: 3.0, cash: 1.0 },
    // correlation matrix, order: inEq, gold, silver, fi, cash
    order: ["inEq", "gold", "silver", "fi", "cash"],
    correlation: [
      [1.00, 0.00, 0.15, 0.10, 0.00],
      [0.00, 1.00, 0.75, 0.15, 0.00],
      [0.15, 0.75, 1.00, 0.05, 0.00],
      [0.10, 0.15, 0.05, 1.00, 0.30],
      [0.00, 0.00, 0.00, 0.30, 1.00]
    ],
    riskFree: 6.0,   // %
    inflation: 5.0   // %, used to show today's value of the future corpus
  },

  // ---------- 7. Feasibility check ----------
  feasibility: {
    stretchMargin: 1.5  // target within this many % points above expected return = "stretch"
  },

  // ---------- 8. Live market data ----------
  market: {
    // How estimates are built from history
    lookbackYears: 10,     // months of history used = lookbackYears x 12
    minMonths: 60,         // an asset needs at least this many months, or its anchor is used
    // Share of HISTORY in each expected return; the rest comes from the long-run anchor.
    // Equity and debt returns are backed by cash flows (earnings, dividends, coupons), so
    // history informs them. Commodities produce no cash flows, so their expected return is
    // the long-run anchor only; history is still used for their volatility and correlation.
    historyWeight: { inEq: 0.5, gold: 0, silver: 0, fi: 0.5, cash: 0.5 },

    // Series used to ESTIMATE each asset class's return, volatility and correlation.
    // Long, clean index histories represent the asset class as a whole.
    fx: "USDINR=X",
    history: {
      inEq:   { source: "yahoo", symbol: "^NSEI",    currency: "INR", addYield: 1.3,
                label: "Nifty 50 index, plus 1.3% a year for dividends (the index excludes them)" },
      gold:   { source: "yahoo", symbol: "GC=F",     currency: "USD",
                label: "Gold futures, converted to INR" },
      silver: { source: "yahoo", symbol: "SI=F",     currency: "USD",
                label: "Silver futures, converted to INR" },
      fi:     { source: "amfi",  code: "119016",     currency: "INR",
                label: "HDFC Short Term Debt Fund, Direct Growth NAV" },
      cash:   { source: "amfi",  code: "119091",     currency: "INR",
                label: "HDFC Liquid Fund, Direct Growth NAV" }
    },

    // Instruments shown on the plan with live prices. Representative examples of each
    // asset class for an Indian investor, chosen for low cost and wide availability.
    instruments: {
      inEq:   { source: "yahoo", symbol: "NIFTYBEES.NS", name: "Nippon India ETF Nifty 50 BeES", kind: "ETF, NSE" },
      gold:   { source: "yahoo", symbol: "GOLDBEES.NS",  name: "Nippon India ETF Gold BeES", kind: "ETF, NSE" },
      silver: { source: "yahoo", symbol: "SILVERBEES.NS", name: "Nippon India Silver ETF", kind: "ETF, NSE" },
      fi:     { source: "amfi",  code: "119016", name: "HDFC Short Term Debt Fund", kind: "Mutual fund, Direct Growth" },
      cash:   { source: "amfi",  code: "119091", name: "HDFC Liquid Fund", kind: "Mutual fund, Direct Growth" }
    }
  },

  // ---------- 9. Nifty 100 stock screen (when the user chooses individual stocks) ----------
  // Stocks are matched to the investor mainly by RISK, because a stock's beta and volatility
  // are far more persistent than its returns. Past return is only a filter.
  stocks: {
    lookbackYears: 5,     // weekly prices over this period
    minYears: 3,          // stocks with less listed history are skipped
    count: 10,            // stocks in the basket
    minStocks: 5,         // fewer than this and the tool falls back to the index fund
    minIndustries: 3,     // ...or fewer industries than this
    minEquity: 50000,     // ...or less than this many rupees for equity
    sectorCap: 3,         // at most this many stocks from one industry
    // Return filter: 5-year CAGR (with dividends) must beat the risk-free rate
    // Risk targets per profile. Vol and drawdown are hard limits; beta is the ranking target.
    profiles: {
      "Conservative":            { targetBeta: 0.60, maxVol: 25, maxDrawdown: 30 },
      "Moderately Conservative": { targetBeta: 0.75, maxVol: 28, maxDrawdown: 35 },
      "Balanced":                { targetBeta: 0.90, maxVol: 32, maxDrawdown: 40 },
      "Growth":                  { targetBeta: 1.05, maxVol: 36, maxDrawdown: 50 },
      "Aggressive":              { targetBeta: 1.20, maxVol: 45, maxDrawdown: 60 }
    },
    // If too few stocks pass, the volatility and drawdown limits are loosened by these
    // percentage points, one step at a time, and the plan says so.
    relaxSteps: [ { vol: 4, drawdown: 5 }, { vol: 8, drawdown: 10 }, { vol: 12, drawdown: 15 } ]
  }
};
