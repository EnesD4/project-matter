import type {
  ChartPoint,
  ChartRange,
  ChartResponse,
  HistoricalClose,
  QuoteSnapshot,
} from './yahooFinance';
import { rangeInterval } from './yahooFinance';

const POLYGON_BASE = 'https://api.polygon.io';
const QUOTE_TTL_MS = 15_000;
const PROFILE_TTL_MS = 24 * 60 * 60 * 1000;
const HISTORY_TTL_MS = 60 * 60 * 1000;
const SEARCH_TTL_MS = 5 * 60 * 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const CHART_TTL_MS: Record<ChartRange, number> = {
  '1D': 30_000,
  '1W': 60_000,
  '1M': 5 * 60_000,
  YTD: 5 * 60_000,
  '1Y': 5 * 60_000,
  ALL: 10 * 60_000,
};

export type PolygonProfile = {
  name?: string;
  logo?: string;
  weburl?: string;
  marketCapitalization?: number;
  finnhubIndustry?: string;
  ticker?: string;
  type?: string;
  domain?: string;
};

export type PolygonSearchResult = {
  symbol: string;
  displaySymbol: string;
  description: string;
  type: string;
};

type AggBar = {
  o?: number;
  h?: number;
  l?: number;
  c?: number;
  v?: number;
  t?: number;
  vw?: number;
};

type TickerDetails = {
  ticker?: string;
  name?: string;
  type?: string;
  market_cap?: number;
  homepage_url?: string;
  sic_description?: string;
  branding?: { logo_url?: string; icon_url?: string };
};

const quoteCache = new Map<string, { expires: number; value: QuoteSnapshot }>();
const profileCache = new Map<string, { expires: number; value: PolygonProfile }>();
const chartCache = new Map<string, { expires: number; value: ChartResponse }>();
const historyCache = new Map<string, { expires: number; value: HistoricalClose }>();
const searchCache = new Map<string, { expires: number; value: PolygonSearchResult[] }>();
const dailyBarCache = new Map<string, { expires: number; value: AggBar[] }>();
const inFlight = new Map<string, Promise<unknown>>();
const waitQueue: Array<() => void> = [];
let gateOpen = true;

const INDEX_ALIASES: Record<string, string> = {
  '^GSPC': 'I:SPX',
  '^SPX': 'I:SPX',
  SPX: 'I:SPX',
  '^DJI': 'I:DJI',
  '^IXIC': 'I:COMP',
  '^NDX': 'I:NDX',
};

function getPolygonApiKey(): string {
  return (process.env.POLYGON_API_KEY || '').trim();
}

export function isPolygonConfigured(): boolean {
  return Boolean(getPolygonApiKey());
}

function cacheGet<T>(map: Map<string, { expires: number; value: T }>, key: string): T | null {
  const hit = map.get(key);
  if (!hit) return null;
  if (hit.expires < Date.now()) {
    map.delete(key);
    return null;
  }
  return hit.value;
}

function cacheSet<T>(
  map: Map<string, { expires: number; value: T }>,
  key: string,
  value: T,
  ttlMs: number
) {
  map.set(key, { expires: Date.now() + ttlMs, value });
}

function coalesce<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key);
  if (existing) return existing as Promise<T>;
  const pending = fn().finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, pending);
  return pending;
}

function asFinite(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function roundPrice(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

export function toPolygonTicker(symbol: string): string {
  const ticker = symbol.trim().toUpperCase();
  return INDEX_ALIASES[ticker] || ticker;
}

function nyDateKey(ms: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ms));
}

function isoDateFromMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function extractDomain(url?: string | null): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    const host = url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    return host || undefined;
  }
}

function emptyQuoteFields() {
  return {
    dividendYield: null,
    dividendRate: null,
    exDividendDate: null,
    dividendDate: null,
  };
}

function toUnixSeconds(value: number | undefined | null): number {
  if (value == null || !Number.isFinite(value)) return Math.floor(Date.now() / 1000);
  if (value > 1e16) return Math.floor(value / 1e9);
  if (value > 1e12) return Math.floor(value / 1000);
  return Math.floor(value);
}

function acquireGate(): Promise<void> {
  if (gateOpen) {
    gateOpen = false;
    return Promise.resolve();
  }
  return new Promise((resolve) => waitQueue.push(resolve));
}

function releaseGate() {
  const next = waitQueue.shift();
  if (next) next();
  else gateOpen = true;
}

