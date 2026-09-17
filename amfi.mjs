// ============================================================
// /api/amfi — fetches Indian mutual fund NAV history.
// Source: MFapi.in (free API serving AMFI's published NAVs).
//
// By scheme code:   /api/amfi?codes=119091,119016
// By fund name:     /api/amfi?find=Motilal Oswal S&P 500 Index Fund
//   (picks the Direct Plan, Growth option; separate several names with |)
// Optional:         &years=11   how many years of history (default 11)
// ============================================================

const BASE = "https://api.mfapi.in";
const MAX_FUNDS = 8;
const MEMORY_TTL_MS = 6 * 60 * 60 * 1000;
const memory = new Map();

async function getJson(url) {
  const hit = memory.get(url);
  if (hit && Date.now() - hit.at < MEMORY_TTL_MS) return hit.data;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { "Accept": "application/json" } });
    if (!res.ok) throw new Error(`MFapi responded ${res.status}`);
    const data = await res.json();
    memory.set(url, { at: Date.now(), data });
    return data;
  } finally {
    clearTimeout(timer);
  }
}

// Choose the Direct Plan, Growth option from search results
function pickDirectGrowth(results) {
  const ok = r => /direct/i.test(r.schemeName) && /growth/i.test(r.schemeName)
    && !/idcw|dividend|bonus|regular/i.test(r.schemeName);
  return results.find(ok) || null;
}

async function fetchFund(code, years) {
  const start = new Date();
  start.setFullYear(start.getFullYear() - years);
  const startDate = start.toISOString().slice(0, 10);
  const endDate = new Date().toISOString().slice(0, 10);

  const json = await getJson(`${BASE}/mf/${code}?startDate=${startDate}&endDate=${endDate}`);
  if (!json || !Array.isArray(json.data) || !json.data.length) throw new Error("No NAV data for this scheme code");

  // MFapi returns newest first with dates as dd-mm-yyyy; convert and sort oldest first
  const points = json.data
    .map(d => {
      const [dd, mm, yyyy] = d.date.split("-");
      return [`${yyyy}-${mm}-${dd}`, Number(d.nav)];
    })
    .filter(p => isFinite(p[1]) && p[1] > 0)
    .sort((a, b) => (a[0] < b[0] ? -1 : 1));

  const last = points[points.length - 1];
  return {
    code: String(json.meta?.scheme_code ?? code),
    name: json.meta?.scheme_name || `Scheme ${code}`,
    fundHouse: json.meta?.fund_house || null,
    category: json.meta?.scheme_category || null,
    currency: "INR",
    price: last[1],
    priceDate: last[0],
    points
  };
}

function respond(body, status, cacheSeconds) {
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
  const codes = (url.searchParams.get("codes") || "").split(",").map(s => s.trim()).filter(Boolean);
  const finds = (url.searchParams.get("find") || "").split("|").map(s => s.trim()).filter(Boolean);
  const years = Math.min(20, Math.max(1, parseInt(url.searchParams.get("years") || "11", 10) || 11));

  if (!codes.length && !finds.length) return respond({ error: "Add ?codes= (AMFI scheme codes) or ?find= (fund name)." }, 400, 0);
  if (codes.length + finds.length > MAX_FUNDS) return respond({ error: `Request up to ${MAX_FUNDS} funds at a time.` }, 400, 0);
  const badCode = codes.find(c => !/^\d{3,7}$/.test(c));
  if (badCode) return respond({ error: `"${badCode}" is not a valid AMFI scheme code.` }, 400, 0);
  const badFind = finds.find(f => f.length < 3 || f.length > 80);
  if (badFind !== undefined) return respond({ error: "Fund names must be 3 to 80 characters." }, 400, 0);

  const out = {};

  await Promise.all(codes.map(async code => {
    try { out[code] = await fetchFund(code, years); }
    catch (err) { out[code] = { code, error: String(err.message || err) }; }
  }));

  await Promise.all(finds.map(async name => {
    try {
      const results = await getJson(`${BASE}/mf/search?q=${encodeURIComponent(name)}`);
      const pick = Array.isArray(results) ? pickDirectGrowth(results) : null;
      if (!pick) throw new Error("No Direct Plan, Growth option found for this name");
      out[name] = { ...(await fetchFund(pick.schemeCode, years)), matchedFrom: name };
    } catch (err) {
      out[name] = { query: name, error: String(err.message || err) };
    }
  }));

  const anyFailed = Object.values(out).some(r => r.error);
  return respond({ fetchedAt: new Date().toISOString(), data: out }, 200, anyFailed ? 300 : 21600);
}
