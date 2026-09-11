import YahooFinance from 'yahoo-finance2';
import { parseFlexibleDate } from './dates';

export type ChartRange = '1D' | '1W' | '1M' | 'YTD' | '1Y' | 'ALL';
export type YahooInterval = '1m' | '15m' | '1d' | '1wk' | '1mo';

export type ChartPoint = {
  timestamp: number;
  date: string;
  price: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type ChartResponse = {
  symbol: string;
  range: ChartRange;
  interval: YahooInterval;
  source: 'yahoo' | 'finnhub' | 'fallback';
  points: ChartPoint[];
};

/** Finnhub-compatible quote shape used by the frontend. */
export type QuoteSnapshot = {
  c: number;
  d: number;
  dp: number;
  h: number;
  l: number;
  o: number;
  pc: number;
  t: number;
  dividendYield: number | null;
  dividendRate: number | null;
  exDividendDate: string | null;
  dividendDate: string | null;
};

export type DividendFrequency = 'monthly' | 'quarterly' | 'semiannual' | 'annual' | 'unknown';

export type DividendDetails = {
  symbol: string;
  dividendYield: number | null;
  dividendRate: number | null;
  trailingAnnualDividendRate: number | null;
  trailingAnnualDividendYield: number | null;
  exDividendDate: string | null;
  dividendDate: string | null;
  lastDividendAmount: number | null;
  frequency: DividendFrequency;
  paymentsPerYear: number;
  nextExDividendDate: string | null;
  nextPaymentDate: string | null;
  estimatedDividendPerShare: number | null;
  status: 'confirmed' | 'estimated';
};

type YahooChartQuote = {
  date?: Date | string | number;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  close?: number | null;
  adjclose?: number | null;
  volume?: number | null;
};

type YahooQuoteRaw = {
  regularMarketPrice?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  regularMarketOpen?: number;
  regularMarketPreviousClose?: number;
  regularMarketTime?: Date | string | number;
  dividendRate?: number | null;
  dividendYield?: number | null;
  trailingAnnualDividendRate?: number | null;
  trailingAnnualDividendYield?: number | null;
  dividendDate?: Date | string | number | null;
};

type YahooChartDividendEvent = {
  amount?: number | null;
  date?: Date | string | number;
};

type YahooQuoteSummaryRaw = {
  calendarEvents?: {
    exDividendDate?: Date | string | number | null;
    dividendDate?: Date | string | number | null;
  } | null;
  summaryDetail?: {
    dividendRate?: number | null;
    dividendYield?: number | null;
    trailingAnnualDividendRate?: number | null;
    trailingAnnualDividendYield?: number | null;
    exDividendDate?: Date | string | number | null;
  } | null;
};

const RANGE_OPTIONS: ChartRange[] = ['1D', '1W', '1M', 'YTD', '1Y', 'ALL'];

const RANGE_INTERVAL: Record<ChartRange, YahooInterval> = {
  '1D': '1m',
  '1W': '15m',
  '1M': '1d',
  YTD: '1d',
  '1Y': '1wk',
  ALL: '1mo',
};

const CHART_TTL_MS: Record<ChartRange, number> = {
  '1D': 30_000,
  '1W': 60_000,
  '1M': 5 * 60_000,
  YTD: 5 * 60_000,
  '1Y': 5 * 60_000,
  ALL: 10 * 60_000,
};

const yahooFinance = new YahooFinance({
  suppressNotices: ['yahooSurvey'],
});

export type HistoricalClose = {
  symbol: string;
  requestedDate: string;
  date: string;
  price: number;
  open: number;
  high: number;
  low: number;
  close: number;
  source: 'yahoo' | 'finnhub';
};

const chartCache = new Map<string, { expires: number; value: ChartResponse }>();
const quoteCache = new Map<string, { expires: number; value: QuoteSnapshot }>();
const dividendCache = new Map<string, { expires: number; value: DividendDetails }>();
const historyCache = new Map<string, { expires: number; value: HistoricalClose }>();
const DIVIDEND_TTL_MS = 6 * 60 * 60 * 1000;
const HISTORY_TTL_MS = 60 * 60 * 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

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

function toUnixSeconds(value: Date | string | number | undefined): number {
  if (value instanceof Date) return Math.floor(value.getTime() / 1000);
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 1e12 ? Math.floor(value / 1000) : Math.floor(value);
  }
  if (typeof value === 'string') {
    const ms = Date.parse(value);
    if (Number.isFinite(ms)) return Math.floor(ms / 1000);
  }
  return Math.floor(Date.now() / 1000);
}

