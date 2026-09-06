import React, { useMemo, useState } from "react";
import { ArrowLeft, TrendingDown, TrendingUp } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { buildHistoricalSeries, formatMarketCap, RANGE_OPTIONS, RangeOption, seriesChangePct } from "../lib/priceSimulation";
import type { StockHolding } from "./InvestmentPortfolioCard";
import StockLogo from "./StockLogo";

type StockDetailPageProps = {
  holding: StockHolding;
  onBack: () => void;
};

function formatMoney(amount: number) {
  return Math.round(amount).toLocaleString("en-US");
}

export default function StockDetailPage({ holding, onBack }: StockDetailPageProps) {
  const [range, setRange] = useState<RangeOption>("1D");

  const series = useMemo(
    () =>
      buildHistoricalSeries(holding.symbol, range, holding.currentPrice, holding.dayChangePct, {
        open: holding.open,
        high: holding.high,
        low: holding.low,
      }),
    [holding, range]
  );

  const rangeChangePct = useMemo(() => seriesChangePct(series), [series]);
  const rangeChangeAbs = useMemo(() => {
    const first = series[0]?.value ?? 0;
    const last = series[series.length - 1]?.value ?? 0;
    return last - first;
  }, [series]);
  const rangeUp = rangeChangePct > 0;
  const rangeDown = rangeChangePct < 0;
  const lineColor = rangeDown ? "#F43F5E" : "#10B981";

  const equity = holding.quantity * holding.currentPrice;
  const costBasis = holding.quantity * holding.avgCost;
  const totalReturn = equity - costBasis;
  const totalReturnPct = costBasis > 0 ? (totalReturn / costBasis) * 100 : 0;
  const totalReturnUp = totalReturn >= 0;

  const dayLow = Math.min(holding.low, holding.high, holding.currentPrice);
  const dayHigh = Math.max(holding.low, holding.high, holding.currentPrice);
  const dayRangeSpan = dayHigh - dayLow || 1;
  const dayRangePosition = Math.min(100, Math.max(0, ((holding.currentPrice - dayLow) / dayRangeSpan) * 100));

  return (
    <div className="fixed inset-0 z-50 min-h-screen overflow-y-auto bg-[#000000]">
      {/* Top navigation bar */}
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-[#1F1F1F] bg-[#000000]/95 px-4 py-3 backdrop-blur-md sm:px-6">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-300 transition hover:bg-white/5 hover:text-white active:scale-[0.98]"
        >
          <ArrowLeft size={16} />
          Back to Portfolio
        </button>
        <span className="ml-auto text-xs font-bold text-slate-500">{holding.symbol}</span>
      </div>

      <div className="mx-auto max-w-2xl px-4 pb-28 pt-6 sm:px-6">
        {/* Header: logo, ticker, name, price, day change */}
        <div className="flex items-start gap-3">
          <StockLogo symbol={holding.symbol} finnhubLogo={holding.logo} domain={holding.domain} size={52} />
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-extrabold leading-tight text-white">{holding.symbol}</h1>
            <p className="truncate text-sm text-slate-400">{holding.description}</p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-end justify-between gap-2">
          <p className="text-4xl font-extrabold tracking-tight text-white">${holding.currentPrice.toFixed(2)}</p>
          <span
            className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-bold ${
              rangeDown ? "bg-rose-500/15 text-rose-400" : "bg-emerald-500/15 text-emerald-400"
            }`}
          >
            {rangeDown ? <TrendingDown size={15} /> : <TrendingUp size={15} />}
            {rangeUp ? "+" : ""}${Math.abs(rangeChangeAbs).toFixed(2)} ({rangeUp ? "+" : ""}
            {rangeChangePct.toFixed(2)}%)
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-500">Performance · {range}</p>

        {/* Timeframe selector */}
        <div className="mt-4 flex gap-1 overflow-x-auto rounded-lg bg-black/30 p-1">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setRange(opt)}
              className={`flex-1 rounded-md px-3 py-1.5 text-xs font-bold transition ${
                range === opt ? "bg-emerald-500 text-[#042F2E]" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {opt}
            </button>
          ))}
        </div>

        {/* Chart */}
        <div className="mt-4 h-64 -mx-1 sm:h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
              <defs>
                <linearGradient id="stockPageAreaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={lineColor} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="label" hide />
              <Tooltip
                cursor={{ stroke: "#1F1F1F", strokeWidth: 1 }}
                contentStyle={{
                  background: "#0A0A0A",
                  border: "1px solid #1F1F1F",
                  borderRadius: 12,
                  fontSize: 11,
                  padding: "6px 10px",
                }}
                labelStyle={{ color: "#94A3B8", marginBottom: 2 }}
                itemStyle={{ color: lineColor, fontWeight: 700 }}
                formatter={(value) => [`$${Number(value).toFixed(2)}`, "Price"]}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke={lineColor}
                strokeWidth={2.5}
                fill="url(#stockPageAreaGradient)"
                isAnimationActive={true}
                animationDuration={400}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-1 text-[10px] text-slate-600">
          {range === "1D"
            ? "Simulated intraday path anchored to today's real open/high/low/current values."
            : "Simulated historical trend anchored to the real current price."}
        </p>

        {/* Your Position */}
        <section className="mt-6">
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400">Your Position</h2>
          <div className="mt-2 grid grid-cols-2 gap-2.5">
            <div className="rounded-xl border border-[#1F1F1F] bg-[#0A0A0A] px-3.5 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Shares</p>
              <p className="mt-0.5 text-base font-extrabold text-white">{holding.quantity}</p>
            </div>
            <div className="rounded-xl border border-[#1F1F1F] bg-[#0A0A0A] px-3.5 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Total Value</p>
              <p className="mt-0.5 text-base font-extrabold text-white">${formatMoney(equity)}</p>
            </div>
            <div className="rounded-xl border border-[#1F1F1F] bg-[#0A0A0A] px-3.5 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Avg Cost</p>
              <p className="mt-0.5 text-base font-extrabold text-white">${holding.avgCost.toFixed(2)}</p>
            </div>
            <div className="rounded-xl border border-[#1F1F1F] bg-[#0A0A0A] px-3.5 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Total Return</p>
              <p className={`mt-0.5 text-base font-extrabold ${totalReturnUp ? "text-emerald-400" : "text-rose-400"}`}>
                {totalReturnUp ? "+" : ""}${formatMoney(Math.abs(totalReturn))}
              </p>
              <p className={`text-[10px] font-bold ${totalReturnUp ? "text-emerald-400" : "text-rose-400"}`}>
                {totalReturnUp ? "+" : ""}
                {totalReturnPct.toFixed(1)}%
              </p>
            </div>
          </div>
        </section>

        {/* Day Range */}
        <section className="mt-6">
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400">Day Range</h2>
          <div className="mt-2 rounded-xl border border-[#1F1F1F] bg-[#0A0A0A] px-4 py-4">
            <div className="flex items-center justify-between text-xs font-bold text-white">
              <span>${dayLow.toFixed(2)}</span>
              <span className="text-slate-500">${holding.currentPrice.toFixed(2)}</span>
              <span>${dayHigh.toFixed(2)}</span>
            </div>
            <div className="relative mt-2 h-1.5 w-full rounded-full bg-gradient-to-r from-rose-500/40 via-slate-600 to-emerald-500/40">
              <span
                className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#0A0A0A] bg-white shadow"
                style={{ left: `${dayRangePosition}%` }}
              />
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[10px] font-semibold text-slate-500">
              <span>Low</span>
              <span>High</span>
            </div>
          </div>
        </section>

        {/* Market Stats */}
        <section className="mt-6">
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400">Market Stats</h2>
          <div className="mt-2 grid grid-cols-2 gap-2.5">
            <div className="rounded-xl border border-[#1F1F1F] bg-[#0A0A0A] px-3.5 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Market Cap</p>
              <p className="mt-0.5 text-base font-extrabold text-white">{formatMarketCap(holding.marketCap)}</p>
            </div>
            <div className="rounded-xl border border-[#1F1F1F] bg-[#0A0A0A] px-3.5 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Today's Change</p>
              <p
                className={`mt-0.5 text-base font-extrabold ${
                  holding.dayChangePct >= 0 ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {holding.dayChangePct >= 0 ? "+" : ""}
                {holding.dayChangePct.toFixed(2)}%
              </p>
            </div>
            <div className="rounded-xl border border-[#1F1F1F] bg-[#0A0A0A] px-3.5 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Open</p>
              <p className="mt-0.5 text-base font-extrabold text-white">${holding.open.toFixed(2)}</p>
            </div>
            <div className="rounded-xl border border-[#1F1F1F] bg-[#0A0A0A] px-3.5 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Prev Close</p>
              <p className="mt-0.5 text-base font-extrabold text-white">${holding.prevClose.toFixed(2)}</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
