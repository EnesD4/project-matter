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

function cacheAndReturnQuote(ticker: string, data: StockQuote): StockQuote {
  setCachedQuote(ticker, { price: data.c, changePct: data.dp ?? 0 });
  return data;
}

export async function fetchStockQuote(
  symbol: string,
  signal?: AbortSignal
): Promise<StockQuote | null> {
  const ticker = symbol.trim().toUpperCase();
  if (!ticker) return null;
  try {
    const data = await safeApiGet<StockQuote>(
      `${apiUrl("/api/stocks/quote")}?symbol=${encodeURIComponent(ticker)}`,
      signal
    );
    if (data && data.c > 0) return cacheAndReturnQuote(ticker, data);
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
      const data = await safeApiGet<{ items?: Array<StockQuote & { symbol?: string }> }>(
        `${apiUrl("/api/stocks/quotes")}?symbols=${encodeURIComponent(unique.join(","))}`,
        signal
      );
      for (const item of data?.items ?? []) {
        const ticker = (item.symbol || "").toUpperCase();
        if (!ticker || !(item.c > 0)) continue;
        out.set(ticker, item);
        setCachedQuote(ticker, { price: item.c, changePct: item.dp ?? 0 });
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
