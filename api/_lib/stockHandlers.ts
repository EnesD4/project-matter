import type { IncomingMessage, ServerResponse } from "http";
import { GoogleGenAI } from "@google/genai";
import {
  mockChartPayload,
  mockHistoryPayload,
  mockProfilePayload,
  mockQuoteForSymbol,
} from "./mockMarket.js";
import { GEMINI_FLASH_MODEL, getGeminiApiKey, getGeminiModel } from "./env.js";
import { readJsonBody } from "./security.js";
import {
  buildStockBriefingPrompt,
  generateStockBriefing,
  GEMINI_GOOGLE_SEARCH_TOOL,
  type StockBriefingFundamentals,
  type StockBriefingPerformance,
} from "../../src/lib/gemini.js";
import {
  EDUCATIONAL_DISCLAIMER,
  SPROUT_SYSTEM_INSTRUCTION,
} from "../../src/lib/sproutAi.js";
import { isDividendEtf } from "../../src/lib/allocation.js";

function sendJson(res: any, status: number, payload: unknown) {
  if (typeof res.status === "function" && typeof res.json === "function") {
    return res.status(status).json(payload);
  }
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

function urlOf(req: IncomingMessage | { url?: string }): URL {
  try {
    return new URL(req.url || "", "http://localhost");
  } catch {
    return new URL("http://localhost/");
  }
}

function stocksParts(req: IncomingMessage | { url?: string; query?: Record<string, unknown> }): string[] {
  const url = urlOf(req);
  const fromUrl = url.pathname.split("/").filter(Boolean);
  const idx = fromUrl.indexOf("stocks");
  if (idx >= 0) return fromUrl.slice(idx + 1);
  const query = (req as { query?: Record<string, unknown> }).query;
  const path = query?.path;
  if (Array.isArray(path)) return path.map(String);
  if (typeof path === "string") return path.split("/").filter(Boolean);
  return [];
}

const YAHOO_RANGE: Record<string, { interval: string; range: string }> = {
  "1D": { interval: "5m", range: "1d" },
  "1W": { interval: "15m", range: "5d" },
  "1M": { interval: "1d", range: "1mo" },
  YTD: { interval: "1d", range: "ytd" },
  "1Y": { interval: "1d", range: "1y" },
  ALL: { interval: "1wk", range: "5y" },
};

type SearchResult = {
  symbol: string;
  displaySymbol: string;
  description: string;
  type: string;
};

type YahooSearchQuote = {
  symbol?: string;
  shortname?: string;
  longname?: string;
  quoteType?: string;
  exchDisp?: string;
  exchange?: string;
  isYahooFinance?: boolean;
};

type YahooSearchNews = {
  title?: string;
  publisher?: string;
  providerPublishTime?: number;
  link?: string;
};

const YAHOO_SEARCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/json",
};

const US_EXCHANGE_RE =
  /\b(NASDAQ|NYSE|NYSEARCA|NYSE American|AMEX|Cboe|BATS|OTC|OTCQB|OTCQX|PINK)\b/i;

