import React, { useEffect, useMemo, useState } from "react";
import { Banknote, CalendarDays, Loader2, Sparkles } from "lucide-react";
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
import { privacyMoney } from "../lib/privacy";
import type { Holding, StockHolding } from "./InvestmentPortfolioCard";
import StockLogo from "./StockLogo";

type CashFlowScreenProps = {
  holdings: Holding[];
  privacyMode?: boolean;
};

type DividendsResponse = {
  items?: DividendDetails[];
};

const API_BASE_URL = getApiBaseUrl();

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

export default function CashFlowScreen({ holdings, privacyMode = false }: CashFlowScreenProps) {
  const parentPositions = useMemo(() => positionsFromHoldings(holdings), [holdings]);
  const [fallbackPositions, setFallbackPositions] = useState<DividendPosition[]>([]);
  const [metaBySymbol, setMetaBySymbol] = useState<Record<string, DividendDetails>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <div className="flex flex-col gap-3" aria-label="Passive income and dividend calendar">
      <article className="overflow-hidden rounded-2xl border border-emerald-500/25 bg-gradient-to-b from-[#0A0A0A] to-black p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl bg-emerald-500/15 text-emerald-400">
              <Banknote size={16} />
            </span>
            <div>
              <p className="m-0 text-[11px] font-extrabold uppercase tracking-[0.12em] text-emerald-400">
                Passive Income (Dividends)
              </p>
              <p className="mt-0.5 text-[11px] font-semibold text-neutral-500">
                {positions.length === 0
                  ? "From your active stock holdings"
                  : `${payerCount} dividend ${payerCount === 1 ? "payer" : "payers"} in the portfolio`}
              </p>
            </div>
          </div>
          {loading && <Loader2 size={16} className="mt-1 flex-shrink-0 animate-spin text-emerald-400" aria-label="Loading dividends" />}
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
      </article>

      <section className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/80" aria-label="Upcoming dividend payments">
        <div className="flex items-center justify-between gap-3 p-4 pb-3">
          <div className="flex items-center gap-2">
            <CalendarDays size={15} className="text-emerald-400" />
            <p className="m-0 text-[11px] font-extrabold uppercase tracking-[0.12em] text-neutral-400">
              Upcoming Dividend Payments
            </p>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wide text-neutral-500">
            {upcoming.length === 0 ? "12-month view" : `${upcoming.length} payouts`}
          </span>
        </div>

        {loading && upcoming.length === 0 ? (
          <div className="flex items-center gap-2 px-4 pb-4 text-[12px] font-semibold text-neutral-500">
            <Loader2 size={14} className="animate-spin text-emerald-400" />
            Pulling Yahoo ex-dates and payout estimates…
          </div>
        ) : upcoming.length === 0 ? (
          <div className="mx-4 mb-4 flex items-start gap-2 rounded-xl border border-dashed border-neutral-800 bg-black/30 px-3 py-3">
            <Sparkles size={14} className="mt-0.5 flex-shrink-0 text-neutral-600" />
            <p className="m-0 text-[12px] font-semibold leading-snug text-neutral-500">
              {positions.length === 0
                ? "Hold a dividend stock such as SCHD, VIG, or IBM and expected payment dates will land here."
                : "No upcoming dates yet — Yahoo may not list a dividend for these tickers."}
            </p>
          </div>
        ) : (
          <ol className="m-0 list-none divide-y divide-neutral-800/80 border-t border-neutral-800 p-0">
            {grouped.map((group) => (
              <li key={group.heading} className="px-4 py-3">
                <p className="mb-2 text-[10px] font-extrabold uppercase tracking-[0.14em] text-neutral-500">
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
        )}
      </section>
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
    <li className="flex items-center gap-3 rounded-xl border border-neutral-800 bg-black/35 px-2.5 py-2">
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
