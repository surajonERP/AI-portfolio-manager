// ============================================================
// /api/yahoo — fetches price history from Yahoo Finance.
// Runs on Vercel's servers (browsers can't call Yahoo directly).
//
// Example: /api/yahoo?symbols=NIFTYBEES.NS,GC=F&range=1y&interval=1d
//
// Caching, so heavy traffic doesn't get us blocked by Yahoo:
//  1. Vercel's CDN keeps each response for 6 hours (Cache-Control header).
//  2. A warm server instance also remembers results in memory.
// ============================================================

const RANGES = new Set(["1mo", "3mo", "6mo", "1y", "2y", "5y", "10y", "max"]);
const INTERVALS = new Set(["1d", "1wk", "1mo"]);
const SYMBOL_RE = /^[A-Za-z0-9.^=\-&]{1,24}$/;
const MAX_SYMBOLS = 10;
const MEMORY_TTL_MS = 6 * 60 * 60 * 1000;

const memory = new Map(); // key -> { at, data }

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Accept": "application/json"
};

async function fetchChart(symbol, range, interval) {
  const key = `${symbol}|${range}|${interval}`;
  const hit = memory.get(key);
  if (hit && Date.now() - hit.at < MEMORY_TTL_MS) return hit.data;

  const path = `/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&events=div%2Csplit&includeAdjustedClose=true`;
  let lastError = "Unknown error";

  for (const host of ["https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"]) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 7000);
      const res = await fetch(host + path, { headers: HEADERS, signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) { lastError = `Yahoo responded ${res.status}`; continue; }

      const json = await res.json();
      const result = json?.chart?.result?.[0];
      if (!result) { lastError = json?.chart?.error?.description || "No data for this symbol"; continue; }

      const data = parseChart(symbol, result);
      memory.set(key, { at: Date.now(), data });
      return data;
    } catch (err) {
      lastError = err.name === "AbortError" ? "Yahoo request timed out" : String(err.message || err);
    }
  }
  return { symbol, error: lastError };
}

function parseChart(symbol, result) {
  const meta = result.meta || {};
  const ts = result.timestamp || [];
  const closes = result.indicators?.quote?.[0]?.close || [];
  const adj = result.indicators?.adjclose?.[0]?.adjclose || null;
  const offset = meta.gmtoffset || 0;

  const points = [];
  for (let i = 0; i < ts.length; i++) {
    const v = adj && adj[i] != null ? adj[i] : closes[i];
    if (v == null || !isFinite(v)) continue;
    const date = new Date((ts[i] + offset) * 1000).toISOString().slice(0, 10);
    points.push([date, Number(v.toFixed(6))]);
  }

  return {
    symbol,
    name: meta.longName || meta.shortName || symbol,
    currency: meta.currency || null,
    exchange: meta.fullExchangeName || meta.exchangeName || null,
    type: meta.instrumentType || null,
    price: meta.regularMarketPrice ?? (points.length ? points[points.length - 1][1] : null),
    priceTime: meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString() : null,
    points
  };
}

function json(body, status, cacheSeconds) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": cacheSeconds > 0
        ? `public, s-maxage=${cacheSeconds}, stale-while-revalidate=86400`
        : "no-store"
    }
  });
}

export async function GET(request) {
  const url = new URL(request.url);
  const symbols = (url.searchParams.get("symbols") || "")
    .split(",").map(s => s.trim()).filter(Boolean);
  const range = url.searchParams.get("range") || "1y";
  const interval = url.searchParams.get("interval") || "1d";

  if (!symbols.length) return json({ error: "Add at least one symbol, for example ?symbols=NIFTYBEES.NS" }, 400, 0);
  if (symbols.length > MAX_SYMBOLS) return json({ error: `Request up to ${MAX_SYMBOLS} symbols at a time.` }, 400, 0);
  const bad = symbols.find(s => !SYMBOL_RE.test(s));
  if (bad) return json({ error: `"${bad}" is not a valid ticker.` }, 400, 0);
  if (!RANGES.has(range)) return json({ error: `range must be one of: ${[...RANGES].join(", ")}` }, 400, 0);
  if (!INTERVALS.has(interval)) return json({ error: `interval must be one of: ${[...INTERVALS].join(", ")}` }, 400, 0);

  const results = await Promise.all(symbols.map(s => fetchChart(s, range, interval)));
  const out = {};
  results.forEach(r => { out[r.symbol] = r; });

  const anyFailed = results.some(r => r.error);
  // Cache complete answers for 6 hours; retry partial failures after 5 minutes.
  return json({ fetchedAt: new Date().toISOString(), range, interval, data: out }, 200, anyFailed ? 300 : 21600);
}