async function yahooChart(symbol: string, range: string) {
  const spec = YAHOO_RANGE[range] || YAHOO_RANGE["1M"];
  const yahoo = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${spec.interval}&range=${spec.range}`,
    { headers: { "User-Agent": "Sprout/1.0" } }
  );
  const json = (await yahoo.json().catch(() => null)) as {
    chart?: {
      result?: Array<{
        timestamp?: number[];
        indicators?: { quote?: Array<{ open?: number[]; high?: number[]; low?: number[]; close?: number[]; volume?: number[] }> };
      }>;
    };
  } | null;
  const result = json?.chart?.result?.[0];
  const timestamps = result?.timestamp || [];
  const quote = result?.indicators?.quote?.[0];
  const points = timestamps
    .map((ts, i) => {
      const close = Number(quote?.close?.[i]);
      const open = Number(quote?.open?.[i]);
      const high = Number(quote?.high?.[i]);
      const low = Number(quote?.low?.[i]);
      const volume = Number(quote?.volume?.[i]);
      const price = Number.isFinite(close) && close > 0 ? close : open;
      if (!Number.isFinite(price) || price <= 0) return null;
      const timestamp = ts * 1000;
      return {
        timestamp,
        date: new Date(timestamp).toISOString(),
        price,
        open: Number.isFinite(open) && open > 0 ? open : price,
        high: Number.isFinite(high) && high > 0 ? high : price,
        low: Number.isFinite(low) && low > 0 ? low : price,
        close: price,
        volume: Number.isFinite(volume) ? volume : 0,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row != null);
  return points;
}

async function yahooQuoteMeta(symbol: string) {
  const yahoo = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`,
    { headers: { "User-Agent": "Sprout/1.0" } }
  );
  const json = (await yahoo.json().catch(() => null)) as {
    chart?: { result?: Array<{ meta?: Record<string, unknown> }> };
  } | null;
  return json?.chart?.result?.[0]?.meta || {};
}

function quoteFromMeta(symbol: string, meta: Record<string, unknown>) {
  const price = Number(meta.regularMarketPrice ?? meta.previousClose ?? 0);
  if (!Number.isFinite(price) || price <= 0) return null;
  const previous = Number(meta.chartPreviousClose ?? meta.previousClose ?? 0);
  const change = previous ? price - previous : 0;
  const changePct = previous ? (change / previous) * 100 : 0;
  return {
    symbol,
    c: price,
    d: Number.isFinite(change) ? change : 0,
    dp: Number.isFinite(changePct) ? changePct : 0,
    h: Number(meta.regularMarketDayHigh ?? 0) || price,
    l: Number(meta.regularMarketDayLow ?? 0) || price,
    o: Number(meta.regularMarketOpen ?? previous ?? 0) || price,
    pc: Number.isFinite(previous) && previous > 0 ? previous : price,
    t: Number(meta.regularMarketTime ?? 0) || Math.floor(Date.now() / 1000),
  };
}

function yahooSearchUrl(query: string, quotesCount: number, newsCount: number): string {
  const params = new URLSearchParams({
    q: query,
    quotesCount: String(quotesCount),
    newsCount: String(newsCount),
    lang: "en-US",
    region: "US",
    enableFuzzyQuery: "true",
    quotesQueryId: "tss_match_phrase_query",
    multiQuoteQueryId: "multi_quote_single_token_query",
    newsQueryId: "news_cie_vespa",
    enableEnhancedTrivialQuery: "true",
  });
  return `https://query2.finance.yahoo.com/v1/finance/search?${params.toString()}`;
}

async function yahooFinanceSearch(query: string, quotesCount = 16, newsCount = 0) {
  const urls = [
    yahooSearchUrl(query, quotesCount, newsCount),
    // query1 mirror — some networks block query2 intermittently.
    yahooSearchUrl(query, quotesCount, newsCount).replace(
      "query2.finance.yahoo.com",
      "query1.finance.yahoo.com"
    ),
  ];
  let lastEmpty = { quotes: [] as YahooSearchQuote[], news: [] as YahooSearchNews[] };
  for (const url of urls) {
    try {
      const response = await fetch(url, { headers: YAHOO_SEARCH_HEADERS });
      if (!response.ok) continue;
      const json = (await response.json().catch(() => null)) as {
        quotes?: YahooSearchQuote[];
        news?: YahooSearchNews[];
      } | null;
      const quotes = Array.isArray(json?.quotes) ? json.quotes : [];
      const news = Array.isArray(json?.news) ? json.news : [];
      lastEmpty = { quotes, news };
      if (quotes.length > 0 || news.length > 0) {
        return { quotes, news };
      }
    } catch {
      // try next host
    }
  }
  return lastEmpty;
}

