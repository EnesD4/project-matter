import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Banknote,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ExternalLink,
  Eye,
  EyeOff,
  GripVertical,
  Layers,
  Loader2,
  LucideIcon,
  Plus,
  Search,
  Wallet,
  X,
} from "lucide-react";
import {
  Area,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  useActiveTooltipDataPoints,
  useIsTooltipActive,
} from "recharts";
import { buildAllocationSlices, classifyHolding } from "../lib/allocation";
import {
  createPortfolioItem,
  deletePortfolioItem,
  fetchPortfolio,
  getApiBaseUrl,
  type PortfolioApiItem,
} from "../lib/auth";
import {
  buildBenchmarkChartData,
  canonicalTimestamps,
  fetchChartCandles,
  fetchSp500Candles,
  formatSignedPct,
  PORTFOLIO_LINE,
  pricesOnTimestamps,
  reconstructPortfolioValues,
  resampleValuesToLength,
  SP500_LINE,
  type BenchmarkChartPoint,
} from "../lib/benchmarkChart";
import {
  buildHistoricalSeries,
  ChartCandle,
  RANGE_OPTIONS,
  RangeOption,
  SeriesPoint,
  seriesChangePct,
} from "../lib/priceSimulation";
import { privacyAxis, privacyMoney, privacyShares, privacySignedMoney, formatMoney } from "../lib/privacy";
import { useMarketPolling } from "../hooks/useMarketPolling";
import AllocationRing from "./AllocationRing";
import DailyReportScreen from "./DailyReportScreen";
import LiveStatusBadge from "./LiveStatusBadge";
import SocratesPortfolioReport from "./SocratesPortfolioReport";
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
  instrumentType?: string;
  industry?: string;
  /** Trailing yield as a decimal (0.03 = 3%), when the quote provides it. */
  dividendYield?: number | null;
};

type BrokerHolding = {
  id: string;
  kind: "broker";
  name: string;
  icon: LucideIcon;
  balance: number;
};

export type Holding = StockHolding | BrokerHolding;

const HOLDING_ORDER_KEY = "matterpro:portfolio-holding-order";
const ASSETS_PERF_KEY = "matterpro:assets-perf-mode";

type AssetsPerfMode = "daily" | "total";

function readAssetsPerfMode(): AssetsPerfMode {
  try {
    return localStorage.getItem(ASSETS_PERF_KEY) === "total" ? "total" : "daily";
  } catch {
    return "daily";
  }
}

function writeAssetsPerfMode(mode: AssetsPerfMode) {
  try {
    localStorage.setItem(ASSETS_PERF_KEY, mode);
  } catch {
    // private mode / quota
  }
}

function holdingValue(h: Holding): number {
  return h.kind === "stock" ? h.quantity * h.currentPrice : h.balance;
}

