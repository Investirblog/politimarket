// Netlify Function : proxy vers Polymarket Gamma API
// Cache mémoire 15 minutes pour éviter de surcharger l'API

const GAMMA_API = "https://gamma-api.polymarket.com";

// Cache simple en mémoire (persiste tant que la Function est chaude)
const cache = new Map();
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

function fromCache(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function toCache(key, data) {
  cache.set(key, { ts: Date.now(), data });
}

// Marchés politiques à surveiller (slugs Polymarket)
// Format: { slug, label, category, emoji }
const WATCHED_MARKETS = [
  // US politique
  { slug: "republicans-win-house-2026",           label: "GOP remporte la Chambre (2026)",     category: "🇺🇸 Midterms 2026", emoji: "🏛️" },
  { slug: "republicans-win-senate-2026",          label: "GOP remporte le Sénat (2026)",       category: "🇺🇸 Midterms 2026", emoji: "🏛️" },
  { slug: "democrats-win-house-2026",             label: "Démocrates remportent la Chambre",   category: "🇺🇸 Midterms 2026", emoji: "🏛️" },
  { slug: "trump-approval-above-50-q2-2026",      label: "Cote de Trump > 50% au T2 2026",     category: "🇺🇸 Trump", emoji: "📊" },
  { slug: "trump-impeached",                      label: "Trump mis en accusation",             category: "🇺🇸 Trump", emoji: "⚖️" },
  { slug: "us-recession-2025",                    label: "Récession US en 2025",                category: "📉 Macro", emoji: "📉" },
  { slug: "fed-cut-rates-june-2026",              label: "Fed baisse ses taux en juin 2026",   category: "📉 Macro", emoji: "🏦" },
  // Europe
  { slug: "marine-le-pen-wins-2027-french-presidential-election", label: "Le Pen gagne la présidentielle 2027", category: "🇪🇺 Europe", emoji: "🇫🇷" },
  { slug: "macron-resigns-2026",                  label: "Macron démissionne en 2026",         category: "🇪🇺 Europe", emoji: "🇫🇷" },
  { slug: "germany-snap-election-2025",           label: "Élections anticipées en Allemagne",  category: "🇪🇺 Europe", emoji: "🇩🇪" },
];

async function fetchMarket(slug) {
  const cacheKey = `market:${slug}`;
  const cached = fromCache(cacheKey);
  if (cached) return cached;

  const url = `${GAMMA_API}/markets?slug=${encodeURIComponent(slug)}`;
  const res = await fetch(url, {
    headers: { "Accept": "application/json", "User-Agent": "PolitiMarket/1.0" }
  });

  if (!res.ok) return null;

  const data = await res.json();
  const market = Array.isArray(data) ? data[0] : data;
  if (!market) return null;

  const result = {
    slug,
    question: market.question,
    outcomePrices: market.outcomePrices,  // JSON string "[0.88, 0.12]"
    outcomes: market.outcomes,            // JSON string "[\"Yes\",\"No\"]"
    volume: market.volume,
    liquidity: market.liquidity,
    endDate: market.endDate,
    active: market.active,
    closed: market.closed,
  };

  toCache(cacheKey, result);
  return result;
}

// Fetch enriched : récupère aussi l'historique 7j des prix
async function fetchPriceHistory(tokenId) {
  if (!tokenId) return null;
  const cacheKey = `history:${tokenId}`;
  const cached = fromCache(cacheKey);
  if (cached) return cached;

  const endTs = Math.floor(Date.now() / 1000);
  const startTs = endTs - 7 * 24 * 3600;
  const url = `${GAMMA_API}/prices-history?market=${tokenId}&startTs=${startTs}&endTs=${endTs}&fidelity=60`;

  try {
    const res = await fetch(url, { headers: { "Accept": "application/json" } });
    if (!res.ok) return null;
    const data = await res.json();
    toCache(cacheKey, data.history || []);
    return data.history || [];
  } catch {
    return null;
  }
}

// Fetch top marchés politiques via tag
async function fetchTopPoliticsMarkets(limit = 20) {
  const cacheKey = `top-politics:${limit}`;
  const cached = fromCache(cacheKey);
  if (cached) return cached;

  const url = `${GAMMA_API}/markets?tag_slug=politics&limit=${limit}&active=true&closed=false&order=volume&ascending=false`;
  try {
    const res = await fetch(url, { headers: { "Accept": "application/json" } });
    if (!res.ok) return [];
    const data = await res.json();
    const markets = Array.isArray(data) ? data : [];
    toCache(cacheKey, markets);
    return markets;
  } catch {
    return [];
  }
}

export default async function handler(req) {
  const url = new URL(req.url);
  const action = url.searchParams.get("action") || "dashboard";

  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "public, max-age=900", // 15min browser cache
  };

  try {
    if (action === "dashboard") {
      // Charge les marchés surveillés + les top marchés politique
      const [watchedResults, topMarkets] = await Promise.all([
        Promise.all(WATCHED_MARKETS.map(async (def) => {
          const market = await fetchMarket(def.slug);
          return { ...def, market };
        })),
        fetchTopPoliticsMarkets(20),
      ]);

      return new Response(JSON.stringify({
        watched: watchedResults.filter(m => m.market !== null),
        top: topMarkets.slice(0, 10).map(m => ({
          slug: m.slug,
          question: m.question,
          outcomePrices: m.outcomePrices,
          outcomes: m.outcomes,
          volume: m.volume,
          endDate: m.endDate,
        })),
        cachedAt: new Date().toISOString(),
      }), { status: 200, headers });
    }

    if (action === "market") {
      const slug = url.searchParams.get("slug");
      if (!slug) return new Response(JSON.stringify({ error: "slug required" }), { status: 400, headers });
      const market = await fetchMarket(slug);
      if (!market) return new Response(JSON.stringify({ error: "market not found" }), { status: 404, headers });
      return new Response(JSON.stringify(market), { status: 200, headers });
    }

    if (action === "search") {
      const q = url.searchParams.get("q") || "";
      const url2 = `${GAMMA_API}/markets?_search=${encodeURIComponent(q)}&limit=10&active=true`;
      const res = await fetch(url2, { headers: { "Accept": "application/json" } });
      const data = await res.json();
      return new Response(JSON.stringify(Array.isArray(data) ? data : []), { status: 200, headers });
    }

    return new Response(JSON.stringify({ error: "unknown action" }), { status: 400, headers });

  } catch (err) {
    console.error("Polymarket proxy error:", err);
    return new Response(JSON.stringify({ error: "proxy error", detail: err.message }), { status: 500, headers });
  }
}