function mapYahooQuoteToSearchResult(row: YahooSearchQuote): (SearchResult & { rank: number }) | null {
  const symbol = String(row.symbol || "")
    .trim()
    .toUpperCase();
  if (!symbol || symbol.includes("=") || symbol.includes("^")) return null;
  if (row.isYahooFinance === false) return null;

  const type = String(row.quoteType || "").toUpperCase();
  // Accept equities/ETFs/funds; also allow blank quoteType for fuzzy name hits (e.g. Aeva).
  if (type && !["EQUITY", "ETF", "MUTUALFUND", "INDEX"].includes(type)) return null;
  if (type === "INDEX") return null;

  // Prefer primary US listings (AAPL, VOO) over foreign dual listings (AAPL.MX, 1RCAT.MI).
  const hasForeignSuffix = /[.=]/.test(symbol);
  const exch = `${row.exchDisp || ""} ${row.exchange || ""}`;
  const isUsExchange = US_EXCHANGE_RE.test(exch) || (!hasForeignSuffix && !exch.trim());

  let rank = 50;
  if (type === "EQUITY" || type === "ETF" || !type) rank -= 10;
  if (!hasForeignSuffix) rank -= 20;
  if (isUsExchange) rank -= 15;
  if (type === "ETF") rank -= 2;

  return {
    symbol,
    displaySymbol: symbol,
    description: String(row.shortname || row.longname || symbol).trim() || symbol,
    type: type === "ETF" ? "ETF" : type === "MUTUALFUND" ? "Mutual Fund" : "Common Stock",
    rank,
  };
}

function mapYahooNewsHeadlines(
  news: YahooSearchNews[],
  maxAgeDays: number,
  limit: number
): string[] {
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of news) {
    const title = String(item.title || "").trim();
    if (!title) continue;
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    const publishedMs =
      typeof item.providerPublishTime === "number" && item.providerPublishTime > 0
        ? item.providerPublishTime * 1000
        : Date.now();
    if (publishedMs < cutoff) continue;
    seen.add(key);
    const publisher = String(item.publisher || "").trim();
    out.push(publisher ? `${title} (${publisher})` : title);
    if (out.length >= limit) break;
  }
  return out;
}

/** Pull recent Yahoo Finance headlines for 1-week and 1-month briefing windows. */
async function fetchYahooBriefingNews(symbol: string, name: string): Promise<{
  weekHeadlines: string[];
  monthHeadlines: string[];
}> {
  const queries = [symbol, name].map((q) => q.trim()).filter(Boolean);
  const uniqueQueries = [...new Set(queries)];
  const bundles = await Promise.all(
    uniqueQueries.map(async (q) => {
      try {
        return await yahooFinanceSearch(q, 4, 18);
      } catch {
        return { quotes: [] as YahooSearchQuote[], news: [] as YahooSearchNews[] };
      }
    })
  );
  const news = bundles.flatMap((bundle) => bundle.news);
  return {
    weekHeadlines: mapYahooNewsHeadlines(news, 7, 8),
    monthHeadlines: mapYahooNewsHeadlines(news, 30, 12),
  };
}

async function handleQuote(req: IncomingMessage | any, res: ServerResponse | any) {
  const url = urlOf(req);
  const symbol = String(url.searchParams.get("symbol") || "").trim().toUpperCase();
  if (!symbol) {
    return sendJson(res, 400, { error: "Symbol is required", c: 0 });
  }

  try {
    const meta = await yahooQuoteMeta(symbol);
    const quote = quoteFromMeta(symbol, meta);
    if (!quote) {
      // Do not invent catalog prices — let the client use cache or prompt for manual input.
      return sendJson(res, 502, { error: "Failed to fetch stock quote", symbol, c: 0, source: "empty" });
    }
    return sendJson(res, 200, { status: "ok", ...quote, source: "yahoo", data: [] });
  } catch {
    return sendJson(res, 502, { error: "Failed to fetch stock quote", symbol, c: 0, source: "empty" });
  }
}