async function polygonGet<T>(path: string, timeoutMs = 8000): Promise<T | null> {
  const key = getPolygonApiKey();
  if (!key) return null;
  const url = `${POLYGON_BASE}${path}${path.includes('?') ? '&' : '?'}apiKey=${encodeURIComponent(key)}`;

  for (let attempt = 0; attempt < 2; attempt++) {
    await acquireGate();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (response.status === 429) {
        console.warn(`Polygon rate limited: ${path}`);
        if (attempt === 0) {
          await new Promise((resolve) => setTimeout(resolve, 1300));
          continue;
        }
        return null;
      }
      if (response.status === 403) return null;
      if (!response.ok) return null;
      return (await response.json()) as T;
    } catch (error) {
      console.error(`Polygon request failed ${path}:`, error instanceof Error ? error.message : error);
      return null;
    } finally {
      clearTimeout(timer);
      setTimeout(releaseGate, 220);
    }
  }
  return null;
}

function quoteFromBars(args: {
  price: number;
  prevClose: number;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  change?: number | null;
  changePct?: number | null;
  timestamp?: number | null;
}): QuoteSnapshot {
  const prevClose = args.prevClose > 0 ? args.prevClose : args.price;
  const change = args.change ?? args.price - prevClose;
  const changePct = args.changePct ?? (prevClose ? (change / prevClose) * 100 : 0);
  const price = args.price;
  return {
    c: roundPrice(price),
    d: roundPrice(change),
    dp: roundPrice(changePct),
    h: roundPrice(args.high ?? Math.max(price, prevClose)),
    l: roundPrice(args.low ?? Math.min(price, prevClose)),
    o: roundPrice(args.open ?? prevClose),
    pc: roundPrice(prevClose),
    t: toUnixSeconds(args.timestamp),
    ...emptyQuoteFields(),
  };
}

/** Polygon bar close: prefer `c`, fall back to volume-weighted `vw`. */
function barClosePrice(bar: AggBar | null | undefined): number | null {
  const close = asFinite(bar?.c);
  if (close != null && close > 0) return close;
  const vw = asFinite(bar?.vw);
  if (vw != null && vw > 0) return vw;
  return null;
}

async function fetchPreviousClose(ticker: string): Promise<AggBar | null> {
  const data = await polygonGet<{ results?: AggBar[] }>(
    `/v2/aggs/ticker/${encodeURIComponent(ticker)}/prev?adjusted=true`
  );
  const bar = data?.results?.[0];
  return bar && barClosePrice(bar) != null ? bar : null;
}

async function fetchRecentDailyBars(ticker: string): Promise<AggBar[]> {
  const cached = cacheGet(dailyBarCache, ticker);
  if (cached) return cached;
  const to = isoDateFromMs(Date.now() + MS_PER_DAY);
  const from = isoDateFromMs(Date.now() - 420 * MS_PER_DAY);
  const data = await polygonGet<{ results?: AggBar[] }>(
    `/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/1/day/${from}/${to}?adjusted=true&sort=asc&limit=500`
  );
  const bars = (data?.results ?? []).filter((bar) => (barClosePrice(bar) ?? 0) > 0);
  if (bars.length > 0) cacheSet(dailyBarCache, ticker, bars, 5 * 60_000);
  return bars;
}

function quoteFromDailyBars(bars: AggBar[]): QuoteSnapshot | null {
  if (bars.length === 0) return null;
  const last = bars[bars.length - 1];
  const prev = bars.length > 1 ? bars[bars.length - 2] : last;
  const price = barClosePrice(last);
  const prevClose = barClosePrice(prev);
  if (price == null || price <= 0) return null;
  return quoteFromBars({
    price,
    prevClose: prevClose ?? price,
    open: asFinite(last.o),
    high: asFinite(last.h),
    low: asFinite(last.l),
    timestamp: asFinite(last.t),
  });
}

async function fetchQuoteUncached(symbol: string): Promise<QuoteSnapshot | null> {
  const ticker = toPolygonTicker(symbol);

  const daily = await fetchRecentDailyBars(ticker);
  const fromDaily = quoteFromDailyBars(daily);
  if (fromDaily) return fromDaily;

  const prev = await fetchPreviousClose(ticker);
  const prevClose = barClosePrice(prev);
  if (prevClose == null || prevClose <= 0) return null;

  return quoteFromBars({
    price: prevClose,
    prevClose,
    open: asFinite(prev?.o),
    high: asFinite(prev?.h),
    low: asFinite(prev?.l),
    timestamp: asFinite(prev?.t),
  });
}

