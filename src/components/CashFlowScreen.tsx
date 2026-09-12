import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  ChevronRight,
  Coins,
  Landmark,
  LineChart,
  Loader2,
  Map as MapIcon,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";
import { fetchPortfolio, getApiBaseUrl } from "../lib/auth";
import {
  annualDividendIncome,
  buildUpcomingPayouts,
  formatMonthHeading,
  formatPayoutDate,
  frequencyLabel,
  type DividendDetails,
  type DividendPosition,
  type UpcomingPayout,
} from "../lib/dividends";
import { formatCurrencyInput, formatCurrencyValue, parseCurrency } from "../lib/money";
import { privacyMoney } from "../lib/privacy";
import {
  SAFETY_NET_STARTER_MONTHS,
  computeSafetyNetTotals,
  convertGoldAmount,
  coverageProgressPct,
  goldOunces,
  monthsOfCoverage,
  nextBondId,
  type SafetyNetBond,
  type SafetyNetConfig,
} from "../lib/safetyNet";
import { useFinancialRoadmap, useRoadmapTodoProgress } from "../hooks/useFinancialRoadmap";
import {
  HYSA_APY,
  hysaAnnualYield,
  requestFinancialOnboarding,
} from "../lib/roadmapService";
import type { Holding, StockHolding } from "./InvestmentPortfolioCard";
import FinancialRoadmapPanel from "./FinancialRoadmapPanel";
import StockLogo from "./StockLogo";

type CashFlowScreenProps = {
  holdings: Holding[];
  privacyMode?: boolean;
};

type DividendsResponse = {
  items?: DividendDetails[];
};

const API_BASE_URL = getApiBaseUrl();

/** Compact payout row: 34px logo + 16px vertical padding + 2px border. */
const PAYOUT_ROW_PX = 52;
const PAYOUT_GAP_PX = 8;
const MONTH_LABEL_PX = 26;
const VISIBLE_PAYOUTS = 6;
const DIVIDEND_LIST_MAX_HEIGHT =
  MONTH_LABEL_PX + VISIBLE_PAYOUTS * PAYOUT_ROW_PX + (VISIBLE_PAYOUTS - 1) * PAYOUT_GAP_PX;

function isStockHolding(holding: Holding): holding is StockHolding {
  return holding.kind === "stock" && holding.quantity > 0;
}

function mergePositions(items: DividendPosition[]): DividendPosition[] {
  const bySymbol = new Map<string, DividendPosition>();
  for (const item of items) {
    const symbol = item.symbol.trim().toUpperCase();
    if (!symbol || item.shares <= 0) continue;
    const existing = bySymbol.get(symbol);
    if (!existing) {
      bySymbol.set(symbol, { ...item, symbol });
      continue;
    }
    existing.shares += item.shares;
    if (!existing.name || existing.name === existing.symbol) existing.name = item.name;
    if (!existing.logo && item.logo) existing.logo = item.logo;
    if (!existing.domain && item.domain) existing.domain = item.domain;
    if (item.price > 0) existing.price = item.price;
  }
  return [...bySymbol.values()];
}

function positionsFromHoldings(holdings: Holding[]): DividendPosition[] {
  return mergePositions(
    holdings.filter(isStockHolding).map((h) => ({
      symbol: h.symbol,
      name: h.description || h.symbol,
      shares: h.quantity,
      price: h.currentPrice,
      logo: h.logo,
      domain: h.domain,
    }))
  );
}