async function handleQuotes(req: IncomingMessage | any, res: ServerResponse | any) {
  try {
    const url = urlOf(req);
    const symbols = String(url.searchParams.get("symbols") || url.searchParams.get("symbol") || "")
      .split(",")
      .map((item) => item.trim().toUpperCase())
      .filter(Boolean)
      .slice(0, 40);

    if (symbols.length === 0) {
      return sendJson(res, 200, { status: "ok", items: [], data: [] });
    }

    const items = (
      await Promise.all(
        symbols.map(async (symbol) => {
          try {
            const meta = await yahooQuoteMeta(symbol);
            const quote = quoteFromMeta(symbol, meta);
            return quote ? { ...quote, symbol, source: "yahoo" as const } : null;
          } catch {
            return null;
          }
        })
      )
    ).filter((row): row is NonNullable<typeof row> => row != null);
    return sendJson(res, 200, { status: "ok", items, data: items });
  } catch {
    return sendJson(res, 200, { status: "ok", items: [], data: [] });
  }
}

async function handleSearch(req: IncomingMessage | any, res: ServerResponse | any) {
  const url = urlOf(req);
  const query = String(url.searchParams.get("q") || url.searchParams.get("query") || "")
    .trim()
    .slice(0, 64);
  if (!query) {
    return sendJson(res, 200, []);
  }

  try {
    const { quotes } = await yahooFinanceSearch(query, 24, 0);
    const seen = new Set<string>();
    const mapped = quotes
      .map(mapYahooQuoteToSearchResult)
      .filter((row): row is SearchResult & { rank: number } => row != null);

    // If US filters removed everything, still return the best Yahoo hits (never invent cards).
    const preferUs = mapped.filter((row) => !/[.=]/.test(row.symbol));
    const pool = preferUs.length > 0 ? preferUs : mapped;

    const remote = pool
      .sort((a, b) => a.rank - b.rank || a.symbol.localeCompare(b.symbol))
      .filter((row) => {
        if (seen.has(row.symbol)) return false;
        seen.add(row.symbol);
        return true;
      })
      .slice(0, 10)
      .map(({ symbol, displaySymbol, description, type }) => ({
        symbol,
        displaySymbol,
        description,
        type,
      }));
    // Live Yahoo results only — never synthesize fake ticker cards.
    return sendJson(res, 200, remote);
  } catch (error) {
    console.error("Yahoo Finance search failed:", error);
    return sendJson(res, 200, []);
  }
}

const GEMINI_TIMEOUT_MS = 35_000;

type YahooDividendQuote = {
  dividendYield?: number | null;
  dividendRate?: number | null;
  trailingAnnualDividendRate?: number | null;
  trailingAnnualDividendYield?: number | null;
  exDividendDate?: number | null;
};

