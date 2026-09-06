import React, { useEffect, useMemo, useState } from "react";
import {
  Banknote,
  Bitcoin,
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Landmark,
  Layers,
  Loader2,
  LucideIcon,
  Minus,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { buildHistoricalSeries, RANGE_OPTIONS, RangeOption, seriesChangePct } from "../lib/priceSimulation";
import StockDetailPage from "./StockDetailPage";
import StockLogo from "./StockLogo";

export type StockHolding = {
  id: string;
  kind: "stock";
  symbol: string;
  description: string;
  quantity: number;
  avgCost: number;
  currentPrice: number;
  dayChangePct: number;
  dayChangeAbs: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
  logo?: string;
  domain?: string;
  marketCap?: number;
};

type BrokerHolding = {
  id: string;
  kind: "broker";
  name: string;
  icon: LucideIcon;
  balance: number;
};

export type Holding = StockHolding | BrokerHolding;

function holdingValue(h: Holding): number {
  return h.kind === "stock" ? h.quantity * h.currentPrice : h.balance;
}

function holdingLabel(h: Holding): string {
  return h.kind === "stock" ? `${h.description} (${h.symbol})` : h.name;
}

const ALLOCATION_COLORS = ["#10B981", "#3B82F6", "#F59E0B", "#8B5CF6", "#EC4899", "#22D3EE"];

type BrokerPlatform = { name: string; icon: LucideIcon; color: string };

const BROKER_PLATFORMS: BrokerPlatform[] = [
  { name: "Midas", icon: Sparkles, color: "#8B5CF6" },
  { name: "Robinhood", icon: TrendingUp, color: "#10B981" },
  { name: "Fidelity", icon: Landmark, color: "#3B82F6" },
  { name: "Charles Schwab", icon: Building2, color: "#0EA5E9" },
  { name: "Coinbase", icon: Bitcoin, color: "#F59E0B" },
];

/** Base URL of our Express backend (see /server). Override with VITE_API_BASE_URL if needed. */
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() || "http://localhost:5000";

const SEARCH_DEBOUNCE_MS = 350;

/** Shape returned by GET /api/stocks/search (proxied from Finnhub's /search). */
type StockSearchResult = {
  symbol: string;
  displaySymbol: string;
  description: string;
  type: string;
};

/** Shape returned by GET /api/stocks/quote (proxied from Finnhub's /quote). `c` = current price. */
export type StockQuote = {
  c: number;
  d: number;
  dp: number;
  h: number;
  l: number;
  o: number;
  pc: number;
  t: number;
};

/** Shape returned by GET /api/stocks/profile (proxied from Finnhub's /stock/profile2). */
type StockProfile = {
  name?: string;
  logo?: string;
  weburl?: string;
  marketCapitalization?: number;
};

type SelectedStock = {
  symbol: string;
  description: string;
};

function formatMoney(amount: number) {
  return Math.round(amount).toLocaleString("en-US");
}

function randomMockBalance() {
  return Math.round(500 + Math.random() * 4500);
}

function extractDomain(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

type InvestmentPortfolioCardProps = {
  /** Mirrors the live holdings list up to the parent (e.g. so Socrates AI can reference it). */
  onHoldingsChange?: (holdings: Holding[]) => void;
};

export default function InvestmentPortfolioCard({ onHoldingsChange }: InvestmentPortfolioCardProps) {
  const [range, setRange] = useState<RangeOption>("1D");
  const [holdings, setHoldings] = useState<Holding[]>([]);

  useEffect(() => {
    onHoldingsChange?.(holdings);
  }, [holdings, onHoldingsChange]);
  const [holdingsExpanded, setHoldingsExpanded] = useState(true);
  const [selectedHolding, setSelectedHolding] = useState<StockHolding | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState<"connect" | "manual">("connect");
  const [connectingPlatform, setConnectingPlatform] = useState<string | null>(null);
  const [justAddedId, setJustAddedId] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<StockSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [selectedTicker, setSelectedTicker] = useState<SelectedStock | null>(null);
  const [selectedQuote, setSelectedQuote] = useState<StockQuote | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<StockProfile | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  const [quantity, setQuantity] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");

  // Live stock search — debounced fetch against our Express backend as the user types.
  useEffect(() => {
    if (selectedTicker) {
      return;
    }

    const query = searchQuery.trim();
    if (!query) {
      setSearchResults([]);
      setSearchError(null);
      setSearchLoading(false);
      return;
    }

    setSearchLoading(true);
    setSearchError(null);

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/stocks/search?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`Search request failed (${res.status})`);
        const data: StockSearchResult[] = await res.json();

        // Prefer primary US listings (no exchange suffix like ".TO"/".SW") when available.
        const primary = data.filter((r) => !r.symbol.includes("."));
        setSearchResults((primary.length > 0 ? primary : data).slice(0, 6));
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setSearchResults([]);
          setSearchError("Couldn't reach the server. Is the backend running on :5000?");
        }
      } finally {
        setSearchLoading(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [searchQuery, selectedTicker]);

  const hasHoldings = holdings.length > 0;
  const totalValue = useMemo(() => holdings.reduce((sum, h) => sum + holdingValue(h), 0), [holdings]);

  // Weighted average of each stock's real "today" % change, weighted by its share of
  // total portfolio value (broker/cash-style holdings contribute 0% change and dilute it).
  const portfolioDayChangePct = useMemo(() => {
    if (totalValue <= 0) return 0;
    const weightedSum = holdings.reduce((sum, h) => {
      const dp = h.kind === "stock" ? h.dayChangePct : 0;
      return sum + holdingValue(h) * dp;
    }, 0);
    return weightedSum / totalValue;
  }, [holdings, totalValue]);

  const chartData = useMemo(
    () => buildHistoricalSeries("portfolio-total", range, totalValue, portfolioDayChangePct),
    [range, totalValue, portfolioDayChangePct]
  );

  const gainPct = useMemo(() => seriesChangePct(chartData), [chartData]);
  const isPositive = gainPct > 0;
  const isNegative = gainPct < 0;

  const allocation = useMemo(
    () =>
      holdings.map((h, i) => ({
        id: h.id,
        label: holdingLabel(h),
        pct: totalValue > 0 ? (holdingValue(h) / totalValue) * 100 : 0,
        color: ALLOCATION_COLORS[i % ALLOCATION_COLORS.length],
      })),
    [holdings, totalValue]
  );

  const connectedPlatformNames = useMemo(
    () => new Set(holdings.filter((h): h is BrokerHolding => h.kind === "broker").map((h) => h.name)),
    [holdings]
  );

  const resetManualForm = () => {
    setSearchQuery("");
    setSearchResults([]);
    setSearchError(null);
    setSelectedTicker(null);
    setSelectedQuote(null);
    setSelectedProfile(null);
    setQuoteLoading(false);
    setQuoteError(null);
    setQuantity("");
    setPurchasePrice("");
  };

  const openModal = () => {
    setModalTab("connect");
    resetManualForm();
    setModalOpen(true);
  };

  const closeModal = () => {
    if (connectingPlatform) return;
    setModalOpen(false);
  };

  const connectPlatform = (platform: BrokerPlatform) => {
    if (connectingPlatform || connectedPlatformNames.has(platform.name)) return;
    setConnectingPlatform(platform.name);
    window.setTimeout(() => {
      const id = `${platform.name.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`;
      setHoldings((prev) => [
        ...prev,
        { id, kind: "broker", name: platform.name, balance: randomMockBalance(), icon: platform.icon },
      ]);
      setConnectingPlatform(null);
      setJustAddedId(id);
      setModalOpen(false);
      setHoldingsExpanded(true);
      window.setTimeout(() => setJustAddedId(null), 2000);
    }, 900);
  };

  const selectTicker = async (result: StockSearchResult) => {
    const symbol = result.displaySymbol || result.symbol;
    setSelectedTicker({ symbol, description: result.description });
    setSearchQuery("");
    setSearchResults([]);
    setPurchasePrice("");
    setSelectedQuote(null);
    setSelectedProfile(null);
    setQuoteError(null);
    setQuoteLoading(true);

    const [quoteResult, profileResult] = await Promise.allSettled([
      fetch(`${API_BASE_URL}/api/stocks/quote?symbol=${encodeURIComponent(result.symbol)}`).then((r) => {
        if (!r.ok) throw new Error(`Quote request failed (${r.status})`);
        return r.json() as Promise<StockQuote>;
      }),
      fetch(`${API_BASE_URL}/api/stocks/profile?symbol=${encodeURIComponent(result.symbol)}`).then((r) => {
        if (!r.ok) throw new Error(`Profile request failed (${r.status})`);
        return r.json() as Promise<StockProfile>;
      }),
    ]);

    if (quoteResult.status === "fulfilled" && quoteResult.value.c > 0) {
      setPurchasePrice(quoteResult.value.c.toFixed(2));
      setSelectedQuote(quoteResult.value);
    } else {
      setQuoteError("Couldn't fetch the live price. You can enter it manually.");
    }

    if (profileResult.status === "fulfilled") {
      setSelectedProfile(profileResult.value);
    }

    setQuoteLoading(false);
  };

  const clearSelectedTicker = () => {
    setSelectedTicker(null);
    setSelectedQuote(null);
    setSelectedProfile(null);
    setQuoteError(null);
    setQuoteLoading(false);
    setPurchasePrice("");
  };

  const parsedQuantity = Number(quantity);
  const parsedPrice = Number(purchasePrice);
  const manualValue =
    Number.isFinite(parsedQuantity) && Number.isFinite(parsedPrice) ? parsedQuantity * parsedPrice : 0;
  const canSubmitManual = !!selectedTicker && parsedQuantity > 0 && parsedPrice > 0;

  const submitManualAsset = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmitManual || !selectedTicker) return;

    const id = `manual-${Date.now()}`;
    const currentPrice = selectedQuote && selectedQuote.c > 0 ? selectedQuote.c : parsedPrice;

    setHoldings((prev) => [
      ...prev,
      {
        id,
        kind: "stock",
        symbol: selectedTicker.symbol,
        description: selectedTicker.description,
        quantity: parsedQuantity,
        avgCost: parsedPrice,
        currentPrice,
        dayChangePct: selectedQuote?.dp ?? 0,
        dayChangeAbs: selectedQuote?.d ?? 0,
        open: selectedQuote?.o ?? currentPrice,
        high: selectedQuote?.h ?? currentPrice,
        low: selectedQuote?.l ?? currentPrice,
        prevClose: selectedQuote?.pc ?? currentPrice,
        logo: selectedProfile?.logo,
        domain: extractDomain(selectedProfile?.weburl),
        marketCap: selectedProfile?.marketCapitalization,
      },
    ]);
    resetManualForm();
    setJustAddedId(id);
    setModalOpen(false);
    setHoldingsExpanded(true);
    window.setTimeout(() => setJustAddedId(null), 2000);
  };

  return (
    <article className="rounded-2xl border border-[#1F1F1F] bg-[#0A0A0A] p-4 sm:p-5 shadow-[0_12px_40px_rgba(0,0,0,0.35)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-emerald-500/15 text-emerald-400">
            <Layers size={18} />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Investment Portfolio
            </p>
            <p className="text-[11px] text-slate-500">
              {hasHoldings ? `${holdings.length} holdings` : "No accounts connected yet"}
            </p>
          </div>
        </div>
      </div>

      {hasHoldings && (
        <div className="mt-3 flex gap-1 overflow-x-auto rounded-lg bg-black/30 p-1">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setRange(opt)}
              className={`flex-1 rounded-md px-2 py-1 text-[10px] font-bold transition ${
                range === opt ? "bg-emerald-500 text-[#042F2E]" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      )}

      <div className="mt-4 flex items-end justify-between">
        <p className="text-3xl font-extrabold tracking-tight text-white">
          {hasHoldings ? `$${formatMoney(totalValue)}` : "$0.00"}
        </p>
        {hasHoldings && (
          <span
            className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${
              isPositive
                ? "bg-emerald-500/15 text-emerald-400"
                : isNegative
                ? "bg-rose-500/15 text-rose-400"
                : "bg-slate-500/15 text-slate-400"
            }`}
          >
            {isPositive ? <TrendingUp size={13} /> : isNegative ? <TrendingDown size={13} /> : <Minus size={13} />}
            {isPositive ? "+" : ""}
            {gainPct.toFixed(1)}%
          </span>
        )}
      </div>
      {hasHoldings && <p className="mt-0.5 text-[11px] text-slate-500">Performance · {range}</p>}

      {!hasHoldings ? (
        <div className="mt-4 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[#1F1F1F] bg-black/10 px-4 py-10 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-emerald-500/10 text-emerald-400">
            <Layers size={22} />
          </div>
          <div>
            <p className="text-sm font-bold text-white">You didn't add any stock yet.</p>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
              Connect a broker or add your first investment to start tracking your portfolio.
            </p>
          </div>
          <button
            type="button"
            onClick={openModal}
            className="mt-1 flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-bold text-[#042F2E] transition hover:bg-emerald-400 active:scale-[0.99]"
          >
            <Plus size={14} />
            Add Your First Investment
          </button>
        </div>
      ) : (
        <>
          {/* Total portfolio value chart (Recharts) */}
          <div className="mt-3 -mx-1 h-32">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 6, right: 6, bottom: 0, left: 6 }}>
                <defs>
                  <linearGradient id="portfolioAreaGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10B981" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
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
                  itemStyle={{ color: "#10B981", fontWeight: 700 }}
                  formatter={(value) => [`$${formatMoney(Number(value))}`, "Value"]}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#10B981"
                  strokeWidth={2.5}
                  fill="url(#portfolioAreaGradient)"
                  isAnimationActive={true}
                  animationDuration={400}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-4 space-y-2">
            <div className="flex h-2 w-full overflow-hidden rounded-full bg-black/30">
              {allocation.map((a) => (
                <div key={a.id} style={{ width: `${a.pct}%`, background: a.color }} />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {allocation.map((a) => (
                <div key={a.id} className="flex max-w-full items-center gap-1.5 text-[11px] font-semibold text-slate-300">
                  <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: a.color }} />
                  <span className="truncate">{a.label}</span> {a.pct.toFixed(0)}%
                </div>
              ))}
            </div>
          </div>

          {/* Collapsible vertical holdings list */}
          <div className="mt-4 overflow-hidden rounded-xl border border-[#1F1F1F] bg-black/10">
            <button
              type="button"
              onClick={() => setHoldingsExpanded((v) => !v)}
              aria-expanded={holdingsExpanded}
              className="flex w-full items-center justify-between gap-2 px-3.5 py-3 text-left"
            >
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Holdings</span>
                <span className="rounded-full bg-black/30 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                  {holdings.length}
                </span>
              </div>
              {holdingsExpanded ? (
                <ChevronUp size={16} className="text-slate-500 transition-transform duration-300" />
              ) : (
                <ChevronDown size={16} className="text-slate-500 transition-transform duration-300" />
              )}
            </button>

            <div
              className={`overflow-hidden transition-all duration-300 ease-in-out ${
                holdingsExpanded ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"
              }`}
            >
              <div className="space-y-2 px-3 pb-3">
                {holdings.map((h) => {
                  const highlight = h.id === justAddedId;
                  const value = holdingValue(h);
                  const isStock = h.kind === "stock";

                  return (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => isStock && setSelectedHolding(h)}
                      disabled={!isStock}
                      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all duration-500 ${
                        highlight ? "border-emerald-500/60 bg-emerald-500/10" : "border-[#1F1F1F] bg-black/20"
                      } ${isStock ? "hover:border-emerald-500/40 hover:bg-emerald-500/5 active:scale-[0.99]" : "cursor-default"}`}
                    >
                      {isStock ? (
                        <StockLogo symbol={h.symbol} finnhubLogo={h.logo} domain={h.domain} size={32} />
                      ) : (
                        <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg bg-[#3B82F6]/15 text-[#60A5FA]">
                          <h.icon size={15} />
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-bold text-white">{holdingLabel(h)}</p>
                        <p className="text-[10px] text-slate-500">
                          {isStock ? `${h.quantity} sh · $${h.avgCost.toFixed(2)} avg cost` : "Connected account"}
                        </p>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <p className="text-xs font-bold text-white">${formatMoney(value)}</p>
                        {isStock && (
                          <p
                            className={`text-[10px] font-bold ${
                              h.dayChangePct > 0
                                ? "text-emerald-400"
                                : h.dayChangePct < 0
                                ? "text-rose-400"
                                : "text-slate-500"
                            }`}
                          >
                            {h.dayChangePct > 0 ? "+" : ""}
                            {h.dayChangePct.toFixed(2)}%
                          </p>
                        )}
                      </div>
                      {isStock && <ChevronRight size={14} className="flex-shrink-0 text-slate-500" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={openModal}
            className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-emerald-500/40 bg-emerald-500/5 px-4 py-2.5 text-xs font-bold text-emerald-300 transition hover:border-emerald-500/70 hover:bg-emerald-500/10 active:scale-[0.99]"
          >
            <Plus size={14} />
            Add Asset / Connect Account
          </button>
        </>
      )}

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/75 p-4 sm:items-center"
          onClick={closeModal}
          role="presentation"
        >
          <div
            className="matter-pop w-full max-w-sm rounded-2xl border border-[#1F1F1F] bg-[#0A0A0A] p-5"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="portfolio-modal-title"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-500/15 text-emerald-400">
                  <Wallet size={17} />
                </span>
                <h3 id="portfolio-modal-title" className="text-sm font-extrabold leading-snug text-white">
                  Add Asset / Connect Account
                </h3>
              </div>
              <button
                type="button"
                onClick={closeModal}
                aria-label="Close"
                className="text-slate-400 transition hover:text-white"
                disabled={!!connectingPlatform}
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-4 flex gap-1 rounded-lg bg-black/30 p-1">
              <button
                type="button"
                onClick={() => setModalTab("connect")}
                className={`flex-1 rounded-md py-1.5 text-xs font-bold transition ${
                  modalTab === "connect" ? "bg-emerald-500 text-[#042F2E]" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Connect Broker / App
              </button>
              <button
                type="button"
                onClick={() => setModalTab("manual")}
                className={`flex-1 rounded-md py-1.5 text-xs font-bold transition ${
                  modalTab === "manual" ? "bg-emerald-500 text-[#042F2E]" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Manual Entry
              </button>
            </div>

            {modalTab === "connect" && (
              <div className="mt-4 space-y-2">
                <p className="text-[11px] leading-relaxed text-slate-500">
                  Pick a platform to simulate an auto-sync connection.
                </p>
                {BROKER_PLATFORMS.map((platform) => {
                  const Icon = platform.icon;
                  const isConnected = connectedPlatformNames.has(platform.name);
                  const isConnecting = connectingPlatform === platform.name;
                  return (
                    <button
                      key={platform.name}
                      type="button"
                      onClick={() => connectPlatform(platform)}
                      disabled={isConnected || !!connectingPlatform}
                      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
                        isConnected
                          ? "cursor-default border-[#1F1F1F]/60 bg-black/10 opacity-60"
                          : "border-[#1F1F1F] bg-black/20 hover:border-emerald-500/40 hover:bg-emerald-500/5 active:scale-[0.99]"
                      }`}
                    >
                      <span
                        className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg"
                        style={{ background: `${platform.color}26`, color: platform.color }}
                      >
                        <Icon size={16} />
                      </span>
                      <span className="flex-1 text-xs font-bold text-white">{platform.name}</span>
                      {isConnecting ? (
                        <Loader2 size={15} className="animate-spin text-emerald-400" />
                      ) : isConnected ? (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400">
                          <Check size={12} /> Connected
                        </span>
                      ) : (
                        <ShieldCheck size={15} className="text-slate-500" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {modalTab === "manual" && (
              <form onSubmit={submitManualAsset} className="mt-4 space-y-3">
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    Search Stock
                  </label>

                  {!selectedTicker ? (
                    <div className="relative mt-1">
                      <div className="flex items-center gap-2 rounded-xl border border-[#1F1F1F] bg-black/20 px-3 py-2 focus-within:border-emerald-500/50">
                        {searchLoading ? (
                          <Loader2 size={14} className="flex-shrink-0 animate-spin text-slate-500" />
                        ) : (
                          <Search size={14} className="flex-shrink-0 text-slate-500" />
                        )}
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Search by ticker or company (e.g. AAPL, Tesla)"
                          autoComplete="off"
                          className="w-full bg-transparent text-xs font-semibold text-white outline-none placeholder:text-slate-600"
                        />
                      </div>

                      {searchResults.length > 0 && (
                        <div className="mt-1.5 max-h-52 overflow-y-auto rounded-xl border border-[#1F1F1F] bg-black/40">
                          {searchResults.map((result) => (
                            <button
                              key={result.symbol}
                              type="button"
                              onClick={() => void selectTicker(result)}
                              className="flex w-full items-center justify-between gap-2 border-b border-[#1F1F1F]/60 px-3 py-2 text-left transition last:border-b-0 hover:bg-emerald-500/10"
                            >
                              <div className="flex min-w-0 items-center gap-2">
                                <span className="flex-shrink-0 rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-extrabold text-emerald-300">
                                  {result.displaySymbol || result.symbol}
                                </span>
                                <span className="truncate text-[11px] text-slate-300">{result.description}</span>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}

                      {searchError && <p className="mt-1.5 text-[11px] text-rose-400">{searchError}</p>}

                      {!searchError &&
                        !searchLoading &&
                        searchQuery.trim().length > 0 &&
                        searchResults.length === 0 && (
                          <p className="mt-1.5 text-[11px] text-slate-500">
                            No matches. Try a different ticker or company name.
                          </p>
                        )}
                    </div>
                  ) : (
                    <div className="mt-1 space-y-1.5">
                      <div className="flex items-center justify-between gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <StockLogo
                            symbol={selectedTicker.symbol}
                            finnhubLogo={selectedProfile?.logo}
                            domain={extractDomain(selectedProfile?.weburl)}
                            size={22}
                          />
                          <span className="flex-shrink-0 rounded-md bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-extrabold text-emerald-300">
                            {selectedTicker.symbol}
                          </span>
                          <span className="truncate text-[11px] font-semibold text-white">
                            {selectedTicker.description}
                          </span>
                        </div>
                        {quoteLoading ? (
                          <Loader2 size={13} className="flex-shrink-0 animate-spin text-emerald-400" />
                        ) : (
                          <button
                            type="button"
                            onClick={clearSelectedTicker}
                            aria-label="Change selected stock"
                            className="flex-shrink-0 text-slate-400 transition hover:text-white"
                          >
                            <X size={13} />
                          </button>
                        )}
                      </div>
                      {quoteLoading && (
                        <p className="text-[11px] text-slate-500">Fetching live market price…</p>
                      )}
                      {!quoteLoading && !quoteError && purchasePrice && (
                        <p className="text-[11px] font-semibold text-emerald-300">
                          Live price: ${purchasePrice}
                          {selectedQuote && (
                            <span className={selectedQuote.dp >= 0 ? "text-emerald-300" : "text-rose-400"}>
                              {" "}
                              ({selectedQuote.dp >= 0 ? "+" : ""}
                              {selectedQuote.dp.toFixed(2)}% today)
                            </span>
                          )}
                        </p>
                      )}
                      {quoteError && <p className="text-[11px] text-rose-400">{quoteError}</p>}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="asset-qty" className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      Quantity
                    </label>
                    <input
                      id="asset-qty"
                      type="text"
                      inputMode="decimal"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value.replace(/[^0-9.]/g, ""))}
                      placeholder="10"
                      className="mt-1 w-full rounded-xl border border-[#1F1F1F] bg-black/20 px-3 py-2 text-xs font-semibold text-white outline-none placeholder:text-slate-600 focus:border-emerald-500/50"
                    />
                  </div>
                  <div>
                    <label htmlFor="asset-price" className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      Purchase Price
                    </label>
                    <div className="mt-1 flex items-center gap-2 rounded-xl border border-[#1F1F1F] bg-black/20 px-3 py-2 focus-within:border-emerald-500/50">
                      <Banknote size={14} className="flex-shrink-0 text-slate-500" />
                      <input
                        id="asset-price"
                        type="text"
                        inputMode="decimal"
                        value={purchasePrice}
                        onChange={(e) => setPurchasePrice(e.target.value.replace(/[^0-9.]/g, ""))}
                        placeholder="185.50"
                        className="w-full bg-transparent text-xs font-semibold text-white outline-none placeholder:text-slate-600"
                      />
                    </div>
                  </div>
                </div>

                {selectedTicker && manualValue > 0 && (
                  <p className="text-[11px] font-semibold text-emerald-300">
                    Estimated value: ${formatMoney(manualValue)}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={!canSubmitManual}
                  className={`flex w-full items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-bold transition active:scale-[0.99] ${
                    canSubmitManual
                      ? "bg-emerald-500 text-[#042F2E] hover:bg-emerald-400"
                      : "cursor-not-allowed bg-black/30 text-slate-600"
                  }`}
                >
                  <Plus size={15} />
                  Add to Portfolio
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {selectedHolding && <StockDetailPage holding={selectedHolding} onBack={() => setSelectedHolding(null)} />}
    </article>
  );
}