export default function CashFlowScreen({
  holdings,
  privacyMode = false,
}: CashFlowScreenProps) {
  const parentPositions = useMemo(() => positionsFromHoldings(holdings), [holdings]);
  const [fallbackPositions, setFallbackPositions] = useState<DividendPosition[]>([]);
  const [metaBySymbol, setMetaBySymbol] = useState<Record<string, DividendDetails>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [roadmapOpen, setRoadmapOpen] = useState(false);
  const roadmap = useFinancialRoadmap();
  const todoProgress = useRoadmapTodoProgress();
  const roadmapDone = roadmap
    ? roadmap.todos.filter((todo) => todoProgress.completedIds.includes(todo.id)).length
    : 0;
  const roadmapTotal = roadmap?.todos.length ?? 0;

  const positions = parentPositions.length > 0 ? parentPositions : fallbackPositions;
  const symbolsKey = positions.map((p) => p.symbol).join(",");

  useEffect(() => {
    if (parentPositions.length > 0) {
      setFallbackPositions([]);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const items = await fetchPortfolio();
        if (cancelled) return;
        setFallbackPositions(
          mergePositions(
            items.map((item) => ({
              symbol: item.symbol,
              name: item.symbol,
              shares: item.shares,
              price: 0,
            }))
          )
        );
      } catch {
        if (!cancelled) setFallbackPositions([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [parentPositions.length]);

  useEffect(() => {
    if (!symbolsKey) {
      setMetaBySymbol({});
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/stocks/dividends?symbols=${encodeURIComponent(symbolsKey)}`,
          { signal: controller.signal }
        );
        if (!res.ok) throw new Error(`Dividend request failed (${res.status})`);
        const data = (await res.json()) as DividendsResponse;
        if (cancelled) return;
        const next: Record<string, DividendDetails> = {};
        for (const item of data.items || []) {
          if (item?.symbol) next[item.symbol] = item;
        }
        setMetaBySymbol(next);
      } catch (err) {
        if (cancelled || (err instanceof DOMException && err.name === "AbortError")) return;
        setError("Couldn't load live dividend dates right now. Try again in a moment.");
        setMetaBySymbol({});
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [symbolsKey]);

  useEffect(() => {
    if (!calendarOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCalendarOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [calendarOpen]);

  const annualIncome = useMemo(
    () => positions.reduce((sum, position) => sum + annualDividendIncome(position, metaBySymbol[position.symbol]), 0),
    [positions, metaBySymbol]
  );
  const monthlyIncome = annualIncome / 12;
  const payerCount = positions.filter((position) => annualDividendIncome(position, metaBySymbol[position.symbol]) > 0)
    .length;
  const stockValue = positions.reduce((sum, position) => sum + Math.max(0, position.price) * position.shares, 0);
  const blendedYield = stockValue > 0 ? annualIncome / stockValue : 0;
  const upcoming = useMemo(() => buildUpcomingPayouts(positions, metaBySymbol), [positions, metaBySymbol]);
  const grouped = useMemo(() => groupByMonth(upcoming), [upcoming]);

  return (
    <div className="flex flex-col gap-3" aria-label="Dividend calendar">
      <button
        type="button"
        onClick={() => {
          if (roadmap) {
            setRoadmapOpen(true);
            return;
          }
          requestFinancialOnboarding(true);
        }}
        aria-haspopup="dialog"
        aria-expanded={roadmapOpen}
        aria-controls="financial-roadmap-panel-title"
        className="group w-full overflow-hidden rounded-2xl border border-emerald-400/40 bg-gradient-to-r from-emerald-500 to-emerald-400 p-4 text-left text-[#042F2E] shadow-[0_10px_28px_rgba(16,185,129,0.18)] transition hover:from-emerald-400 hover:to-emerald-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-[#042F2E]/15 text-[#042F2E]">
              <MapIcon size={18} />
            </span>
            <div className="min-w-0">
              <p className="m-0 flex items-center gap-1 text-[13px] font-extrabold tracking-tight">
                View Your Financial Roadmap
                <ChevronRight
                  size={15}
                  strokeWidth={2.75}
                  className="transition-transform group-hover:translate-x-0.5"
                  aria-hidden
                />
              </p>
              <p className="mt-0.5 text-[11px] font-semibold text-[#042F2E]/70">
                {roadmap
                  ? `${roadmap.emoji} ${roadmap.title} · ${roadmapDone}/${roadmapTotal} tasks`
                  : "Build a real-life to-do list from your budget"}
              </p>
            </div>
          </div>
        </div>
      </button>

      <FinancialRoadmapPanel open={roadmapOpen} onClose={() => setRoadmapOpen(false)} />

      <button
        type="button"
        onClick={() => setCalendarOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={calendarOpen}
        aria-controls="upcoming-dividends-dialog"
        className="group w-full overflow-hidden rounded-2xl border border-emerald-500/25 bg-gradient-to-b from-[#0A0A0A] to-black p-4 text-left transition hover:border-emerald-400/45 hover:from-[#0C1410] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl bg-emerald-500/15 text-emerald-400">
              <CalendarDays size={16} />
            </span>
            <div>
              <p className="m-0 flex items-center gap-1 text-[11px] font-extrabold uppercase tracking-[0.12em] text-emerald-400">
                Dividend Calendar
                <ChevronRight
                  size={13}
                  strokeWidth={2.75}
                  className="transition-transform group-hover:translate-x-0.5"
                  aria-hidden
                />
              </p>
              <p className="mt-0.5 text-[11px] font-semibold text-neutral-500">
                {positions.length === 0
                  ? "From your active stock holdings"
                  : `${payerCount} dividend ${payerCount === 1 ? "payer" : "payers"} in the portfolio`}
              </p>
            </div>
          </div>
          {loading && (
            <Loader2 size={16} className="mt-1 flex-shrink-0 animate-spin text-emerald-400" aria-label="Loading dividends" />
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-neutral-800 bg-black/40 px-3 py-2.5">
            <p className="m-0 text-[10px] font-bold uppercase tracking-wide text-neutral-500">Estimated annual</p>
            <p className="mt-1 text-xl font-extrabold tracking-tight text-white">
              {privacyMoney(privacyMode, annualIncome)}
            </p>
          </div>
          <div className="rounded-xl border border-neutral-800 bg-black/40 px-3 py-2.5">
            <p className="m-0 text-[10px] font-bold uppercase tracking-wide text-neutral-500">Monthly average</p>
            <p className="mt-1 text-xl font-extrabold tracking-tight text-emerald-400">
              {privacyMoney(privacyMode, monthlyIncome)}
            </p>
          </div>
        </div>

        <p className="mt-3 text-[11px] font-semibold leading-snug text-neutral-500">
          {error
            ? error
            : positions.length === 0
              ? "Add stocks or ETFs on the Investment tab to estimate dividend cash flow."
              : payerCount === 0 && !loading
                ? "None of the current holdings report a dividend yield yet."
                : `Shares owned × Yahoo dividend per share.${
                    blendedYield > 0 ? ` Blended yield ${(blendedYield * 100).toFixed(2)}%.` : ""
                  }`}
        </p>
      </button>

      {calendarOpen && (
        <div
          className="fixed inset-0 z-[65] flex items-end justify-center bg-slate-950/75 p-4 sm:items-center"
          onClick={() => setCalendarOpen(false)}
          role="presentation"
        >
          <div
            id="upcoming-dividends-dialog"
            className="matter-pop flex w-full max-w-md flex-col overflow-hidden rounded-2xl border border-[#1F1F1F] bg-[#0A0A0A]"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="upcoming-dividends-title"
          >
            <div className="flex items-start justify-between gap-3 border-b border-neutral-800 px-4 py-3.5">
              <div className="flex min-w-0 items-center gap-2">
                <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg bg-emerald-500/15 text-emerald-400">
                  <CalendarDays size={15} />
                </span>
                <div className="min-w-0">
                  <h3 id="upcoming-dividends-title" className="m-0 text-sm font-extrabold text-white">
                    Upcoming Dividends
                  </h3>
                  <p className="mt-0.5 text-[11px] font-semibold text-neutral-500">
                    {upcoming.length === 0 ? "12-month view" : `${upcoming.length} payouts`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCalendarOpen(false)}
                aria-label="Close upcoming dividends"
                className="flex-shrink-0 rounded-lg p-1 text-neutral-500 transition hover:bg-white/5 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            {loading && upcoming.length === 0 ? (
              <div className="flex items-center gap-2 px-4 py-4 text-[12px] font-semibold text-neutral-500">
                <Loader2 size={14} className="animate-spin text-emerald-400" />
                Pulling Yahoo ex-dates and payout estimates…
              </div>
            ) : upcoming.length === 0 ? (
              <div className="mx-4 my-4 flex items-start gap-2 rounded-xl border border-dashed border-neutral-800 bg-black/30 px-3 py-3">
                <Sparkles size={14} className="mt-0.5 flex-shrink-0 text-neutral-600" />
                <p className="m-0 text-[12px] font-semibold leading-snug text-neutral-500">
                  {positions.length === 0
                    ? "Hold a dividend stock such as SCHD, VIG, or IBM and expected payment dates will land here."
                    : "No upcoming dates yet — Yahoo may not list a dividend for these tickers."}
                </p>
              </div>
            ) : (
              <div className="px-4 py-3">
                <div
                  className="matter-dividend-scroll overscroll-contain pr-1"
                  style={{ maxHeight: DIVIDEND_LIST_MAX_HEIGHT }}
                >
                  <ol className="m-0 list-none p-0">
                    {grouped.map((group) => (
                      <li key={group.heading} className="mb-3 last:mb-0">
                        <p className="mb-2 h-[18px] text-[10px] font-extrabold uppercase leading-[18px] tracking-[0.14em] text-neutral-500">
                          {group.heading}
                        </p>
                        <ul className="m-0 flex list-none flex-col gap-2 p-0">
                          {group.items.map((payout) => (
                            <PayoutRow key={payout.id} payout={payout} privacyMode={privacyMode} />
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function groupByMonth(payouts: UpcomingPayout[]): Array<{ heading: string; items: UpcomingPayout[] }> {
  const groups: Array<{ heading: string; items: UpcomingPayout[] }> = [];
  for (const payout of payouts) {
    const heading = formatMonthHeading(payout.date);
    const last = groups[groups.length - 1];
    if (last && last.heading === heading) last.items.push(payout);
    else groups.push({ heading, items: [payout] });
  }
  return groups;
}

function PayoutRow({ payout, privacyMode }: { payout: UpcomingPayout; privacyMode: boolean }) {
  const confirmed = payout.status === "confirmed";
  return (
    <li className="flex h-[52px] items-center gap-3 overflow-hidden rounded-xl border border-neutral-800 bg-black/35 px-2.5">
      <StockLogo symbol={payout.symbol} finnhubLogo={payout.logo} domain={payout.domain} size={34} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="m-0 truncate text-[13px] font-extrabold tracking-tight text-white">{payout.symbol}</p>
          <span
            className={`flex-shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.12em] ${
              confirmed
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                : "border-amber-500/25 bg-amber-500/10 text-amber-300"
            }`}
          >
            {confirmed ? "Confirmed" : "Estimated"}
          </span>
        </div>
        <div className="mt-0.5 flex items-baseline justify-between gap-2">
          <p className="m-0 truncate text-[11px] font-semibold text-neutral-500">
            {payout.dateKind === "payment" ? "Payment" : "Ex-Dividend"} · {formatPayoutDate(payout.date)}
            <span className="text-neutral-600"> · {frequencyLabel(payout.frequency)}</span>
          </p>
          <p className="m-0 flex-shrink-0 text-[13px] font-extrabold text-emerald-400">
            {privacyMoney(privacyMode, payout.amount)}
          </p>
        </div>
      </div>
    </li>
  );
}

function formatCoverage(months: number): string {
  if (months <= 0) return "0 months";
  const rounded = Math.round(months * 10) / 10;
  const label = rounded === 1 ? "month" : "months";
  return `${Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)} ${label}`;
}

function stockPortfolioValue(holdings: Holding[]): number {
  return holdings
    .filter((h): h is StockHolding => h.kind === "stock")
    .reduce((sum, h) => sum + Math.max(0, h.quantity) * Math.max(0, h.currentPrice), 0);
}

export type SafetyNetSectionProps = {
  holdings: Holding[];
  monthlyExpenses: number;
  cash: number;
  onCashChange: (next: number) => void;
  config: SafetyNetConfig;
  onConfigChange: (next: SafetyNetConfig) => void;
  goldPricePerOz: number | null;
  bondPrices: Record<string, number>;
  quotesLoading?: boolean;
  privacyMode?: boolean;
};

export function SafetyNetSection({
  holdings,
  monthlyExpenses,
  cash,
  onCashChange,
  config,
  onConfigChange,
  goldPricePerOz,
  bondPrices,
  quotesLoading = false,
  privacyMode = false,
}: SafetyNetSectionProps) {
  const [open, setOpen] = useState(false);
  const [bondFormOpen, setBondFormOpen] = useState(false);
  const [bondKind, setBondKind] = useState<"amount" | "ticker">("amount");
  const [bondLabel, setBondLabel] = useState("");
  const [bondAmount, setBondAmount] = useState("");
  const [bondSymbol, setBondSymbol] = useState("");
  const [bondShares, setBondShares] = useState("");
  const [bondError, setBondError] = useState("");

  const portfolioValue = useMemo(() => stockPortfolioValue(holdings), [holdings]);
  const totals = useMemo(
    () =>
      computeSafetyNetTotals({
        cash,
        portfolioValue,
        config,
        goldPricePerOz,
        bondPrices,
      }),
    [cash, portfolioValue, config, goldPricePerOz, bondPrices]
  );
  const monthsCovered = monthsOfCoverage(totals.total, monthlyExpenses);
  const cashMonths = monthsOfCoverage(totals.cash, monthlyExpenses);
  const cashProgressPct = coverageProgressPct(cashMonths, SAFETY_NET_STARTER_MONTHS);
  const starterTarget = monthlyExpenses * SAFETY_NET_STARTER_MONTHS;
  const goldOz = goldOunces(config.goldAmount, config.goldUnit);
  const selectedPortfolioPct = Math.round(config.portfolioPct);
  const hysaCash = Math.max(0, config.hysaCash ?? 0);
  const hysaYield = hysaAnnualYield(hysaCash);
  const apyLabel = `${(HYSA_APY * 100).toFixed(1)}% APY`;

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const patchConfig = (partial: Partial<SafetyNetConfig>) => {
    onConfigChange({ ...config, ...partial });
  };

  const setHysaCash = (next: number) => {
    patchConfig({ hysaCash: Math.max(0, next) });
  };

  const updateBond = (id: string, partial: Partial<SafetyNetBond>) => {
    onConfigChange({
      ...config,
      bonds: config.bonds.map((bond) => (bond.id === id ? { ...bond, ...partial } : bond)),
    });
  };

  const removeBond = (id: string) => {
    onConfigChange({ ...config, bonds: config.bonds.filter((bond) => bond.id !== id) });
  };

  const addBond = (bond: SafetyNetBond) => {
    onConfigChange({ ...config, bonds: [...config.bonds, bond] });
  };

  const submitBond = (event: React.FormEvent) => {
    event.preventDefault();
    if (bondKind === "ticker") {
      const symbol = bondSymbol.trim().toUpperCase();
      const shares = parseCurrency(bondShares);
      if (!symbol) {
        setBondError("Enter a ticker such as SGOV or SHY.");
        return;
      }
      if (!Number.isFinite(shares) || shares <= 0) {
        setBondError("Enter how many shares you hold.");
        return;
      }
      addBond({
        id: nextBondId(),
        label: bondLabel.trim() || symbol,
        kind: "ticker",
        amount: 0,
        symbol,
        shares,
      });
    } else {
      const amount = parseCurrency(bondAmount);
      if (!Number.isFinite(amount) || amount <= 0) {
        setBondError("Enter the current value of the T-bill or bond.");
        return;
      }
      addBond({
        id: nextBondId(),
        label: bondLabel.trim() || "Treasury / bond",
        kind: "amount",
        amount,
        symbol: "",
        shares: 0,
      });
    }
    setBondFormOpen(false);
    setBondLabel("");
    setBondAmount("");
    setBondSymbol("");
    setBondShares("");
    setBondError("");
  };

  return (
    <section className="flex flex-col gap-3" aria-label="Emergency Safety Net">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="safety-net-dialog"
        className="matter-safety-trigger group w-full overflow-hidden rounded-2xl border border-emerald-500/25 bg-gradient-to-b from-[#0A0A0A] to-black p-4 text-left transition hover:border-emerald-400/45 hover:from-[#0C1410] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-400/20">
              <ShieldCheck size={18} />
            </span>
            <div className="min-w-0">
              <p className="m-0 flex items-center gap-1 text-[11px] font-extrabold uppercase tracking-[0.12em] text-emerald-400">
                Emergency Safety Net
                <ChevronRight
                  size={13}
                  strokeWidth={2.75}
                  className="transition-transform group-hover:translate-x-0.5"
                  aria-hidden
                />
              </p>
              <p className="mt-0.5 text-[11px] font-semibold leading-snug text-neutral-400">
                {monthlyExpenses > 0
                  ? `${formatCoverage(cashMonths)} of essential spending`
                  : "Cash and yield accounts"}
              </p>
            </div>
          </div>
          {quotesLoading && (
            <Loader2 size={14} className="mt-1 animate-spin text-emerald-400" aria-label="Updating live prices" />
          )}
        </div>

        <p className="mt-4 mb-0 text-[22px] font-extrabold tracking-tight text-white">
          {privacyMoney(privacyMode, totals.cash, 0)}
          {starterTarget > 0 && (
            <span className="ml-1.5 text-[14px] font-semibold text-slate-500">
              / {privacyMoney(privacyMode, starterTarget, 0)}
            </span>
          )}
        </p>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#121212]">
          <div
            className="h-full rounded-full bg-emerald-500 transition-[width] duration-200"
            style={{ width: `${cashProgressPct}%` }}
          />
        </div>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[65] flex items-end justify-center bg-slate-950/75 p-4 sm:items-center"
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <div
            id="safety-net-dialog"
            className="matter-pop flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-[#1F1F1F] bg-[#0A0A0A]"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="safety-net-title"
          >
            <div className="flex items-start justify-between gap-3 border-b border-neutral-800 px-4 py-3.5">
              <div className="flex min-w-0 items-center gap-2">
                <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg bg-emerald-500/15 text-emerald-400">
                  <ShieldCheck size={15} />
                </span>
                <div className="min-w-0">
                  <h3 id="safety-net-title" className="m-0 text-sm font-extrabold text-white">
                    Emergency Safety Net
                  </h3>
                  <p className="mt-0.5 text-[11px] font-semibold text-neutral-500">
                    {privacyMoney(privacyMode, totals.total, 0)}
                    {monthlyExpenses > 0 ? ` · ${formatCoverage(monthsCovered)} of expenses` : ""}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close safety net"
                className="flex-shrink-0 rounded-lg p-1 text-neutral-500 transition hover:bg-white/5 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <div className="matter-dividend-scroll overflow-y-auto px-4 py-3">
              <div className="mb-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2.5">
                <p className="m-0 text-[10px] font-extrabold uppercase tracking-[0.12em] text-emerald-400">
                  Total liquidity
                </p>
                <p className="mt-1 mb-0 text-xl font-extrabold tracking-tight text-white">
                  {privacyMoney(privacyMode, totals.total, 0)}
                </p>
                <p className="mt-1 mb-0 text-[11px] font-semibold text-emerald-200/80">
                  {monthlyExpenses > 0
                    ? `Covers ${formatCoverage(monthsCovered)} of spending (${privacyMoney(privacyMode, monthlyExpenses, 0)}/mo). Target: ${SAFETY_NET_STARTER_MONTHS} months (${privacyMoney(privacyMode, starterTarget, 0)}).`
                    : `Target ${SAFETY_NET_STARTER_MONTHS} months of essential spending.`}
                </p>
              </div>

              <SafetyBucket
                icon={<Wallet size={15} />}
                title="Liquid Cash Reserves"
                hint="Checking, physical cash, or any account you keep ready for instant access — no yield assumed."
                value={privacyMoney(privacyMode, totals.liquidCash, 0)}
              >
                <div className="flex items-center gap-2">
                  <CurrencyField
                    value={cash}
                    onValueChange={onCashChange}
                    aria-label="Liquid cash reserves"
                    className="min-w-0 flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => onCashChange(cash + 100)}
                    className="flex flex-shrink-0 items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-2 text-[11px] font-extrabold text-emerald-400"
                  >
                    <Plus size={12} />
                    $100
                  </button>
                </div>
              </SafetyBucket>

              <SafetyBucket
                icon={<TrendingUp size={15} />}
                title="HYSA & Yield Accounts"
                hint="FDIC-insured high-yield savings and similar cash vehicles earning about 4.5% APY."
                value={privacyMoney(privacyMode, totals.hysaCash, 0)}
                badge={`${apyLabel} · FDIC insured · ~${privacyMoney(privacyMode, hysaYield, 0)}/yr`}
              >
                <div className="flex items-center gap-2">
                  <CurrencyField
                    value={hysaCash}
                    onValueChange={setHysaCash}
                    aria-label="HYSA and yield account balance"
                    className="min-w-0 flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => setHysaCash(hysaCash + 100)}
                    className="flex flex-shrink-0 items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-2 text-[11px] font-extrabold text-emerald-400"
                  >
                    <Plus size={12} />
                    $100
                  </button>
                </div>
              </SafetyBucket>

              <SafetyBucket
                icon={<LineChart size={15} />}
                title="Stock / ETF Portfolio"
                hint="Map a slice of live brokerage holdings into this safety net. Does not sell anything."
                value={privacyMoney(privacyMode, totals.stocks, 0)}
              >
                <p className="m-0 text-[11px] font-semibold text-neutral-500">
                  Live brokerage value {privacyMoney(privacyMode, portfolioValue, 0)}
                  {portfolioValue <= 0 ? " — add holdings on the Investment tab." : ""}
                </p>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={selectedPortfolioPct}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) => {
                    event.stopPropagation();
                    patchConfig({ portfolioPct: Number(event.target.value) });
                  }}
                  aria-label="Percent of brokerage holdings counted as safety net"
                  className="mt-3 w-full cursor-pointer accent-emerald-500"
                />
                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-1.5">
                    {[0, 25, 50, 100].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          patchConfig({ portfolioPct: pct });
                        }}
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-extrabold ${
                          selectedPortfolioPct === pct
                            ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-400"
                            : "border-neutral-800 bg-black/40 text-neutral-400"
                        }`}
                      >
                        {pct === 0 ? "None" : pct === 100 ? "All" : `${pct}%`}
                      </button>
                    ))}
                  </div>
                  <p className="m-0 text-[12px] font-extrabold text-white">{selectedPortfolioPct}%</p>
                </div>
                <p className="mt-2 mb-0 text-[11px] font-semibold text-neutral-500">
                  Counting {privacyMoney(privacyMode, totals.stocks, 0)} of brokerage toward the Safety Net.
                </p>
              </SafetyBucket>

              <SafetyBucket
                icon={<Coins size={15} />}
                title="Gold & Precious Metals"
                hint="Physical or digital gold, marked to the live ounce price."
                value={privacyMoney(privacyMode, totals.gold, 0)}
              >
                <div className="flex items-center gap-2">
                  <DecimalField
                    value={config.goldAmount}
                    onValueChange={(next) => patchConfig({ goldAmount: next })}
                    aria-label={`Gold quantity in ${config.goldUnit === "g" ? "grams" : "ounces"}`}
                    className="min-w-0 flex-1"
                  />
                  <div className="flex flex-shrink-0 overflow-hidden rounded-lg border border-neutral-800">
                    {(["oz", "g"] as const).map((unit) => (
                      <button
                        key={unit}
                        type="button"
                        onClick={() => {
                          if (unit === config.goldUnit) return;
                          patchConfig({
                            goldUnit: unit,
                            goldAmount: convertGoldAmount(config.goldAmount, config.goldUnit, unit),
                          });
                        }}
                        className={`px-2.5 py-2 text-[11px] font-extrabold ${
                          config.goldUnit === unit
                            ? "bg-emerald-500/15 text-emerald-400"
                            : "bg-black/40 text-neutral-500"
                        }`}
                      >
                        {unit}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="mt-2 mb-0 text-[11px] font-semibold text-neutral-500">
                  {goldPricePerOz
                    ? `Live gold ${privacyMoney(privacyMode, goldPricePerOz)} / oz${
                        goldOz > 0 ? ` · ${goldOz.toLocaleString("en-US", { maximumFractionDigits: 4 })} oz` : ""
                      }`
                    : "Fetching the live gold price…"}
                </p>
              </SafetyBucket>

              <SafetyBucket
                icon={<Landmark size={15} />}
                title="Government Bonds / Fixed Income"
                hint="T-bills, bond ETFs such as SGOV or SHY, or local government bonds."
                value={privacyMoney(privacyMode, totals.bonds, 0)}
              >
                {config.bonds.length === 0 ? (
                  <p className="m-0 text-[11px] font-semibold text-neutral-500">
                    Nothing logged yet. Add a T-bill balance or a short-duration fund.
                  </p>
                ) : (
                  <ul className="m-0 flex list-none flex-col gap-2 p-0">
                    {config.bonds.map((bond) => {
                      const value =
                        bond.kind === "ticker"
                          ? Math.max(0, bond.shares) * Math.max(0, bondPrices[bond.symbol] ?? 0)
                          : bond.amount;
                      return (
                        <li
                          key={bond.id}
                          className="flex items-start gap-2 rounded-xl border border-neutral-800 bg-black/35 px-2.5 py-2"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="m-0 truncate text-[12px] font-extrabold text-white">
                              {bond.label}
                              {bond.kind === "ticker" && bond.symbol ? (
                                <span className="ml-1 font-semibold text-neutral-500">{bond.symbol}</span>
                              ) : null}
                            </p>
                            {bond.kind === "ticker" ? (
                              <div className="mt-1 flex items-center gap-2">
                                <DecimalField
                                  value={bond.shares}
                                  onValueChange={(next) => updateBond(bond.id, { shares: next })}
                                  aria-label={`${bond.symbol || bond.label} shares`}
                                  className="w-24"
                                />
                                <span className="text-[10px] font-bold uppercase tracking-wide text-neutral-500">
                                  sh
                                </span>
                                <span className="ml-auto text-[12px] font-extrabold text-white">
                                  {privacyMoney(privacyMode, value, 0)}
                                </span>
                              </div>
                            ) : (
                              <div className="mt-1">
                                <CurrencyField
                                  value={bond.amount}
                                  onValueChange={(next) => updateBond(bond.id, { amount: next })}
                                  aria-label={`${bond.label} value`}
                                />
                              </div>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => removeBond(bond.id)}
                            aria-label={`Remove ${bond.label}`}
                            className="mt-0.5 rounded-lg p-1 text-neutral-600 transition hover:bg-white/5 hover:text-rose-400"
                          >
                            <Trash2 size={13} />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {!bondFormOpen ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setBondKind("amount");
                        setBondLabel("US Treasury bill");
                        setBondFormOpen(true);
                        setBondError("");
                      }}
                      className="rounded-full border border-neutral-800 bg-black/40 px-2.5 py-1 text-[10px] font-extrabold text-neutral-300"
                    >
                      + T-bill
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setBondKind("ticker");
                        setBondLabel("SGOV");
                        setBondSymbol("SGOV");
                        setBondFormOpen(true);
                        setBondError("");
                      }}
                      className="rounded-full border border-neutral-800 bg-black/40 px-2.5 py-1 text-[10px] font-extrabold text-neutral-300"
                    >
                      + SGOV
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setBondKind("ticker");
                        setBondLabel("SHY");
                        setBondSymbol("SHY");
                        setBondFormOpen(true);
                        setBondError("");
                      }}
                      className="rounded-full border border-neutral-800 bg-black/40 px-2.5 py-1 text-[10px] font-extrabold text-neutral-300"
                    >
                      + SHY
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setBondKind("amount");
                        setBondLabel("");
                        setBondFormOpen(true);
                        setBondError("");
                      }}
                      className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-extrabold text-emerald-400"
                    >
                      + Custom
                    </button>
                  </div>
                ) : (
                  <form className="matter-pop mt-3 flex flex-col gap-2 rounded-xl border border-neutral-800 bg-black/40 p-3" onSubmit={submitBond}>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setBondKind("amount");
                          setBondError("");
                        }}
                        className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold ${
                          bondKind === "amount"
                            ? "bg-emerald-500/15 text-emerald-400"
                            : "bg-neutral-900 text-neutral-500"
                        }`}
                      >
                        Dollar amount
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setBondKind("ticker");
                          setBondError("");
                        }}
                        className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold ${
                          bondKind === "ticker"
                            ? "bg-emerald-500/15 text-emerald-400"
                            : "bg-neutral-900 text-neutral-500"
                        }`}
                      >
                        Fund ticker
                      </button>
                    </div>
                    <input
                      value={bondLabel}
                      onChange={(event) => setBondLabel(event.target.value)}
                      placeholder={bondKind === "ticker" ? "Label (optional)" : "e.g. 6-month T-bill"}
                      className="rounded-lg border border-neutral-800 bg-black px-3 py-2 text-[13px] font-semibold text-white outline-none placeholder:text-neutral-600 focus:border-emerald-500/40"
                    />
                    {bondKind === "ticker" ? (
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          value={bondSymbol}
                          onChange={(event) => setBondSymbol(event.target.value.toUpperCase())}
                          placeholder="SGOV"
                          className="rounded-lg border border-neutral-800 bg-black px-3 py-2 text-[13px] font-semibold uppercase text-white outline-none placeholder:text-neutral-600 focus:border-emerald-500/40"
                        />
                        <input
                          value={bondShares}
                          onChange={(event) => setBondShares(formatCurrencyInput(event.target.value))}
                          inputMode="decimal"
                          placeholder="Shares"
                          className="rounded-lg border border-neutral-800 bg-black px-3 py-2 text-[13px] font-semibold text-white outline-none placeholder:text-neutral-600 focus:border-emerald-500/40"
                        />
                      </div>
                    ) : (
                      <input
                        value={bondAmount}
                        onChange={(event) => setBondAmount(formatCurrencyInput(event.target.value))}
                        inputMode="decimal"
                        placeholder="Current value"
                        className="rounded-lg border border-neutral-800 bg-black px-3 py-2 text-[13px] font-semibold text-white outline-none placeholder:text-neutral-600 focus:border-emerald-500/40"
                      />
                    )}
                    {bondError ? <p className="m-0 text-[11px] font-semibold text-rose-400">{bondError}</p> : null}
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setBondFormOpen(false);
                          setBondError("");
                        }}
                        className="rounded-lg px-2.5 py-1.5 text-[11px] font-extrabold text-neutral-500"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="rounded-lg bg-emerald-500 px-2.5 py-1.5 text-[11px] font-extrabold text-emerald-950"
                      >
                        Add holding
                      </button>
                    </div>
                  </form>
                )}
              </SafetyBucket>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function SafetyBucket({
  icon,
  title,
  hint,
  value,
  badge,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  value: string;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-3 rounded-2xl border border-neutral-800 bg-black/30 p-3 last:mb-1">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <span className="mt-0.5 grid h-7 w-7 flex-shrink-0 place-items-center rounded-lg bg-emerald-500/12 text-emerald-400">
            {icon}
          </span>
          <div className="min-w-0">
            <h4 className="m-0 text-[13px] font-extrabold text-white">{title}</h4>
            <p className="mt-0.5 mb-0 text-[11px] font-semibold leading-snug text-neutral-500">{hint}</p>
            {badge ? (
              <p className="mt-1 mb-0 text-[10px] font-extrabold uppercase tracking-[0.1em] text-emerald-400">
                {badge}
              </p>
            ) : null}
          </div>
        </div>
        <p className="m-0 flex-shrink-0 text-[13px] font-extrabold text-white">{value}</p>
      </div>
      {children}
    </section>
  );
}

