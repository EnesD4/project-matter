import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Banknote,
  BarChart3,
  Loader2,
  Minus,
  Plus,
  Sparkles,
  Trash2,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { playTransactionClick } from "../lib/audioService";
import { getApiBaseUrl } from "../lib/auth";
import { isEtfAsset } from "../lib/etfIcons";
import { getCachedChart, getCachedQuote, setCachedChart, setCachedQuote } from "../lib/marketCache";
import { fetchStockChart, fetchStockQuote, isLiveChartSource } from "../lib/stockService";
import { privacyMoney, privacyShares, privacySignedMoney } from "../lib/privacy";
import {
  buildHistoricalSeries,
  formatCompactUsd,
  RANGE_OPTIONS,
  RangeOption,
  SeriesPoint,
  seriesChangeAbs,
  seriesChangePct,
} from "../lib/priceSimulation";
import { useMarketPolling } from "../hooks/useMarketPolling";
import { EDUCATIONAL_DISCLAIMER } from "../lib/sproutAi";
import type { StockHolding, StockQuote } from "./InvestmentPortfolioCard";
import StockLogo from "./StockLogo";

const GAIN_GREEN = "#10B981";
const LOSS_RED = "#EF4444";
const apiBase = () => getApiBaseUrl();

type StockMetricsSnapshot = {
  symbol: string;
  revenueGrowthYoy: number | null;
  cash: number | null;
  debt: number | null;
  fcf: number | null;
  pe: number | null;
  peTag: string;
  recommendation: {
    strongBuy: number;
    buy: number;
    hold: number;
    sell: number;
    strongSell: number;
    period: string;
  } | null;
};

type SproutAnalysis = {
  growthDrivers: string[];
  keyRisks: string[];
  analystConsensus: string;
  sentiment: "Buy" | "Hold" | "Sell";
  source: "ai" | "fallback";
  warning?: string;
  disclaimer?: string;
};

export type SellPositionResult = {
  remainingShares: number;
};

type StockDetailPageProps = {
  holding: StockHolding;
  totalPortfolioValue: number;
  privacyMode?: boolean;
  onBack: () => void;
  onAddMore?: (holding: StockHolding) => void;
  onSell?: (
    holding: StockHolding,
    shares: number,
    sellPrice: number
  ) => Promise<SellPositionResult>;
  onRemove?: (id: string) => void | Promise<void>;
  removing?: boolean;
};

function roundShares(n: number): number {
  return Math.round(n * 1e8) / 1e8;
}

function formatUsd(amount: number, digits = 0) {
  return amount.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function isHeldPosition(holding: StockHolding) {
  return holding.quantity > 0 && !holding.id.startsWith("watchlist:");
}

function sentimentTone(sentiment: SproutAnalysis["sentiment"]) {
  if (sentiment === "Buy") return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
  if (sentiment === "Sell") return "bg-rose-500/15 text-rose-300 border-rose-500/30";
  return "bg-amber-500/15 text-amber-200 border-amber-500/30";
}

function SproutBadge() {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/35 bg-emerald-500/15 px-2.5 py-1">
      <Sparkles size={12} className="text-emerald-400" />
      <span className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-emerald-300">
        Sprout AI
      </span>
    </div>
  );
}

function hoverPointFromChart(
  state: { activeIndex?: number | string | null; isTooltipActive?: boolean },
  data: SeriesPoint[]
): SeriesPoint | null {
  if (!state.isTooltipActive) return null;
  const index = Number(state.activeIndex);
  return Number.isFinite(index) && data[index] ? data[index] : null;
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ value?: number | string; payload?: SeriesPoint }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  const value = payload[0]?.value ?? point?.value;
  const timestamp = point?.label ?? label;
  if (value == null) return null;
  const hasOhlc =
    point?.open != null && point?.high != null && point?.low != null && point?.close != null;
  return (
    <div className="rounded-xl border border-[#1F1F1F] bg-[#0A0A0A] px-3 py-2 shadow-[0_8px_24px_rgba(0,0,0,0.45)]">
      <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#6B7280]">
        {timestamp}
      </p>
      <p className="mt-0.5 text-sm font-extrabold tabular-nums text-white">
        ${Number(value).toFixed(2)}
      </p>
      {hasOhlc ? (
        <p className="mt-1 text-[10px] font-semibold tabular-nums text-[#9CA3AF]">
          O ${point.open!.toFixed(2)} · H ${point.high!.toFixed(2)} · L ${point.low!.toFixed(2)}
        </p>
      ) : null}
    </div>
  );
}

function MetricSkeleton() {
  return (
    <div className="rounded-xl border border-[#1F1F1F] bg-[#121212] px-3.5 py-3">
      <div className="h-2.5 w-20 animate-pulse rounded bg-white/10" />
      <div className="mt-2.5 h-5 w-24 animate-pulse rounded bg-white/10" />
      <div className="mt-2 h-2.5 w-16 animate-pulse rounded bg-white/5" />
    </div>
  );
}

