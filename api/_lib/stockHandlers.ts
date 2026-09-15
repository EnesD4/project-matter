import type { IncomingMessage, ServerResponse } from "http";
import {
  mockChartPayload,
  mockHistoryPayload,
  mockProfilePayload,
  mockQuoteForSymbol,
} from "./mockMarket.js";

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

const SEARCH_CATALOG: Array<SearchResult & { aliases?: string[] }> = [
  { symbol: "AAPL", displaySymbol: "AAPL", description: "Apple Inc.", type: "Common Stock", aliases: ["apple"] },
  { symbol: "MSFT", displaySymbol: "MSFT", description: "Microsoft Corp.", type: "Common Stock", aliases: ["microsoft"] },
  { symbol: "NVDA", displaySymbol: "NVDA", description: "NVIDIA Corp.", type: "Common Stock", aliases: ["nvidia"] },
  { symbol: "GOOGL", displaySymbol: "GOOGL", description: "Alphabet Inc.", type: "Common Stock", aliases: ["google", "alphabet"] },
  { symbol: "AMZN", displaySymbol: "AMZN", description: "Amazon.com Inc.", type: "Common Stock", aliases: ["amazon"] },
  { symbol: "META", displaySymbol: "META", description: "Meta Platforms", type: "Common Stock", aliases: ["facebook", "meta"] },
  { symbol: "TSLA", displaySymbol: "TSLA", description: "Tesla Inc.", type: "Common Stock", aliases: ["tesla"] },
  { symbol: "RCAT", displaySymbol: "RCAT", description: "Red Cat Holdings Inc.", type: "Common Stock", aliases: ["red cat", "redcat", "red cat holdings"] },
  { symbol: "NFLX", displaySymbol: "NFLX", description: "Netflix Inc.", type: "Common Stock", aliases: ["netflix"] },
  { symbol: "AMD", displaySymbol: "AMD", description: "Advanced Micro Devices", type: "Common Stock" },
  { symbol: "PLTR", displaySymbol: "PLTR", description: "Palantir Technologies", type: "Common Stock", aliases: ["palantir"] },
  { symbol: "COIN", displaySymbol: "COIN", description: "Coinbase Global", type: "Common Stock", aliases: ["coinbase"] },
  { symbol: "SPY", displaySymbol: "SPY", description: "SPDR S&P 500 ETF", type: "ETF" },
  { symbol: "QQQ", displaySymbol: "QQQ", description: "Invesco QQQ Trust", type: "ETF" },
  { symbol: "VOO", displaySymbol: "VOO", description: "Vanguard S&P 500 ETF", type: "ETF" },
  { symbol: "VTI", displaySymbol: "VTI", description: "Vanguard Total Stock Market", type: "ETF" },
  { symbol: "SCHD", displaySymbol: "SCHD", description: "Schwab US Dividend Equity", type: "ETF", aliases: ["schwab dividend"] },
  { symbol: "VXUS", displaySymbol: "VXUS", description: "Vanguard Total International", type: "ETF" },
  { symbol: "IVV", displaySymbol: "IVV", description: "iShares Core S&P 500 ETF", type: "ETF" },
  { symbol: "VIG", displaySymbol: "VIG", description: "Vanguard Dividend Appreciation", type: "ETF" },
];

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

function normalizeSearchText(value: string | null | undefined): string {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9.\s-]+/g, " ")
    .replace(/\s+/g, " ");
}

function matchesStockQuery(query: string, symbol: string, name: string | null | undefined): boolean {
  const q = normalizeSearchText(query);
  if (!q) return false;
  const sym = normalizeSearchText(symbol);
  const desc = normalizeSearchText(name);
  if (sym.includes(q) || desc.includes(q)) return true;

  const compactQ = q.replace(/[\s.-]+/g, "");
  const compactSym = sym.replace(/[\s.-]+/g, "");
  const compactDesc = desc.replace(/[\s.-]+/g, "");
  if (compactQ && (compactSym.includes(compactQ) || compactDesc.includes(compactQ))) return true;

  const tokens = q.split(" ").filter(Boolean);
  if (tokens.length > 1) {
    return tokens.every((token) => sym.includes(token) || desc.includes(token));
  }
  return false;
}

function catalogMatches(query: string): SearchResult[] {
  // Known catalog only — never invent a fake card for an unrecognized typed ticker.
  return SEARCH_CATALOG.filter((row) =>
    matchesStockQuery(query, row.symbol, [row.description, ...(row.aliases || [])].join(" "))
  )
    .map(({ symbol, displaySymbol, description, type }) => ({
      symbol,
      displaySymbol,
      description,
      type,
    }))
    .slice(0, 8);
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
    .slice(0, 40);
  if (!query) {
    return sendJson(res, 200, []);
  }

  try {
    const yahoo = await fetch(
      `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=8&newsCount=0`,
      { headers: { "User-Agent": "Sprout/1.0" } }
    );
    const json = (await yahoo.json().catch(() => null)) as {
      quotes?: Array<{ symbol?: string; shortname?: string; longname?: string; quoteType?: string }>;
    } | null;
    const remote = (json?.quotes ?? [])
      .map((row) => {
        const symbol = String(row.symbol || "").trim().toUpperCase();
        if (!symbol || symbol.includes("=")) return null;
        const type = String(row.quoteType || "").toUpperCase();
        if (type && !["EQUITY", "ETF", "MUTUALFUND", "INDEX"].includes(type)) return null;
        return {
          symbol,
          displaySymbol: symbol,
          description: String(row.shortname || row.longname || symbol).trim() || symbol,
          type: type === "ETF" ? "ETF" : "Common Stock",
        } satisfies SearchResult;
      })
      .filter((row): row is SearchResult => row != null)
      .slice(0, 8);
    if (remote.length > 0) return sendJson(res, 200, remote);
  } catch {
    // fall through to catalog
  }

  return sendJson(res, 200, catalogMatches(query));
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
    return sendJson(res, 200, { items: [] });
  }

  if (parts[0] === "metrics") {
    const symbol = String(url.searchParams.get("symbol") || "").trim().toUpperCase();
    const quote = mockQuoteForSymbol(symbol);
    return sendJson(res, 200, {
      symbol,
      marketCap: null,
      pe: null,
      eps: null,
      price: quote?.c ?? 0,
      source: "mock",
    });
  }

  if (parts[0] === "analysis") {
    return sendJson(res, 200, {});
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
