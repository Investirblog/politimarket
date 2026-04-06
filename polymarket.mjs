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

// Marchés politiques à surveiller
const WATCHED_MARKETS = [
  // Midterms
  { slug:"republicans-win-house-2026",     label:"Républicains remportent la Chambre (2026)",   category:"🇺🇸 Midterms 2026",                   emoji:"🏛️" },
  { slug:"democrats-win-house-2026",       label:"Démocrates remportent la Chambre (2026)",     category:"🇺🇸 Midterms 2026",                   emoji:"🏛️" },
  { slug:"republicans-win-senate-2026",    label:"Républicains remportent le Sénat (2026)",     category:"🇺🇸 Midterms 2026",                   emoji:"🏛️" },
  { slug:"democrats-win-senate-2026",      label:"Démocrates remportent le Sénat (2026)",       category:"🇺🇸 Midterms 2026",                   emoji:"🏛️" },
  // Trump
  { slug:"trump-impeached",                label:"Trump mis en accusation",                     category:"🇺🇸 Trump & politique US",             emoji:"⚖️" },
  { slug:"trump-approval-above-50",        label:"Cote de Trump dépasse 50%",                  category:"🇺🇸 Trump & politique US",             emoji:"📊" },
  { slug:"trump-tariffs-paused-2026",      label:"Trump suspend ses tarifs douaniers",          category:"🇺🇸 Trump & politique US",             emoji:"🚢" },
  // France
  { slug:"le-pen-wins-2027",               label:"Le Pen gagne la présidentielle 2027",         category:"🇫🇷 France",                           emoji:"🇫🇷" },
  { slug:"macron-resigns-2026",            label:"Macron démissionne en 2026",                  category:"🇫🇷 France",                           emoji:"🇫🇷" },
  { slug:"france-snap-election-2026",      label:"Élections législatives anticipées en France", category:"🇫🇷 France",                           emoji:"🗳️" },
  // Europe
  { slug:"ukraine-ceasefire-2026",         label:"Cessez-le-feu en Ukraine en 2026",            category:"🇩🇪 🇬🇧 🇪🇺 Reste de l'Europe",       emoji:"🕊️" },
  { slug:"germany-far-right-coalition",    label:"Coalition d'extrême droite en Allemagne",     category:"🇩🇪 🇬🇧 🇪🇺 Reste de l'Europe",       emoji:"🇩🇪" },
  { slug:"eu-breaks-up-2030",              label:"Un pays quitte l'Union européenne avant 2030",category:"🇩🇪 🇬🇧 🇪🇺 Reste de l'Europe",       emoji:"🇪🇺" },
  // Macro
  { slug:"us-recession-2026",              label:"Récession aux États-Unis en 2026",            category:"📉 Économie & Banques centrales",       emoji:"📉" },
  { slug:"fed-cut-rates-june-2026",        label:"La Fed baisse ses taux en juin 2026",         category:"📉 Économie & Banques centrales",       emoji:"🏦" },
  { slug:"ecb-rate-cut-q2-2026",           label:"La BCE baisse ses taux au T2 2026",           category:"📉 Économie & Banques centrales",       emoji:"🏦" },
  { slug:"us-unemployment-above-5",        label:"Chômage US dépasse 5% en 2026",               category:"📉 Économie & Banques centrales",       emoji:"📊" },
  // Indices
  { slug:"sp500-above-6000-end-2026",      label:"S&P 500 au-dessus de 6 000 fin 2026",         category:"📊 Indices boursiers",                  emoji:"📈" },
  { slug:"sp500-bear-market-2026",         label:"S&P 500 en bear market en 2026",              category:"📊 Indices boursiers",                  emoji:"🐻" },
  { slug:"nasdaq-bear-market-2026",        label:"Nasdaq en bear market en 2026",               category:"📊 Indices boursiers",                  emoji:"🐻" },
  { slug:"cac40-above-8000-end-2026",      label:"CAC 40 au-dessus de 8 000 fin 2026",          category:"📊 Indices boursiers",                  emoji:"🇫🇷" },
  // Commodities
  { slug:"gold-above-3500-2026",           label:"Or dépasse 3 500 $/oz en 2026",               category:"🥇 Matières premières & Crypto",        emoji:"🥇" },
  { slug:"oil-brent-above-90-2026",        label:"Pétrole Brent dépasse 90$ en 2026",           category:"🥇 Matières premières & Crypto",        emoji:"🛢️" },
  { slug:"bitcoin-above-100k-2026",        label:"Bitcoin dépasse 100 000$ en 2026",            category:"🥇 Matières premières & Crypto",        emoji:"₿"  },
  { slug:"bitcoin-above-200k-2026",        label:"Bitcoin dépasse 200 000$ en 2026",            category:"🥇 Matières premières & Crypto",        emoji:"₿"  },
  // Géopolitique
  { slug:"israel-iran-war-2026",           label:"Conflit militaire direct Israël-Iran en 2026",category:"🌍 Géopolitique",                       emoji:"⚔️" },
  { slug:"north-korea-missile-2026",       label:"Tir de missile nord-coréen vers le Japon",   category:"🌍 Géopolitique",                       emoji:"🚀" },
  { slug:"taiwan-crisis-2026",             label:"Crise militaire dans le détroit de Taïwan",  category:"🌍 Géopolitique",                       emoji:"🇹🇼" },
  { slug:"iran-nuclear-deal-2026",         label:"Accord nucléaire avec l'Iran en 2026",       category:"🌍 Géopolitique",                       emoji:"☢️" },
  // Tech & IA
  { slug:"openai-ipo-2026",               label:"Introduction en bourse d'OpenAI en 2026",    category:"💻 Tech & Intelligence artificielle",   emoji:"🤖" },
  { slug:"ai-regulation-us-2026",         label:"Loi fédérale sur l'IA aux États-Unis en 2026",category:"💻 Tech & Intelligence artificielle",  emoji:"⚖️" },
  { slug:"elon-musk-leaves-doge-2026",    label:"Elon Musk quitte le DOGE en 2026",           category:"💻 Tech & Intelligence artificielle",   emoji:"🚀" },
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

      // Historique 7j pour les marchés qui ont un tokenId
      const historyMap = {};
      await Promise.all(
        watchedResults
          .filter(r => r.market && r.market.clobTokenIds)
          .map(async r => {
            try {
              const ids = JSON.parse(r.market.clobTokenIds);
              const tokenId = ids[0];
              const hist = await fetchPriceHistory(tokenId);
              if (hist && hist.length >= 2) {
                // Extraire juste les prix (un point par jour sur 7j)
                const step = Math.floor(hist.length / 7) || 1;
                historyMap[r.slug] = hist
                  .filter((_, i) => i % step === 0)
                  .slice(-7)
                  .map(h => parseFloat(h.p));
              }
            } catch {}
          })
      );

      return new Response(JSON.stringify({
        watched: watchedResults.filter(m => m.market !== null),
        top: topMarkets.slice(0, 12).map(m => ({
          slug: m.slug,
          question: m.question,
          outcomePrices: m.outcomePrices,
          outcomes: m.outcomes,
          volume: m.volume,
          endDate: m.endDate,
        })),
        history: historyMap,
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