async function fetchChartSeries(symbol: string, range: RangeOption) {
  return fetchStockChart(symbol, range);
}

export default function StockDetailPage({
  holding,
  totalPortfolioValue,
  privacyMode = false,
  onBack,
  onAddMore,
  onSell,
  onRemove,
  removing,
}: StockDetailPageProps) {
  const [range, setRange] = useState<RangeOption>("1D");
  const [hoverPoint, setHoverPoint] = useState<SeriesPoint | null>(null);
  const [liveSeries, setLiveSeries] = useState<SeriesPoint[] | null>(() =>
    getCachedChart(holding.symbol, "1D")
  );
  const [chartLoading, setChartLoading] = useState(() => !getCachedChart(holding.symbol, "1D"));
  const [chartLive, setChartLive] = useState(false);
  const [chartSource, setChartSource] = useState<string | null>(null);
  const [liveQuote, setLiveQuote] = useState<StockQuote | null>(() => {
    const cached = getCachedQuote(holding.symbol);
    if (!cached) return null;
    const prev = cached.price / (1 + cached.changePct / 100);
    return {
      c: cached.price,
      dp: cached.changePct,
      d: cached.price - prev,
      o: prev,
      h: Math.max(cached.price, prev),
      l: Math.min(cached.price, prev),
      pc: prev,
      t: cached.updatedAt,
    };
  });
  const [metrics, setMetrics] = useState<StockMetricsSnapshot | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [metricsError, setMetricsError] = useState(false);
  const [analysis, setAnalysis] = useState<SproutAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [chartAnimate, setChartAnimate] = useState(true);
  const [sellOpen, setSellOpen] = useState(false);
  const [sellShares, setSellShares] = useState("");
  const [sellPrice, setSellPrice] = useState("");
  const [sellError, setSellError] = useState<string | null>(null);
  const [selling, setSelling] = useState(false);

  const symbolRef = useRef(holding.symbol);
  symbolRef.current = holding.symbol;
  const rangeRef = useRef(range);
  rangeRef.current = range;

  const { markUpdated } = useMarketPolling({
    onPoll: async () => {
      const symbol = symbolRef.current;
      const chartRange = rangeRef.current;
      const [quote, chart] = await Promise.all([
        fetchStockQuote(symbol).catch(() => null),
        fetchChartSeries(symbol, chartRange).catch(() => null),
      ]);
      if (symbolRef.current !== symbol) return;
      if (quote) setLiveQuote(quote);
      if (rangeRef.current !== chartRange) return;
      if (chart && chart.mapped.length > 0) {
        setChartAnimate(false);
        setLiveSeries(chart.mapped);
        setChartLive(isLiveChartSource(chart.source));
        setChartSource(chart.source ?? null);
      }
      if (!quote && !(chart && chart.mapped.length > 0)) {
        throw new Error("refresh failed");
      }
    },
  });

  const held = isHeldPosition(holding);
  const isEtf = isEtfAsset(holding.symbol, {
    name: holding.description,
    type: holding.instrumentType,
  });
  const price = liveQuote && liveQuote.c > 0 ? liveQuote.c : holding.currentPrice;
  const dayChangePct = liveQuote?.dp ?? holding.dayChangePct;
  const open = liveQuote?.o ?? holding.open;
  const high = liveQuote?.h ?? holding.high;
  const low = liveQuote?.l ?? holding.low;

  const fallbackSeries = useMemo(
    () =>
      buildHistoricalSeries(holding.symbol, range, price, dayChangePct, {
        open,
        high,
        low,
      }),
    [holding.symbol, range, price, dayChangePct, open, high, low]
  );
  const series = liveSeries && liveSeries.length > 0 ? liveSeries : fallbackSeries;

  const rangeChangePct = useMemo(() => seriesChangePct(series), [series]);
  const rangeChangeAbs = useMemo(() => seriesChangeAbs(series), [series]);
  const rangeDown = rangeChangePct < 0;
  const lineColor = rangeDown ? LOSS_RED : GAIN_GREEN;
  const gradientId = `cc-area-${holding.symbol.replace(/[^A-Za-z0-9]/g, "")}`;

  const yDomain = useMemo(() => {
    if (series.length === 0) return ["auto", "auto"] as const;
    const lows = series.map((p) => Math.min(p.value, p.low ?? p.value));
    const highs = series.map((p) => Math.max(p.value, p.high ?? p.value));
    let min = Math.min(...lows);
    let max = Math.max(...highs);
    if (range === "1D") {
      min = Math.min(min, low, open, price);
      max = Math.max(max, high, open, price);
    }
    const span = max - min;
    const pad =
      range === "1D"
        ? span > 0
          ? span * 0.05
          : Math.max(Math.abs(max) * 0.002, 0.01)
        : Math.max(span * 0.08, (max || 1) * 0.01);
    return [min - pad, max + pad] as [number, number];
  }, [series, range, low, high, open, price]);

  const displayPrice = hoverPoint?.value ?? price;
  const displayGainAbs = hoverPoint
    ? hoverPoint.value - (series[0]?.value ?? 0)
    : rangeChangeAbs;
  const displayGainPct = hoverPoint
    ? series[0]?.value
      ? ((hoverPoint.value - series[0].value) / series[0].value) * 100
      : 0
    : rangeChangePct;
  const displayUp = displayGainPct > 0;
  const displayDown = displayGainPct < 0;

  const equity = holding.quantity * price;
  const weightPct = held && totalPortfolioValue > 0 ? (equity / totalPortfolioValue) * 100 : 0;

  const dayLow = Math.min(low, high, price);
  const dayHigh = Math.max(low, high, price);
  const dayRangeSpan = dayHigh - dayLow || 1;
  const dayRangePosition = Math.min(100, Math.max(0, ((price - dayLow) / dayRangeSpan) * 100));

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onBack();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onBack]);

  useEffect(() => {
    let cancelled = false;
    const cached = getCachedQuote(holding.symbol);
    const prev = cached ? cached.price / (1 + cached.changePct / 100) : 0;
    setLiveQuote(
      cached
        ? {
            c: cached.price,
            dp: cached.changePct,
            d: cached.price - prev,
            o: prev,
            h: Math.max(cached.price, prev),
            l: Math.min(cached.price, prev),
            pc: prev,
            t: cached.updatedAt,
          }
        : null
    );
    setLiveSeries(getCachedChart(holding.symbol, "1D"));
    setChartLive(false);
    setRange("1D");
    setAnalysis(null);
    setAnalysisError(null);

    (async () => {
      try {
        const data = await fetchStockQuote(holding.symbol);
        if (!cancelled && data) {
          setLiveQuote(data);
          setCachedQuote(holding.symbol, {
            price: data.c,
            changePct: data.dp ?? holding.dayChangePct,
            name: holding.description,
            logo: holding.logo,
            domain: holding.domain,
          });
          markUpdated();
        }
      } catch {
        // keep the holding's quote
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [holding.symbol, markUpdated]);

  useEffect(() => {
    setHoverPoint(null);
  }, [holding.symbol, range]);

  useEffect(() => {
    let cancelled = false;
    const cached = getCachedChart(holding.symbol, range);
    if (cached && cached.length > 0) {
      setLiveSeries(cached);
      setChartLoading(false);
    } else {
      setLiveSeries(null);
      setChartLoading(true);
    }
    setChartAnimate(true);

    (async () => {
      try {
        const data = await fetchChartSeries(holding.symbol, range);
        if (cancelled) return;
        if (data && data.mapped.length > 0) {
          setLiveSeries(data.mapped);
          setCachedChart(holding.symbol, range, data.mapped);
          setChartLive(isLiveChartSource(data.source));
          setChartSource(data.source ?? null);
          markUpdated();
        } else {
          setChartLive(false);
        }
      } catch {
        if (!cancelled) setChartLive(false);
      } finally {
        if (!cancelled) setChartLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [holding.symbol, range, markUpdated]);

  useEffect(() => {
    let cancelled = false;

    if (isEtf) {
      setMetrics(null);
      setMetricsError(false);
      setMetricsLoading(false);
      return;
    }

    setMetricsLoading(true);
    setMetricsError(false);
    setMetrics(null);

    (async () => {
      try {
        const res = await fetch(
          `${apiBase()}/api/stocks/metrics?symbol=${encodeURIComponent(holding.symbol)}`
        );
        if (!res.ok) throw new Error("metrics failed");
        const data = (await res.json()) as StockMetricsSnapshot;
        if (!cancelled) setMetrics(data);
      } catch {
        if (!cancelled) setMetricsError(true);
      } finally {
        if (!cancelled) setMetricsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [holding.symbol, isEtf]);

  const generateReport = async () => {
    if (analysisLoading) return;
    setAnalysisLoading(true);
    setAnalysisError(null);
    try {
      const res = await fetch(`${apiBase()}/api/stocks/analysis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: holding.symbol,
          name: holding.description,
          price,
          changePct: dayChangePct,
          positionNote: held
            ? `User holds ${holding.quantity} shares worth $${formatUsd(equity)} (${weightPct.toFixed(1)}% of portfolio).`
            : "User is watching this name and does not currently hold a position.",
        }),
      });
      if (!res.ok) throw new Error("analysis failed");
      const data = (await res.json()) as SproutAnalysis;
      if (!data?.growthDrivers?.length || !data?.keyRisks?.length || !data?.analystConsensus) {
        throw new Error("incomplete analysis");
      }
      setAnalysis(data);
    } catch {
      setAnalysisError("Sprout AI couldn't finish this briefing. Please try again.");
      setAnalysis(null);
    } finally {
      setAnalysisLoading(false);
    }
  };

  const canSell =
    held && holding.account !== "verified" && typeof onSell === "function";
  const parsedSellShares = Number(sellShares);
  const parsedSellPrice = Number(sellPrice);
  const sellQtyValid = Number.isFinite(parsedSellShares) && parsedSellShares > 0;
  const sellPriceValid = Number.isFinite(parsedSellPrice) && parsedSellPrice > 0;
  const sellingAll =
    sellQtyValid && roundShares(holding.quantity - parsedSellShares) <= 1e-8;
  const sellOverQty = sellQtyValid && parsedSellShares > holding.quantity + 1e-8;
  const sellProceeds =
    sellQtyValid && sellPriceValid ? parsedSellShares * parsedSellPrice : 0;
  const sellRealized =
    sellQtyValid && sellPriceValid && holding.avgCost > 0
      ? (parsedSellPrice - holding.avgCost) * parsedSellShares
      : null;
  const remainingAfterSell = sellQtyValid
    ? Math.max(0, roundShares(holding.quantity - parsedSellShares))
    : holding.quantity;

  const openSell = () => {
    setSellError(null);
    setSellShares("");
    setSellPrice(price > 0 ? price.toFixed(2) : "");
    setSellOpen(true);
  };

  const closeSell = () => {
    if (selling) return;
    setSellOpen(false);
    setSellError(null);
  };

  const submitSell = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSell || selling) return;
    if (!sellQtyValid) {
      setSellError("Enter a positive number of shares.");
      return;
    }
    if (sellOverQty) {
      setSellError(`You only own ${holding.quantity} shares.`);
      return;
    }
    if (!sellPriceValid) {
      setSellError("Enter a positive execution price.");
      return;
    }

    setSelling(true);
    setSellError(null);
    try {
      const result = await onSell(holding, parsedSellShares, parsedSellPrice);
      setSellOpen(false);
      setSellShares("");
      if (result.remainingShares <= 1e-8) onBack();
    } catch (err) {
      setSellError(err instanceof Error ? err.message : "Couldn't complete this sale");
    } finally {
      setSelling(false);
    }
  };

  const growth = metrics?.revenueGrowthYoy;
  const growthUp = (growth ?? 0) >= 0;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onClick={() => {
        if (sellOpen) return;
        onBack();
      }}
      role="presentation"
    >
      <div
        className="matter-pop flex max-h-[min(94vh,860px)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[#1F1F1F] bg-[#000000]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="stock-cc-title"
      >
        <div className="flex items-center gap-3 border-b border-[#1F1F1F] bg-[#000000] px-4 py-3 sm:px-5">
          <StockLogo
            symbol={holding.symbol}
            finnhubLogo={holding.logo}
            domain={holding.domain}
            size={44}
          />
          <div className="min-w-0 flex-1">
            <h1 id="stock-cc-title" className="truncate text-lg font-extrabold leading-tight text-white">
              {holding.symbol}
            </h1>
            <p className="truncate text-xs text-[#9CA3AF]">{holding.description}</p>
          </div>
          <button
            type="button"
            onClick={onBack}
            aria-label="Close stock detail"
            className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl border border-[#1F1F1F] bg-[#121212] text-[#9CA3AF] transition hover:border-[#2A2A2A] hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto px-4 pb-8 pt-5 sm:px-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-4xl font-extrabold tracking-tight text-white tabular-nums">
                ${displayPrice.toFixed(2)}
              </p>
              <p
                className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-sm font-bold tabular-nums"
                style={{ color: displayDown ? LOSS_RED : GAIN_GREEN }}
              >
                {displayDown ? <TrendingDown size={15} /> : <TrendingUp size={15} />}
                <span>
                  {displayUp ? "+" : displayDown ? "-" : ""}
                  ${Math.abs(displayGainAbs).toFixed(2)} ({displayUp ? "+" : ""}
                  {displayGainPct.toFixed(2)}%)
                </span>
                {hoverPoint ? (
                  <span className="text-[11px] font-semibold text-[#9CA3AF]">· {hoverPoint.label}</span>
                ) : (
                  <span className="text-[11px] font-semibold text-[#9CA3AF]">· {range}</span>
                )}
              </p>
            </div>
            {onAddMore || canSell ? (
              <div className="mt-1.5 flex flex-shrink-0 items-center gap-1.5">
                {onAddMore ? (
                  <button
                    type="button"
                    onClick={() => {
                      playTransactionClick();
                      onAddMore(holding);
                    }}
                    aria-label={`Add more ${holding.symbol}`}
                    className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-wide text-emerald-300 transition hover:border-emerald-400/60 hover:bg-emerald-500/25 hover:text-emerald-200 active:scale-[0.98]"
                  >
                    <Plus size={13} strokeWidth={2.5} aria-hidden="true" />
                    Add
                  </button>
                ) : null}
                {canSell ? (
                  <button
                    type="button"
                    onClick={() => {
                      playTransactionClick();
                      openSell();
                    }}
                    aria-label={`Sell ${holding.symbol}`}
                    className="inline-flex items-center gap-1 rounded-full border border-rose-500/40 bg-rose-500/15 px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-wide text-rose-300 transition hover:border-rose-400/60 hover:bg-rose-500/25 hover:text-rose-200 active:scale-[0.98]"
                  >
                    <Minus size={13} strokeWidth={2.5} aria-hidden="true" />
                    Sell
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="mt-4 flex gap-1 overflow-x-auto rounded-lg bg-[#121212] p-1">
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => {
                  setRange(opt);
                  setHoverPoint(null);
                }}
                className={`flex-1 rounded-md px-3 py-1.5 text-xs font-bold transition ${
                  range === opt ? "bg-[#10B981] text-[#042F2E]" : "text-[#9CA3AF] hover:text-white"
                }`}
              >
                {opt}
              </button>
            ))}
          </div>

          <div className="relative mt-4 h-56 -mx-1 sm:h-64">
            {chartLoading && (
              <div className="pointer-events-none absolute right-2 top-2 z-10 grid h-6 w-6 place-items-center rounded-full bg-black/50">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />
              </div>
            )}
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={series}
                margin={{ top: 8, right: 8, bottom: 0, left: 8 }}
                onMouseMove={(state) => setHoverPoint(hoverPointFromChart(state, series))}
                onMouseLeave={() => setHoverPoint(null)}
              >
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={lineColor} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <YAxis domain={yDomain} hide width={0} />
                <XAxis dataKey="t" hide />
                <Tooltip
                  shared
                  cursor={{ stroke: "#FFFFFF", strokeWidth: 1, strokeDasharray: "4 4", opacity: 0.45 }}
                  content={({ active, payload, label: tipLabel }) => (
                    <ChartTooltip
                      active={active}
                      payload={payload as ReadonlyArray<{ value?: number | string; payload?: SeriesPoint }> | undefined}
                      label={typeof tipLabel === "string" ? tipLabel : undefined}
                    />
                  )}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={lineColor}
                  strokeWidth={2.5}
                  fill={`url(#${gradientId})`}
                  isAnimationActive={chartAnimate}
                  animationDuration={400}
                  activeDot={{
                    r: 5,
                    fill: lineColor,
                    stroke: "#000000",
                    strokeWidth: 2,
                  }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-1 text-[10px] text-[#4B5563]">
            {chartLive
              ? chartSource === "polygon"
                ? "Live Polygon.io aggregates, split-adjusted."
                : "Live market candles, split-adjusted."
              : range === "1D"
                ? "Intraday path anchored to today's real open/high/low/current values."
                : "Historical trend anchored to the live current price."}
          </p>

          <section className="mt-6">
            <h2 className="text-xs font-bold uppercase tracking-wide text-[#9CA3AF]">
              Position Details
            </h2>
            <div className="mt-2 grid grid-cols-2 gap-2.5">
              <div className="rounded-xl border border-[#1F1F1F] bg-[#121212] px-3.5 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[#6B7280]">Shares</p>
                <p className="mt-0.5 text-base font-extrabold tabular-nums text-white">
                  {held ? privacyShares(privacyMode, holding.quantity) : "—"}
                </p>
              </div>
              <div className="rounded-xl border border-[#1F1F1F] bg-[#121212] px-3.5 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[#6B7280]">
                  Total Value
                </p>
                <p className="mt-0.5 text-base font-extrabold tabular-nums text-white">
                  {held ? privacyMoney(privacyMode, equity) : "—"}
                </p>
              </div>
              <div className="rounded-xl border border-[#1F1F1F] bg-[#121212] px-3.5 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[#6B7280]">
                  Portfolio Weight
                </p>
                <p className="mt-0.5 text-base font-extrabold tabular-nums text-white">
                  {held ? `${weightPct.toFixed(1)}%` : "—"}
                </p>
              </div>
              <div className="rounded-xl border border-[#1F1F1F] bg-[#121212] px-3.5 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[#6B7280]">
                  Average Cost
                </p>
                <p className="mt-0.5 text-base font-extrabold tabular-nums text-white">
                  {held ? privacyMoney(privacyMode, holding.avgCost) : "—"}
                </p>
                {held && holding.purchasedAt ? (
                  <p className="mt-0.5 text-[10px] font-semibold text-[#6B7280]">
                    Bought {new Date(`${holding.purchasedAt}T12:00:00`).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </p>
                ) : null}
              </div>
              {held && holding.avgCost > 0 ? (
                <div className="col-span-2 rounded-xl border border-[#1F1F1F] bg-[#121212] px-3.5 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[#6B7280]">
                    Total Return
                  </p>
                  <p
                    className="mt-0.5 text-base font-extrabold tabular-nums"
                    style={{
                      color:
                        price === holding.avgCost ? "#FFFFFF" : price > holding.avgCost ? "#10B981" : "#EF4444",
                    }}
                  >
                    {privacySignedMoney(privacyMode, (price - holding.avgCost) * holding.quantity)}
                    <span className="ml-1 text-sm">
                      ({price >= holding.avgCost ? "+" : ""}
                      {(((price - holding.avgCost) / holding.avgCost) * 100).toFixed(2)}%)
                    </span>
                  </p>
                  <p className="mt-0.5 text-[10px] font-semibold text-[#6B7280]">
                    {holding.purchasedAt
                      ? `Since ${new Date(`${holding.purchasedAt}T12:00:00`).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}`
                      : "Vs. purchase price"}
                  </p>
                </div>
              ) : null}
            </div>
          </section>

          <section className="mt-6">
            <h2 className="text-xs font-bold uppercase tracking-wide text-[#9CA3AF]">Day's Range</h2>
            <div className="mt-2 rounded-xl border border-[#1F1F1F] bg-[#121212] px-4 py-4">
              <div className="flex items-center justify-between text-xs font-bold tabular-nums text-white">
                <span>${dayLow.toFixed(2)}</span>
                <span className="text-[#9CA3AF]">${price.toFixed(2)}</span>
                <span>${dayHigh.toFixed(2)}</span>
              </div>
              <div className="relative mt-2 h-1.5 w-full rounded-full bg-gradient-to-r from-rose-500/40 via-[#2A2A2A] to-emerald-500/40">
                <span
                  className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#121212] bg-white shadow"
                  style={{ left: `${dayRangePosition}%` }}
                />
              </div>
              <div className="mt-1.5 flex items-center justify-between text-[10px] font-semibold text-[#6B7280]">
                <span>Low</span>
                <span>High</span>
              </div>
            </div>
          </section>

          {!isEtf && (
          <section className="mt-6">
            <h2 className="text-xs font-bold uppercase tracking-wide text-[#9CA3AF]">
              Financial Snapshot
            </h2>
            {metricsLoading ? (
              <div className="mt-2 grid grid-cols-2 gap-2.5">
                <MetricSkeleton />
                <MetricSkeleton />
                <MetricSkeleton />
                <MetricSkeleton />
              </div>
            ) : (
              <div className="mt-2 grid grid-cols-2 gap-2.5">
                <div className="rounded-xl border border-[#1F1F1F] bg-[#121212] px-3.5 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[#6B7280]">
                    Revenue Growth
                  </p>
                  <p
                    className={`mt-0.5 text-base font-extrabold ${
                      growth == null ? "text-white" : growthUp ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {growth == null ? "—" : `${growthUp ? "+" : ""}${growth.toFixed(1)}%`}
                  </p>
                  <p className="mt-0.5 text-[10px] font-semibold text-[#6B7280]">YoY</p>
                </div>
                <div className="rounded-xl border border-[#1F1F1F] bg-[#121212] px-3.5 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[#6B7280]">
                    Cash vs Debt
                  </p>
                  {metrics?.cash == null && metrics?.debt == null ? (
                    <p className="mt-0.5 text-base font-extrabold text-white">—</p>
                  ) : (
                    <p className="mt-0.5 text-[13px] font-extrabold leading-snug text-white">
                      {formatCompactUsd(metrics?.cash)} Cash
                      <span className="text-[#6B7280]"> / </span>
                      {formatCompactUsd(metrics?.debt)} Debt
                    </p>
                  )}
                </div>
                <div className="rounded-xl border border-[#1F1F1F] bg-[#121212] px-3.5 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[#6B7280]">
                    Free Cash Flow
                  </p>
                  <p
                    className={`mt-0.5 text-base font-extrabold ${
                      metrics?.fcf == null
                        ? "text-white"
                        : metrics.fcf >= 0
                          ? "text-emerald-400"
                          : "text-rose-400"
                    }`}
                  >
                    {formatCompactUsd(metrics?.fcf)}
                  </p>
                  <p className="mt-0.5 text-[10px] font-semibold text-[#6B7280]">FCF</p>
                </div>
                <div className="rounded-xl border border-[#1F1F1F] bg-[#121212] px-3.5 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[#6B7280]">
                    Valuation (P/E)
                  </p>
                  <p className="mt-0.5 text-base font-extrabold text-white">
                    {metrics?.pe != null && metrics.pe > 0 ? metrics.pe.toFixed(1) : "—"}
                  </p>
                  <p className="mt-0.5 text-[10px] font-bold text-emerald-400">
                    {metrics?.peTag && metrics.peTag !== "N/A" ? metrics.peTag : metricsError ? "Unavailable" : "—"}
                  </p>
                </div>
              </div>
            )}
          </section>
          )}

          <section className="mt-6">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-bold uppercase tracking-wide text-[#9CA3AF]">
                Sprout AI Report
              </h2>
              <SproutBadge />
            </div>

            {!analysis && !analysisLoading && (
              <button
                type="button"
                onClick={() => void generateReport()}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#10B981] px-4 py-3.5 text-sm font-bold text-[#042F2E] transition hover:bg-emerald-400 active:scale-[0.99]"
              >
                <Sparkles size={15} />
                Generate Sprout AI Report
              </button>
            )}

            {analysisLoading && (
              <div
                className="mt-3 rounded-2xl border border-[#1F1F1F] bg-[#121212] p-5"
                aria-busy="true"
                aria-live="polite"
              >
                <div className="flex items-center gap-3">
                  <Loader2 className="h-5 w-5 animate-spin text-emerald-400" />
                  <div>
                    <p className="text-sm font-bold text-white">Sprout AI is analyzing {holding.symbol}…</p>
                    <p className="mt-0.5 text-[12px] text-[#9CA3AF]">
                      Growth drivers, risks, and Street consensus
                    </p>
                  </div>
                </div>
                <div className="mt-5 space-y-4">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="space-y-2">
                      <div className="h-3 w-28 animate-pulse rounded bg-white/10" />
                      <div className="h-3 w-full animate-pulse rounded bg-white/5" />
                      <div className="h-3 w-[88%] animate-pulse rounded bg-white/5" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {analysisError && !analysisLoading && (
              <div className="mt-3 rounded-2xl border border-dashed border-[#1F1F1F] bg-[#121212] px-4 py-6 text-center">
                <p className="text-sm font-bold text-white">Report unavailable</p>
                <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-[#9CA3AF]">
                  {analysisError}
                </p>
                <button
                  type="button"
                  onClick={() => void generateReport()}
                  className="mt-4 inline-flex items-center justify-center rounded-xl border border-[#1F1F1F] px-4 py-2 text-xs font-bold text-emerald-400 transition hover:bg-white/5"
                >
                  Try again
                </button>
              </div>
            )}

            {analysis && !analysisLoading && (
              <div className="mt-3 space-y-2.5">
                {analysis.warning && (
                  <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-200/90">
                    {analysis.warning}
                  </p>
                )}
                <div className="flex items-center justify-between rounded-xl border border-[#1F1F1F] bg-[#121212] px-3.5 py-2.5">
                  <p className="text-[11px] font-semibold text-[#9CA3AF]">Published Street consensus</p>
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-[11px] font-extrabold ${sentimentTone(analysis.sentiment)}`}
                  >
                    {analysis.sentiment}
                  </span>
                </div>
                <article className="rounded-2xl border border-[#1F1F1F] bg-[#121212] p-4 sm:p-5">
                  <div>
                    <p className="inline-flex items-center gap-1.5 text-[11px] font-bold text-white">
                      <TrendingUp size={13} className="text-emerald-400" aria-hidden />
                      Growth Drivers & Highlights
                    </p>
                    <ul className="mt-2 space-y-1.5">
                      {analysis.growthDrivers.map((item, index) => (
                        <li key={`growth-${index}`} className="flex gap-2 text-[13px] leading-relaxed text-[#D1D5DB]">
                          <span className="mt-2 h-1 w-1 flex-shrink-0 rounded-full bg-emerald-400" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="mt-5 border-t border-[#1F1F1F] pt-4">
                    <p className="inline-flex items-center gap-1.5 text-[11px] font-bold text-white">
                      <AlertTriangle size={13} className="text-amber-400" aria-hidden />
                      Key Risks to Watch
                    </p>
                    <ul className="mt-2 space-y-1.5">
                      {analysis.keyRisks.map((item, index) => (
                        <li key={`risk-${index}`} className="flex gap-2 text-[13px] leading-relaxed text-[#D1D5DB]">
                          <span className="mt-2 h-1 w-1 flex-shrink-0 rounded-full bg-amber-400" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="mt-5 border-t border-[#1F1F1F] pt-4">
                    <p className="inline-flex items-center gap-1.5 text-[11px] font-bold text-white">
                      <BarChart3 size={13} className="text-sky-400" aria-hidden />
                      Analyst Consensus
                    </p>
                    <p className="mt-2 text-[13px] leading-relaxed text-[#D1D5DB]">
                      {analysis.analystConsensus}
                    </p>
                  </div>
                  <p className="mt-5 text-center text-[10px] font-semibold italic leading-relaxed text-[#6B7280]">
                    {analysis.disclaimer || EDUCATIONAL_DISCLAIMER}
                  </p>
                </article>
                <button
                  type="button"
                  onClick={() => void generateReport()}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-[#2A2A2A] bg-[#0A0A0A] px-4 py-2.5 text-xs font-bold text-[#9CA3AF] transition hover:border-[#3F3F3F] hover:text-white"
                >
                  <Sparkles size={13} className="text-emerald-400" />
                  Regenerate report
                </button>
              </div>
            )}
          </section>

          {held && onRemove ? (
            <button
              type="button"
              disabled={removing}
              onClick={() => void onRemove(holding.id)}
              className="mt-8 flex w-full items-center justify-center gap-2 rounded-xl border border-rose-500/35 bg-rose-500/10 px-4 py-3.5 text-sm font-bold text-rose-300 transition hover:bg-rose-500/15 disabled:opacity-50"
            >
              {removing ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
              {removing ? "Removing…" : "Remove from Portfolio"}
            </button>
          ) : null}
        </div>
      </div>

      {sellOpen ? (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
          onClick={(e) => {
            e.stopPropagation();
            closeSell();
          }}
          role="presentation"
        >
          <div
            className="matter-pop w-full max-w-md overflow-y-auto rounded-2xl border border-[#1F1F1F] bg-[#0A0A0A] p-5 max-h-[min(88vh,640px)]"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="sell-position-title"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 id="sell-position-title" className="text-sm font-extrabold leading-snug text-white">
                  Sell {holding.symbol}
                </h3>
                <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
                  Reduce or liquidate this paper position. Remaining shares keep the current average cost.
                </p>
              </div>
              <button
                type="button"
                onClick={closeSell}
                aria-label="Close sell"
                className="flex-shrink-0 text-slate-400 transition hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={(e) => void submitSell(e)} className="mt-4 space-y-3">
              <div className="rounded-xl border border-[#1F1F1F] bg-black/30 px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Shares owned
                </p>
                <p className="mt-0.5 text-sm font-extrabold tabular-nums text-white">
                  {holding.quantity.toLocaleString("en-US", { maximumFractionDigits: 8 })}
                </p>
                {holding.avgCost > 0 ? (
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    Avg cost {privacyMoney(privacyMode, holding.avgCost)}
                  </p>
                ) : null}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="sell-qty"
                    className="text-[10px] font-semibold uppercase tracking-wide text-slate-500"
                  >
                    Shares sold
                  </label>
                  <input
                    id="sell-qty"
                    type="text"
                    inputMode="decimal"
                    value={sellShares}
                    onChange={(e) => {
                      setSellShares(e.target.value.replace(/[^0-9.]/g, ""));
                      setSellError(null);
                    }}
                    placeholder={String(holding.quantity)}
                    className={`mt-1 w-full rounded-xl border bg-black/20 px-3 py-2 text-xs font-semibold text-white outline-none placeholder:text-slate-600 focus:border-rose-500/50 ${
                      sellOverQty ? "border-rose-500/60" : "border-[#1F1F1F]"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setSellShares(String(holding.quantity));
                      setSellError(null);
                    }}
                    className="mt-1 text-[10px] font-bold uppercase tracking-wide text-rose-300 transition hover:text-rose-200"
                  >
                    Sell all
                  </button>
                </div>
                <div>
                  <label
                    htmlFor="sell-price"
                    className="text-[10px] font-semibold uppercase tracking-wide text-slate-500"
                  >
                    Execution price
                  </label>
                  <div className="mt-1 flex items-center gap-2 rounded-xl border border-[#1F1F1F] bg-black/20 px-3 py-2 focus-within:border-rose-500/50">
                    <Banknote size={14} className="flex-shrink-0 text-slate-500" />
                    <input
                      id="sell-price"
                      type="text"
                      inputMode="decimal"
                      value={sellPrice}
                      onChange={(e) => {
                        setSellPrice(e.target.value.replace(/[^0-9.]/g, ""));
                        setSellError(null);
                      }}
                      placeholder={price > 0 ? price.toFixed(2) : "185.50"}
                      className="w-full bg-transparent text-xs font-semibold text-white outline-none placeholder:text-slate-600"
                    />
                  </div>
                </div>
              </div>

              {sellQtyValid && sellPriceValid && !sellOverQty ? (
                <div className="space-y-0.5 rounded-xl border border-[#1F1F1F] bg-black/30 px-3 py-2.5">
                  <p className="text-[11px] font-semibold text-white">
                    Proceeds: {privacyMoney(privacyMode, sellProceeds)}
                  </p>
                  {sellRealized != null ? (
                    <p
                      className={`text-[11px] font-bold ${
                        sellRealized > 0
                          ? "text-emerald-300"
                          : sellRealized < 0
                            ? "text-rose-400"
                            : "text-slate-400"
                      }`}
                    >
                      Realized P/L: {privacySignedMoney(privacyMode, sellRealized)}
                    </p>
                  ) : null}
                  {sellingAll ? (
                    <p className="text-[11px] text-rose-300">
                      This liquidates the position and removes {holding.symbol} from your portfolio.
                    </p>
                  ) : (
                    <p className="text-[11px] text-slate-400">
                      Remaining: {remainingAfterSell.toLocaleString("en-US", { maximumFractionDigits: 8 })}{" "}
                      sh @ {privacyMoney(privacyMode, holding.avgCost)} avg cost
                    </p>
                  )}
                </div>
              ) : null}

              {sellError ? <p className="text-[11px] font-semibold text-rose-400">{sellError}</p> : null}

              <button
                type="submit"
                disabled={selling || !sellQtyValid || !sellPriceValid || sellOverQty}
                className={`flex w-full items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-bold transition active:scale-[0.99] ${
                  selling || !sellQtyValid || !sellPriceValid || sellOverQty
                    ? "cursor-not-allowed bg-black/30 text-slate-600"
                    : "bg-rose-500 text-white hover:bg-rose-400"
                }`}
              >
                {selling ? <Loader2 size={15} className="animate-spin" /> : <Minus size={15} />}
                {selling ? "Selling…" : sellingAll ? "Liquidate position" : "Sell shares"}
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