function readHoldingOrder(): string[] {
  try {
    const raw = localStorage.getItem(HOLDING_ORDER_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function writeHoldingOrder(ids: string[]) {
  try {
    localStorage.setItem(HOLDING_ORDER_KEY, JSON.stringify(ids));
  } catch {
    // private mode / quota
  }
}

function sortHoldingsByOrder(items: Holding[], order: string[]): Holding[] {
  if (order.length === 0) return items;
  const rank = new Map(order.map((id, i) => [id, i]));
  return [...items].sort((a, b) => {
    const ra = rank.get(a.id);
    const rb = rank.get(b.id);
    if (ra == null && rb == null) return 0;
    if (ra == null) return 1;
    if (rb == null) return -1;
    return ra - rb;
  });
}

function moveItemToIndex<T extends { id: string }>(items: T[], fromId: string, toIndex: number): T[] {
  const fromIndex = items.findIndex((item) => item.id === fromId);
  if (fromIndex < 0 || toIndex < 0 || toIndex >= items.length || fromIndex === toIndex) return items;
  const next = [...items];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

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

/** Shape returned by GET /api/stocks/quote (Yahoo first, Finnhub fallback). `c` = current price. */
export type StockQuote = {
  c: number;
  d: number;
  dp: number;
  h: number;
  l: number;
  o: number;
  pc: number;
  t: number;
  dividendYield?: number | null;
  dividendRate?: number | null;
  exDividendDate?: string | null;
  dividendDate?: string | null;
};

/** Shape returned by GET /api/stocks/profile (proxied from Finnhub's /stock/profile2). */
type StockProfile = {
  name?: string;
  logo?: string;
  weburl?: string;
  marketCapitalization?: number;
  finnhubIndustry?: string;
};

type SelectedStock = {
  symbol: string;
  description: string;
  type?: string;
};

function formatAxisMoney(amount: number) {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 10_000) return `$${(amount / 1_000).toFixed(1)}k`;
  if (amount >= 1_000) return `$${formatMoney(amount, 0)}`;
  return `$${formatMoney(amount, 0)}`;
}

const GAIN_GREEN = "#10B981";
const LOSS_RED = "#EF4444";

function hoverPointFromChart(
  state: { activeIndex?: number | string | null; isTooltipActive?: boolean },
  data: SeriesPoint[]
): SeriesPoint | null {
  if (!state.isTooltipActive) return null;
  const index = Number(state.activeIndex);
  return Number.isFinite(index) && data[index] ? data[index] : null;
}

function ChartHoverBridge({ onHover }: { onHover: (point: SeriesPoint | null) => void }) {
  const active = useIsTooltipActive();
  const points = useActiveTooltipDataPoints<SeriesPoint>();
  const point = active ? points?.[0] : undefined;
  const t = point?.t;
  const value = point?.value;
  const label = point?.label;
  const portfolioValue = point?.portfolioValue;
  const portfolioPct = point?.portfolioPct;
  const spPct = point?.spPct;

  useEffect(() => {
    if (t == null || value == null) {
      onHover(null);
      return;
    }
    onHover({ t, value, label: label ?? "", portfolioValue, portfolioPct, spPct });
  }, [t, value, label, portfolioValue, portfolioPct, spPct, onHover]);

  return null;
}

function BenchmarkTooltip({
  active,
  payload,
  privacyMode,
  startValue,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: BenchmarkChartPoint }>;
  privacyMode: boolean;
  startValue: number;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;
  const portfolioPct = point.portfolioPct ?? 0;
  const gainAbs = (point.portfolioValue ?? startValue) - startValue;

  return (
    <div className="rounded-xl border border-[#1F1F1F] bg-[#0A0A0A] px-3 py-2 shadow-[0_8px_24px_rgba(0,0,0,0.45)]">
      <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#6B7280]">
        {point.label}
      </p>
      <p className="mt-1.5 text-[11px] font-semibold text-[#9CA3AF]">My Portfolio</p>
      <p className="text-sm font-extrabold tabular-nums" style={{ color: PORTFOLIO_LINE }}>
        {privacySignedMoney(privacyMode, gainAbs)} ({formatSignedPct(portfolioPct)})
      </p>
      <p className="mt-1.5 text-[11px] font-semibold text-[#9CA3AF]">S&amp;P 500</p>
      <p className="text-sm font-extrabold tabular-nums" style={{ color: SP500_LINE }}>
        {point.spPct == null ? "—" : formatSignedPct(point.spPct)}
      </p>
    </div>
  );
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
  /** Mirrors the live holdings list up to the parent (e.g. so Matter AI can reference it). */
  onHoldingsChange?: (holdings: Holding[]) => void;
  /** Opens the Matter AI chat tab from the insights card. */
  onConsultSocrates?: () => void;
  /** Extra cash (e.g. emergency fund) rolled into portfolio value. */
  cashBalance?: number;
  /** Lifted so tab switches keep privacy mode on. */
  privacyMode: boolean;
  onTogglePrivacy?: () => void;
  /** Rendered directly below the Connect Broker button (e.g. in-page Watchlist). */
  belowHoldings?: React.ReactNode;
  /** Rendered directly below the Asset Allocation ring. */
  belowAllocation?: React.ReactNode;
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
    industry: profile?.finnhubIndustry,
    dividendYield: quote?.dividendYield ?? null,
  };
}

function applyQuoteToHolding(holding: StockHolding, quote: StockQuote): StockHolding {
  if (!(quote.c > 0)) return holding;
  return {
    ...holding,
    currentPrice: quote.c,
    dayChangePct: quote.dp ?? holding.dayChangePct,
    dayChangeAbs: quote.d ?? holding.dayChangeAbs,
    open: quote.o ?? holding.open,
    high: quote.h ?? holding.high,
    low: quote.l ?? holding.low,
    prevClose: quote.pc ?? holding.prevClose,
    dividendYield: quote.dividendYield ?? holding.dividendYield,
  };
}

async function fetchStockQuote(symbol: string): Promise<StockQuote | null> {
  const res = await fetch(`${API_BASE_URL}/api/stocks/quote?symbol=${encodeURIComponent(symbol)}`);
  if (!res.ok) return null;
  const data = (await res.json()) as StockQuote;
  return data?.c > 0 ? data : null;
}

export default function InvestmentPortfolioCard({
  onHoldingsChange,
  onConsultSocrates,
  cashBalance = 0,
  privacyMode,
  onTogglePrivacy,
  belowHoldings,
  belowAllocation,
}: InvestmentPortfolioCardProps) {
  const [range, setRange] = useState<RangeOption>("1D");
  const [benchmarkOn, setBenchmarkOn] = useState(false);
  const [benchmarkLoading, setBenchmarkLoading] = useState(false);
  const [spCandles, setSpCandles] = useState<ChartCandle[]>([]);
  const [holdingCandles, setHoldingCandles] = useState<Map<string, ChartCandle[]>>(new Map());
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [assetsPerfMode, setAssetsPerfMode] = useState<AssetsPerfMode>(readAssetsPerfMode);
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
  const [chartAnimate, setChartAnimate] = useState(true);

  const holdingsRef = useRef(holdings);
  holdingsRef.current = holdings;
  const holdingsListRef = useRef<HTMLDivElement>(null);
  const draggingIdRef = useRef<string | null>(null);
  const pendingDragRef = useRef<{
    id: string;
    pointerId: number;
    startX: number;
    startY: number;
  } | null>(null);
  const holdTimerRef = useRef<number | null>(null);
  const ignoreHoldingClickRef = useRef(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [pressingId, setPressingId] = useState<string | null>(null);
  const hasStockHoldings = holdings.some((h) => h.kind === "stock");
  const canReorderHoldings = holdings.length > 1;

  const { markUpdated, marketOpen } = useMarketPolling({
    enabled: hasStockHoldings,
    onPoll: async () => {
      const stocks = holdingsRef.current.filter((h): h is StockHolding => h.kind === "stock");
      if (stocks.length === 0) return;
      const uniqueSymbols = [...new Set(stocks.map((s) => s.symbol))];
      const entries = await Promise.all(
        uniqueSymbols.map(async (symbol) => {
          try {
            const quote = await fetchStockQuote(symbol);
            return quote ? ([symbol, quote] as const) : null;
          } catch {
            return null;
          }
        })
      );
      const quotes = new Map<string, StockQuote>();
      for (const entry of entries) {
        if (entry) quotes.set(entry[0], entry[1]);
      }
      if (quotes.size === 0) throw new Error("no quotes");

      setChartAnimate(false);
      setHoldings((prev) =>
        prev.map((h) => {
          if (h.kind !== "stock") return h;
          const quote = quotes.get(h.symbol);
          return quote ? applyQuoteToHolding(h, quote) : h;
        })
      );
      setSelectedHolding((prev) => {
        if (!prev) return prev;
        const quote = quotes.get(prev.symbol);
        return quote ? applyQuoteToHolding(prev, quote) : prev;
      });
    },
  });

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
          return sortHoldingsByOrder([...stocks, ...brokers], readHoldingOrder());
        });
        if (stocks.length > 0) markUpdated();
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
  }, [markUpdated]);

  useEffect(() => {
    setChartAnimate(true);
  }, [range, benchmarkOn]);

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
  const investmentValue = useMemo(
    () => holdings.filter((h) => h.kind === "stock").reduce((sum, h) => sum + holdingValue(h), 0),
    [holdings]
  );
  const brokerCash = useMemo(
    () => holdings.filter((h) => h.kind === "broker").reduce((sum, h) => sum + holdingValue(h), 0),
    [holdings]
  );
  const cashValue = brokerCash + Math.max(0, cashBalance);
  const totalValue = investmentValue + cashValue;

  const allocationSlices = useMemo(() => {
    const items = holdings.map((h) => {
      if (h.kind === "broker") {
        return {
          bucket: classifyHolding({ kind: "broker" }),
          value: h.balance,
          holdingId: h.id,
          holdingLabel: h.name,
          holdingDetail: "Connected account",
        };
      }
      return {
        bucket: classifyHolding({
          kind: "stock",
          symbol: h.symbol,
          name: h.description,
          type: h.instrumentType,
          industry: h.industry,
        }),
        value: holdingValue(h),
        holdingId: h.id,
        holdingLabel: h.symbol,
        holdingDetail: h.description,
      };
    });
    if (cashBalance > 0) {
      items.push({
        bucket: classifyHolding({ kind: "cash" }),
        value: cashBalance,
        holdingId: "cash:balance",
        holdingLabel: "Cash",
        holdingDetail: "Available cash",
      });
    }
    return buildAllocationSlices(items);
  }, [holdings, cashBalance]);

  const holdingOrderKey = holdings.map((h) => h.id).join("\0");
  useEffect(() => {
    if (portfolioLoading || !holdingOrderKey) return;
    writeHoldingOrder(holdingOrderKey.split("\0"));
  }, [holdingOrderKey, portfolioLoading]);

  useEffect(() => {
    return () => {
      if (holdTimerRef.current == null) return;
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    };
  }, []);

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

  const stockSymbolsKey = useMemo(
    () =>
      holdings
        .filter((h): h is StockHolding => h.kind === "stock")
        .map((h) => h.symbol)
        .sort()
        .join(","),
    [holdings]
  );

  useEffect(() => {
    if (!benchmarkOn) return;
    let cancelled = false;

    (async () => {
      setBenchmarkLoading(true);
      try {
        const unique = stockSymbolsKey ? stockSymbolsKey.split(",") : [];
        const [sp, holdingEntries] = await Promise.all([
          fetchSp500Candles(range),
          Promise.all(
            unique.map(async (symbol) => [symbol, await fetchChartCandles(symbol, range)] as const)
          ),
        ]);
        if (cancelled) return;
        setSpCandles(sp);
        setHoldingCandles(new Map(holdingEntries));
      } catch {
        if (!cancelled) {
          setSpCandles([]);
          setHoldingCandles(new Map());
        }
      } finally {
        if (!cancelled) setBenchmarkLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [benchmarkOn, range, stockSymbolsKey]);

  const simulatedChartData = useMemo(
    () => buildHistoricalSeries("portfolio-total", range, totalValue, portfolioDayChangePct),
    [range, totalValue, portfolioDayChangePct]
  );

  const benchmarkReady = benchmarkOn && spCandles.length > 0;

  const chartData = useMemo(() => {
    if (!benchmarkReady) {
      const first = simulatedChartData[0]?.value ?? 0;
      return simulatedChartData.map((p) => ({
        ...p,
        portfolioValue: p.value,
        portfolioPct: first > 0 ? ((p.value - first) / first) * 100 : 0,
      }));
    }

    const timestamps = canonicalTimestamps(spCandles, [...holdingCandles.values()]);
    if (timestamps.length === 0) {
      const first = simulatedChartData[0]?.value ?? 0;
      return simulatedChartData.map((p) => ({
        ...p,
        portfolioValue: p.value,
        portfolioPct: first > 0 ? ((p.value - first) / first) * 100 : 0,
      }));
    }

    const stocks = holdings
      .filter((h): h is StockHolding => h.kind === "stock")
      .map((h) => ({ symbol: h.symbol, quantity: h.quantity, currentPrice: h.currentPrice }));
    const reconstructed = reconstructPortfolioValues(stocks, holdingCandles, cashValue, timestamps);
    const hasLivePath = reconstructed.some((v) => v > 0);
    const portfolioValues = hasLivePath
      ? reconstructed
      : resampleValuesToLength(
          simulatedChartData.map((p) => p.value),
          timestamps.length
        );
    if (portfolioValues.length > 0 && totalValue > 0) {
      portfolioValues[portfolioValues.length - 1] = totalValue;
    }
    const spPrices = pricesOnTimestamps(spCandles, timestamps);
    return buildBenchmarkChartData({ range, timestamps, portfolioValues, spPrices });
  }, [
    benchmarkReady,
    simulatedChartData,
    spCandles,
    holdingCandles,
    holdings,
    cashValue,
    totalValue,
    range,
  ]);

  const gainPct = useMemo(() => {
    const last = chartData[chartData.length - 1];
    if (last?.portfolioPct != null) return last.portfolioPct;
    return seriesChangePct(chartData);
  }, [chartData]);
  const gainAbs = useMemo(() => {
    const first = chartData[0]?.portfolioValue ?? chartData[0]?.value ?? 0;
    const last =
      chartData[chartData.length - 1]?.portfolioValue ??
      chartData[chartData.length - 1]?.value ??
      0;
    return last - first;
  }, [chartData]);
  const isNegative = gainPct < 0;
  const gainColor = isNegative ? LOSS_RED : GAIN_GREEN;
  const portfolioStroke = benchmarkReady ? PORTFOLIO_LINE : gainColor;

  const yDomain = useMemo(() => {
    const values = chartData.flatMap((p) => {
      const pts = [p.value];
      if (benchmarkReady && p.spPct != null) pts.push(p.spPct);
      return pts;
    });
    if (values.length === 0) return [0, 1] as [number, number];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = Math.max((max - min) * 0.08, benchmarkReady ? 0.6 : Math.max((max || 1) * 0.01, 1));
    if (benchmarkReady) return [min - pad, max + pad] as [number, number];
    return [Math.max(0, min - pad), max + pad] as [number, number];
  }, [chartData, benchmarkReady]);

  const startPortfolioValue = chartData[0]?.portfolioValue ?? chartData[0]?.value ?? 0;
  const displayValue = benchmarkReady
    ? (hoverPoint?.portfolioValue ?? totalValue)
    : (hoverPoint?.value ?? totalValue);
  const displayGainAbs = hoverPoint
    ? (hoverPoint.portfolioValue ?? hoverPoint.value) - startPortfolioValue
    : gainAbs;
  const displayGainPct = hoverPoint
    ? hoverPoint.portfolioPct ??
      (startPortfolioValue
        ? ((hoverPoint.value - startPortfolioValue) / startPortfolioValue) * 100
        : 0)
    : gainPct;
  const displaySpPct = hoverPoint?.spPct ?? chartData[chartData.length - 1]?.spPct;
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
    setSelectedTicker({ symbol, description: result.description, type: result.type });
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
        instrumentType: selectedTicker.type,
        industry: selectedProfile?.finnhubIndustry,
        dividendYield: selectedQuote?.dividendYield ?? null,
      };

      setHoldings((prev) => [holding, ...prev]);
      markUpdated();
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

  const clearHoldTimer = () => {
    if (holdTimerRef.current == null) return;
    window.clearTimeout(holdTimerRef.current);
    holdTimerRef.current = null;
  };

  const endHoldingDrag = () => {
    clearHoldTimer();
    pendingDragRef.current = null;
    draggingIdRef.current = null;
    setDraggingId(null);
    setPressingId(null);
  };

  const startHoldingDrag = (id: string, pointerId: number) => {
    clearHoldTimer();
    pendingDragRef.current = null;
    draggingIdRef.current = id;
    ignoreHoldingClickRef.current = true;
    setPressingId(id);
    setDraggingId(id);
    try {
      holdingsListRef.current?.setPointerCapture(pointerId);
    } catch {
      // pointer already released
    }
  };

  const reorderDraggingOver = (clientY: number) => {
    const dragId = draggingIdRef.current;
    const list = holdingsListRef.current;
    if (!dragId || !list) return;

    const rows = list.querySelectorAll<HTMLElement>("[data-holding-id]");
    for (const row of rows) {
      const overId = row.dataset.holdingId;
      if (!overId || overId === dragId) continue;
      const rect = row.getBoundingClientRect();
      if (clientY < rect.top || clientY > rect.bottom) continue;
      const mid = rect.top + rect.height / 2;
      setHoldings((prev) => {
        const from = prev.findIndex((item) => item.id === dragId);
        const to = prev.findIndex((item) => item.id === overId);
        if (from < 0 || to < 0 || from === to) return prev;
        if (from < to && clientY < mid) return prev;
        if (from > to && clientY > mid) return prev;
        return moveItemToIndex(prev, dragId, to);
      });
      break;
    }
  };

  const handleHoldingsPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!canReorderHoldings || e.button !== 0) return;
    const target = e.target as HTMLElement;
    const row = target.closest<HTMLElement>("[data-holding-id]");
    const id = row?.dataset.holdingId;
    if (!id) return;

    setPressingId(id);
    if (target.closest("[data-drag-handle]")) {
      e.preventDefault();
      startHoldingDrag(id, e.pointerId);
      return;
    }

    pendingDragRef.current = {
      id,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
    };
    holdTimerRef.current = window.setTimeout(() => {
      const pending = pendingDragRef.current;
      if (!pending || pending.pointerId !== e.pointerId) return;
      startHoldingDrag(pending.id, pending.pointerId);
    }, 350);
  };

  const handleHoldingsPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (draggingIdRef.current) {
      e.preventDefault();
      reorderDraggingOver(e.clientY);
      return;
    }

    const pending = pendingDragRef.current;
    if (!pending || pending.pointerId !== e.pointerId) return;
    const moved = Math.hypot(e.clientX - pending.startX, e.clientY - pending.startY);
    if (moved > 8) {
      clearHoldTimer();
      pendingDragRef.current = null;
      setPressingId(null);
    }
  };

  const handleHoldingsPointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    const list = holdingsListRef.current;
    if (list?.hasPointerCapture(e.pointerId)) {
      list.releasePointerCapture(e.pointerId);
    }
    if (draggingIdRef.current) {
      ignoreHoldingClickRef.current = true;
      window.setTimeout(() => {
        ignoreHoldingClickRef.current = false;
      }, 0);
    }
    endHoldingDrag();
  };

  const moveHolding = (id: string, direction: -1 | 1) => {
    setHoldings((prev) => {
      const index = prev.findIndex((h) => h.id === id);
      return moveItemToIndex(prev, id, index + direction);
    });
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
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
            Portfolio Value
          </p>
          {onTogglePrivacy && (
            <button
              type="button"
              onClick={onTogglePrivacy}
              aria-label={privacyMode ? "Show amounts" : "Hide amounts"}
              aria-pressed={privacyMode}
              title={privacyMode ? "Show amounts" : "Hide amounts"}
              className="grid h-6 w-6 place-items-center rounded-md text-[#9CA3AF] transition hover:bg-white/[0.06] hover:text-white"
            >
              {privacyMode ? (
                <EyeOff size={14} strokeWidth={1.75} aria-hidden="true" />
              ) : (
                <Eye size={14} strokeWidth={1.75} aria-hidden="true" />
              )}
            </button>
          )}
          {hasStockHoldings && (
            <LiveStatusBadge marketOpen={marketOpen} />
          )}
        </div>
        <p className="mt-1 text-3xl font-extrabold tracking-tight text-white tabular-nums">
          {privacyMoney(privacyMode, displayValue)}
        </p>
        {hasHoldings && benchmarkReady && (
          <div className="mt-1.5 space-y-0.5">
            <p className="text-sm font-bold tabular-nums" style={{ color: displayGainColor }}>
              <span className="mr-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#9CA3AF]">
                My Portfolio
              </span>
              {privacySignedMoney(privacyMode, displayGainAbs)} ({formatSignedPct(displayGainPct)})
            </p>
            <p className="text-sm font-bold tabular-nums" style={{ color: SP500_LINE }}>
              <span className="mr-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#9CA3AF]">
                S&amp;P 500
              </span>
              {displaySpPct == null ? "—" : formatSignedPct(displaySpPct)}
              {hoverPoint ? (
                <span className="ml-1.5 text-[11px] font-semibold text-[#9CA3AF]">
                  · {hoverPoint.label}
                </span>
              ) : (
                <span className="ml-1.5 text-[11px] font-semibold text-[#9CA3AF]">· {range}</span>
              )}
            </p>
          </div>
        )}
        {hasHoldings && !benchmarkReady && (
          <p
            className="mt-1.5 text-sm font-bold tabular-nums"
            style={{ color: displayGainColor }}
          >
            {privacySignedMoney(privacyMode, displayGainAbs)} ({displayPositive ? "+" : ""}
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
        {!hasHoldings && cashValue <= 0 && (
          <p className="mt-1 text-[11px] text-[#9CA3AF]">No accounts connected yet</p>
        )}
      </div>

      {/* AI daily report — above chart (below portfolio value) */}
      <div className="mt-4">
        <SocratesPortfolioReport onOpenReport={() => setDailyReportOpen(true)} />
      </div>

      {!hasHoldings ? (
        <>
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
          <AllocationRing slices={allocationSlices} privacyMode={privacyMode} />
          {belowAllocation}
        </>
      ) : (
        <>
          {/* Chart + timeframe (Google Finance / Midas style) */}
          <div className="mt-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-pressed={benchmarkOn}
                  aria-label="Toggle S&P 500 benchmark overlay"
                  title="Compare portfolio return to the S&P 500"
                  onClick={() => {
                    setBenchmarkOn((v) => !v);
                    setHoverPoint(null);
                  }}
                  className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-bold transition ${
                    benchmarkOn
                      ? "border-indigo-500/40 bg-indigo-500/15 text-indigo-300"
                      : "border-[#1F2937] bg-black/40 text-[#9CA3AF] hover:border-[#374151] hover:text-white"
                  }`}
                >
                  <span aria-hidden="true">📊</span>
                  VS S&amp;P 500
                </button>
                {benchmarkOn && (
                  <span className="hidden items-center gap-2 text-[10px] font-semibold text-[#9CA3AF] sm:inline-flex">
                    <span className="inline-flex items-center gap-1">
                      <span className="h-1.5 w-3 rounded-full" style={{ background: PORTFOLIO_LINE }} />
                      Portfolio
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span
                        className="h-px w-3 border-t-2 border-dashed"
                        style={{ borderColor: SP500_LINE }}
                      />
                      S&amp;P 500
                    </span>
                  </span>
                )}
              </div>
              <div className="flex gap-0.5 rounded-lg border border-[#1F2937] bg-black/40 p-0.5">
                {RANGE_OPTIONS.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => {
                      setRange(opt);
                      setHoverPoint(null);
                    }}
                    className={`rounded-md px-2 py-1 text-[10px] font-bold transition sm:px-2.5 ${
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

            <div className="relative h-44 -mx-1 sm:h-48">
              {benchmarkOn && benchmarkLoading && (
                <div className="absolute inset-0 z-10 grid place-items-center rounded-lg bg-black/35">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-indigo-300">
                    <Loader2 size={14} className="animate-spin" />
                    Loading S&amp;P 500…
                  </span>
                </div>
              )}
              {benchmarkOn && !benchmarkLoading && !benchmarkReady && (
                <p className="absolute right-2 top-1 z-10 text-[10px] font-semibold text-amber-300/90">
                  Couldn&apos;t load S&amp;P 500
                </p>
              )}
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={chartData}
                  margin={{ top: 8, right: 8, bottom: 4, left: 0 }}
                  onMouseMove={(state) => setHoverPoint(hoverPointFromChart(state, chartData))}
                  onMouseLeave={() => setHoverPoint(null)}
                >
                  <ChartHoverBridge onHover={setHoverPoint} />
                  <defs>
                    <linearGradient id="portfolioAreaGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={portfolioStroke} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={portfolioStroke} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <YAxis
                    domain={yDomain}
                    width={benchmarkReady ? 56 : 46}
                    tickFormatter={(v) =>
                      benchmarkReady
                        ? formatSignedPct(Number(v), Math.abs(Number(v)) < 10 ? 1 : 0)
                        : privacyAxis(privacyMode, formatAxisMoney(Number(v)))
                    }
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
                    shared
                    cursor={{ stroke: "#FFFFFF", strokeWidth: 1.25, strokeDasharray: "4 4", opacity: 0.55 }}
                    content={
                      benchmarkReady
                        ? (props) => (
                            <BenchmarkTooltip
                              {...props}
                              privacyMode={privacyMode}
                              startValue={startPortfolioValue}
                            />
                          )
                        : () => null
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    name="My Portfolio"
                    stroke={portfolioStroke}
                    strokeWidth={2.5}
                    fill="url(#portfolioAreaGradient)"
                    isAnimationActive={chartAnimate}
                    animationDuration={400}
                    activeDot={{
                      r: 5,
                      fill: portfolioStroke,
                      stroke: "#000000",
                      strokeWidth: 2,
                    }}
                  />
                  {benchmarkReady && (
                    <Line
                      type="monotone"
                      dataKey="spPct"
                      name="S&P 500"
                      stroke={SP500_LINE}
                      strokeWidth={2}
                      strokeDasharray="6 4"
                      dot={false}
                      connectNulls
                      isAnimationActive={chartAnimate}
                      animationDuration={400}
                      activeDot={{
                        r: 4,
                        fill: SP500_LINE,
                        stroke: "#000000",
                        strokeWidth: 2,
                      }}
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          <AllocationRing slices={allocationSlices} privacyMode={privacyMode} />
          {belowAllocation}

          {/* Asset list — Midas style */}
          <div className="mt-5">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setHoldingsExpanded((v) => !v)}
                aria-expanded={holdingsExpanded}
                className="flex min-w-0 items-center gap-2 text-left"
              >
                <span className="text-[11px] font-bold uppercase tracking-wide text-[#9CA3AF]">
                  Assets
                </span>
                <span className="rounded-full bg-[#1F2937] px-2 py-0.5 text-[10px] font-bold text-[#9CA3AF]">
                  {holdings.length}
                </span>
                {holdingsExpanded ? (
                  <ChevronUp size={16} className="text-[#9CA3AF]" />
                ) : (
                  <ChevronDown size={16} className="text-[#9CA3AF]" />
                )}
              </button>
              <div
                role="group"
                aria-label="Asset performance period"
                className="flex flex-shrink-0 rounded-full border border-[#1F2937] bg-[#0A0A0A] p-0.5"
              >
                {(["daily", "total"] as const).map((mode) => {
                  const active = assetsPerfMode === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      title={mode === "daily" ? "Today's gain/loss" : "Profit vs. average cost"}
                      aria-pressed={active}
                      onClick={() => {
                        setAssetsPerfMode(mode);
                        writeAssetsPerfMode(mode);
                      }}
                      className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide transition ${
                        active
                          ? "bg-[#10B981] text-[#042F2E]"
                          : "text-[#9CA3AF] hover:text-white"
                      }`}
                    >
                      {mode === "daily" ? "Daily" : "Total"}
                    </button>
                  );
                })}
              </div>
            </div>

            <div
              className={`transition-all duration-300 ease-in-out ${
                holdingsExpanded
                  ? "mt-2 max-h-[2000px] overflow-visible opacity-100"
                  : "max-h-0 overflow-hidden opacity-0"
              }`}
            >
              <div
                ref={holdingsListRef}
                className={`divide-y divide-[#1F2937] select-none ${
                  draggingId ? "cursor-grabbing touch-none" : ""
                }`}
                onPointerDown={handleHoldingsPointerDown}
                onPointerMove={handleHoldingsPointerMove}
                onPointerUp={handleHoldingsPointerEnd}
                onPointerCancel={handleHoldingsPointerEnd}
                onContextMenu={(e) => {
                  if (draggingIdRef.current || pendingDragRef.current) e.preventDefault();
                }}
              >
                {holdings.map((h) => {
                  const highlight = h.id === justAddedId;
                  const value = holdingValue(h);
                  const isStock = h.kind === "stock";
                  let perfAbs: number | null = null;
                  let perfPct: number | null = null;
                  if (isStock) {
                    if (assetsPerfMode === "total") {
                      if (h.avgCost > 0) {
                        perfAbs = (h.currentPrice - h.avgCost) * h.quantity;
                        perfPct = ((h.currentPrice - h.avgCost) / h.avgCost) * 100;
                      }
                    } else if (h.prevClose > 0) {
                      perfAbs = (h.currentPrice - h.prevClose) * h.quantity;
                      perfPct = ((h.currentPrice - h.prevClose) / h.prevClose) * 100;
                    } else {
                      perfAbs = h.dayChangeAbs * h.quantity;
                      perfPct = h.dayChangePct;
                    }
                  }
                  const dayUp = (perfPct ?? 0) > 0;
                  const dayDown = (perfPct ?? 0) < 0;
                  const dayColor =
                    perfPct == null ? "#6B7280" : dayDown ? LOSS_RED : dayUp ? GAIN_GREEN : "#9CA3AF";
                  const isDragging = draggingId === h.id;
                  const isPressed = pressingId === h.id;

                  return (
                    <div
                      key={h.id}
                      data-holding-id={h.id}
                      aria-grabbed={isDragging}
                      className={`flex w-full items-center gap-1 rounded-xl px-1 py-3.5 transition duration-150 ${
                        isDragging
                          ? "relative z-10 scale-[1.01] bg-[#09090B] shadow-[0_8px_24px_rgba(0,0,0,0.45)] ring-1 ring-white/10 pointer-events-none"
                          : isPressed
                            ? "bg-[#09090B]"
                            : highlight
                              ? "bg-emerald-500/10"
                              : ""
                      }`}
                    >
                      {canReorderHoldings && (
                        <button
                          type="button"
                          data-drag-handle
                          aria-label={`Reorder ${isStock ? h.symbol : h.name}`}
                          onKeyDown={(e) => {
                            if (e.key === "ArrowUp") {
                              e.preventDefault();
                              moveHolding(h.id, -1);
                            } else if (e.key === "ArrowDown") {
                              e.preventDefault();
                              moveHolding(h.id, 1);
                            }
                          }}
                          className={`grid h-10 w-7 flex-shrink-0 touch-none place-items-center rounded-md text-[#6B7280] transition hover:bg-white/[0.06] hover:text-[#D1D5DB] ${
                            isDragging ? "cursor-grabbing text-[#D1D5DB]" : "cursor-grab"
                          }`}
                          style={{ touchAction: "none" }}
                        >
                          <GripVertical size={16} aria-hidden="true" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          if (ignoreHoldingClickRef.current) {
                            ignoreHoldingClickRef.current = false;
                            return;
                          }
                          if (isStock) setSelectedHolding(h);
                        }}
                        disabled={!isStock}
                        className={`flex min-w-0 flex-1 items-center gap-3 text-left transition ${
                          isStock ? "hover:bg-white/[0.03] active:scale-[0.995]" : "cursor-default"
                        }`}
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
                                {h.description} · {privacyShares(privacyMode, h.quantity)}
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
                            {privacyMoney(privacyMode, value)}
                          </p>
                          {isStock && (
                            <p className="text-[11px] font-bold tabular-nums" style={{ color: dayColor }}>
                              {perfAbs == null || perfPct == null
                                ? "—"
                                : `${privacySignedMoney(privacyMode, perfAbs)} (${dayUp ? "+" : ""}${perfPct.toFixed(2)}%)`}
                            </p>
                          )}
                        </div>
                        {isStock && <ChevronRight size={14} className="flex-shrink-0 text-[#9CA3AF]" />}
                      </button>
                    </div>
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

      {belowHoldings}

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
                    Estimated value: {privacyMoney(privacyMode, manualValue)}
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
          totalPortfolioValue={totalValue}
          privacyMode={privacyMode}
          onBack={() => setSelectedHolding(null)}
          onRemove={selectedHolding.quantity > 0 ? removeHolding : undefined}
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
