import React, { useEffect, useMemo, useState } from "react";
import {
  Banknote,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ExternalLink,
  Layers,
  Loader2,
  LucideIcon,
  Plus,
  Search,
  Wallet,
  X,
} from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  buildHistoricalSeries,
  RANGE_OPTIONS,
  RangeOption,
  SeriesPoint,
  seriesChangeAbs,
  seriesChangePct,
} from "../lib/priceSimulation";
import {
  createPortfolioItem,
  deletePortfolioItem,
  fetchPortfolio,
  getApiBaseUrl,
  type PortfolioApiItem,
} from "../lib/auth";
import DailyReportScreen from "./DailyReportScreen";
import SocratesPortfolioReport from "./SocratesPortfolioReport";
import StockDetailPage from "./StockDetailPage";
import StockLogo from "./StockLogo";
import WatchlistsSection from "./WatchlistsSection";

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

type BrokerPlatform = {
  name: string;
  tag: string;
  color: string;
  domain: string;
  partnerUrl: string;
  initials: string;
};

const BROKER_PLATFORMS: BrokerPlatform[] = [
  {
    name: "Robinhood",
    tag: "Popular for Stocks & Options",
    color: "#00C805",
    domain: "robinhood.com",
    partnerUrl: "https://robinhood.com/us/en/?ref=matterpro",
    initials: "RH",
  },
  {
    name: "Webull",
    tag: "Commission-free trading",
    color: "#E11D2E",
    domain: "webull.com",
    partnerUrl: "https://www.webull.com/?ref=matterpro",
    initials: "WB",
  },
  {
    name: "Interactive Brokers",
    tag: "Pro tools & global markets",
    color: "#DC0128",
    domain: "interactivebrokers.com",
    partnerUrl: "https://www.interactivebrokers.com/?ref=matterpro",
    initials: "IB",
  },
  {
    name: "Fidelity",
    tag: "Full-service investing",
    color: "#4B8B3B",
    domain: "fidelity.com",
    partnerUrl: "https://www.fidelity.com/?ref=matterpro",
    initials: "F",
  },
  {
    name: "Charles Schwab",
    tag: "Trusted wealth platform",
    color: "#00A0DF",
    domain: "schwab.com",
    partnerUrl: "https://www.schwab.com/?ref=matterpro",
    initials: "CS",
  },
];

