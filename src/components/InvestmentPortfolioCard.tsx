import React, { useMemo, useState } from "react";
import { Bitcoin, Landmark, Layers, LucideIcon, TrendingDown, TrendingUp } from "lucide-react";

type RangeOption = "1M" | "3M" | "1Y" | "ALL";

const RANGE_OPTIONS: RangeOption[] = ["1M", "3M", "1Y", "ALL"];

/** Mock historical portfolio values per range — all end at the same "current" value. */
const PORTFOLIO_SERIES: Record<RangeOption, number[]> = {
  "1M": [11890, 11950, 11875, 12010, 12105, 12080, 12210, 12175, 12260, 12300, 12340, 12480],
  "3M": [10800, 11100, 10950, 11400, 11650, 11500, 11800, 12000, 11950, 12200, 12350, 12480],
  "1Y": [9200, 9500, 9800, 9700, 10100, 10400, 10800, 11000, 11300, 11700, 12100, 12480],
  ALL: [6200, 6800, 7300, 7900, 8500, 9000, 9600, 10200, 10800, 11400, 12000, 12480],
};

const PORTFOLIO_GAIN_PCT: Record<RangeOption, number> = {
  "1M": 4.9,
  "3M": 15.6,
  "1Y": 35.7,
  ALL: 101.3,
};

type Asset = { label: string; pct: number; color: string };

const ASSET_ALLOCATION: Asset[] = [
  { label: "Stocks", pct: 52, color: "#10B981" },
  { label: "Funds", pct: 33, color: "#3B82F6" },
  { label: "Gold", pct: 15, color: "#F59E0B" },
];

type ConnectedAccount = {
  name: string;
  balance: number;
  icon: LucideIcon;
};

const CONNECTED_ACCOUNTS: ConnectedAccount[] = [
  { name: "Robinhood", balance: 6320, icon: TrendingUp },
  { name: "Fidelity", balance: 4210, icon: Landmark },
  { name: "Coinbase", balance: 1950, icon: Bitcoin },
];

const TOTAL_VALUE = PORTFOLIO_SERIES["1M"][PORTFOLIO_SERIES["1M"].length - 1];

const CHART_WIDTH = 280;
const CHART_HEIGHT = 120;
const CHART_PADDING = 6;

function buildChartPaths(values: number[]) {
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const stepX = (CHART_WIDTH - CHART_PADDING * 2) / (values.length - 1);

  const points = values.map((v, i) => {
    const x = CHART_PADDING + i * stepX;
    const y = CHART_PADDING + (CHART_HEIGHT - CHART_PADDING * 2) * (1 - (v - min) / range);
    return [x, y] as const;
  });

  const linePath = points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");

  const lastX = points[points.length - 1][0];
  const firstX = points[0][0];
  const floorY = CHART_HEIGHT - CHART_PADDING;
  const areaPath = `${linePath} L${lastX.toFixed(1)},${floorY} L${firstX.toFixed(1)},${floorY} Z`;

  return { linePath, areaPath };
}

function formatMoney(amount: number) {
  return Math.round(amount).toLocaleString("en-US");
}

export default function InvestmentPortfolioCard() {
  const [range, setRange] = useState<RangeOption>("1M");

  const gainPct = PORTFOLIO_GAIN_PCT[range];
  const isPositive = gainPct >= 0;

  const { linePath, areaPath } = useMemo(() => buildChartPaths(PORTFOLIO_SERIES[range]), [range]);

  return (
    <article className="rounded-2xl border border-[#1F2937] bg-[#111827] p-4 sm:p-5 shadow-[0_12px_40px_rgba(0,0,0,0.35)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-emerald-500/15 text-emerald-400">
            <Layers size={18} />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Investment Portfolio
            </p>
            <p className="text-[11px] text-slate-500">{CONNECTED_ACCOUNTS.length} accounts connected</p>
          </div>
        </div>
        <div className="flex gap-1 rounded-lg bg-black/30 p-1">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setRange(opt)}
              className={`rounded-md px-2 py-1 text-[10px] font-bold transition ${
                range === opt ? "bg-emerald-500 text-[#042F2E]" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 flex items-end justify-between">
        <p className="text-3xl font-extrabold tracking-tight text-white">${formatMoney(TOTAL_VALUE)}</p>
        <span
          className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${
            isPositive ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400"
          }`}
        >
          {isPositive ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
          {isPositive ? "+" : ""}
          {gainPct.toFixed(1)}%
        </span>
      </div>
      <p className="mt-0.5 text-[11px] text-slate-500">Performance · {range}</p>

      <div className="mt-3 -mx-1">
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          width="100%"
          height="120"
          preserveAspectRatio="none"
          role="img"
          aria-label={`Portfolio value trend over ${range}`}
        >
          <defs>
            <linearGradient id="portfolioAreaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10B981" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#10B981" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={areaPath} fill="url(#portfolioAreaGradient)" />
          <path d={linePath} fill="none" stroke="#10B981" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      <div className="mt-4 space-y-2">
        <div className="flex h-2 w-full overflow-hidden rounded-full bg-black/30">
          {ASSET_ALLOCATION.map((asset) => (
            <div key={asset.label} style={{ width: `${asset.pct}%`, background: asset.color }} />
          ))}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {ASSET_ALLOCATION.map((asset) => (
            <div key={asset.label} className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-300">
              <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: asset.color }} />
              {asset.label} {asset.pct}%
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 flex gap-2 overflow-x-auto pb-0.5">
        {CONNECTED_ACCOUNTS.map((acct) => {
          const Icon = acct.icon;
          return (
            <div
              key={acct.name}
              className="flex flex-shrink-0 items-center gap-2 rounded-xl border border-[#1F2937] bg-black/20 px-3 py-2"
            >
              <span className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-lg bg-[#3B82F6]/15 text-[#60A5FA]">
                <Icon size={14} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[11px] font-bold text-white">{acct.name}</p>
                <p className="text-[10px] text-slate-500">${formatMoney(acct.balance)}</p>
              </div>
            </div>
          );
        })}
      </div>
    </article>
  );
}