function asFinite(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function isoFromUnixSeconds(value: unknown): string | null {
  const n = asFinite(value);
  if (n == null || n <= 0) return null;
  const ms = n > 1e12 ? n : n * 1000;
  try {
    return new Date(ms).toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

async function yahooDividendDetails(symbol: string) {
  const ticker = symbol.trim().toUpperCase();
  if (!ticker) return null;
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(ticker)}`,
      { headers: { "User-Agent": "Sprout/1.0" } }
    );
    if (!res.ok) return null;
    const json = (await res.json().catch(() => null)) as {
      quoteResponse?: { result?: YahooDividendQuote[] };
    } | null;
    const quote = json?.quoteResponse?.result?.[0];
    if (!quote) return null;
    const dividendYield = asFinite(quote.dividendYield);
    const dividendRate = asFinite(quote.dividendRate);
    const trailingAnnualDividendRate = asFinite(quote.trailingAnnualDividendRate);
    const trailingAnnualDividendYield = asFinite(quote.trailingAnnualDividendYield);
    const exDividendDate = isoFromUnixSeconds(quote.exDividendDate);
    const pays =
      (dividendYield != null && dividendYield > 0) ||
      (dividendRate != null && dividendRate > 0) ||
      (trailingAnnualDividendRate != null && trailingAnnualDividendRate > 0) ||
      isDividendEtf(ticker);
    if (!pays) {
      return {
        symbol: ticker,
        dividendYield: null,
        dividendRate: null,
        trailingAnnualDividendRate: null,
        trailingAnnualDividendYield: null,
        exDividendDate: null,
        dividendDate: null,
        lastDividendAmount: null,
        frequency: "unknown" as const,
        paymentsPerYear: 0,
        nextExDividendDate: null,
        nextPaymentDate: null,
        estimatedDividendPerShare: null,
        status: "estimated" as const,
      };
    }
    const estimated =
      dividendRate != null && dividendRate > 0
        ? Math.round((dividendRate / 4) * 10000) / 10000
        : trailingAnnualDividendRate != null && trailingAnnualDividendRate > 0
          ? Math.round((trailingAnnualDividendRate / 4) * 10000) / 10000
          : null;
    return {
      symbol: ticker,
      dividendYield: dividendYield ?? trailingAnnualDividendYield,
      dividendRate,
      trailingAnnualDividendRate,
      trailingAnnualDividendYield,
      exDividendDate,
      dividendDate: null,
      lastDividendAmount: estimated,
      frequency: "quarterly" as const,
      paymentsPerYear: 4,
      nextExDividendDate: exDividendDate,
      nextPaymentDate: null,
      estimatedDividendPerShare: estimated,
      status: exDividendDate ? ("confirmed" as const) : ("estimated" as const),
    };
  } catch {
    if (isDividendEtf(ticker)) {
      return {
        symbol: ticker,
        dividendYield: 0.035,
        dividendRate: null,
        trailingAnnualDividendRate: null,
        trailingAnnualDividendYield: 0.035,
        exDividendDate: null,
        dividendDate: null,
        lastDividendAmount: null,
        frequency: "quarterly" as const,
        paymentsPerYear: 4,
        nextExDividendDate: null,
        nextPaymentDate: null,
        estimatedDividendPerShare: null,
        status: "estimated" as const,
      };
    }
    return null;
  }
}

async function buildMetricsSnapshot(symbol: string): Promise<StockBriefingFundamentals & { peTag: string }> {
  const ticker = symbol.trim().toUpperCase();
  const quote = mockQuoteForSymbol(ticker);
  let pe: number | null = null;
  let revenueGrowthYoy: number | null = null;
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=defaultKeyStatistics,financialData,summaryDetail`,
      { headers: { "User-Agent": "Sprout/1.0" } }
    );
    if (res.ok) {
      const json = (await res.json().catch(() => null)) as {
        quoteSummary?: {
          result?: Array<{
            defaultKeyStatistics?: { trailingPE?: { raw?: number }; forwardPE?: { raw?: number } };
            financialData?: {
              revenueGrowth?: { raw?: number };
              totalCash?: { raw?: number };
              totalDebt?: { raw?: number };
              freeCashflow?: { raw?: number };
            };
            summaryDetail?: { trailingPE?: { raw?: number } };
          }>;
        };
      } | null;
      const row = json?.quoteSummary?.result?.[0];
      pe =
        asFinite(row?.summaryDetail?.trailingPE?.raw) ??
        asFinite(row?.defaultKeyStatistics?.trailingPE?.raw) ??
        asFinite(row?.defaultKeyStatistics?.forwardPE?.raw);
      const growthRaw = asFinite(row?.financialData?.revenueGrowth?.raw);
      revenueGrowthYoy = growthRaw != null ? growthRaw * 100 : null;
      return {
        symbol: ticker,
        revenueGrowthYoy,
        cash: asFinite(row?.financialData?.totalCash?.raw),
        debt: asFinite(row?.financialData?.totalDebt?.raw),
        fcf: asFinite(row?.financialData?.freeCashflow?.raw),
        pe,
        peTag: pe == null ? "N/A" : pe < 20 ? "Value" : pe < 35 ? "Fair" : "Premium",
        recommendation: null,
      };
    }
  } catch {
    // fall through
  }
  return {
    symbol: ticker,
    revenueGrowthYoy: null,
    cash: null,
    debt: null,
    fcf: null,
    pe: null,
    peTag: "N/A",
    recommendation: null,
    ...(quote ? { name: quote.name } : {}),
  };
}