export async function fetchPolygonQuote(symbol: string): Promise<QuoteSnapshot | null> {
  const ticker = symbol.trim().toUpperCase();
  if (!ticker || !isPolygonConfigured()) return null;
  const cached = cacheGet(quoteCache, ticker);
  if (cached) return cached;

  return coalesce(`quote:${ticker}`, async () => {
    const again = cacheGet(quoteCache, ticker);
    if (again) return again;
    const quote = await fetchQuoteUncached(ticker);
    if (quote) cacheSet(quoteCache, ticker, quote, QUOTE_TTL_MS);
    return quote;
  });
}

export async function fetchPolygonQuotes(symbols: string[]): Promise<Map<string, QuoteSnapshot>> {
  const unique = [...new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))].slice(0, 40);
  const out = new Map<string, QuoteSnapshot>();
  const pending: string[] = [];

  for (const ticker of unique) {
    const cached = cacheGet(quoteCache, ticker);
    if (cached) out.set(ticker, cached);
    else pending.push(ticker);
  }

  if (pending.length === 0 || !isPolygonConfigured()) return out;

  for (const ticker of pending) {
    const quote = await fetchPolygonQuote(ticker);
    if (quote) out.set(ticker, quote);
  }

  return out;
}

export async function fetchPolygonProfile(symbol: string): Promise<PolygonProfile | null> {
  const ticker = symbol.trim().toUpperCase();
  if (!ticker || !isPolygonConfigured()) return null;
  const cached = cacheGet(profileCache, ticker);
  if (cached) return cached;

  return coalesce(`profile:${ticker}`, async () => {
    const again = cacheGet(profileCache, ticker);
    if (again) return again;

    const data = await polygonGet<{ results?: TickerDetails }>(
      `/v3/reference/tickers/${encodeURIComponent(toPolygonTicker(ticker))}`
    );
    const details = data?.results;
    if (!details) return null;

    const domain = extractDomain(details.homepage_url);
    const marketCap = asFinite(details.market_cap);
    const profile: PolygonProfile = {
      ticker: details.ticker || ticker,
      name: details.name,
      weburl: details.homepage_url,
      domain,
      type: details.type,
      finnhubIndustry: details.sic_description,
      marketCapitalization: marketCap != null && marketCap > 0 ? marketCap / 1_000_000 : undefined,
    };
    cacheSet(profileCache, ticker, profile, PROFILE_TTL_MS);
    return profile;
  });
}

export async function fetchPolygonSearch(query: string): Promise<PolygonSearchResult[]> {
  const q = query.trim();
  if (!q || !isPolygonConfigured()) return [];
  const cacheKey = q.toLowerCase();
  const cached = cacheGet(searchCache, cacheKey);
  if (cached) return cached;

  const data = await polygonGet<{ results?: Array<{ ticker?: string; name?: string; type?: string }> }>(
    `/v3/reference/tickers?search=${encodeURIComponent(q)}&active=true&market=stocks&limit=12`
  );
  const results = (data?.results ?? [])
    .map((row) => {
      const symbol = (row.ticker || '').toUpperCase();
      if (!symbol) return null;
      return {
        symbol,
        displaySymbol: symbol,
        description: row.name || symbol,
        type: row.type || '',
      } satisfies PolygonSearchResult;
    })
    .filter((row): row is PolygonSearchResult => row != null);

  cacheSet(searchCache, cacheKey, results, SEARCH_TTL_MS);
  return results;
}

function period1For(range: ChartRange): Date {
  const now = Date.now();
  if (range === '1D') return new Date(now - 4 * MS_PER_DAY);
  if (range === '1W') return new Date(now - 8 * MS_PER_DAY);
  if (range === '1M') {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d;
  }
  if (range === 'YTD') return new Date(new Date().getFullYear(), 0, 1);
  if (range === '1Y') {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return d;
  }
  return new Date('2004-01-01T00:00:00.000Z');
}

function aggregateSpec(range: ChartRange): { multiplier: number; timespan: string } {
  if (range === '1D') return { multiplier: 1, timespan: 'minute' };
  if (range === '1W') return { multiplier: 15, timespan: 'minute' };
  if (range === '1Y') return { multiplier: 1, timespan: 'week' };
  if (range === 'ALL') return { multiplier: 1, timespan: 'month' };
  return { multiplier: 1, timespan: 'day' };
}

