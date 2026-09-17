// ============================================================
// /api/screen — risk and return metrics for every Nifty 100 stock.
//
// 1. Reads the official Nifty 100 constituent list published by NSE Indices.
// 2. Fetches 5 years of weekly prices (adjusted for dividends and splits)
//    for each stock and for the Nifty 50 index from Yahoo Finance.
// 3. Calculates beta, volatility, maximum drawdown and CAGR.
//
// The browser then picks the stocks that fit each investor's profile.
// The result is cached for 24 hours, so this heavy job runs rarely.
// Optional: ?years=5
// ============================================================

const LIST_URLS = [
  "https://niftyindices.com/IndexConstituent/ind_nifty100list.csv",
  "https://nsearchives.nseindia.com/content/indices/ind_nifty100list.csv"
];
const BENCHMARK = "^NSEI";
const CONCURRENCY = 6;
const MEMORY_TTL_MS = 12 * 60 * 60 * 1000;
const memory = new Map();

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchWithTimeout(url, options = {}, ms = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}

// ---------- 1. constituent list ----------
function parseCsvLine(line) {
  const out = []; let cur = ""; let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === "," && !quoted) { out.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

async function getConstituents() {
  const hit = memory.get("list");
  if (hit && Date.now() - hit.at < MEMORY_TTL_MS) return hit.data;
  let lastError = "Could not load the Nifty 100 list";

  for (const url of LIST_URLS) {
    try {
      const res = await fetchWithTimeout(url, { headers: { "User-Agent": UA, "Accept": "text/csv,*/*" } });
      if (!res.ok) { lastError = `List source responded ${res.status}`; continue; }
      const text = await res.text();
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      const header = parseCsvLine(lines[0]).map(h => h.toLowerCase());
      const iName = header.findIndex(h => h.includes("company"));
      const iInd = header.findIndex(h => h.includes("industry"));
      const iSym = header.findIndex(h => h === "symbol");
      if (iName < 0 || iSym < 0) { lastError = "Unexpected list format"; continue; }

      const list = lines.slice(1).map(parseCsvLine)
        .filter(r => r[iSym])
        .map(r => ({ symbol: r[iSym], name: r[iName], industry: iInd >= 0 ? r[iInd] : "Other" }));
      if (list.length < 80) { lastError = `List had only ${list.length} rows`; continue; }

      const data = { list, source: url };
      memory.set("list", { at: Date.now(), data });
      return data;
    } catch (err) {
      lastError = String(err.message || err);
    }
  }
  throw new Error(lastError);
}

// ---------- 2. weekly prices ----------
async function weekly(symbol, years) {
  const key = `${symbol}|${years}`;
  const hit = memory.get(key);
  if (hit && Date.now() - hit.at < MEMORY_TTL_MS) return hit.data;

  const path = `/v8/finance/chart/${encodeURIComponent(symbol)}?range=${years}y&interval=1wk&events=div%2Csplit&includeAdjustedClose=true`;
  const hosts = ["https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"];
  let lastError = "No data";

  for (let attempt = 0; attempt < 3; attempt++) {
    const host = hosts[attempt % 2];
    try {
      const res = await fetchWithTimeout(host + path, { headers: { "User-Agent": UA, "Accept": "application/json" } }, 7000);
      if (res.status === 429) { lastError = "Rate limited by Yahoo"; await sleep(1200 * (attempt + 1)); continue; }
      if (!res.ok) { lastError = `Yahoo responded ${res.status}`; continue; }
      const json = await res.json();
      const r = json?.chart?.result?.[0];
      if (!r) { lastError = "No data"; continue; }

      const ts = r.timestamp || [];
      const adj = r.indicators?.adjclose?.[0]?.adjclose || r.indicators?.quote?.[0]?.close || [];
      const off = r.meta?.gmtoffset || 0;
      const points = [];
      ts.forEach((t, i) => {
        if (adj[i] != null && isFinite(adj[i]) && adj[i] > 0)
          points.push([new Date((t + off) * 1000).toISOString().slice(0, 10), adj[i]]);
      });
      // Yahoo can repeat the current week with today's date; keep one point per week
      const dedup = [];
      points.forEach(p => {
        const prev = dedup[dedup.length - 1];
        if (prev && (Date.parse(p[0]) - Date.parse(prev[0])) < 4 * 864e5) dedup[dedup.length - 1] = p;
        else dedup.push(p);
      });
      const data = { points: dedup, price: r.meta?.regularMarketPrice ?? null, name: r.meta?.longName || r.meta?.shortName || null };
      memory.set(key, { at: Date.now(), data });
      return data;
    } catch (err) {
      lastError = err.name === "AbortError" ? "Timed out" : String(err.message || err);
    }
  }
  return { error: lastError };
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

// ---------- 3. metrics ----------
function metrics(stockPts, benchPts) {
  // weekly returns matched to the benchmark by week
  const weekKey = d => { const t = Date.parse(d); return Math.floor((t / 864e5 + 3) / 7); }; // same key for dates in one Mon–Sun week
  const bench = new Map(benchPts.map(p => [weekKey(p[0]), p[1]]));

  const rs = [], rm = [];
  for (let i = 1; i < stockPts.length; i++) {
    const k0 = weekKey(stockPts[i - 1][0]), k1 = weekKey(stockPts[i][0]);
    if (k1 - k0 !== 1 || !bench.has(k0) || !bench.has(k1)) continue;
    rs.push(stockPts[i][1] / stockPts[i - 1][1] - 1);
    rm.push(bench.get(k1) / bench.get(k0) - 1);
  }
  if (rs.length < 52) return null;

  const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
  const ms = mean(rs), mm = mean(rm);
  let cov = 0, varM = 0, varS = 0;
  for (let i = 0; i < rs.length; i++) {
    cov += (rs[i] - ms) * (rm[i] - mm);
    varM += (rm[i] - mm) ** 2;
    varS += (rs[i] - ms) ** 2;
  }
  const n1 = rs.length - 1;
  const beta = (cov / n1) / (varM / n1);                       // β = Cov(Rᵢ, Rₘ) / Var(Rₘ)
  const vol = Math.sqrt(varS / n1) * Math.sqrt(52) * 100;       // annualised, %

  let peak = stockPts[0][1], maxDd = 0;                         // maximum drawdown, %
  for (const [, v] of stockPts) { peak = Math.max(peak, v); maxDd = Math.min(maxDd, v / peak - 1); }

  const first = stockPts[0], last = stockPts[stockPts.length - 1];
  const years = (Date.parse(last[0]) - Date.parse(first[0])) / (365.25 * 864e5);
  const cagr = (Math.pow(last[1] / first[1], 1 / years) - 1) * 100;

  return { beta, vol, maxDrawdown: maxDd * 100, cagr, years, weeks: rs.length };
}

function respond(body, status, cacheSeconds) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": cacheSeconds > 0 ? `public, s-maxage=${cacheSeconds}, stale-while-revalidate=172800` : "no-store"
    }
  });
}