async function fetchPerformanceSnapshot(symbol: string): Promise<StockBriefingPerformance> {
  try {
    const [weekPoints, monthPoints] = await Promise.all([
      yahooChart(symbol, "1W"),
      yahooChart(symbol, "1M"),
    ]);
    const pct = (points: Array<{ price: number }>) => {
      if (!points || points.length < 2) return null;
      const first = points[0]?.price;
      const last = points[points.length - 1]?.price;
      if (!(first > 0) || !(last > 0)) return null;
      return ((last - first) / first) * 100;
    };
    return {
      weekChangePct: pct(weekPoints),
      monthChangePct: pct(monthPoints),
    };
  } catch {
    return { weekChangePct: null, monthChangePct: null };
  }
}

async function generateStockAnalysisPayload(body: Record<string, unknown>) {
  const symbol = String(body.symbol || "")
    .trim()
    .toUpperCase();
  if (!symbol) return { error: "Symbol is required", status: 400 as const };
  const name = String(body.name || symbol).trim() || symbol;
  const price = asFinite(body.price) ?? undefined;
  const changePct = asFinite(body.changePct) ?? undefined;
  const positionNote = typeof body.positionNote === "string" ? body.positionNote.trim() : "";

  const [fundamentals, news, performance] = await Promise.all([
    buildMetricsSnapshot(symbol),
    fetchYahooBriefingNews(symbol, name),
    fetchPerformanceSnapshot(symbol),
  ]);

  const unavailable = (message: string) => ({
    status: 503 as const,
    payload: {
      growthDrivers: [] as string[],
      keyRisks: [] as string[],
      analystConsensus: "",
      sentiment: "Hold" as const,
      source: "ai" as const,
      warning: message,
      disclaimer: EDUCATIONAL_DISCLAIMER,
      error: message,
    },
  });

  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    return unavailable("Sprout AI is not configured. Live stock briefings are unavailable.");
  }

  const model = getGeminiModel() || GEMINI_FLASH_MODEL;
  const ai = new GoogleGenAI({ apiKey });
  const briefingInput = {
    symbol,
    name,
    price,
    changePct,
    positionNote,
    fundamentals: { ...fundamentals, name: fundamentals.name || name },
    performance,
    weekHeadlines: news.weekHeadlines,
    monthHeadlines: news.monthHeadlines,
    headlines: news.monthHeadlines,
    systemInstruction: SPROUT_SYSTEM_INSTRUCTION,
  };
  const prompt = buildStockBriefingPrompt(briefingInput);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
    let text = "";
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction: SPROUT_SYSTEM_INSTRUCTION,
          abortSignal: controller.signal,
          httpOptions: { timeout: GEMINI_TIMEOUT_MS },
          tools: [GEMINI_GOOGLE_SEARCH_TOOL],
        },
      });
      text = String(response.text || "").trim();
    } finally {
      clearTimeout(timer);
    }
    const parsed = generateStockBriefing(briefingInput, text);
    if (!parsed) {
      console.error("Sprout stock analysis JSON parse failed. Raw:", text.slice(0, 400));
      return unavailable("Sprout AI returned an incomplete briefing. Please try again.");
    }
    return {
      status: 200 as const,
      payload: { ...parsed, source: "ai" as const, disclaimer: EDUCATIONAL_DISCLAIMER },
    };
  } catch (error) {
    console.error("Error generating Sprout stock analysis:", error);
    return unavailable("Sprout AI was unavailable. Please try again shortly.");
  }
}

