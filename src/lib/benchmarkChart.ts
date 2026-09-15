import { getApiBaseUrl } from "./auth";
import { setCachedSpark } from "./marketCache";
import { toFiniteNumber } from "./money";
import { ChartCandle, formatChartLabel, RangeOption, SeriesPoint } from "./priceSimulation";

const apiBase = () => getApiBaseUrl();

/** VOO tracks the S&P 500; ^GSPC is the index itself. */
export const SP500_TICKERS = ["VOO", "^GSPC"] as const;

export const PORTFOLIO_LINE = "#10B981";
export const SP500_LINE = "#6366F1";

export type StockSlice = {
  symbol: string;
  quantity: number;
  currentPrice: number;
};

export type BenchmarkChartPoint = SeriesPoint & {
  portfolioValue: number;
  portfolioPct: number;
  spPct: number;
};

export async function fetchChartCandles(symbol: string, range: RangeOption): Promise<ChartCandle[]> {
  try {
    const res = await fetch(
      `${apiBase()}/api/stocks/${encodeURIComponent(symbol)}/chart?range=${encodeURIComponent(range)}`
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { points?: ChartCandle[] };
    if (!Array.isArray(data.points)) return [];
    const points = data.points.filter(
      (p) => Number.isFinite(p.price) && p.price > 0 && Number.isFinite(p.timestamp)
    );
    if (points.length > 1) {
      setCachedSpark(
        symbol,
        points.map((point) => point.price)
      );
    }
    return points;
  } catch {
    return [];
  }
}

export async function fetchSp500Candles(range: RangeOption): Promise<ChartCandle[]> {
  for (const ticker of SP500_TICKERS) {
    const points = await fetchChartCandles(ticker, range);
    if (points.length > 0) return points;
  }
  return [];
}

function lastPriceAtOrBefore(points: ChartCandle[], ts: number): number | null {
  if (points.length === 0) return null;
  let lo = 0;
  let hi = points.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].timestamp <= ts) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans >= 0 ? points[ans].price : null;
}

export function canonicalTimestamps(preferred: ChartCandle[] | undefined, others: ChartCandle[][]): number[] {
  if (preferred && preferred.length > 0) {
    return preferred.map((p) => p.timestamp);
  }
  let best: ChartCandle[] = [];
  for (const series of others) {
    if (series.length > best.length) best = series;
  }
  return best.map((p) => p.timestamp);
}

export function pricesOnTimestamps(
  candles: ChartCandle[] | null | undefined,
  timestamps: number[] | null | undefined
): number[] {
  return (timestamps ?? []).map((ts) => Number(lastPriceAtOrBefore(candles ?? [], ts)) || 0);
}

export function reconstructPortfolioValues(
  stocks: StockSlice[] | null | undefined,
  charts: Map<string, ChartCandle[]>,
  cashValue: number,
  timestamps: number[]
): number[] {
  return (timestamps ?? []).map((ts) => {
    let sum = Math.max(0, Number(cashValue) || 0);
    for (const stock of stocks ?? []) {
      if (!stock) continue;
      const pts = charts?.get(stock.symbol);
      const price = pts && pts.length > 0 ? lastPriceAtOrBefore(pts, ts) : null;
      const qty = Number(stock?.quantity) || 0;
      const mark = Number(price ?? stock?.currentPrice) || 0;
      sum += qty * mark;
    }
    return sum;
  });
}

export function resampleValuesToLength(values: number[], n: number): number[] {
  if (n <= 0) return [];
  if (values.length === 0) return Array.from({ length: n }, () => 0);
  if (values.length === 1) return Array.from({ length: n }, () => values[0]);
  return Array.from({ length: n }, (_, i) => {
    const idx = (i / Math.max(n - 1, 1)) * (values.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.min(values.length - 1, lo + 1);
    const w = idx - lo;
    return values[lo] * (1 - w) + values[hi] * w;
  });
}

function pctFromBase(value: number, base: number): number {
  if (!base) return 0;
  return ((value - base) / base) * 100;
}

export function buildBenchmarkChartData(args: {
  range: RangeOption;
  timestamps: number[];
  portfolioValues: number[];
  spPrices: number[];
}): BenchmarkChartPoint[] {
  const { range, timestamps, portfolioValues, spPrices } = args;
  const pBase = portfolioValues.find((v) => v > 0) ?? 0;
  const sBase = spPrices.find((v) => v > 0) ?? 0;
  return timestamps.map((ts, i) => {
    const portfolioValue = portfolioValues[i] ?? 0;
    const spPrice = spPrices[i] ?? 0;
    const portfolioPct = pctFromBase(portfolioValue, pBase);
    const spPct = sBase ? pctFromBase(spPrice, sBase) : 0;
    return {
      t: i,
      timestamp: ts,
      label: formatChartLabel(ts, range),
      value: toFiniteNumber(portfolioPct, 0),
      portfolioValue: toFiniteNumber(portfolioValue, 0),
      portfolioPct: toFiniteNumber(portfolioPct, 0),
      spPct: toFiniteNumber(spPct, 0),
    };
  });
}

export function formatSignedPct(n: unknown, digits = 2): string {
  const value = toFiniteNumber(n, 0);
  const abs = Math.abs(value).toFixed(digits);
  if (value > 0) return `+${abs}%`;
  if (value < 0) return `-${abs}%`;
  return `${abs}%`;
}