export async function GET(request) {
  const url = new URL(request.url);
  const years = Math.min(10, Math.max(3, parseInt(url.searchParams.get("years") || "5", 10) || 5));

  let listInfo;
  try { listInfo = await getConstituents(); }
  catch (err) { return respond({ error: `Nifty 100 list unavailable: ${err.message}` }, 502, 0); }

  const bench = await weekly(BENCHMARK, years);
  if (bench.error || bench.points.length < 60) {
    return respond({ error: `Nifty 50 benchmark data unavailable: ${bench.error || "too short"}` }, 502, 0);
  }

  const failed = [];
  const stocks = (await mapLimit(listInfo.list, CONCURRENCY, async s => {
    const ySym = `${s.symbol}.NS`;
    const d = await weekly(ySym, years);
    if (d.error || !d.points || d.points.length < 10) { failed.push({ symbol: s.symbol, reason: d.error || "No data" }); return null; }
    const m = metrics(d.points, bench.points);
    if (!m) { failed.push({ symbol: s.symbol, reason: "Too little history" }); return null; }
    return {
      symbol: s.symbol, yahoo: ySym, name: s.name, industry: s.industry,
      price: d.price ?? d.points[d.points.length - 1][1],
      beta: +m.beta.toFixed(3), vol: +m.vol.toFixed(2), maxDrawdown: +m.maxDrawdown.toFixed(2),
      cagr: +m.cagr.toFixed(2), years: +m.years.toFixed(2), weeks: m.weeks
    };
  })).filter(Boolean);

  const body = {
    fetchedAt: new Date().toISOString(),
    universe: "Nifty 100",
    listSource: listInfo.source,
    benchmark: BENCHMARK,
    years,
    constituents: listInfo.list.length,
    count: stocks.length,
    failed,
    stocks
  };
  // Cache a good result for 24 hours; if many stocks failed, retry sooner.
  return respond(body, 200, failed.length <= 10 ? 86400 : 900);
}
