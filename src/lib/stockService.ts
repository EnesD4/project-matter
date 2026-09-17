import { allowClientMockFallback, apiUrl } from "./apiBase";
import { clearbitLogoUrl, extractWebsiteDomain } from "./assetLogos";
import { DEMO_TICKER_CATALOG } from "./demoScenarios";
import { getCachedQuote, setCachedChart, setCachedQuote, setCachedSpark } from "./marketCache";
import {
  buildHistoricalSeries,
  ChartCandle,
  chartPointsToSeries,
  RangeOption,
  SeriesPoint,
} from "./priceSimulation";
import { catalogSearchText, US_STOCK_SEARCH_CATALOG } from "./usStockCatalog";

export type StockQuote = {
  c: number;
  d: number;
  dp: number;
  h: number;
  l: number;
  o: number;
  pc: number;
  t: number;
  dividendYield?: number | null;
  dividendRate?: number | null;
  exDividendDate?: string | null;
  dividendDate?: string | null;
  source?: string;
};

export type StockProfile = {
  name?: string;
  logo?: string;
  weburl?: string;
  marketCapitalization?: number;
  finnhubIndustry?: string;
  domain?: string;
  type?: string;
};

export type StockSearchResult = {
  symbol: string;
  displaySymbol: string;
  description: string;
  type: string;
};

export type StockChartResponse = {
  symbol: string;
  range: RangeOption;
  source?: string;
  points: ChartCandle[];
};

export type HistoricalClose = {
  symbol: string;
  requestedDate: string;
  date: string | null;
  price: number | null;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  source?: string;
};

const LIVE_CHART_SOURCES = new Set(["polygon", "yahoo", "finnhub"]);
const LIVE_QUOTE_SOURCES = new Set(["polygon", "yahoo", "finnhub"]);

export function isLiveChartSource(source?: string | null): boolean {
  return Boolean(source && LIVE_CHART_SOURCES.has(source));
}

/** True when the quote came from a live market API (not mock / local cache). */
export function isLiveQuoteSource(source?: string | null): boolean {
  return Boolean(source && LIVE_QUOTE_SOURCES.has(source));
}

/** Trim + uppercase ticker symbols so "aapl" and " AAPL " resolve the same. */
export function normalizeSymbol(symbol: string | null | undefined): string {
  return String(symbol || "")
    .trim()
    .toUpperCase();
}

export { clearbitLogoUrl, extractWebsiteDomain };

export type QuoteFetchFailureReason = "rate_limited" | "empty" | "http_error" | "network" | "invalid";

type ApiGetResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: QuoteFetchFailureReason; status?: number };

async function readJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function apiGet<T>(url: string, signal?: AbortSignal): Promise<ApiGetResult<T>> {
  try {
    const res = await fetch(url, { signal });
    if (res.status === 429) {
      return { ok: false, reason: "rate_limited", status: 429 };
    }
    if (!res.ok) {
      return { ok: false, reason: "http_error", status: res.status };
    }
    const data = await readJson<T>(res);
    if (data == null) return { ok: false, reason: "empty", status: res.status };
    return { ok: true, data };
  } catch (err) {
    if ((err as Error)?.name === "AbortError") throw err;
    return { ok: false, reason: "network" };
  }
}

async function safeApiGet<T>(url: string, signal?: AbortSignal): Promise<T | null> {
  const result = await apiGet<T>(url, signal);
  return result.ok ? result.data : null;
}

function quoteFromLocalCache(ticker: string): StockQuote | null {
  const cached = getCachedQuote(ticker);
  if (!cached || !(cached.price > 0)) return null;
  return {
    c: cached.price,
    d: cached.price * ((cached.changePct || 0) / 100),
    dp: cached.changePct || 0,
    h: cached.price,
    l: cached.price,
    o: cached.price,
    pc: cached.price,
    t: Math.floor((cached.updatedAt || Date.now()) / 1000),
    source: "cache",
  };
}