function mapBar(bar: AggBar): ChartPoint | null {
  const close = barClosePrice(bar);
  const timestamp = asFinite(bar.t);
  if (close == null || close <= 0 || timestamp == null) return null;
  const open = asFinite(bar.o) ?? close;
  const high = asFinite(bar.h) ?? Math.max(open, close);
  const low = asFinite(bar.l) ?? Math.min(open, close);
  return {
    timestamp,
    date: new Date(timestamp).toISOString(),
    price: roundPrice(close),
    open: roundPrice(open),
    high: roundPrice(high),
    low: roundPrice(low),
    close: roundPrice(close),
    volume: Math.max(0, Math.round(asFinite(bar.v) ?? 0)),
  };
}

function filterLatestSession(points: ChartPoint[]): ChartPoint[] {
  if (points.length === 0) return points;
  const lastKey = nyDateKey(points[points.length - 1].timestamp);
  const session = points.filter((p) => nyDateKey(p.timestamp) === lastKey);
  return session.length > 0 ? session : points;
}

export async function fetchPolygonChart(symbol: string, range: ChartRange): Promise<ChartResponse | null> {
  const ticker = symbol.trim().toUpperCase();
  if (!ticker || !isPolygonConfigured()) return null;
  const cacheKey = `${ticker}:${range}`;
  const cached = cacheGet(chartCache, cacheKey);
  if (cached) return cached;

  return coalesce(`chart:${cacheKey}`, async () => {
    const again = cacheGet(chartCache, cacheKey);
    if (again) return again;

    const { multiplier, timespan } = aggregateSpec(range);
    const fromMs = period1For(range).getTime();
    const polyTicker = toPolygonTicker(ticker);

    let points: ChartPoint[] = [];
    if (timespan === 'day') {
      const daily = await fetchRecentDailyBars(polyTicker);
      points = daily
        .filter((bar) => (asFinite(bar.t) ?? 0) >= fromMs - MS_PER_DAY)
        .map(mapBar)
        .filter((p): p is ChartPoint => p != null);
    }

    if (points.length < 2) {
      const from = isoDateFromMs(fromMs);
      const to = isoDateFromMs(Date.now() + MS_PER_DAY);
      const data = await polygonGet<{ results?: AggBar[] }>(
        `/v2/aggs/ticker/${encodeURIComponent(polyTicker)}/range/${multiplier}/${timespan}/${from}/${to}?adjusted=true&sort=asc&limit=50000`,
        12_000
      );
      points = (data?.results ?? []).map(mapBar).filter((p): p is ChartPoint => p != null);
    }

    const sessionPoints = range === '1D' ? filterLatestSession(points) : points;
    if (sessionPoints.length === 0) return null;

    const payload: ChartResponse = {
      symbol: ticker,
      range,
      interval: rangeInterval(range),
      source: 'polygon',
      points: sessionPoints,
    };
    cacheSet(chartCache, cacheKey, payload, CHART_TTL_MS[range]);
    return payload;
  });
}

function pickCloseOnOrBefore(points: ChartPoint[], isoDate: string): ChartPoint | null {
  let best: ChartPoint | null = null;
  for (const point of points) {
    const key = nyDateKey(point.timestamp);
    if (key > isoDate) continue;
    const bestKey = best ? nyDateKey(best.timestamp) : '';
    if (!best || key > bestKey || (key === bestKey && point.timestamp > best.timestamp)) {
      best = point;
    }
  }
  return best;
}

export async function fetchPolygonHistory(
  symbol: string,
  isoDate: string
): Promise<HistoricalClose | null> {
  const ticker = symbol.trim().toUpperCase();
  if (!ticker || !isoDate || !isPolygonConfigured()) return null;
  const cacheKey = `${ticker}:${isoDate}`;
  const cached = cacheGet(historyCache, cacheKey);
  if (cached) return cached;

  const target = Date.parse(`${isoDate}T12:00:00.000Z`);
  if (!Number.isFinite(target)) return null;
  const daily = await fetchRecentDailyBars(toPolygonTicker(ticker));
  const points = daily.map(mapBar).filter((p): p is ChartPoint => p != null);
  const hit = pickCloseOnOrBefore(points, isoDate);
  if (!hit) return null;

  const payload: HistoricalClose = {
    symbol: ticker,
    requestedDate: isoDate,
    date: nyDateKey(hit.timestamp),
    price: hit.close,
    open: hit.open,
    high: hit.high,
    low: hit.low,
    close: hit.close,
    source: 'polygon',
  };
  cacheSet(historyCache, cacheKey, payload, HISTORY_TTL_MS);
  return payload;
}