function CurrencyField({
  value,
  onValueChange,
  className = "",
  ...rest
}: {
  value: number;
  onValueChange: (next: number) => void;
  className?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type">) {
  const [draft, setDraft] = useState(() => formatCurrencyValue(value));
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) setDraft(formatCurrencyValue(value));
  }, [value]);

  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      className={`w-full rounded-lg border border-neutral-800 bg-black px-3 py-2 text-[13px] font-semibold text-white outline-none placeholder:text-neutral-600 focus:border-emerald-500/40 ${className}`}
      value={draft}
      placeholder="0"
      onFocus={(event) => {
        focusedRef.current = true;
        rest.onFocus?.(event);
      }}
      onBlur={(event) => {
        focusedRef.current = false;
        setDraft(formatCurrencyValue(value));
        rest.onBlur?.(event);
      }}
      onChange={(event) => {
        const formatted = formatCurrencyInput(event.target.value);
        setDraft(formatted);
        onValueChange(parseCurrency(formatted));
      }}
    />
  );
}

function DecimalField({
  value,
  onValueChange,
  className = "",
  ...rest
}: {
  value: number;
  onValueChange: (next: number) => void;
  className?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type">) {
  const [draft, setDraft] = useState(() => (value > 0 ? String(value) : ""));
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) setDraft(value > 0 ? String(Number(value.toFixed(6))) : "");
  }, [value]);

  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      className={`w-full rounded-lg border border-neutral-800 bg-black px-3 py-2 text-[13px] font-semibold text-white outline-none placeholder:text-neutral-600 focus:border-emerald-500/40 ${className}`}
      value={draft}
      placeholder="0"
      onFocus={(event) => {
        focusedRef.current = true;
        rest.onFocus?.(event);
      }}
      onBlur={(event) => {
        focusedRef.current = false;
        setDraft(value > 0 ? String(Number(value.toFixed(6))) : "");
        rest.onBlur?.(event);
      }}
      onChange={(event) => {
        const next = event.target.value.replace(/[^0-9.]/g, "");
        setDraft(next);
        const n = Number(next);
        onValueChange(Number.isFinite(n) && n >= 0 ? n : 0);
      }}
    />
  );
}