/**
 * Live → local cache → optional demo mock (never cached as live).
 * Hardcoded catalog prices must not overwrite a valid cached / user mark.
 */
function fallbackQuote(ticker: string): StockQuote | null {
  const cached = quoteFromLocalCache(ticker);
  if (cached) return cached;
  // Local/dev demos only — production returns null so the UI can prompt for manual input.
  if (!allowClientMockFallback()) return null;
  return mockQuoteForSymbol(ticker);
}

export type NormalizedStockData = {
  symbol: string;
  name: string;
  price: number;
  change: number;
  change_percent: number;
  high: number;
  low: number;
  volume: number;
  shares: number;
  total_value: number;
};

/** Coerce API / form numerics so NaN/undefined never reach charts or formatters. */
function finiteNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Resolve live/market mark from API payloads.
 * Prefer Polygon close (`c` / `close` / `vw`), then explicit current_price fields,
 * then generic price — never invent a static default (e.g. 100).
 */
export function resolveLiveMark(raw: Record<string, any> | null | undefined, fallback = 0): number {
  const row = raw ?? {};
  const candidates = [
    row.c,
    row.close,
    row.vw,
    row.current_price,
    row.currentPrice,
    row.last,
    row.regularMarketPrice,
    row.price,
  ];
  for (const candidate of candidates) {
    const live = finiteNumber(candidate);
    if (live > 0) return live;
  }
  return finiteNumber(fallback);
}

/**
 * Mandatory sanitizer before any stock enters React state, tables, or Recharts.
 * Guarantees finite numerics — never undefined/NaN on price/shares/change fields.
 *
 * `price` / `current_price` are the live market mark (API `c`).
 * `buy_price` is cost basis only and must not override a live quote.
 */
export function sanitizeSafeStock<T extends Record<string, any>>(rawStock: T | null | undefined): T & {
  price: number;
  shares: number;
  buy_price: number;
  current_price: number;
  change: number;
  change_percent: number;
  total_value: number;
} {
  const raw = (rawStock ?? {}) as Record<string, any>;
  const shares = finiteNumber(raw?.shares ?? raw?.quantity ?? 0);
  const buy_price = finiteNumber(raw?.buy_price ?? raw?.buyPrice ?? raw?.avgCost ?? 0);
  // Live quote fields (`c` / current_price) win over generic `price`, which callers
  // often set to the fill/buy price and must not clobber Polygon marks.
  const current_price = resolveLiveMark(raw, buy_price);
  const price = current_price;
  const change = finiteNumber(raw?.change ?? raw?.d ?? 0);
  const change_percent = finiteNumber(raw?.change_percent ?? raw?.dp ?? 0);
  const total_value = finiteNumber(raw?.total_value ?? price * shares);
  return {
    ...raw,
    price,
    shares,
    buy_price,
    buyPrice: buy_price,
    current_price,
    currentPrice: current_price,
    change,
    change_percent,
    total_value,
  } as unknown as T & {
    price: number;
    shares: number;
    buy_price: number;
    current_price: number;
    change: number;
    change_percent: number;
    total_value: number;
  };
}

/**
 * Strict normalizer for Polygon / Yahoo / Finnhub / manual payloads.
 * Always returns finite numbers and uppercase symbol — never undefined fields.
 */
export const normalizeStockData = (raw: any): NormalizedStockData => {
  const safe = sanitizeSafeStock(raw);
  const symbol = normalizeSymbol(safe?.symbol || raw?.ticker || "");
  // Prefer sanitized live mark (already mapped from Polygon `c` / current_price).
  const price = finiteNumber(safe.current_price ?? safe.price ?? resolveLiveMark(raw));
  const shares = finiteNumber(safe.shares);
  return {
    symbol,
    name: String(raw?.name || raw?.companyName || raw?.description || symbol || "Unknown Stock"),
    price,
    change: finiteNumber(safe.change),
    change_percent: finiteNumber(safe.change_percent),
    high: finiteNumber(raw?.high ?? raw?.h ?? 0),
    low: finiteNumber(raw?.low ?? raw?.l ?? 0),
    volume: finiteNumber(raw?.volume ?? raw?.v ?? 0),
    shares,
    total_value: finiteNumber(safe.total_value ?? price * shares),
  };
};