function BrokerLogo({ platform }: { platform: BrokerPlatform }) {
  const [failed, setFailed] = useState(false);
  const src = `https://www.google.com/s2/favicons?sz=128&domain=${platform.domain}`;

  return (
    <span
      className="grid h-11 w-11 flex-shrink-0 place-items-center overflow-hidden rounded-xl"
      style={{ background: `${platform.color}22`, color: platform.color }}
    >
      {failed ? (
        <span className="text-[11px] font-extrabold tracking-tight">{platform.initials}</span>
      ) : (
        <img
          src={src}
          alt={`${platform.name} logo`}
          width={28}
          height={28}
          className="h-7 w-7 rounded-md object-contain"
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}

/** Base URL of our Express backend (see /server). Override with VITE_API_BASE_URL if needed. */
const API_BASE_URL = getApiBaseUrl();

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

function formatMoney(amount: number, digits = 2) {
  return amount.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatAxisMoney(amount: number) {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 10_000) return `$${(amount / 1_000).toFixed(1)}k`;
  if (amount >= 1_000) return `$${formatMoney(amount, 0)}`;
  return `$${formatMoney(amount, 0)}`;
}

const GAIN_GREEN = "#10B981";
const LOSS_RED = "#EF4444";

function extractDomain(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

type InvestmentPortfolioCardProps = {
  /** Mirrors the live holdings list up to the parent (e.g. so Matter AI can reference it). */
  onHoldingsChange?: (holdings: Holding[]) => void;
  /** Opens the Matter AI chat tab from the insights card. */
  onConsultSocrates?: () => void;
};

function PortfolioActionButtons({
  onAddStock,
  onConnectBroker,
}: {
  onAddStock: () => void;
  onConnectBroker: () => void;
}) {
  return (
    <div className="mt-4 flex flex-col gap-2">
      <button
        type="button"
        onClick={onAddStock}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#10B981] px-4 py-3 text-sm font-bold text-[#042F2E] transition hover:bg-emerald-400 active:scale-[0.99]"
      >
        <Plus size={16} />
        Add Stock
      </button>
      <button
        type="button"
        onClick={onConnectBroker}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-[#2A2A2A] bg-[#0A0A0A] px-4 py-3 text-sm font-bold text-white transition hover:border-[#3F3F3F] hover:bg-[#111111] active:scale-[0.99]"
      >
        <Wallet size={16} />
        Connect Broker
      </button>
    </div>
  );
}

async function enrichStockHolding(item: PortfolioApiItem): Promise<StockHolding> {
  const [quoteResult, profileResult] = await Promise.allSettled([
    fetch(`${API_BASE_URL}/api/stocks/quote?symbol=${encodeURIComponent(item.symbol)}`).then((r) => {
      if (!r.ok) throw new Error(`Quote request failed (${r.status})`);
      return r.json() as Promise<StockQuote>;
    }),
    fetch(`${API_BASE_URL}/api/stocks/profile?symbol=${encodeURIComponent(item.symbol)}`).then((r) => {
      if (!r.ok) throw new Error(`Profile request failed (${r.status})`);
      return r.json() as Promise<StockProfile>;
    }),
  ]);

  const quote = quoteResult.status === "fulfilled" ? quoteResult.value : null;
  const profile = profileResult.status === "fulfilled" ? profileResult.value : null;
  const currentPrice = quote && quote.c > 0 ? quote.c : item.buyPrice;

  return {
    id: item.id,
    kind: "stock",
    symbol: item.symbol,
    description: profile?.name || item.symbol,
    quantity: item.shares,
    avgCost: item.buyPrice,
    currentPrice,
    dayChangePct: quote?.dp ?? 0,
    dayChangeAbs: quote?.d ?? 0,
    open: quote?.o ?? currentPrice,
    high: quote?.h ?? currentPrice,
    low: quote?.l ?? currentPrice,
    prevClose: quote?.pc ?? currentPrice,
    logo: profile?.logo,
    domain: extractDomain(profile?.weburl),
    marketCap: profile?.marketCapitalization,
  };
}

export default function InvestmentPortfolioCard({
  onHoldingsChange,
  onConsultSocrates,
}: InvestmentPortfolioCardProps) {
  const [range, setRange] = useState<RangeOption>("1D");
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [hoverPoint, setHoverPoint] = useState<SeriesPoint | null>(null);
  const [portfolioLoading, setPortfolioLoading] = useState(true);
  const [portfolioError, setPortfolioError] = useState<string | null>(null);
  const [savingAsset, setSavingAsset] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    onHoldingsChange?.(holdings);
  }, [holdings, onHoldingsChange]);
  const [holdingsExpanded, setHoldingsExpanded] = useState(true);
  const [selectedHolding, setSelectedHolding] = useState<StockHolding | null>(null);
  const [dailyReportOpen, setDailyReportOpen] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState<"connect" | "manual">("connect");
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

  // Load persisted portfolio for the authenticated user, then enrich with live quotes.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setPortfolioLoading(true);
      setPortfolioError(null);
      try {
        const items = await fetchPortfolio();
        const stocks = await Promise.all(items.map((item) => enrichStockHolding(item)));
        if (cancelled) return;
        setHoldings((prev) => {
          const brokers = prev.filter((h): h is BrokerHolding => h.kind === "broker");
          return [...stocks, ...brokers];
        });
      } catch (err) {
        if (!cancelled) {
          setPortfolioError(err instanceof Error ? err.message : "Couldn't load portfolio");
        }
      } finally {
        if (!cancelled) setPortfolioLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

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
  const gainAbs = useMemo(() => seriesChangeAbs(chartData), [chartData]);
  const isPositive = gainPct > 0;
  const isNegative = gainPct < 0;
  const gainColor = isNegative ? LOSS_RED : GAIN_GREEN;

  const yDomain = useMemo(() => {
    const values = chartData.map((p) => p.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = Math.max((max - min) * 0.08, (max || 1) * 0.01);
    return [Math.max(0, min - pad), max + pad] as [number, number];
  }, [chartData]);

  const displayValue = hoverPoint?.value ?? totalValue;
  const displayGainAbs = hoverPoint
    ? hoverPoint.value - (chartData[0]?.value ?? 0)
    : gainAbs;
  const displayGainPct = hoverPoint
    ? chartData[0]?.value
      ? ((hoverPoint.value - chartData[0].value) / chartData[0].value) * 100
      : 0
    : gainPct;
  const displayPositive = displayGainPct > 0;
  const displayNegative = displayGainPct < 0;
  const displayGainColor = displayNegative ? LOSS_RED : GAIN_GREEN;

  const xTickIndexes = useMemo(() => {
    const n = chartData.length;
    if (n <= 1) return [0];
    if (range === "1W") {
      // Mon, Wed, Fri, Now — sparse weekday labels
      return [0, 2, 4, n - 1].filter((i, idx, arr) => arr.indexOf(i) === idx && i < n);
    }
    if (range === "1D") return [0, Math.floor(n / 3), Math.floor((2 * n) / 3), n - 1];
    return [0, Math.floor(n / 3), Math.floor((2 * n) / 3), n - 1];
  }, [chartData.length, range]);

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

  const openModal = (tab: "connect" | "manual" = "connect") => {
    setModalTab(tab);
    resetManualForm();
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
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

  const submitManualAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmitManual || !selectedTicker || savingAsset) return;

    setSavingAsset(true);
    setQuoteError(null);
    try {
      const saved = await createPortfolioItem({
        symbol: selectedTicker.symbol,
        shares: parsedQuantity,
        buyPrice: parsedPrice,
      });

      const currentPrice = selectedQuote && selectedQuote.c > 0 ? selectedQuote.c : parsedPrice;
      const holding: StockHolding = {
        id: saved.id,
        kind: "stock",
        symbol: selectedTicker.symbol,
        description: selectedTicker.description || selectedProfile?.name || selectedTicker.symbol,
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
      };

      setHoldings((prev) => [holding, ...prev]);
      resetManualForm();
      setJustAddedId(holding.id);
      setModalOpen(false);
      setHoldingsExpanded(true);
      window.setTimeout(() => setJustAddedId(null), 2000);
    } catch (err) {
      setQuoteError(err instanceof Error ? err.message : "Couldn't save this asset");
    } finally {
      setSavingAsset(false);
    }
  };

  const removeHolding = async (id: string) => {
    const target = holdings.find((h) => h.id === id);
    if (!target || removingId) return;

    if (target.kind === "broker") {
      setHoldings((prev) => prev.filter((h) => h.id !== id));
      if (selectedHolding?.id === id) setSelectedHolding(null);
      return;
    }

    setRemovingId(id);
    try {
      await deletePortfolioItem(id);
      setHoldings((prev) => prev.filter((h) => h.id !== id));
      if (selectedHolding?.id === id) setSelectedHolding(null);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Couldn't remove this asset");
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <article className="rounded-2xl border border-[#1F2937] bg-[#000000] p-4 sm:p-5 shadow-[0_12px_40px_rgba(0,0,0,0.35)]">
      {portfolioLoading && (
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-[#1F2937] bg-[#0A0A0A] px-3 py-2 text-xs font-semibold text-[#9CA3AF]">
          <Loader2 size={14} className="animate-spin text-emerald-400" />
          Loading your saved portfolio…
        </div>
      )}
      {portfolioError && (
        <div className="mb-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-300">
          {portfolioError}
        </div>
      )}
      {/* Portfolio hero */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
            Portfolio Value
          </p>
          <p className="mt-1 text-3xl font-extrabold tracking-tight text-white tabular-nums">
            ${formatMoney(displayValue)}
          </p>
          {hasHoldings && (
            <p
              className="mt-1.5 text-sm font-bold tabular-nums"
              style={{ color: displayGainColor }}
            >
              {displayPositive ? "+" : displayNegative ? "-" : ""}
              ${formatMoney(Math.abs(displayGainAbs))} ({displayPositive ? "+" : ""}
              {displayGainPct.toFixed(2)}%)
              {hoverPoint ? (
                <span className="ml-1.5 text-[11px] font-semibold text-[#9CA3AF]">
                  · {hoverPoint.label}
                </span>
              ) : (
                <span className="ml-1.5 text-[11px] font-semibold text-[#9CA3AF]">· {range}</span>
              )}
            </p>
          )}
          {!hasHoldings && (
            <p className="mt-1 text-[11px] text-[#9CA3AF]">No accounts connected yet</p>
          )}
        </div>
        <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-emerald-500/15 text-emerald-400">
          <Layers size={18} />
        </div>
      </div>

      {/* AI daily report — above chart (below portfolio value) */}
      <div className="mt-4">
        <SocratesPortfolioReport onOpenReport={() => setDailyReportOpen(true)} />
      </div>

      {!hasHoldings ? (
        <div className="mt-4 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[#1F2937] bg-black/10 px-4 py-10 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-emerald-500/10 text-emerald-400">
            <Layers size={22} />
          </div>
          <div>
            <p className="text-sm font-bold text-white">You didn&apos;t add any stock yet.</p>
            <p className="mt-1 text-[11px] leading-relaxed text-[#9CA3AF]">
              Connect a broker or add your first investment to start tracking your portfolio.
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Chart + timeframe (Google Finance / Midas style) */}
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-end">
              <div className="flex gap-0.5 rounded-lg border border-[#1F2937] bg-black/40 p-0.5">
                {RANGE_OPTIONS.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => {
                      setRange(opt);
                      setHoverPoint(null);
                    }}
                    className={`rounded-md px-2.5 py-1 text-[10px] font-bold transition ${
                      range === opt
                        ? "bg-emerald-500 text-[#042F2E]"
                        : "text-[#9CA3AF] hover:text-white"
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>

            <div className="h-44 -mx-1 sm:h-48">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={chartData}
                  margin={{ top: 8, right: 8, bottom: 4, left: 0 }}
                  onMouseMove={(state) => {
                    const payload = (
                      state as { activePayload?: Array<{ payload?: SeriesPoint }> }
                    )?.activePayload?.[0]?.payload;
                    if (payload) setHoverPoint(payload);
                  }}
                  onMouseLeave={() => setHoverPoint(null)}
                >
                  <defs>
                    <linearGradient id="portfolioAreaGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={gainColor} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={gainColor} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <YAxis
                    domain={yDomain}
                    width={46}
                    tickFormatter={formatAxisMoney}
                    tick={{ fill: "#9CA3AF", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    tickCount={4}
                  />
                  <XAxis
                    dataKey="t"
                    tick={{ fill: "#9CA3AF", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    ticks={xTickIndexes}
                    tickFormatter={(t) => chartData[Number(t)]?.label ?? ""}
                    minTickGap={20}
                  />
                  <Tooltip
                    cursor={{ stroke: "#FFFFFF", strokeWidth: 1, strokeDasharray: "4 4", opacity: 0.45 }}
                    content={() => null}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke={gainColor}
                    strokeWidth={2.5}
                    fill="url(#portfolioAreaGradient)"
                    isAnimationActive={true}
                    animationDuration={400}
                    activeDot={{
                      r: 5,
                      fill: gainColor,
                      stroke: "#000000",
                      strokeWidth: 2,
                    }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Allocation bar */}
          <div className="mt-4 space-y-2">
            <div className="flex h-2 w-full overflow-hidden rounded-full bg-black/30">
              {allocation.map((a) => (
                <div key={a.id} style={{ width: `${a.pct}%`, background: a.color }} />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {allocation.map((a) => (
                <div
                  key={a.id}
                  className="flex max-w-full items-center gap-1.5 text-[11px] font-semibold text-[#9CA3AF]"
                >
                  <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: a.color }} />
                  <span className="truncate text-white/90">{a.label}</span> {a.pct.toFixed(0)}%
                </div>
              ))}
            </div>
          </div>

          {/* Asset list — Midas style */}
          <div className="mt-5">
            <button
              type="button"
              onClick={() => setHoldingsExpanded((v) => !v)}
              aria-expanded={holdingsExpanded}
              className="flex w-full items-center justify-between gap-2 text-left"
            >
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wide text-[#9CA3AF]">
                  Assets
                </span>
                <span className="rounded-full bg-[#1F2937] px-2 py-0.5 text-[10px] font-bold text-[#9CA3AF]">
                  {holdings.length}
                </span>
              </div>
              {holdingsExpanded ? (
                <ChevronUp size={16} className="text-[#9CA3AF]" />
              ) : (
                <ChevronDown size={16} className="text-[#9CA3AF]" />
              )}
            </button>

            <div
              className={`overflow-hidden transition-all duration-300 ease-in-out ${
                holdingsExpanded ? "mt-2 max-h-[2000px] opacity-100" : "max-h-0 opacity-0"
              }`}
            >
              <div className="divide-y divide-[#1F2937]">
                {holdings.map((h) => {
                  const highlight = h.id === justAddedId;
                  const value = holdingValue(h);
                  const isStock = h.kind === "stock";
                  const dayAbs =
                    isStock ? h.quantity * h.dayChangeAbs : 0;
                  const dayPct = isStock ? h.dayChangePct : 0;
                  const dayUp = dayPct > 0;
                  const dayDown = dayPct < 0;
                  const dayColor = dayDown ? LOSS_RED : dayUp ? GAIN_GREEN : "#9CA3AF";

                  return (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => isStock && setSelectedHolding(h)}
                      disabled={!isStock}
                      className={`flex w-full items-center gap-3 py-3.5 text-left transition ${
                        highlight ? "bg-emerald-500/10" : ""
                      } ${isStock ? "hover:bg-white/[0.03] active:scale-[0.995]" : "cursor-default"}`}
                    >
                      {isStock ? (
                        <StockLogo symbol={h.symbol} finnhubLogo={h.logo} domain={h.domain} size={40} />
                      ) : (
                        <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full bg-[#3B82F6]/15 text-[#60A5FA]">
                          <h.icon size={18} />
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        {isStock ? (
                          <>
                            <p className="truncate text-sm font-bold text-white">{h.symbol}</p>
                            <p className="truncate text-[11px] text-[#9CA3AF]">
                              {h.description} · {h.quantity} sh
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="truncate text-sm font-bold text-white">{h.name}</p>
                            <p className="text-[11px] text-[#9CA3AF]">Connected account</p>
                          </>
                        )}
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <p className="text-sm font-bold tabular-nums text-white">
                          ${formatMoney(value)}
                        </p>
                        {isStock && (
                          <p className="text-[11px] font-bold tabular-nums" style={{ color: dayColor }}>
                            {dayUp ? "+" : dayDown ? "-" : ""}
                            ${formatMoney(Math.abs(dayAbs))} ({dayUp ? "+" : ""}
                            {dayPct.toFixed(2)}%)
                          </p>
                        )}
                      </div>
                      {isStock && <ChevronRight size={14} className="flex-shrink-0 text-[#9CA3AF]" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}

      <PortfolioActionButtons
        onAddStock={() => openModal("manual")}
        onConnectBroker={() => openModal("connect")}
      />

      <WatchlistsSection />

      {modalOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/75 p-4 sm:items-center"
          onClick={closeModal}
          role="presentation"
        >
          <div
            className="matter-pop w-full max-w-md overflow-y-auto rounded-2xl border border-[#1F1F1F] bg-[#0A0A0A] p-5 max-h-[min(88vh,720px)]"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="portfolio-modal-title"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                {modalTab === "manual" ? (
                  <button
                    type="button"
                    onClick={() => setModalTab("connect")}
                    aria-label="Back to brokers"
                    className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-white/5 text-slate-300 transition hover:bg-white/10 hover:text-white"
                  >
                    <ChevronLeft size={17} />
                  </button>
                ) : (
                  <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-emerald-500/15 text-emerald-400">
                    <Wallet size={17} />
                  </span>
                )}
                <div className="min-w-0">
                  <h3 id="portfolio-modal-title" className="text-sm font-extrabold leading-snug text-white">
                    {modalTab === "manual" ? "Add assets manually" : "Connect Broker"}
                  </h3>
                  <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
                    {modalTab === "manual"
                      ? "Search a ticker and log shares you already own."
                      : "Link a top US brokerage via our partner network."}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeModal}
                aria-label="Close"
                className="flex-shrink-0 text-slate-400 transition hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            {modalTab === "connect" && (
              <div className="mt-4 space-y-2.5">
                {BROKER_PLATFORMS.map((platform) => {
                  const isLinked = connectedPlatformNames.has(platform.name);
                  return (
                    <div
                      key={platform.name}
                      className="rounded-2xl border border-[#1F1F1F] bg-black/30 p-3 transition hover:border-emerald-500/30"
                    >
                      <div className="flex items-center gap-3">
                        <BrokerLogo platform={platform} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-extrabold text-white">{platform.name}</p>
                          <p className="truncate text-[11px] text-slate-400">{platform.tag}</p>
                        </div>
                      </div>
                      {isLinked ? (
                        <p className="mt-2.5 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-center text-[11px] font-bold text-emerald-300">
                          Linked in this session
                        </p>
                      ) : (
                        <a
                          href={platform.partnerUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-2 text-[11px] font-extrabold text-[#042F2E] transition hover:bg-emerald-400 active:scale-[0.99]"
                        >
                          Connect via Partner Link
                          <ExternalLink size={12} />
                        </a>
                      )}
                    </div>
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
                                <StockLogo symbol={result.displaySymbol || result.symbol} size={32} />
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
                            size={32}
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
                  disabled={!canSubmitManual || savingAsset}
                  className={`flex w-full items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-bold transition active:scale-[0.99] ${
                    canSubmitManual && !savingAsset
                      ? "bg-emerald-500 text-[#042F2E] hover:bg-emerald-400"
                      : "cursor-not-allowed bg-black/30 text-slate-600"
                  }`}
                >
                  {savingAsset ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                  {savingAsset ? "Saving…" : "Add to Portfolio"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {selectedHolding && (
        <StockDetailPage
          holding={selectedHolding}
          onBack={() => setSelectedHolding(null)}
          onRemove={removeHolding}
          removing={removingId === selectedHolding.id}
        />
      )}

      {dailyReportOpen && (
        <DailyReportScreen
          onBack={() => setDailyReportOpen(false)}
          onConsultSocrates={onConsultSocrates}
        />
      )}
    </article>
  );
}
