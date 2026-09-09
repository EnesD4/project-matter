/**
 * Chart helpers + a last-resort historical simulation.
 *
 * Live stock/ETF candles come from GET /api/stocks/:symbol/chart (Yahoo Finance).
 * `buildHistoricalSeries` is only used when that endpoint returns no points
 * (Yahoo throttle, network error, unknown ticker) so the UI never goes blank.
 */

export type RangeOption = "1D" | "1W" | "1M" | "1Y" | "ALL";

export const RANGE_OPTIONS: RangeOption[] = ["1D", "1W", "1M", "1Y", "ALL"];

export type SeriesPoint = {
  t: number;
  label: string;
  value: number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
};

export type ChartCandle = {
  timestamp: number;
  date: string;
  price: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type DayAnchors = { open: number; high: number; low: number };

const NY_TZ = "America/New_York";

function formatChartLabel(ms: number, range: RangeOption): string {
  const date = new Date(ms);
  if (range === "1D") {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: NY_TZ,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(date);
  }
  if (range === "1W") {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: NY_TZ,
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(date);
  }
  if (range === "1M" || range === "1Y") {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: NY_TZ,
      month: "short",
      day: "numeric",
    }).format(date);
  }
  return new Intl.DateTimeFormat("en-US", {
    timeZone: NY_TZ,
    month: "short",
    year: "2-digit",
  }).format(date);
}

/** Maps Yahoo/Finnhub candle points into the Recharts series shape. */
export function chartPointsToSeries(points: ChartCandle[], range: RangeOption): SeriesPoint[] {
  return points
    .filter((p) => Number.isFinite(p.price) && p.price > 0 && Number.isFinite(p.timestamp))
    .map((p, i) => ({
      t: i,
      label: formatChartLabel(p.timestamp, range),
      value: p.price,
      open: p.open,
      high: p.high,
      low: p.low,
      close: p.close,
      volume: p.volume,
    }));
}

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