/** Map mixed quote payloads into the Finnhub-shaped StockQuote used by the UI. */
export function normalizeToStockQuote(raw: any, fallbackSymbol = ""): StockQuote | null {
  if (!raw || typeof raw !== "object") return null;
  const normalized = normalizeStockData({
    ...raw,
    symbol: raw.symbol || raw.ticker || fallbackSymbol,
  });
  if (!(normalized.price > 0)) return null;
  const price = normalized.price;
  const change = normalized.change;
  const open = finiteNumber(raw.o ?? raw.open ?? price);
  const prevClose = finiteNumber(raw.pc ?? raw.prevClose ?? raw.previousClose ?? price - change);
  return {
    c: price,
    d: change,
    dp: normalized.change_percent,
    h: normalized.high > 0 ? normalized.high : price,
    l: normalized.low > 0 ? normalized.low : price,
    o: open > 0 ? open : price,
    pc: prevClose > 0 ? prevClose : price,
    t: finiteNumber(raw.t ?? Math.floor(Date.now() / 1000)),
    dividendYield: raw.dividendYield ?? null,
    dividendRate: raw.dividendRate ?? null,
    exDividendDate: raw.exDividendDate ?? null,
    dividendDate: raw.dividendDate ?? null,
    source: typeof raw.source === "string" ? raw.source : undefined,
  };
}

function cacheAndReturnQuote(ticker: string, data: StockQuote): StockQuote {
  const quote = normalizeToStockQuote(data, ticker) ?? data;
  // Never persist mock/catalog marks into the live quote cache — they override real inputs.
  if (quote.source !== "mock" && quote.c > 0) {
    setCachedQuote(ticker, { price: quote.c, changePct: quote.dp ?? 0 });
  }
  return quote;
}

export async function fetchStockQuote(
  symbol: string,
  signal?: AbortSignal
): Promise<StockQuote | null> {
  const ticker = normalizeSymbol(symbol);
  if (!ticker) return null;
  try {
    const result = await apiGet<unknown>(
      `${apiUrl("/api/stocks/quote")}?symbol=${encodeURIComponent(ticker)}`,
      signal
    );
    if (result.ok) {
      const quote = normalizeToStockQuote(result.data, ticker);
      if (quote && quote.c > 0) {
        // Reject mock payloads from the API when a fresher local cache already exists —
        // hardcoded catalog defaults must not clobber a valid mark.
        if (quote.source === "mock") {
          const cached = quoteFromLocalCache(ticker);
          if (cached) return cached;
          if (!allowClientMockFallback()) return null;
          return quote;
        }
        return cacheAndReturnQuote(ticker, quote);
      }
      // Empty / zero price body
      return fallbackQuote(ticker);
    }
    // 429 / HTTP / network — prefer cache, then optional local-demo mock only.
    return fallbackQuote(ticker);
  } catch (err) {
    if ((err as Error)?.name === "AbortError") throw err;
    return fallbackQuote(ticker);
  }
}