export default async function handleStockPath(req: IncomingMessage | any, res: ServerResponse | any) {
  const url = urlOf(req);
  const parts = stocksParts(req);
  const method = String(req.method || "GET").toUpperCase();

  if (parts[0] === "quote") {
    return handleQuote(req, res);
  }

  if (parts[0] === "quotes") {
    return handleQuotes(req, res);
  }

  if (parts[0] === "search") {
    return handleSearch(req, res);
  }

  if (parts[0] === "profile") {
    const symbol = String(url.searchParams.get("symbol") || "").trim().toUpperCase();
    return sendJson(res, 200, mockProfilePayload(symbol));
  }

  if (parts[0] === "dividends") {
    const symbols = String(url.searchParams.get("symbols") || url.searchParams.get("symbol") || "")
      .split(",")
      .map((item) => item.trim().toUpperCase())
      .filter(Boolean)
      .slice(0, 30);
    const items = (
      await Promise.all(symbols.map(async (symbol) => yahooDividendDetails(symbol)))
    ).filter((row): row is NonNullable<typeof row> => row != null);
    return sendJson(res, 200, { items });
  }

  if (parts[0] === "metrics") {
    const symbol = String(url.searchParams.get("symbol") || "").trim().toUpperCase();
    if (!symbol) return sendJson(res, 400, { error: "Symbol is required" });
    const metrics = await buildMetricsSnapshot(symbol);
    return sendJson(res, 200, metrics);
  }

  if (parts[0] === "analysis") {
    if (method !== "POST" && method !== "GET") {
      return sendJson(res, 405, { error: "Method not allowed" });
    }
    try {
      const body =
        method === "POST"
          ? ((await readJsonBody(req)) as Record<string, unknown>)
          : {
              symbol: url.searchParams.get("symbol"),
              name: url.searchParams.get("name"),
            };
      const result = await generateStockAnalysisPayload(body || {});
      if ("error" in result && !("payload" in result)) {
        return sendJson(res, result.status, { error: result.error });
      }
      return sendJson(res, result.status, "payload" in result ? result.payload : result);
    } catch (error) {
      return sendJson(res, 503, {
        growthDrivers: [],
        keyRisks: [],
        analystConsensus: "",
        sentiment: "Hold",
        source: "ai",
        warning: "Sprout AI was unavailable. Please try again shortly.",
        error: "Sprout AI was unavailable. Please try again shortly.",
        disclaimer: EDUCATIONAL_DISCLAIMER,
        detail: error instanceof Error ? error.message : undefined,
      });
    }
  }

  if (parts.length >= 2 && parts[1] === "chart") {
    const symbol = String(parts[0] || "").trim().toUpperCase();
    const range = String(url.searchParams.get("range") || "1M");
    if (!symbol) return sendJson(res, 400, { error: "Symbol is required", points: [] });
    try {
      const points = await yahooChart(symbol, range);
      if (points.length > 0) {
        return sendJson(res, 200, { symbol, range, interval: range === "1D" ? "5m" : "1d", source: "yahoo", points });
      }
    } catch {
      // fall through to mock
    }
    return sendJson(res, 200, mockChartPayload(symbol, range));
  }

  if (parts.length >= 2 && parts[1] === "history") {
    const symbol = String(parts[0] || "").trim().toUpperCase();
    const date = String(url.searchParams.get("date") || "");
    return sendJson(res, 200, mockHistoryPayload(symbol, date));
  }

  if (method === "GET") {
    return sendJson(res, 404, { error: "Not found" });
  }
  return sendJson(res, 404, { error: "Not found" });
}
