import { apiUrl } from "./apiBase";
import { clearbitLogoUrl, extractWebsiteDomain } from "./assetLogos";
import { DEMO_TICKER_CATALOG, resolveDemoTicker } from "./demoScenarios";
import { setCachedChart, setCachedQuote, setCachedSpark } from "./marketCache";
import {
  buildHistoricalSeries,
  ChartCandle,
  chartPointsToSeries,
  RangeOption,
  SeriesPoint,
} from "./priceSimulation";

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

export function isLiveChartSource(source?: string | null): boolean {
  return Boolean(source && LIVE_CHART_SOURCES.has(source));
}

export { clearbitLogoUrl, extractWebsiteDomain };

async function readJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function safeApiGet<T>(url: string, signal?: AbortSignal): Promise<T | null> {
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    return await readJson<T>(res);
  } catch {
    return null;
  }
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
 * Mandatory sanitizer before any stock enters React state, tables, or Recharts.
 * Guarantees finite numerics — never undefined/NaN on price/shares/change fields.
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
  const buy_price = finiteNumber(
    raw?.buy_price ?? raw?.buyPrice ?? raw?.avgCost ?? raw?.price ?? 0
  );
  const current_price = finiteNumber(
    raw?.current_price ?? raw?.currentPrice ?? raw?.price ?? raw?.close ?? raw?.c ?? buy_price ?? 0
  );
  const price = finiteNumber(raw?.price ?? current_price ?? buy_price ?? 0);
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
  const symbol = String(safe?.symbol || raw?.ticker || "")
    .trim()
    .toUpperCase();
  const price = finiteNumber(safe.price ?? raw?.close ?? raw?.c ?? 0);
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
  setCachedQuote(ticker, { price: quote.c, changePct: quote.dp ?? 0 });
  return quote;
}

export async function fetchStockQuote(
  symbol: string,
  signal?: AbortSignal
): Promise<StockQuote | null> {
  const ticker = symbol.trim().toUpperCase();
  if (!ticker) return null;
  try {
    const data = await safeApiGet<unknown>(
      `${apiUrl("/api/stocks/quote")}?symbol=${encodeURIComponent(ticker)}`,
      signal
    );
    const quote = normalizeToStockQuote(data, ticker);
    if (quote && quote.c > 0) return cacheAndReturnQuote(ticker, quote);
  } catch {
    // 404 / connection errors fall through to mock quotes
  }
  const mock = mockQuoteForSymbol(ticker);
  return mock ? cacheAndReturnQuote(ticker, mock) : null;
}

export async function fetchStockQuotes(
  symbols: string[],
  signal?: AbortSignal
): Promise<Map<string, StockQuote>> {
  const unique = [...new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))];
  const out = new Map<string, StockQuote>();
  if (unique.length === 0) return out;

  if (unique.length > 1) {
    try {
      const data = await safeApiGet<{ items?: Array<Record<string, unknown> & { symbol?: string }> }>(
        `${apiUrl("/api/stocks/quotes")}?symbols=${encodeURIComponent(unique.join(","))}`,
        signal
      );
      for (const item of data?.items ?? []) {
        const ticker = String(item.symbol || item.ticker || "")
          .trim()
          .toUpperCase();
        const quote = normalizeToStockQuote(item, ticker);
        if (!ticker || !quote || !(quote.c > 0)) continue;
        out.set(ticker, quote);
        setCachedQuote(ticker, { price: quote.c, changePct: quote.dp ?? 0 });
      }
    } catch {
      // fall through to per-symbol fetches
    }
  }

  const missing = unique.filter((ticker) => !out.has(ticker));
  await Promise.all(
    missing.map(async (ticker) => {
      try {
        const quote = await fetchStockQuote(ticker, signal);
        if (quote) out.set(ticker, quote);
      } catch {
        const mock = mockQuoteForSymbol(ticker);
        if (mock) out.set(ticker, cacheAndReturnQuote(ticker, mock));
      }
    })
  );
  return out;
}

export async function fetchStockProfile(
  symbol: string,
  signal?: AbortSignal
): Promise<StockProfile | null> {
  const ticker = symbol.trim().toUpperCase();
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

const TICKER_QUERY = /^[A-Z][A-Z0-9.\-]{0,9}$/;

function asSearchResult(row: Partial<StockSearchResult> | null | undefined): StockSearchResult | null {
  const symbol = String(row?.displaySymbol || row?.symbol || "")
    .trim()
    .toUpperCase();
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

/** Local catalog + typed-ticker fallback so paper search still works when APIs are down. */
export function localTickerMatches(query: string): StockSearchResult[] {
  const q = query.trim().toUpperCase();
  if (!q) return [];
  const rows = Object.entries(DEMO_TICKER_CATALOG)
    .filter(([symbol, meta]) => symbol.includes(q) || meta.name.toUpperCase().includes(q))
    .map(([symbol, meta]) => ({
      symbol,
      displaySymbol: symbol,
      description: meta.name,
      type: "Common Stock",
    }));
  if (TICKER_QUERY.test(q) && !rows.some((row) => row.symbol === q)) {
    const resolved = resolveDemoTicker(q);
    rows.unshift({
      symbol: resolved.symbol,
      displaySymbol: resolved.symbol,
      description: resolved.name,
      type: "Common Stock",
    });
  }
  return rows.slice(0, 8);
}

const MOCK_DAY_CHANGE: Record<string, number> = {
  AAPL: 0.42,
  NVDA: 1.15,
  TSLA: -0.68,
  MSFT: 0.31,
  GOOGL: 0.22,
  AMZN: 0.18,
  META: 0.55,
  SPY: 0.21,
  QQQ: 0.38,
  VOO: 0.19,
};

export function mockQuoteForSymbol(symbol: string): StockQuote | null {
  const ticker = symbol.trim().toUpperCase();
  if (!ticker) return null;
  const known = DEMO_TICKER_CATALOG[ticker];
  const price = known?.buyPrice ?? (TICKER_QUERY.test(ticker) ? 100 : 0);
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

function mockChartForSymbol(ticker: string, range: RangeOption) {
  const quote = mockQuoteForSymbol(ticker);
  const price = quote?.c ?? 100;
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
  const q = query.trim().slice(0, 40);
  if (!q) return [];
  const local = localTickerMatches(q);
  try {
    const data = await safeApiGet<unknown>(
      `${apiUrl("/api/stocks/search")}?q=${encodeURIComponent(q)}`,
      signal
    );
    const remote = parseSearchPayload(data);
    return remote.length > 0 ? remote.slice(0, 8) : local;
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
  const ticker = symbol.trim().toUpperCase();
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
  const ticker = symbol.trim().toUpperCase();
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