export async function fetchStockQuotes(
  symbols: string[],
  signal?: AbortSignal
): Promise<Map<string, StockQuote>> {
  const unique = [...new Set(symbols.map((s) => normalizeSymbol(s)).filter(Boolean))];
  const out = new Map<string, StockQuote>();
  if (unique.length === 0) return out;

  if (unique.length > 1) {
    try {
      const result = await apiGet<{ items?: Array<Record<string, unknown> & { symbol?: string }> }>(
        `${apiUrl("/api/stocks/quotes")}?symbols=${encodeURIComponent(unique.join(","))}`,
        signal
      );
      if (result.ok) {
        for (const item of result.data?.items ?? []) {
          const ticker = normalizeSymbol(String(item.symbol || item.ticker || ""));
          const quote = normalizeToStockQuote(item, ticker);
          if (!ticker || !quote || !(quote.c > 0)) continue;
          if (quote.source === "mock") {
            const cached = quoteFromLocalCache(ticker);
            if (cached) {
              out.set(ticker, cached);
              continue;
            }
            if (!allowClientMockFallback()) continue;
            out.set(ticker, quote);
            continue;
          }
          out.set(ticker, quote);
          setCachedQuote(ticker, { price: quote.c, changePct: quote.dp ?? 0 });
        }
      }
    } catch (err) {
      if ((err as Error)?.name === "AbortError") throw err;
      // fall through to per-symbol fetches
    }
  }

  const missing = unique.filter((ticker) => !out.has(ticker));
  await Promise.all(
    missing.map(async (ticker) => {
      try {
        const quote = await fetchStockQuote(ticker, signal);
        if (quote) out.set(ticker, quote);
      } catch (err) {
        if ((err as Error)?.name === "AbortError") throw err;
        const cached = fallbackQuote(ticker);
        if (cached) out.set(ticker, cached);
      }
    })
  );
  return out;
}

export async function fetchStockProfile(
  symbol: string,
  signal?: AbortSignal
): Promise<StockProfile | null> {
  const ticker = normalizeSymbol(symbol);
  if (!ticker) return null;
  try {
    const data = await safeApiGet<StockProfile>(
      `${apiUrl("/api/stocks/profile")}?symbol=${encodeURIComponent(ticker)}`,
      signal
    );
    if (data) {
      const domain = data.domain || extractWebsiteDomain(data.weburl);
      return {
        ...data,
        domain,
        logo: data.logo || (domain ? clearbitLogoUrl(domain) : undefined),
      };
    }
  } catch {
    // fall through to catalog
  }
  return mockProfileForSymbol(ticker);
}

/** Normalize free-text queries/names for case-insensitive ticker + company matching. */
export function normalizeSearchText(value: string | null | undefined): string {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9.\s-]+/g, " ")
    .replace(/\s+/g, " ");
}

/**
 * Match a search query against ticker symbol and/or company name.
 * Supports "AAPL", "apple", "red cat", and spaced company fragments.
 */
