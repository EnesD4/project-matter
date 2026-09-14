/** Offline quotes/charts used when Yahoo (or the Express backend) is unavailable. */

export type MockQuote = {
  symbol: string;
  c: number;
  d: number;
  dp: number;
  h: number;
  l: number;
  o: number;
  pc: number;
  t: number;
  source: "mock";
  name: string;
};

export type MockCandle = {
  timestamp: number;
  date: string;
  price: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

const MOCK_TICKERS: Record<string, { name: string; c: number; dp: number }> = {
  AAPL: { name: "Apple Inc.", c: 228.4, dp: 0.42 },
  MSFT: { name: "Microsoft Corp.", c: 418.2, dp: 0.31 },
  NVDA: { name: "NVIDIA Corp.", c: 124.6, dp: 1.15 },
  GOOGL: { name: "Alphabet Inc.", c: 174.8, dp: 0.22 },
  AMZN: { name: "Amazon.com Inc.", c: 191.3, dp: 0.18 },
  META: { name: "Meta Platforms", c: 512.7, dp: 0.55 },
  TSLA: { name: "Tesla Inc.", c: 248.9, dp: -0.68 },
  SPY: { name: "SPDR S&P 500 ETF", c: 562.1, dp: 0.21 },
  QQQ: { name: "Invesco QQQ Trust", c: 481.5, dp: 0.38 },
  VOO: { name: "Vanguard S&P 500 ETF", c: 516.4, dp: 0.19 },
  VTI: { name: "Vanguard Total Stock Market", c: 286.2, dp: 0.16 },
  SCHD: { name: "Schwab US Dividend Equity", c: 27.8, dp: 0.08 },
  VXUS: { name: "Vanguard Total International", c: 64.2, dp: 0.11 },
};

function seededRandom(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function next() {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

export function mockQuoteForSymbol(symbol: string, fallbackPrice?: number): MockQuote | null {
  const ticker = symbol.trim().toUpperCase();
  if (!ticker) return null;
  const known = MOCK_TICKERS[ticker];
  const catalogPrice = known?.c;
  const fallback = typeof fallbackPrice === "number" && Number.isFinite(fallbackPrice) ? fallbackPrice : 0;
  // Known catalog or caller-supplied mark only — never invent a static $100 default.
  const price = catalogPrice ?? (fallback > 0 ? fallback : 0);
  if (!(price > 0)) return null;
  const dp = known?.dp ?? 0;
  const d = price * (dp / 100);
  const pc = price - d;
  return {
    symbol: ticker,
    c: price,
    d,
    dp,
    h: Number((price * 1.008).toFixed(2)),
    l: Number((price * 0.992).toFixed(2)),
    o: Number(pc.toFixed(2)),
    pc: Number(pc.toFixed(2)),
    t: Math.floor(Date.now() / 1000),
    source: "mock",
    name: known?.name || ticker,
  };
}

export function mockQuotePayload(symbol: string) {
  const quote = mockQuoteForSymbol(symbol);
  if (!quote) {
    return { status: "ok", c: 0, d: 0, dp: 0, h: 0, l: 0, o: 0, pc: 0, t: 0, source: "mock", data: [] };
  }
  return { status: "ok", ...quote, data: [] };
}

type ChartRange = "1D" | "1W" | "1M" | "YTD" | "1Y" | "ALL";

function normalizeRange(range: string | null | undefined): ChartRange {
  const value = String(range || "1M").toUpperCase();
  if (value === "1D" || value === "1W" || value === "1M" || value === "YTD" || value === "1Y" || value === "ALL") {
    return value;
  }
  return "1M";
}

function pointCount(range: ChartRange): number {
  switch (range) {
    case "1D":
      return 26;
    case "1W":
      return 7;
    case "1M":
      return 22;
    case "YTD":
      return 40;
    case "1Y":
      return 52;
    default:
      return 90;
  }
}

function stepMs(range: ChartRange): number {
  switch (range) {
    case "1D":
      return 15 * 60 * 1000;
    case "1W":
      return 2 * 60 * 60 * 1000;
    case "1M":
    case "YTD":
      return 24 * 60 * 60 * 1000;
    default:
      return 7 * 24 * 60 * 60 * 1000;
  }
}

export function mockChartPayload(symbol: string, rangeInput?: string | null) {
  const ticker = symbol.trim().toUpperCase();
  const range = normalizeRange(rangeInput);
  const quote = mockQuoteForSymbol(ticker) || mockQuoteForSymbol("AAPL")!;
  const count = pointCount(range);
  const step = stepMs(range);
  const rng = seededRandom(`${ticker}-${range}-chart`);
  const now = Date.now();
  const start = quote.c / (1 + (quote.dp || 0) / 100);
  const points: MockCandle[] = [];
  for (let i = 0; i < count; i++) {
    const progress = count === 1 ? 1 : i / (count - 1);
    const drift = start + (quote.c - start) * progress;
    const noise = i === 0 || i === count - 1 ? 0 : (rng() - 0.5) * quote.c * 0.012;
    const price = Number(Math.max(0.01, drift + noise).toFixed(2));
    const timestamp = now - (count - 1 - i) * step;
    const open = Number((price * (0.996 + rng() * 0.008)).toFixed(2));
    const high = Number(Math.max(open, price, quote.h * (0.98 + progress * 0.02)).toFixed(2));
    const low = Number(Math.min(open, price, quote.l * (1.02 - progress * 0.02)).toFixed(2));
    points.push({
      timestamp,
      date: new Date(timestamp).toISOString(),
      price,
      open,
      high,
      low,
      close: price,
      volume: Math.round(1_000_000 + rng() * 4_000_000),
    });
  }
  return {
    symbol: ticker || quote.symbol,
    range,
    interval: range === "1D" ? "15m" : "1d",
    source: "mock",
    points,
  };
}

export function mockHistoryPayload(symbol: string, date: string) {
  const quote = mockQuoteForSymbol(symbol);
  const price = quote?.c ?? 0;
  return {
    symbol: symbol.trim().toUpperCase(),
    requestedDate: date,
    date: date || null,
    price: price || 0,
    open: quote?.o ?? 0,
    high: quote?.h ?? 0,
    low: quote?.l ?? 0,
    close: price || 0,
    source: "mock",
  };
}

export function mockProfilePayload(symbol: string) {
  const quote = mockQuoteForSymbol(symbol);
  const ticker = symbol.trim().toUpperCase();
  return {
    name: quote?.name || ticker,
    ticker,
    logo: "",
    weburl: "",
    finnhubIndustry: "Technology",
    type: "Common Stock",
  };
}
