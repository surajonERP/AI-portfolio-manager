// ============================================================
// /api/explain — asks Gemini to explain a finished plan in plain language.
//
// Guardrails:
//  1. The browser sends only COMPUTED RESULTS (never the user's name).
//  2. Gemini is told to use only those facts and never to recommend securities.
//  3. Every number in Gemini's answer is checked against the facts. If any number
//     can't be traced back, the answer is rejected and the site keeps its own text.
//  4. Per-visitor and daily request limits protect the free Gemini quota.
//
// Needs the environment variable GEMINI_API_KEY (set in Vercel, never in code).
// Optional: GEMINI_MODEL to choose the model; the fallbacks below are tried in order.
// ============================================================

// Google retires older models for new users; its error messages name the replacement.
const FALLBACK_MODELS = ["gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-2.5-flash"];
const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const MAX_BODY_BYTES = 8000;
const PER_VISITOR_LIMIT = 8;          // requests per visitor per 10 minutes (per server instance)
const DAILY_LIMIT = 400;              // requests per day (per server instance)
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const visitors = new Map();           // ip -> [timestamps]
const cache = new Map();              // facts hash -> { at, body }
let day = { date: "", count: 0 };

const SYSTEM_PROMPT = `You write the explanation section of an educational portfolio planning tool built on CFA Level 1 concepts, for Indian retail investors with no finance background.

Rules you must follow:
- Use ONLY the facts in the JSON you are given. Every number you write must appear in those facts. Do not calculate new numbers, and do not mention dates, prices, index levels or statistics that are not in the facts.
- Write rupee amounts exactly as whole rupees with Indian digit grouping, for example ₹1,00,000. Never use lakh, crore, k or million.
- Write percentages as given, for example 12.5%.
- Do not recommend, name or rank specific stocks, funds or securities, and never tell the reader to buy or sell anything.
- Do not add greetings, headings, disclaimers, bullet points or markdown. Plain text only.
- Address the reader as "you". Be warm, clear and concrete. Explain any finance term in a few words the first time you use it.

Write exactly four short paragraphs, separated by a blank line, under 230 words in total:
1. The investor's situation: age, amounts, horizon and goal.
2. Why the risk profile came out as it did: risk ability versus risk willingness, and that the lower score sets the profile. Mention the weakest ability factors if they are given.
3. The allocation and the job each part does (growth, diversification, stability, liquidity). If the equity vehicle is individual stocks and a basket was built, say how many stocks and that their average beta matches the target; if it fell back to the index fund, say so briefly. Mention any constraint notes.
4. Whether the target return is realistic for this portfolio, what the projected amount means, and what it is worth in today's money after inflation. If a higher SIP is needed, mention the required SIP.`;