export function matchesStockQuery(
  query: string,
  symbol: string,
  name: string | null | undefined
): boolean {
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

function searchRelevance(query: string, symbol: string, name: string): number {
  const q = normalizeSearchText(query);
  const sym = normalizeSearchText(symbol);
  const desc = normalizeSearchText(name);
  if (!q) return 99;
  if (sym === q) return 0;
  if (sym.startsWith(q)) return 1;
  if (sym.includes(q)) return 2;
  if (desc.startsWith(q)) return 3;
  if (desc.includes(q)) return 4;
  const compactQ = q.replace(/[\s.-]+/g, "");
  if (compactQ && sym.replace(/[\s.-]+/g, "").includes(compactQ)) return 5;
  if (compactQ && desc.replace(/[\s.-]+/g, "").includes(compactQ)) return 6;
  return 7;
}

function asSearchResult(row: Partial<StockSearchResult> | null | undefined): StockSearchResult | null {
  const symbol = normalizeSymbol(row?.displaySymbol || row?.symbol || "");
  if (!symbol) return null;
  return {
    symbol,
    displaySymbol: symbol,
    description: String(row?.description || symbol).trim() || symbol,
    type: String(row?.type || "").trim(),
  };
}

function parseSearchPayload(data: unknown): StockSearchResult[] {
  if (!data) return [];
  const rows = Array.isArray(data)
    ? data
    : Array.isArray((data as { result?: unknown }).result)
      ? (data as { result: unknown[] }).result
      : Array.isArray((data as { items?: unknown }).items)
        ? (data as { items: unknown[] }).items
        : [];
  const seen = new Set<string>();
  const out: StockSearchResult[] = [];
  for (const row of rows) {
    const next = asSearchResult(row as Partial<StockSearchResult>);
    if (!next || seen.has(next.symbol)) continue;
    seen.add(next.symbol);
    out.push(next);
  }
  return out;
}

function mergeSearchResults(query: string, ...groups: StockSearchResult[][]): StockSearchResult[] {
  const seen = new Set<string>();
  const merged: StockSearchResult[] = [];
  for (const group of groups) {
    for (const row of group) {
      if (!row?.symbol || seen.has(row.symbol)) continue;
      seen.add(row.symbol);
      merged.push(row);
    }
  }
  return merged
    .sort((a, b) => {
      const aMatch = matchesStockQuery(query, a.symbol, a.description) ? 0 : 1;
      const bMatch = matchesStockQuery(query, b.symbol, b.description) ? 0 : 1;
      if (aMatch !== bMatch) return aMatch - bMatch;
      return (
        searchRelevance(query, a.symbol, a.description) -
        searchRelevance(query, b.symbol, b.description)
      );
    })
    .slice(0, 8);
}

/**
 * Instant local matches from the US stock/ETF dictionary (ticker + company name + aliases).
 * Never invents unknown tickers — unknown queries return [] so the UI can show "No stocks found".
 */
export function localTickerMatches(query: string): StockSearchResult[] {
  const raw = String(query || "").trim();
  if (!raw) return [];

  const fromSearchCatalog = US_STOCK_SEARCH_CATALOG.filter((entry) =>
    matchesStockQuery(raw, entry.symbol, catalogSearchText(entry))
  ).map((entry) => ({
    symbol: entry.symbol,
    displaySymbol: entry.symbol,
    description: entry.name,
    type: entry.type,
  }));

  // Merge demo catalog names so lesson/demo tickers stay searchable even if omitted above.
  const seen = new Set(fromSearchCatalog.map((row) => row.symbol));
  for (const [symbol, meta] of Object.entries(DEMO_TICKER_CATALOG)) {
    if (seen.has(symbol)) continue;
    if (!matchesStockQuery(raw, symbol, meta.name)) continue;
    seen.add(symbol);
    fromSearchCatalog.push({
      symbol,
      displaySymbol: symbol,
      description: meta.name,
      type: "Common Stock",
    });
  }

  return fromSearchCatalog
    .sort(
      (a, b) =>
        searchRelevance(raw, a.symbol, a.description) - searchRelevance(raw, b.symbol, b.description)
    )
    .slice(0, 8);
}

const MOCK_DAY_CHANGE: Record<string, number> = {
  AAPL: 0.42,
  NVDA: 1.15,
  TSLA: -0.68,
  MSFT: 0.31,
  GOOGL: 0.22,
  AMZN: 0.18,
  META: 0.55,
  RCAT: 0.35,
  SPY: 0.21,
  QQQ: 0.38,
  VOO: 0.19,
};

export function mockQuoteForSymbol(symbol: string, fallbackPrice?: number): StockQuote | null {
  const ticker = normalizeSymbol(symbol);
  if (!ticker) return null;
  const known = DEMO_TICKER_CATALOG[ticker];
  // Catalog or caller-supplied mark only — never invent a static $100 default.
  const price = finiteNumber(known?.buyPrice ?? fallbackPrice);
  if (!(price > 0)) return null;
  const dp = MOCK_DAY_CHANGE[ticker] ?? 0;
  const d = price * (dp / 100);
  const pc = price - d;
  return {
    c: price,
    d,
    dp,
    h: Number((price * 1.008).toFixed(2)),
    l: Number((price * 0.992).toFixed(2)),
    o: Number(pc.toFixed(2)),
    pc: Number(pc.toFixed(2)),
    t: Math.floor(Date.now() / 1000),
    source: "mock",
  };
}

function mockProfileForSymbol(ticker: string): StockProfile {
  const known = DEMO_TICKER_CATALOG[ticker];
  return {
    name: known?.name || ticker,
    type: "Common Stock",
  };
}

function chartStepMs(range: RangeOption): number {
  if (range === "1D") return 15 * 60 * 1000;
  if (range === "1W") return 2 * 60 * 60 * 1000;
  if (range === "1M" || range === "YTD") return 24 * 60 * 60 * 1000;
  return 7 * 24 * 60 * 60 * 1000;
}

function mockChartForSymbol(ticker: string, range: RangeOption, fallbackPrice?: number) {
  const quote = mockQuoteForSymbol(ticker, fallbackPrice);
  const price = finiteNumber(quote?.c ?? fallbackPrice);
  if (!(price > 0)) {
    return { mapped: [] as SeriesPoint[], source: "mock", points: [] as ChartCandle[] };
  }
  const mapped = buildHistoricalSeries(ticker, range, price, quote?.dp ?? 0, {
    open: quote?.o ?? price,
    high: quote?.h ?? price,
    low: quote?.l ?? price,
  });
  const now = Date.now();
  const step = chartStepMs(range);
  const points: ChartCandle[] = mapped.map((point, i) => {
    const timestamp = now - (mapped.length - 1 - i) * step;
    const value = point.value;
    return {
      timestamp,
      date: new Date(timestamp).toISOString(),
      price: value,
      open: point.open ?? value,
      high: point.high ?? value,
      low: point.low ?? value,
      close: point.close ?? value,
      volume: point.volume ?? 0,
    };
  });
  if (mapped.length > 0) {
    setCachedChart(ticker, range, mapped);
    setCachedSpark(
      ticker,
      points.map((point) => point.price)
    );
  }
  return { mapped, source: "mock", points };
}

export async function fetchStockSearch(
  query: string,
  signal?: AbortSignal
): Promise<StockSearchResult[]> {
  const q = query.trim().slice(0, 64);
  if (!q) return [];
  const local = localTickerMatches(q);
  try {
    const data = await safeApiGet<unknown>(
      `${apiUrl("/api/stocks/search")}?q=${encodeURIComponent(q)}`,
      signal
    );
    const remote = parseSearchPayload(data);
    // Live Yahoo proxy hits win. Local catalog only fills exact known gaps — never invents tickers.
    if (remote.length > 0) {
      return mergeSearchResults(q, remote, local);
    }
    return local;
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    return local;
  }
}

export async function fetchStockChart(
  symbol: string,
  range: RangeOption,
  signal?: AbortSignal
): Promise<{ mapped: SeriesPoint[]; source?: string; points: ChartCandle[] } | null> {
  const ticker = normalizeSymbol(symbol);
  if (!ticker) return null;
  try {
    const data = await safeApiGet<StockChartResponse>(
      `${apiUrl(`/api/stocks/${encodeURIComponent(ticker)}/chart`)}?range=${encodeURIComponent(range)}`,
      signal
    );
    const points = Array.isArray(data?.points) ? data.points : [];
    const mapped = chartPointsToSeries(points, range);
    if (mapped.length > 0) {
      setCachedChart(ticker, range, mapped);
      setCachedSpark(
        ticker,
        points.map((point) => point.price)
      );
      return { mapped, source: data?.source, points };
    }
  } catch {
    // 404 / connection errors fall through to mock candles
  }
  return mockChartForSymbol(ticker, range);
}

export async function fetchHistoricalClose(
  symbol: string,
  date: string,
  signal?: AbortSignal
): Promise<HistoricalClose | null> {
  const ticker = normalizeSymbol(symbol);
  if (!ticker || !date) return null;
  try {
    const data = await safeApiGet<HistoricalClose>(
      `${apiUrl(`/api/stocks/${encodeURIComponent(ticker)}/history`)}?date=${encodeURIComponent(date)}`,
      signal
    );
    if (data && typeof data.price === "number" && data.price > 0) return data;
  } catch {
    // fall through to mock
  }
  const mock = mockQuoteForSymbol(ticker);
  if (!mock) return null;
  return {
    symbol: ticker,
    requestedDate: date,
    date,
    price: mock.c,
    open: mock.o,
    high: mock.h,
    low: mock.l,
    close: mock.c,
    source: "mock",
  };
}
