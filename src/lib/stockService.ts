import { apiUrl } from "./apiBase";
import { clearbitLogoUrl, extractWebsiteDomain } from "./assetLogos";
import { setCachedChart, setCachedQuote, setCachedSpark } from "./marketCache";
import {
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
    if (!data || !(data.c > 0)) return null;
    setCachedQuote(ticker, { price: data.c, changePct: data.dp ?? 0 });
    return data;
  } catch {
    return null;
  }
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
        // keep going
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
    if (!data) return null;
    const domain = data.domain || extractWebsiteDomain(data.weburl);
    return {
      ...data,
      domain,
      logo: data.logo || (domain ? clearbitLogoUrl(domain) : undefined),
    };
  } catch {
    return null;
  }
}

export async function fetchStockSearch(
  query: string,
  signal?: AbortSignal
): Promise<StockSearchResult[]> {
  const q = query.trim();
  if (!q) return [];
  try {
    const data = await safeApiGet<StockSearchResult[]>(
      `${apiUrl("/api/stocks/search")}?q=${encodeURIComponent(q)}`,
      signal
    );
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
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
    if (!data) return null;
    const points = Array.isArray(data.points) ? data.points : [];
    const mapped = chartPointsToSeries(points, range);
    if (mapped.length > 0) {
      setCachedChart(ticker, range, mapped);
      setCachedSpark(
        ticker,
        points.map((point) => point.price)
      );
    }
    return { mapped, source: data.source, points };
  } catch {
    return null;
  }
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
    if (!data || typeof data.price !== "number" || !(data.price > 0)) return null;
    return data;
  } catch {
    return null;
  }
}
