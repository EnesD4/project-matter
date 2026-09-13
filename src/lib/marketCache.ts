import type { RangeOption, SeriesPoint } from "./priceSimulation";

export type CachedQuote = {
  price: number;
  changePct: number;
  name?: string;
  logo?: string;
  domain?: string;
  updatedAt: number;
};

const QUOTE_KEY = "sprout_quote_cache_v1";
const CHART_KEY = "sprout_chart_cache_v1";
const SPARK_KEY = "sprout_spark_cache_v1";

const quoteMemory = new Map<string, CachedQuote>();
const chartMemory = new Map<string, SeriesPoint[]>();
const sparkMemory = new Map<string, number[]>();

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // quota / private mode
  }
}

function hydrateQuotes() {
  if (quoteMemory.size > 0) return;
  const stored = readJson<Record<string, CachedQuote>>(QUOTE_KEY);
  if (!stored) return;
  for (const [symbol, quote] of Object.entries(stored)) {
    if (quote && Number.isFinite(quote.price) && quote.price > 0) {
      quoteMemory.set(symbol.toUpperCase(), quote);
    }
  }
}

function persistQuotes() {
  const out: Record<string, CachedQuote> = {};
  for (const [symbol, quote] of quoteMemory) out[symbol] = quote;
  writeJson(QUOTE_KEY, out);
}

function chartKey(symbol: string, range: RangeOption) {
  return `${symbol.toUpperCase()}:${range}`;
}

export function getCachedQuote(symbol: string): CachedQuote | null {
  hydrateQuotes();
  return quoteMemory.get(symbol.trim().toUpperCase()) ?? null;
}

export function setCachedQuote(symbol: string, quote: Omit<CachedQuote, "updatedAt">) {
  hydrateQuotes();
  const ticker = symbol.trim().toUpperCase();
  if (!ticker || !Number.isFinite(quote.price) || quote.price <= 0) return;
  quoteMemory.set(ticker, { ...quote, updatedAt: Date.now() });
  persistQuotes();
}

export function getCachedChart(symbol: string, range: RangeOption): SeriesPoint[] | null {
  const key = chartKey(symbol, range);
  const hit = chartMemory.get(key);
  if (hit && hit.length > 0) return hit;
  const stored = readJson<Record<string, SeriesPoint[]>>(CHART_KEY);
  const points = stored?.[key];
  if (points && points.length > 0) {
    chartMemory.set(key, points);
    return points;
  }
  return null;
}

export function setCachedChart(symbol: string, range: RangeOption, points: SeriesPoint[]) {
  if (!points.length) return;
  const key = chartKey(symbol, range);
  chartMemory.set(key, points);
  const stored = readJson<Record<string, SeriesPoint[]>>(CHART_KEY) ?? {};
  stored[key] = points;
  const keys = Object.keys(stored);
  if (keys.length > 40) {
    for (const extra of keys.slice(0, keys.length - 40)) delete stored[extra];
  }
  writeJson(CHART_KEY, stored);
  setCachedSpark(
    symbol,
    points.map((point) => point.value)
  );
}

export function getCachedSpark(symbol: string): number[] | null {
  const ticker = symbol.trim().toUpperCase();
  const hit = sparkMemory.get(ticker);
  if (hit && hit.length > 1) return hit;
  const stored = readJson<Record<string, number[]>>(SPARK_KEY);
  const points = stored?.[ticker];
  if (points && points.length > 1) {
    sparkMemory.set(ticker, points);
    return points;
  }
  return null;
}

export function setCachedSpark(symbol: string, values: number[]) {
  const clean = values.filter((value) => Number.isFinite(value) && value > 0);
  if (clean.length < 2) return;
  const ticker = symbol.trim().toUpperCase();
  sparkMemory.set(ticker, clean);
  const stored = readJson<Record<string, number[]>>(SPARK_KEY) ?? {};
  stored[ticker] = clean;
  writeJson(SPARK_KEY, stored);
}