// ---------- helpers ----------
function respond(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

function allowVisitor(ip) {
  const now = Date.now();
  const list = (visitors.get(ip) || []).filter(t => now - t < 10 * 60 * 1000);
  if (list.length >= PER_VISITOR_LIMIT) { visitors.set(ip, list); return false; }
  list.push(now); visitors.set(ip, list);
  if (visitors.size > 5000) visitors.clear();
  return true;
}

function allowToday() {
  const today = new Date().toISOString().slice(0, 10);
  if (day.date !== today) day = { date: today, count: 0 };
  if (day.count >= DAILY_LIMIT) return false;
  day.count++;
  return true;
}

// Every number inside the facts, in the forms a writer might reasonably use
function allowedNumbers(facts) {
  const out = new Set([100]);
  const walk = v => {
    if (typeof v === "number" && isFinite(v)) {
      [v, Math.round(v), Math.round(v * 10) / 10, Math.round(v * 100) / 100].forEach(x => out.add(x));
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
    else if (typeof v === "string") (v.match(/\d[\d,]*(?:\.\d+)?/g) || []).forEach(n => out.add(Number(n.replace(/,/g, ""))));
  };
  walk(facts);
  for (let i = 1; i <= 4; i++) out.add(i);   // "four paragraphs", "CFA Level 1", list counts
  return [...out];
}

function unverifiedNumbers(text, allowed) {
  const found = (text.match(/\d[\d,]*(?:\.\d+)?/g) || []).map(n => Number(n.replace(/,/g, "")));
  return found.filter(x => !allowed.some(a => Math.abs(x - a) <= Math.max(0.051, Math.abs(a) * 0.005)));
}

function cleanParagraphs(text) {
  return text
    .replace(/\*\*|__|^#+\s*/gm, "")
    .split(/\n\s*\n/)
    .map(p => p.replace(/\s*\n\s*/g, " ").trim())
    .filter(p => p.length > 0)
    .slice(0, 6);
}

async function callGemini(model, key, facts) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(`${API_BASE}/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: "Facts (JSON):\n" + JSON.stringify(facts) }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 2048 }
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data?.error?.message || `Gemini responded ${res.status}`);
      err.status = res.status;
      throw err;
    }
    const parts = data?.candidates?.[0]?.content?.parts || [];
    const text = parts.map(p => p.text || "").join("").trim();
    if (!text) throw new Error("Gemini returned no text");
    return text;
  } finally {
    clearTimeout(timer);
  }
}

// ---------- diagnostic: open /api/explain?test=1 in a browser ----------
// Shows whether the key is set and whether Gemini answers, without revealing the key.
export async function GET(request) {
  const url = new URL(request.url);
  const key = process.env.GEMINI_API_KEY;
  const models = [process.env.GEMINI_MODEL, ...FALLBACK_MODELS].filter((m, i, a) => m && a.indexOf(m) === i);
  const report = { keyConfigured: Boolean(key), modelsToTry: models };
  if (!key || url.searchParams.get("test") !== "1") {
    report.hint = key ? "Add ?test=1 to the address to send a tiny test request to Gemini." : "GEMINI_API_KEY is not set for this deployment. Add it in Vercel, then redeploy.";
    return respond(report, 200);
  }
  const ip = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
  if (!allowVisitor(ip) || !allowToday()) return respond({ ...report, error: "Rate limit reached; try again in a few minutes." }, 429);
  report.results = [];
  for (const model of models) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(`${API_BASE}/${encodeURIComponent(model)}:generateContent`, {
        method: "POST", signal: controller.signal,
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "Reply with the single word OK." }] }], generationConfig: { maxOutputTokens: 256 } })
      });
      const data = await res.json().catch(() => ({}));
      const text = (data?.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("").trim();
      report.results.push({ model, status: res.status, ok: res.ok && Boolean(text), reply: text.slice(0, 40) || null, error: data?.error?.message || null });
      if (res.ok && text) break;
    } catch (err) {
      report.results.push({ model, ok: false, error: err.name === "AbortError" ? "Timed out" : String(err.message || err) });
    } finally {
      clearTimeout(timer);
    }
  }
  return respond(report, 200);
}

// ---------- handler ----------
export async function POST(request) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return respond({ error: "AI explanations are not configured on this site.", fallback: true }, 503);

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return respond({ error: "Request too large.", fallback: true }, 413);
  let facts;
  try { facts = JSON.parse(raw).facts; } catch { return respond({ error: "Invalid JSON.", fallback: true }, 400); }
  if (!facts || typeof facts !== "object" || typeof facts.profile !== "string" || !facts.allocationPct) {
    return respond({ error: "Missing plan facts.", fallback: true }, 400);
  }

  const cacheKey = hash(JSON.stringify(facts));
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return respond({ ...hit.body, cached: true }, 200);

  const ip = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
  if (!allowVisitor(ip)) return respond({ error: "Too many explanations requested. Try again in a few minutes.", fallback: true }, 429);
  if (!allowToday()) return respond({ error: "Today's AI explanation limit has been reached.", fallback: true }, 429);

  const models = [process.env.GEMINI_MODEL, ...FALLBACK_MODELS].filter((m, i, a) => m && a.indexOf(m) === i);
  const allowed = allowedNumbers(facts);
  let lastError = "Unknown error";

  for (const model of models) {
    try {
      const text = await callGemini(model, key, facts);
      const paragraphs = cleanParagraphs(text);
      const bad = unverifiedNumbers(paragraphs.join(" "), allowed);
      if (bad.length) {
        lastError = `Rejected: numbers not found in the plan (${bad.slice(0, 5).join(", ")})`;
        continue; // try the next model rather than show an unverified number
      }
      if (paragraphs.length < 2) { lastError = "Answer too short"; continue; }
      const body = { paragraphs, model, verified: true };
      cache.set(cacheKey, { at: Date.now(), body });
      if (cache.size > 500) cache.clear();
      return respond(body, 200);
    } catch (err) {
      lastError = String(err.message || err);
      // wrong model name or model-specific quota: try the next one; auth problems: stop
      if (err.status === 401 || err.status === 403) break;
    }
  }
  return respond({ error: lastError, fallback: true }, 502);
}