function gaussian(rng: () => number) {
  const u1 = Math.max(rng(), 1e-9);
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** Market-hours labels for 1D intraday axis (sparse unique ticks). */
const INTRADAY_HOURS = ["9:30", "10:30", "11:30", "12:30", "1:30", "2:30", "3:30", "4:00"];

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function buildIntradaySeries(seedKey: string, anchors: DayAnchors, current: number, points = 26): SeriesPoint[] {
  const safeOpen = anchors.open || current;
  const lo = Math.min(anchors.low || safeOpen, safeOpen, current);
  const hi = Math.max(anchors.high || safeOpen, safeOpen, current);
  const span = hi - lo || Math.max(current * 0.01, 0.5);
  const rng = seededRandom(`${seedKey}-1D`);

  const series: SeriesPoint[] = [];
  for (let i = 0; i < points; i++) {
    const progress = i / (points - 1);
    const drift = safeOpen + (current - safeOpen) * progress;
    const noise = i === 0 || i === points - 1 ? 0 : (gaussian(rng) * span) / 8;
    const value = i === 0 ? safeOpen : i === points - 1 ? current : Math.min(hi, Math.max(lo, drift + noise));
    const hourIdx = Math.round(progress * (INTRADAY_HOURS.length - 1));
    series.push({ t: i, label: INTRADAY_HOURS[hourIdx], value });
  }
  return series;
}

type WalkRange = Exclude<RangeOption, "1D">;
type RangeShape = { points: number; dailyVolPct: number; driftPct: number };

const RANGE_SHAPE: Record<WalkRange, RangeShape> = {
  "1W": { points: 7, dailyVolPct: 1.1, driftPct: 0.4 },
  "1M": { points: 22, dailyVolPct: 1.4, driftPct: 1.2 },
  "1Y": { points: 52, dailyVolPct: 2.6, driftPct: 6 },
  ALL: { points: 90, dailyVolPct: 2.9, driftPct: 12 },
};

function labelForWalkPoint(range: WalkRange, index: number, total: number): string {
  const last = total - 1;
  if (index === last) return "Now";

  if (range === "1W") {
    // Trading-week style: Mon → Sun ending at Now
    return WEEKDAY_LABELS[index % 7];
  }

  if (range === "1M") {
    const daysAgo = last - index;
    if (daysAgo === 0) return "Now";
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return `${MONTH_LABELS[d.getMonth()]} ${d.getDate()}`;
  }

  if (range === "1Y") {
    // Weekly points across ~12 months
    const weeksAgo = last - index;
    const d = new Date();
    d.setDate(d.getDate() - weeksAgo * 7);
    return MONTH_LABELS[d.getMonth()];
  }

  // ALL — longer arc labeled by year + month
  const weeksAgo = last - index;
  const d = new Date();
  d.setDate(d.getDate() - weeksAgo * 7);
  const yy = String(d.getFullYear()).slice(2);
  return `${MONTH_LABELS[d.getMonth()]} '${yy}`;
}

function buildWalkSeries(seedKey: string, range: WalkRange, target: number): SeriesPoint[] {
  const shape = RANGE_SHAPE[range];
  const rng = seededRandom(`${seedKey}-${range}`);
  const vol = shape.dailyVolPct / 100;
  const drift = shape.driftPct / 100 / shape.points;

  const raw = [1];
  for (let i = 1; i < shape.points; i++) {
    const r = drift + gaussian(rng) * vol;
    raw.push(Math.max(0.05, raw[i - 1] * (1 + r)));
  }

  // Rescale the whole synthetic path so it always ends exactly at the real current value.
  const scale = target / raw[raw.length - 1];
  return raw.map((v, i) => ({
    t: i,
    label: labelForWalkPoint(range, i, raw.length),
    value: v * scale,
  }));
}

/**
 * Builds a believable historical series for the given range, always ending at
 * `currentValue`. For "1D", pass real `anchors` (open/high/low from a live quote)
 * when available for an honestly-anchored intraday path; otherwise a synthetic
 * open is derived from `todayChangePct`.
 */
export function buildHistoricalSeries(
  seedKey: string,
  range: RangeOption,
  currentValue: number,
  todayChangePct = 0,
  anchors?: DayAnchors
): SeriesPoint[] {
  if (!Number.isFinite(currentValue) || currentValue <= 0) {
    return [
      { t: 0, label: "Start", value: 0 },
      { t: 1, label: "Now", value: 0 },
    ];
  }

  if (range === "1D") {
    const dayAnchors: DayAnchors =
      anchors ??
      (() => {
        const open = currentValue / (1 + todayChangePct / 100);
        const hi = Math.max(open, currentValue) * 1.004;
        const lo = Math.min(open, currentValue) * 0.996;
        return { open, high: hi, low: lo };
      })();
    return buildIntradaySeries(seedKey, dayAnchors, currentValue);
  }

  return buildWalkSeries(seedKey, range, currentValue);
}

/** Percentage change from the first to the last point of a series. */
export function seriesChangePct(series: SeriesPoint[]): number {
  const first = series[0]?.value;
  const last = series[series.length - 1]?.value;
  if (!first) return 0;
  return ((last - first) / first) * 100;
}

/** Absolute change from the first to the last point of a series. */
export function seriesChangeAbs(series: SeriesPoint[]): number {
  const first = series[0]?.value ?? 0;
  const last = series[series.length - 1]?.value ?? 0;
  return last - first;
}

/** Formats a Finnhub `marketCapitalization` value (reported in millions of the listing currency). */
export function formatMarketCap(millions?: number | null): string {
  if (!millions || millions <= 0) return "—";
  if (millions >= 1_000_000) return `$${(millions / 1_000_000).toFixed(2)}T`;
  if (millions >= 1_000) return `$${(millions / 1_000).toFixed(1)}B`;
  return `$${millions.toFixed(0)}M`;
}

/** Compact USD for balance-sheet figures (cash, debt, FCF). */
export function formatCompactUsd(amount?: number | null): string {
  if (amount == null || !Number.isFinite(amount)) return "—";
  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(amount);
  if (abs >= 1_000_000_000_000) return `${sign}$${(abs / 1_000_000_000_000).toFixed(1)}T`;
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}
