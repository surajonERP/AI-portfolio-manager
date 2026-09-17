# Your AI Portfolio Manager

An educational portfolio planning tool built on CFA Level 1 concepts, by Suraj Kumar.
Educational academic project. Not investment advice.

## Files
- `index.html` – page structure and the six tabs
- `style.css` – the black, minimal design
- `config.js` – ALL finance settings: scoring, profile allocations, long-run assumptions, data sources, instruments, history weight
- `engine.js` – calculations: risk scoring, allocation, portfolio return and variance, Sharpe, feasibility, lump sum and SIP values
- `market.js` – loads live data and estimates expected returns, volatility and correlations from history
- `stocks.js` – builds the Nifty 100 stock basket: beta band, risk limits, sector-group cap, whole shares
- `plan.js` – questionnaire, results, instrument cards and written explanation
- `methodology.js` – builds the Methodology tab from the live settings
- `app.js` – switches between tabs
- `api/yahoo.mjs` – server function: Yahoo Finance prices (runs on Vercel)
- `api/amfi.mjs` – server function: Indian mutual fund NAVs from MFapi / AMFI (runs on Vercel)
- `api/screen.mjs` – server function: reads the official Nifty 100 list and calculates 5-year beta, volatility, drawdown and CAGR for each stock
- `vercel.json` – gives the stock screen up to 60 seconds to run

## Live data
The `api` functions only run on Vercel. Opening `index.html` directly still works,
but shows long-run assumptions and hides live prices.

## Status
- Phase 1: skeleton and Home page – done
- Phase 2: questionnaire, risk scoring, allocation, goal check, SIP planning – done
- Phase 3: live Yahoo Finance and AMFI data, history-based assumptions, instrument cards – done
- Phase 3.5: Indian assets only, Nifty 100 stock screen, per-asset history weights, month-ends from daily prices – done
- Phase 3.6: beta band and sector-group diversification for the stock basket – done
- Phase 4: analytics tabs and custom allocation sliders – next