function toMillis(value: Date | string | number | undefined): number | null {
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 1e12 ? value * 1000 : value;
  }
  if (typeof value === 'string') {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

function nyDateKey(ms: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ms));
}

function isoDateFromValue(value: Date | string | number | null | undefined): string | null {
  if (typeof value === 'string') {
    const match = value.trim().match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = value < 1e12 ? value * 1000 : value;
    return new Date(ms).toISOString().slice(0, 10);
  }
  return null;
}

function calendarDateMs(isoDate: string | null | undefined): number | null {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const ms = Date.parse(`${isoDate}T12:00:00.000Z`);
  return Number.isFinite(ms) ? ms : null;
}

function pickYield(primary: number | null, trailing: number | null): number | null {
  if (primary == null) return trailing;
  if (trailing == null) return primary;
  if (primary > 0.15 && trailing > 0 && trailing < primary / 5) return trailing;
  return primary;
}

/** Yahoo yield is sometimes a fraction (0.038) and sometimes already in percent (3.8). */
function normalizeYield(raw: number | null): number | null {
  if (raw == null || !Number.isFinite(raw) || raw <= 0) return null;
  return raw > 1 ? raw / 100 : raw;
}

function roundMoney(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function frequencyFromPaymentsPerYear(n: number): DividendFrequency {
  if (n >= 10) return 'monthly';
  if (n >= 3) return 'quarterly';
  if (n === 2) return 'semiannual';
  if (n === 1) return 'annual';
  return 'unknown';
}

function paymentsPerYearFromGaps(sortedMs: number[]): number {
  if (sortedMs.length < 2) return 4;
  const gaps: number[] = [];
  for (let i = 1; i < sortedMs.length; i++) {
    const days = (sortedMs[i] - sortedMs[i - 1]) / MS_PER_DAY;
    if (days >= 10 && days <= 400) gaps.push(days);
  }
  const typical = median(gaps);
  if (typical == null) return 4;
  if (typical <= 40) return 12;
  if (typical <= 135) return 4;
  if (typical <= 230) return 2;
  return 1;
}

function addCalendarMonths(ms: number, months: number): number {
  const d = new Date(ms);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d.getTime();
}

function projectNextDate(lastMs: number, paymentsPerYear: number, nowMs: number): number {
  const months = Math.max(1, Math.round(12 / Math.max(1, paymentsPerYear)));
  let cursor = lastMs;
  let guard = 0;
  while (cursor <= nowMs && guard < 48) {
    cursor = addCalendarMonths(cursor, months);
    guard += 1;
  }
  return cursor;
}

function dividendFieldsFromQuote(quote: YahooQuoteRaw): {
  dividendYield: number | null;
  dividendRate: number | null;
  trailingAnnualDividendRate: number | null;
  trailingAnnualDividendYield: number | null;
  dividendDate: string | null;
} {
  const trailingRate = asFinite(quote.trailingAnnualDividendRate);
  const rate = asFinite(quote.dividendRate) ?? (trailingRate != null && trailingRate > 0 ? trailingRate : null);
  return {
    dividendYield: normalizeYield(asFinite(quote.dividendYield) ?? asFinite(quote.trailingAnnualDividendYield)),
    dividendRate: rate != null && rate > 0 ? roundMoney(rate) : null,
    trailingAnnualDividendRate: trailingRate != null && trailingRate > 0 ? roundMoney(trailingRate) : null,
    trailingAnnualDividendYield: normalizeYield(asFinite(quote.trailingAnnualDividendYield)),
    dividendDate: isoDateFromValue(quote.dividendDate),
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
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

export function toYahooSymbol(symbol: string): string {
  return symbol.trim().toUpperCase().replace(/\./g, '-');
}

export function parseChartRange(raw: unknown): ChartRange {
  const value = String(raw || '1D').trim().toUpperCase();
  return RANGE_OPTIONS.includes(value as ChartRange) ? (value as ChartRange) : '1D';
}

export function rangeInterval(range: ChartRange): YahooInterval {
  return RANGE_INTERVAL[range];
}

function period1For(range: ChartRange): Date {
  const now = Date.now();
  if (range === '1D') return new Date(now - 2 * 24 * 60 * 60 * 1000);
  if (range === '1W') return new Date(now - 8 * 24 * 60 * 60 * 1000);
  if (range === '1M') {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d;
  }
  if (range === 'YTD') {
    return new Date(new Date().getFullYear(), 0, 1);
  }
  if (range === '1Y') {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return d;
  }
  return new Date('1980-01-01T00:00:00.000Z');
}

function mapCandle(raw: YahooChartQuote): ChartPoint | null {
  const timestamp = toMillis(raw.date);
  const close = asFinite(raw.close) ?? asFinite(raw.adjclose);
  if (timestamp == null || close == null || close <= 0) return null;

  const open = asFinite(raw.open) ?? close;
  const high = asFinite(raw.high) ?? Math.max(open, close);
  const low = asFinite(raw.low) ?? Math.min(open, close);
  const volume = asFinite(raw.volume) ?? 0;

  return {
    timestamp,
    date: new Date(timestamp).toISOString(),
    price: roundPrice(close),
    open: roundPrice(open),
    high: roundPrice(high),
    low: roundPrice(low),
    close: roundPrice(close),
    volume: Math.max(0, Math.round(volume)),
  };
}

function filterLatestSession(points: ChartPoint[]): ChartPoint[] {
  if (points.length === 0) return points;
  const lastKey = nyDateKey(points[points.length - 1].timestamp);
  const session = points.filter((p) => nyDateKey(p.timestamp) === lastKey);
  return session.length > 0 ? session : points;
}

async function fetchYahooChart(symbol: string, range: ChartRange): Promise<ChartPoint[]> {
  const yahooSymbol = toYahooSymbol(symbol);
  const result = await withTimeout(
    yahooFinance.chart(yahooSymbol, {
      period1: period1For(range),
      period2: new Date(),
      interval: RANGE_INTERVAL[range],
      includePrePost: false,
      return: 'array',
    }),
    12_000,
    `Yahoo chart ${yahooSymbol} ${range}`
  );

  const quotes = Array.isArray(result?.quotes) ? (result.quotes as YahooChartQuote[]) : [];
  const points = quotes.map(mapCandle).filter((p): p is ChartPoint => p != null);
  return range === '1D' ? filterLatestSession(points) : points;
}

async function fetchFinnhubChart(symbol: string, range: ChartRange): Promise<ChartPoint[]> {
  const token = process.env.FINNHUB_API_KEY;
  if (!token) return [];

  const resolution: Record<ChartRange, string> = {
    '1D': '1',
    '1W': '15',
    '1M': 'D',
    YTD: 'D',
    '1Y': 'W',
    ALL: 'M',
  };
  const from = Math.floor(period1For(range).getTime() / 1000);
  const to = Math.floor(Date.now() / 1000);
  const url = `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(symbol)}&resolution=${resolution[range]}&from=${from}&to=${to}&token=${token}`;

  const response = await withTimeout(fetch(url), 8000, `Finnhub candle ${symbol}`);
  if (!response.ok) return [];
  const data = (await response.json()) as {
    s?: string;
    t?: number[];
    o?: number[];
    h?: number[];
    l?: number[];
    c?: number[];
    v?: number[];
  };
  if (data.s !== 'ok' || !Array.isArray(data.t) || !Array.isArray(data.c)) return [];

  const points: ChartPoint[] = [];
  for (let i = 0; i < data.t.length; i++) {
    const mapped = mapCandle({
      date: (data.t[i] ?? 0) * 1000,
      open: data.o?.[i],
      high: data.h?.[i],
      low: data.l?.[i],
      close: data.c[i],
      volume: data.v?.[i],
    });
    if (mapped) points.push(mapped);
  }
  return range === '1D' ? filterLatestSession(points) : points;
}

function emptyChart(symbol: string, range: ChartRange): ChartResponse {
  return {
    symbol,
    range,
    interval: RANGE_INTERVAL[range],
    source: 'fallback',
    points: [],
  };
}

export async function fetchStockChart(symbol: string, range: ChartRange): Promise<ChartResponse> {
  const ticker = symbol.trim().toUpperCase();
  const cacheKey = `${ticker}:${range}`;
  const cached = cacheGet(chartCache, cacheKey);
  if (cached) return cached;

  try {
    const points = await fetchYahooChart(ticker, range);
    if (points.length > 0) {
      const payload: ChartResponse = {
        symbol: ticker,
        range,
        interval: RANGE_INTERVAL[range],
        source: 'yahoo',
        points,
      };
      cacheSet(chartCache, cacheKey, payload, CHART_TTL_MS[range]);
      return payload;
    }
  } catch (error) {
    console.error(`Yahoo chart failed for ${ticker} ${range}:`, error instanceof Error ? error.message : error);
  }

  try {
    const points = await fetchFinnhubChart(ticker, range);
    if (points.length > 0) {
      const payload: ChartResponse = {
        symbol: ticker,
        range,
        interval: RANGE_INTERVAL[range],
        source: 'finnhub',
        points,
      };
      cacheSet(chartCache, cacheKey, payload, CHART_TTL_MS[range]);
      return payload;
    }
  } catch (error) {
    console.error(`Finnhub chart fallback failed for ${ticker} ${range}:`, error instanceof Error ? error.message : error);
  }

  const fallback = emptyChart(ticker, range);
  cacheSet(chartCache, cacheKey, fallback, 15_000);
  return fallback;
}

function parseIsoDateParam(raw: unknown): string | null {
  return parseFlexibleDate(raw);
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

function toHistoricalClose(
  symbol: string,
  requestedDate: string,
  point: ChartPoint,
  source: 'yahoo' | 'finnhub'
): HistoricalClose {
  return {
    symbol,
    requestedDate,
    date: nyDateKey(point.timestamp),
    price: point.close,
    open: point.open,
    high: point.high,
    low: point.low,
    close: point.close,
    source,
  };
}

async function fetchYahooDailyWindow(symbol: string, isoDate: string): Promise<ChartPoint[]> {
  const yahooSymbol = toYahooSymbol(symbol);
  const target = Date.parse(`${isoDate}T12:00:00.000Z`);
  const period1 = new Date(target - 21 * MS_PER_DAY);
  const period2 = new Date(Math.min(Date.now() + MS_PER_DAY, target + 3 * MS_PER_DAY));
  const result = await withTimeout(
    yahooFinance.chart(yahooSymbol, {
      period1,
      period2,
      interval: '1d',
      includePrePost: false,
      return: 'array',
    }),
    12_000,
    `Yahoo history ${yahooSymbol} ${isoDate}`
  );
  const quotes = Array.isArray(result?.quotes) ? (result.quotes as YahooChartQuote[]) : [];
  return quotes.map(mapCandle).filter((p): p is ChartPoint => p != null);
}

async function fetchFinnhubDailyWindow(symbol: string, isoDate: string): Promise<ChartPoint[]> {
  const token = process.env.FINNHUB_API_KEY;
  if (!token) return [];

  const target = Date.parse(`${isoDate}T12:00:00.000Z`);
  const from = Math.floor((target - 21 * MS_PER_DAY) / 1000);
  const to = Math.floor(Math.min(Date.now(), target + 3 * MS_PER_DAY) / 1000);
  const url = `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(symbol)}&resolution=D&from=${from}&to=${to}&token=${token}`;
  const response = await withTimeout(fetch(url), 8000, `Finnhub history ${symbol}`);
  if (!response.ok) return [];
  const data = (await response.json()) as {
    s?: string;
    t?: number[];
    o?: number[];
    h?: number[];
    l?: number[];
    c?: number[];
    v?: number[];
  };
  if (data.s !== 'ok' || !Array.isArray(data.t) || !Array.isArray(data.c)) return [];

  const points: ChartPoint[] = [];
  for (let i = 0; i < data.t.length; i++) {
    const mapped = mapCandle({
      date: (data.t[i] ?? 0) * 1000,
      open: data.o?.[i],
      high: data.h?.[i],
      low: data.l?.[i],
      close: data.c[i],
      volume: data.v?.[i],
    });
    if (mapped) points.push(mapped);
  }
  return points;
}

/** Adjusted close on or before `date` (YYYY-MM-DD), skipping weekends and market holidays. */
export async function fetchHistoricalClose(symbol: string, dateRaw: unknown): Promise<HistoricalClose | null> {
  const ticker = symbol.trim().toUpperCase();
  const requestedDate = parseIsoDateParam(dateRaw);
  if (!ticker || !requestedDate) return null;

  const cacheKey = `${ticker}:${requestedDate}`;
  const cached = cacheGet(historyCache, cacheKey);
  if (cached) return cached;

  try {
    const points = await fetchYahooDailyWindow(ticker, requestedDate);
    const hit = pickCloseOnOrBefore(points, requestedDate);
    if (hit) {
      const payload = toHistoricalClose(ticker, requestedDate, hit, 'yahoo');
      cacheSet(historyCache, cacheKey, payload, HISTORY_TTL_MS);
      return payload;
    }
  } catch (error) {
    console.error(
      `Yahoo history failed for ${ticker} ${requestedDate}:`,
      error instanceof Error ? error.message : error
    );
  }

  try {
    const points = await fetchFinnhubDailyWindow(ticker, requestedDate);
    const hit = pickCloseOnOrBefore(points, requestedDate);
    if (hit) {
      const payload = toHistoricalClose(ticker, requestedDate, hit, 'finnhub');
      cacheSet(historyCache, cacheKey, payload, HISTORY_TTL_MS);
      return payload;
    }
  } catch (error) {
    console.error(
      `Finnhub history fallback failed for ${ticker} ${requestedDate}:`,
      error instanceof Error ? error.message : error
    );
  }

  return null;
}

export async function fetchYahooQuote(symbol: string): Promise<QuoteSnapshot | null> {
  const ticker = symbol.trim().toUpperCase();
  const cached = cacheGet(quoteCache, ticker);
  if (cached) return cached;

  try {
    const yahooSymbol = toYahooSymbol(ticker);
    const quote = (await withTimeout(
      yahooFinance.quote(yahooSymbol),
      8000,
      `Yahoo quote ${yahooSymbol}`
    )) as YahooQuoteRaw;

    const price = asFinite(quote.regularMarketPrice);
    if (price == null || price <= 0) return null;

    const prevClose = asFinite(quote.regularMarketPreviousClose) ?? price;
    const change = asFinite(quote.regularMarketChange) ?? price - prevClose;
    const changePct =
      asFinite(quote.regularMarketChangePercent) ?? (prevClose ? (change / prevClose) * 100 : 0);

    const dividends = dividendFieldsFromQuote(quote);
    const cachedDiv = cacheGet(dividendCache, ticker);

    const snapshot: QuoteSnapshot = {
      c: roundPrice(price),
      d: roundPrice(change),
      dp: roundPrice(changePct),
      h: roundPrice(asFinite(quote.regularMarketDayHigh) ?? price),
      l: roundPrice(asFinite(quote.regularMarketDayLow) ?? price),
      o: roundPrice(asFinite(quote.regularMarketOpen) ?? price),
      pc: roundPrice(prevClose),
      t: toUnixSeconds(quote.regularMarketTime),
      dividendYield: dividends.dividendYield ?? cachedDiv?.dividendYield ?? null,
      dividendRate: dividends.dividendRate ?? cachedDiv?.dividendRate ?? null,
      dividendDate: dividends.dividendDate ?? cachedDiv?.dividendDate ?? null,
      exDividendDate: cachedDiv?.exDividendDate ?? cachedDiv?.nextExDividendDate ?? null,
    };
    cacheSet(quoteCache, ticker, snapshot, 15_000);
    return snapshot;
  } catch (error) {
    console.error(`Yahoo quote failed for ${ticker}:`, error instanceof Error ? error.message : error);
    return null;
  }
}

function collectDividendEvents(raw: unknown): Array<{ amount: number; dateMs: number }> {
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : Object.values(raw as Record<string, unknown>);
  const events: Array<{ amount: number; dateMs: number }> = [];
  for (const item of list) {
    const event = item as YahooChartDividendEvent;
    const amount = asFinite(event?.amount);
    const dateMs = toMillis(event?.date);
    if (amount == null || amount <= 0 || dateMs == null) continue;
    events.push({ amount, dateMs });
  }
  return events.sort((a, b) => a.dateMs - b.dateMs);
}

async function fetchDividendHistory(symbol: string): Promise<Array<{ amount: number; dateMs: number }>> {
  const yahooSymbol = toYahooSymbol(symbol);
  const period1 = new Date(Date.now() - 420 * MS_PER_DAY);
  try {
    const result = await withTimeout(
      yahooFinance.chart(yahooSymbol, {
        period1,
        period2: new Date(),
        interval: '1d',
        events: 'div',
        includePrePost: false,
        return: 'object',
      }),
      12_000,
      `Yahoo dividend events ${yahooSymbol}`
    );
    const events = (result as { events?: { dividends?: unknown } } | null)?.events?.dividends;
    return collectDividendEvents(events);
  } catch (error) {
    console.error(
      `Yahoo dividend history failed for ${symbol}:`,
      error instanceof Error ? error.message : error
    );
    return [];
  }
}

async function fetchQuoteSummaryDividends(symbol: string): Promise<{
  dividendRate: number | null;
  dividendYield: number | null;
  trailingAnnualDividendRate: number | null;
  trailingAnnualDividendYield: number | null;
  exDividendDate: string | null;
  dividendDate: string | null;
}> {
  const empty = {
    dividendRate: null,
    dividendYield: null,
    trailingAnnualDividendRate: null,
    trailingAnnualDividendYield: null,
    exDividendDate: null,
    dividendDate: null,
  };
  try {
    const yahooSymbol = toYahooSymbol(symbol);
    const summary = (await withTimeout(
      yahooFinance.quoteSummary(yahooSymbol, {
        modules: ['summaryDetail', 'calendarEvents'],
      }),
      10_000,
      `Yahoo quoteSummary ${yahooSymbol}`
    )) as YahooQuoteSummaryRaw;

    const detail = summary?.summaryDetail;
    const calendar = summary?.calendarEvents;
    const trailingRate = asFinite(detail?.trailingAnnualDividendRate);
    const rate = asFinite(detail?.dividendRate) ?? (trailingRate != null && trailingRate > 0 ? trailingRate : null);

    return {
      dividendRate: rate != null && rate > 0 ? roundMoney(rate) : null,
      dividendYield: normalizeYield(asFinite(detail?.dividendYield) ?? asFinite(detail?.trailingAnnualDividendYield)),
      trailingAnnualDividendRate: trailingRate != null && trailingRate > 0 ? roundMoney(trailingRate) : null,
      trailingAnnualDividendYield: normalizeYield(asFinite(detail?.trailingAnnualDividendYield)),
      exDividendDate: isoDateFromValue(calendar?.exDividendDate ?? detail?.exDividendDate),
      dividendDate: isoDateFromValue(calendar?.dividendDate),
    };
  } catch (error) {
    console.error(
      `Yahoo quoteSummary dividends failed for ${symbol}:`,
      error instanceof Error ? error.message : error
    );
    return empty;
  }
}

function buildDividendDetails(
  ticker: string,
  quoteFields: ReturnType<typeof dividendFieldsFromQuote>,
  summary: Awaited<ReturnType<typeof fetchQuoteSummaryDividends>>,
  history: Array<{ amount: number; dateMs: number }>
): DividendDetails {
  const nowMs = Date.now();
  const todayKey = nyDateKey(nowMs);
  const lastEvent = history.length > 0 ? history[history.length - 1] : null;
  const paymentsPerYear = history.length >= 2 ? paymentsPerYearFromGaps(history.map((e) => e.dateMs)) : 4;
  const frequency = frequencyFromPaymentsPerYear(paymentsPerYear);

  const dividendRate =
    quoteFields.dividendRate ??
    summary.dividendRate ??
    (lastEvent ? roundMoney(lastEvent.amount * paymentsPerYear) : null);
  const trailingAnnualDividendYield =
    quoteFields.trailingAnnualDividendYield ?? summary.trailingAnnualDividendYield;
  const dividendYield = pickYield(
    quoteFields.dividendYield ?? summary.dividendYield,
    trailingAnnualDividendYield
  );
  const trailingAnnualDividendRate =
    quoteFields.trailingAnnualDividendRate ?? summary.trailingAnnualDividendRate;

  const announcedEx = summary.exDividendDate;
  const announcedPay = summary.dividendDate ?? quoteFields.dividendDate;
  const announcedExFuture = Boolean(announcedEx && announcedEx >= todayKey);
  const announcedPayFuture = Boolean(announcedPay && announcedPay >= todayKey);

  let nextExDate = announcedExFuture ? announcedEx : null;
  let nextPayDate = announcedPayFuture ? announcedPay : null;
  let status: DividendDetails['status'] =
    announcedExFuture || announcedPayFuture ? 'confirmed' : 'estimated';

  if (nextExDate == null && lastEvent) {
    nextExDate = new Date(projectNextDate(lastEvent.dateMs, paymentsPerYear, nowMs)).toISOString().slice(0, 10);
    if (!announcedPayFuture) status = 'estimated';
  } else if (nextExDate == null && nextPayDate != null) {
    const payMs = calendarDateMs(nextPayDate);
    if (payMs != null) nextExDate = new Date(payMs - 14 * MS_PER_DAY).toISOString().slice(0, 10);
  }

  if (nextPayDate == null && nextExDate != null) {
    const exMs = calendarDateMs(nextExDate);
    const announcedPayMs = calendarDateMs(announcedPay);
    const announcedExMs = calendarDateMs(announcedEx);
    const lagMs =
      announcedPayMs != null && announcedExMs != null
        ? Math.max(3 * MS_PER_DAY, announcedPayMs - announcedExMs)
        : 21 * MS_PER_DAY;
    if (exMs != null) {
      nextPayDate = new Date(exMs + Math.min(Math.max(lagMs, 3 * MS_PER_DAY), 45 * MS_PER_DAY))
        .toISOString()
        .slice(0, 10);
    }
  }

  const estimatedDividendPerShare = lastEvent
    ? roundMoney(lastEvent.amount)
    : dividendRate != null
      ? roundMoney(dividendRate / paymentsPerYear)
      : trailingAnnualDividendRate != null
        ? roundMoney(trailingAnnualDividendRate / paymentsPerYear)
        : null;

  const paysDividend =
    (dividendRate != null && dividendRate > 0) ||
    (estimatedDividendPerShare != null && estimatedDividendPerShare > 0) ||
    (dividendYield != null && dividendYield > 0);

  return {
    symbol: ticker,
    dividendYield,
    dividendRate,
    trailingAnnualDividendRate,
    trailingAnnualDividendYield,
    exDividendDate: announcedEx,
    dividendDate: announcedPay,
    lastDividendAmount: lastEvent ? roundMoney(lastEvent.amount) : estimatedDividendPerShare,
    frequency: paysDividend ? frequency : 'unknown',
    paymentsPerYear: paysDividend ? paymentsPerYear : 0,
    nextExDividendDate: paysDividend ? nextExDate : null,
    nextPaymentDate: paysDividend ? nextPayDate : null,
    estimatedDividendPerShare: paysDividend ? estimatedDividendPerShare : null,
    status: paysDividend ? status : 'estimated',
  };
}

export async function fetchDividendDetails(symbol: string): Promise<DividendDetails | null> {
  const ticker = symbol.trim().toUpperCase();
  if (!ticker) return null;
  const cached = cacheGet(dividendCache, ticker);
  if (cached) return cached;

  try {
    const yahooSymbol = toYahooSymbol(ticker);
    const [quote, summary, history] = await Promise.all([
      withTimeout(yahooFinance.quote(yahooSymbol), 8000, `Yahoo dividend quote ${yahooSymbol}`)
        .then((raw) => dividendFieldsFromQuote(raw as YahooQuoteRaw))
        .catch(() => ({
          dividendYield: null,
          dividendRate: null,
          trailingAnnualDividendRate: null,
          trailingAnnualDividendYield: null,
          dividendDate: null,
        })),
      fetchQuoteSummaryDividends(ticker),
      fetchDividendHistory(ticker),
    ]);

    const details = buildDividendDetails(ticker, quote, summary, history);
    cacheSet(dividendCache, ticker, details, DIVIDEND_TTL_MS);
    return details;
  } catch (error) {
    console.error(`Yahoo dividend details failed for ${ticker}:`, error instanceof Error ? error.message : error);
    return null;
  }
}

export async function fetchDividendDetailsMany(symbols: string[]): Promise<DividendDetails[]> {
  const unique = [...new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))].slice(0, 30);
  const results: DividendDetails[] = [];

  const pending: string[] = [];
  for (const ticker of unique) {
    const cached = cacheGet(dividendCache, ticker);
    if (cached) results.push(cached);
    else pending.push(ticker);
  }

  const concurrency = 3;
  let cursor = 0;
  async function worker() {
    while (cursor < pending.length) {
      const ticker = pending[cursor];
      cursor += 1;
      const details = await fetchDividendDetails(ticker);
      if (details) results.push(details);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, pending.length) }, () => worker()));
  const order = new Map(unique.map((s, i) => [s, i]));
  return results.sort((a, b) => (order.get(a.symbol) ?? 0) - (order.get(b.symbol) ?? 0));
}
