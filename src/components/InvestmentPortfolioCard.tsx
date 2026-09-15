import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Banknote,
  BarChart3,
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
  getStoredUser,
  readPortfolioCache,
  sellPortfolioItem,
  withTimeout,
  writePortfolioCache,
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
  SP500_LINE,
  type BenchmarkChartPoint,
} from "../lib/benchmarkChart";
import { getCachedSpark } from "../lib/marketCache";
import {
  fetchHistoricalClose,
  fetchStockProfile,
  fetchStockQuote,
  fetchStockQuotes,
  fetchStockSearch,
  localTickerMatches,
  mockQuoteForSymbol,
  normalizeStockData,
  normalizeToStockQuote,
  sanitizeSafeStock,
  type StockProfile,
  type StockQuote,
  type StockSearchResult,
} from "../lib/stockService";
import { clearbitLogoUrl } from "../lib/assetLogos";
import {
  buildHistoricalSeries,
  ChartCandle,
  RANGE_OPTIONS,
  RangeOption,
  SeriesPoint,
  seriesChangePct,
  sparklineValues,
} from "../lib/priceSimulation";
import { toFiniteNumber } from "../lib/money";
import { privacyAxis, privacyMoney, privacyShares, privacySignedMoney, formatMoney } from "../lib/privacy";
import { todayISODate } from "../lib/age";
import { parseAccountKind, type AccountKind } from "../lib/accountKind";
import { clearPaperTickerIntent, peekPaperTickerIntent } from "../lib/lessonProgress";
import { readLocalItem } from "../lib/storage";
import { isoToUsDate, maskUsDateInput, parseToIsoDate } from "../lib/usDate";
import { useMarketPolling } from "../hooks/useMarketPolling";
import {
  DEMO_SCENARIOS,
  DEMO_SCENARIO_APPLIED_EVENT,
  readActiveDemoScenario,
  type DemoScenarioApplyDetail,
} from "../lib/demoScenarios";
import {
  PLAID_CONNECTED_EVENT,
  type PlaidLinkResult,
} from "../lib/plaidLink";
import AccountKindBadge, { PortfolioOriginBadges } from "./AccountKindBadge";
import AllocationRing from "./AllocationRing";
import DailyReportScreen from "./DailyReportScreen";
import DarkCalendar from "./DarkCalendar";
import LiveStatusBadge from "./LiveStatusBadge";
import LoadingSpinner, { EmptyChartPlaceholder } from "./LoadingSpinner";
import PlaidConnectButton from "./PlaidConnectButton";
import SocratesPortfolioReport from "./SocratesPortfolioReport";
import Sparkline from "./Sparkline";
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
  /** Calendar day the lot was purchased (YYYY-MM-DD), when known. */
  purchasedAt?: string | null;
  /** Manual lots are paper; only API-imported brokerage lots are verified. */
  account: AccountKind;
};

type BrokerHolding = {
  id: string;
  kind: "broker";
  name: string;
  icon: LucideIcon;
  balance: number;
  account: AccountKind;
};

export type Holding = StockHolding | BrokerHolding;

/** Hard-guard StockHolding numerics so Recharts/tables never see undefined/NaN. */
function sanitizeStockHolding(holding: StockHolding): StockHolding {
  const safeStock = sanitizeSafeStock({
    ...holding,
    price: Number(holding?.currentPrice ?? (holding as any)?.price ?? (holding as any)?.current_price) || 0,
    shares: Number(holding?.quantity ?? (holding as any)?.shares) || 0,
    buy_price: Number(holding?.avgCost ?? (holding as any)?.buy_price ?? (holding as any)?.buyPrice) || 0,
    current_price: Number(holding?.currentPrice ?? (holding as any)?.current_price) || 0,
    total_value:
      Number(
        (holding as any)?.total_value ??
          (Number(holding?.quantity) || 0) * (Number(holding?.currentPrice) || 0)
      ) || 0,
    change: Number(holding?.dayChangeAbs ?? (holding as any)?.change) || 0,
    change_percent: Number(holding?.dayChangePct ?? (holding as any)?.change_percent) || 0,
  });
  const price = Number(safeStock.current_price ?? safeStock.price) || 0;
  const shares = Number(safeStock.shares) || 0;
  const buyPrice = Number(holding?.avgCost ?? safeStock.buy_price) || 0;
  return {
    ...holding,
    symbol: String(holding?.symbol || safeStock.symbol || "—").toUpperCase(),
    description: String(holding?.description || (safeStock as any)?.name || holding?.symbol || "—"),
    quantity: shares,
    avgCost: buyPrice,
    currentPrice: price,
    dayChangePct: Number(safeStock.change_percent) || 0,
    dayChangeAbs: Number(safeStock.change) || 0,
    open: toFiniteNumber(holding?.open, price),
    high: toFiniteNumber(holding?.high, price),
    low: toFiniteNumber(holding?.low, price),
    prevClose: toFiniteNumber(holding?.prevClose, price),
  };
}

/** Ensure every entry in holdings arrays is numeric-safe before charts/state consumers. */
function guardHoldings(list: Holding[] | null | undefined): Holding[] {
  return (list || [])
    .filter((h): h is Holding => Boolean(h))
    .map((h) => (h.kind === "stock" ? sanitizeStockHolding(h) : { ...h, balance: toFiniteNumber(h.balance, 0) }));
}

const HOLDING_ORDER_KEY = "sprout_portfolio_holding_order";
const LEGACY_HOLDING_ORDER_KEY = "matterpro:portfolio-holding-order";
const ASSETS_PERF_KEY = "sprout_assets_perf_mode";
const LEGACY_ASSETS_PERF_KEY = "matterpro:assets-perf-mode";

type AssetsPerfMode = "daily" | "total";

function readAssetsPerfMode(): AssetsPerfMode {
  try {
    return readLocalItem(ASSETS_PERF_KEY, LEGACY_ASSETS_PERF_KEY) === "total" ? "total" : "daily";
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
  if (h.kind === "stock") {
    return toFiniteNumber(h?.quantity, 0) * toFiniteNumber(h?.currentPrice, 0);
  }
  return toFiniteNumber(h?.balance, 0);
}

function readHoldingOrder(): string[] {
  try {
    const raw = readLocalItem(HOLDING_ORDER_KEY, LEGACY_HOLDING_ORDER_KEY);
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
  const src = clearbitLogoUrl(platform.domain, 128);

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
          draggable={false}
          onContextMenu={(event) => event.preventDefault()}
          onDragStart={(event) => event.preventDefault()}
          className="pointer-events-none h-7 w-7 select-none rounded-md object-contain drag-none"
          style={{ WebkitTouchCallout: "none", WebkitUserDrag: "none" } as React.CSSProperties}
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}

const SEARCH_DEBOUNCE_MS = 350;

export type { StockQuote };

type SelectedStock = {
  symbol: string;
  description: string;
  type?: string;
};

function formatAxisMoney(amount: unknown) {
  const n = toFiniteNumber(amount, 0);
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${formatMoney(n, 0)}`;
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
  if (!active || !payload || !payload.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;
  const portfolioPct = Number(point?.portfolioPct) || 0;
  const gainAbs = (Number(point?.portfolioValue) || Number(startValue) || 0) - (Number(startValue) || 0);

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
  /** Mirrors the live holdings list up to the parent (e.g. so Sprout AI can reference it). */
  onHoldingsChange?: (holdings: Holding[]) => void;
  /** Opens the Sprout AI chat tab from the insights card. */
  onConsultSocrates?: () => void;
  /** Extra cash (e.g. emergency fund) rolled into portfolio value. */
  cashBalance?: number;
  /** Lifted so tab switches keep privacy mode on. */
  privacyMode: boolean;
  onTogglePrivacy?: () => void;
  /** Rendered directly below the Connect Broker button (e.g. in-page Watchlist). */
  belowHoldings?:
    | React.ReactNode
    | ((ctx: {
        onAddHolding: (holding: StockHolding) => void;
        onSellHolding: (
          holding: StockHolding,
          shares: number,
          sellPrice: number
        ) => Promise<{ remainingShares: number }>;
      }) => React.ReactNode);
  /** Rendered directly below the Asset Allocation ring. */
  belowAllocation?:
    | React.ReactNode
    | ((ctx: { holdings: Holding[]; cashBalance: number }) => React.ReactNode);
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

function stockHoldingFromItem(item: PortfolioApiItem, name?: string): StockHolding {
  if (!item) {
    return sanitizeStockHolding({
      id: `missing-${Date.now()}`,
      kind: "stock",
      symbol: "—",
      description: "—",
      quantity: 0,
      avgCost: 0,
      currentPrice: 0,
      dayChangePct: 0,
      dayChangeAbs: 0,
      open: 0,
      high: 0,
      low: 0,
      prevClose: 0,
      account: "paper",
    });
  }
  // Mandatory sanitizer before any holding is built from API/raw payloads.
  const safeStock = sanitizeSafeStock({
    ...item,
    symbol: item.symbol,
    name,
    // Prefer stored mark fields; buyPrice is cost basis fallback only.
    price: (item as any).current_price ?? (item as any).currentPrice ?? (item as any).price ?? item.buyPrice,
    current_price: (item as any).current_price ?? (item as any).currentPrice ?? (item as any).price,
    buy_price: item.buyPrice,
    shares: (item as any).quantity ?? item.shares,
    change: (item as any).change,
    change_percent: (item as any).change_percent,
  });
  const normalized = normalizeStockData(safeStock);
  const currentPrice = Number(normalized.price) || 0;
  const shares = Number(normalized.shares) || 0;
  const buyPrice = Number(item.buyPrice ?? currentPrice) || 0;
  return sanitizeStockHolding({
    id: item.id || `lot-${Date.now()}`,
    kind: "stock",
    symbol: normalized.symbol || "—",
    description: normalized.name || normalized.symbol || "—",
    quantity: shares,
    avgCost: buyPrice,
    currentPrice,
    dayChangePct: normalized.change_percent,
    dayChangeAbs: normalized.change,
    open: currentPrice,
    high: normalized.high > 0 ? normalized.high : currentPrice,
    low: normalized.low > 0 ? normalized.low : currentPrice,
    prevClose: currentPrice,
    purchasedAt: isoDateFromApi(item.purchasedAt),
    account: parseAccountKind(item.accountType),
  });
}

function holdingsFromApiItems(items: PortfolioApiItem[] | null | undefined): StockHolding[] {
  return (items || [])
    .filter((item): item is PortfolioApiItem => Boolean(item?.id && item?.symbol))
    .map((item) =>
      stockHoldingFromItem(item, "name" in item && typeof item.name === "string" ? item.name : undefined)
    );
}

function persistHoldingsCache(holdings: Holding[]) {
  const items: PortfolioApiItem[] = (holdings || [])
    .filter((holding): holding is StockHolding => holding?.kind === "stock")
    .map((holding) => ({
      id: holding.id,
      userId: getStoredUser()?.id ?? "local",
      symbol: holding.symbol,
      shares: Number(holding.quantity) || 0,
      buyPrice: Number(holding.avgCost) || 0,
      purchasedAt: holding.purchasedAt,
      accountType: holding.account,
      createdAt: new Date().toISOString(),
    }));
  writePortfolioCache(items);
}

async function enrichStockHolding(item: PortfolioApiItem): Promise<StockHolding> {
  const [quoteResult, profileResult] = await Promise.allSettled([
    withTimeout(fetchStockQuote(item.symbol), 12000, "Quote"),
    withTimeout(fetchStockProfile(item.symbol), 12000, "Profile"),
  ]);

  const rawQuote = quoteResult.status === "fulfilled" ? quoteResult.value : null;
  const quote = normalizeToStockQuote(rawQuote, item.symbol);
  const profile = profileResult.status === "fulfilled" ? profileResult.value : null;
  const buyPrice = Number(item?.buyPrice) || 0;
  // Live Polygon/API `c` first; then any stored mark on the item; never a static default.
  const itemMark = Number(
    (item as any)?.current_price ?? (item as any)?.currentPrice ?? (item as any)?.price
  ) || 0;
  const liveMark = Number(quote?.c) || 0;
  const mark = liveMark > 0 ? liveMark : itemMark > 0 ? itemMark : buyPrice;
  const safeStock = sanitizeSafeStock({
    symbol: item.symbol,
    name: profile?.name || item.symbol,
    shares: Number(item?.shares) || 0,
    price: mark,
    current_price: mark,
    buy_price: buyPrice,
    change: Number(quote?.d) || 0,
    change_percent: Number(quote?.dp) || 0,
    high: Number(quote?.h) || 0,
    low: Number(quote?.l) || 0,
    c: liveMark,
    d: Number(quote?.d) || 0,
    dp: Number(quote?.dp) || 0,
    h: Number(quote?.h) || 0,
    l: Number(quote?.l) || 0,
  });
  const normalized = normalizeStockData(safeStock);
  const currentPrice = Number(normalized.price > 0 ? normalized.price : mark) || 0;
  const shares = Number(normalized.shares) || 0;

  return sanitizeStockHolding({
    id: item.id,
    kind: "stock",
    symbol: normalized.symbol || item.symbol,
    description: normalized.name || item.symbol,
    quantity: shares,
    avgCost: buyPrice,
    currentPrice,
    dayChangePct: normalized.change_percent,
    dayChangeAbs: normalized.change,
    open: toFiniteNumber(quote?.o, currentPrice),
    high: normalized.high > 0 ? normalized.high : currentPrice,
    low: normalized.low > 0 ? normalized.low : currentPrice,
    prevClose: toFiniteNumber(quote?.pc, currentPrice),
    logo: profile?.logo,
    domain: profile?.domain || extractDomain(profile?.weburl),
    marketCap: profile?.marketCapitalization,
    industry: profile?.finnhubIndustry,
    instrumentType: profile?.type,
    dividendYield: quote?.dividendYield ?? null,
    purchasedAt: isoDateFromApi(item.purchasedAt),
    account: parseAccountKind(item.accountType),
  });
}

function isoDateFromApi(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = String(value).trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function isPaperTicker(h: Holding, symbol: string): h is StockHolding {
  if (h?.kind !== "stock" || h.account !== "paper") return false;
  const left = String(h.symbol || "").toUpperCase();
  const right = String(symbol || "").toUpperCase();
  return Boolean(left && right && left === right);
}

/** Replace the paper row for this ticker (or insert it) so adding shares never creates a duplicate. */
function upsertPaperHolding(prev: Holding[], next: StockHolding): Holding[] {
  if (!next?.symbol) return (prev || []).filter(Boolean);
  let replaced = false;
  const out: Holding[] = [];
  for (const h of prev || []) {
    if (!h) continue;
    if (!isPaperTicker(h, next.symbol)) {
      out.push(h);
      continue;
    }
    if (!replaced) {
      out.push(next);
      replaced = true;
    }
  }
  if (!replaced) out.unshift(next);
  return out;
}

function formatSessionDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

type HistoryMeta = {
  requestedDate: string;
  sessionDate: string;
  source: "live" | "history" | "fallback";
  closePrice?: number;
};

async function fetchHistoricalPrice(
  symbol: string,
  date: string
): Promise<{ price: number; date: string; requestedDate: string; source: string } | null> {
  const data = await fetchHistoricalClose(symbol, date);
  if (!data || typeof data.price !== "number" || !(data.price > 0)) return null;
  return {
    price: data.price,
    date: data.date || date,
    requestedDate: data.requestedDate || date,
    source: data.source || "history",
  };
}

function applyQuoteToHolding(holding: StockHolding, quote: StockQuote): StockHolding {
  const safe = normalizeToStockQuote(quote, holding.symbol);
  if (!safe || !(safe.c > 0)) return sanitizeStockHolding(holding);
  const safeStock = sanitizeSafeStock({
    symbol: holding.symbol,
    name: holding.description,
    shares: Number(holding.quantity) || 0,
    price: Number(safe.c) || 0,
    current_price: Number(safe.c) || 0,
    buy_price: Number(holding.avgCost) || 0,
    change: Number(safe.d) || 0,
    change_percent: Number(safe.dp) || 0,
    high: Number(safe.h) || 0,
    low: Number(safe.l) || 0,
    c: Number(safe.c) || 0,
    d: Number(safe.d) || 0,
    dp: Number(safe.dp) || 0,
    h: Number(safe.h) || 0,
    l: Number(safe.l) || 0,
  });
  const normalized = normalizeStockData(safeStock);
  const currentPrice = Number(normalized.price) || 0;
  return sanitizeStockHolding({
    ...holding,
    currentPrice,
    dayChangePct: Number(normalized.change_percent) || 0,
    dayChangeAbs: Number(normalized.change) || 0,
    open: toFiniteNumber(safe.o, toFiniteNumber(holding.open, currentPrice)),
    high: normalized.high > 0 ? Number(normalized.high) || currentPrice : currentPrice,
    low: normalized.low > 0 ? Number(normalized.low) || currentPrice : currentPrice,
    prevClose: toFiniteNumber(safe.pc, toFiniteNumber(holding.prevClose, currentPrice)),
    dividendYield: safe.dividendYield ?? holding.dividendYield ?? null,
  });
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
  const [holdings, setHoldingsState] = useState<Holding[]>(() => {
    const cached = readPortfolioCache();
    return guardHoldings(cached ? holdingsFromApiItems(cached.items || []) : []);
  });
  const setHoldings = (
    updater: Holding[] | ((prev: Holding[]) => Holding[])
  ) => {
    setHoldingsState((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      // Pass safeStock-only arrays into React state / Recharts consumers.
      return guardHoldings(next);
    });
  };
  const [assetsPerfMode, setAssetsPerfMode] = useState<AssetsPerfMode>(readAssetsPerfMode);
  const [hoverPoint, setHoverPoint] = useState<SeriesPoint | null>(null);
  const [portfolioLoading, setPortfolioLoading] = useState(() => !readPortfolioCache());
  const holdingsEpochRef = useRef(0);
  const [portfolioError, setPortfolioError] = useState<string | null>(null);
  const [savingAsset, setSavingAsset] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    if (portfolioLoading) return;
    onHoldingsChange?.(holdings);
    persistHoldingsCache(holdings);
  }, [holdings, onHoldingsChange, portfolioLoading]);
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
  const [purchaseDate, setPurchaseDate] = useState(() => isoToUsDate(todayISODate()));
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyMeta, setHistoryMeta] = useState<HistoryMeta | null>(null);
  const [chartAnimate, setChartAnimate] = useState(true);

  const holdingsRef = useRef(holdings);
  holdingsRef.current = holdings;
  const holdingsListRef = useRef<HTMLDivElement>(null);
  const historySeqRef = useRef(0);
  const priceTouchedRef = useRef(false);
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

  // Guard mapped portfolio arrays so undefined never reaches charts/tables.
  const safeHoldings = useMemo(() => guardHoldings(holdings), [holdings]);
  const stocks = safeHoldings.filter((h): h is StockHolding => h?.kind === "stock");
  const hasStockHoldings = stocks.length > 0;
  const canReorderHoldings = safeHoldings.length > 1;

  const { markUpdated, marketOpen } = useMarketPolling({
    enabled: hasStockHoldings,
    onPoll: async () => {
      const stocks = (holdingsRef.current || []).filter(
        (h): h is StockHolding => h?.kind === "stock"
      );
      if (stocks.length === 0) return;
      const uniqueSymbols = [...new Set(stocks.map((s) => s?.symbol).filter(Boolean))];
      const quotes = await fetchStockQuotes(uniqueSymbols);
      if (quotes.size === 0) return;

      setChartAnimate(false);
      setHoldings((prev) =>
        (prev || []).map((h) => {
          if (!h || h.kind !== "stock") return h;
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

  useEffect(() => {
    const applyStocks = (stocks: StockHolding[], replaceVerified: boolean) => {
      holdingsEpochRef.current += 1;
      setPortfolioLoading(false);
      setHoldings((prev) => {
        const incomingSymbols = new Set(
          (stocks || []).map((stock) => String(stock?.symbol || "").toUpperCase()).filter(Boolean)
        );
        const kept = (prev || []).filter((holding) => {
          if (!holding) return false;
          if (holding.kind === "broker") return true;
          if (replaceVerified) return holding.account !== "verified";
          return !(holding.account === "verified" && incomingSymbols.has(holding.symbol.toUpperCase()));
        });
        return sortHoldingsByOrder([...kept, ...(stocks || [])], readHoldingOrder());
      });
      setHoldingsExpanded(true);
      setModalOpen(false);
      if (stocks.length > 0) markUpdated();
    };

    const onPlaidSandbox = (event: Event) => {
      const detail = (event as CustomEvent<PlaidLinkResult>).detail;
      if (!detail?.holdings) return;
      const portfolioStocks = detail?.holdings || [];
      const stocks = (portfolioStocks ?? [])
        .filter(Boolean)
        .map((item) => ({
          ...stockHoldingFromItem(item, item?.name),
          account: "verified" as const,
          description: item?.name || item?.symbol,
        }));
      applyStocks(stocks, false);
      const first = stocks[0];
      if (first) {
        setJustAddedId(first.id);
        window.setTimeout(() => setJustAddedId(null), 2000);
      }
      void Promise.all((portfolioStocks ?? []).map((item) => enrichStockHolding(item)))
        .then((enriched) => {
          setHoldings((prev) =>
            (prev || []).map((holding) => {
              if (!holding || holding.kind !== "stock") return holding;
              return enriched.find((item) => item?.id === holding.id) ?? holding;
            })
          );
        })
        .catch(() => {});
    };

    const onDemo = (event: Event) => {
      const detail = (event as CustomEvent<DemoScenarioApplyDetail>).detail;
      if (!detail) return;
      const portfolioStocks = (detail?.holdings || []).filter(Boolean);
      const stocks = portfolioStocks
        .map((item) => {
          if (!item?.symbol) return null;
          const lot =
            detail.lots?.find((row) => row?.symbol === item.symbol) ??
            (detail.id !== "custom"
              ? DEMO_SCENARIOS[detail.id]?.lots.find((row) => row?.symbol === item.symbol)
              : undefined);
          return stockHoldingFromItem(item, lot?.name);
        })
        .filter((h): h is StockHolding => Boolean(h));
      holdingsEpochRef.current += 1;
      setPortfolioLoading(false);
      setHoldings(guardHoldings(stocks));
      writePortfolioCache(portfolioStocks);
      setHoldingsExpanded(true);
      if (stocks.length > 0) markUpdated();
    };

    window.addEventListener(PLAID_CONNECTED_EVENT, onPlaidSandbox);
    window.addEventListener(DEMO_SCENARIO_APPLIED_EVENT, onDemo);
    return () => {
      window.removeEventListener(PLAID_CONNECTED_EVENT, onPlaidSandbox);
      window.removeEventListener(DEMO_SCENARIO_APPLIED_EVENT, onDemo);
    };
  }, [markUpdated]);

  // Load persisted portfolio instantly from cache, then refresh quotes in the background.
  useEffect(() => {
    let cancelled = false;
    const startedAt = Date.now();
    const epoch = holdingsEpochRef.current;
    const cached = readPortfolioCache();
    if (cached) {
      setHoldings((prev) => {
        const brokers = (prev || []).filter((h): h is BrokerHolding => h?.kind === "broker");
        return sortHoldingsByOrder([...holdingsFromApiItems(cached.items || []), ...brokers], readHoldingOrder());
      });
      setPortfolioLoading(false);
    }

    (async () => {
      setPortfolioError(null);
      if (!cached) setPortfolioLoading(true);
      try {
        const items = (await withTimeout(fetchPortfolio(), 2000, "Portfolio")) || [];
        if (cancelled || holdingsEpochRef.current !== epoch) return;
        const latestCache = readPortfolioCache();
        if (latestCache && (latestCache.updatedAt > startedAt || readActiveDemoScenario())) {
          const cachedStocks = holdingsFromApiItems(latestCache.items || []);
          void Promise.all((latestCache.items || []).map((item) => enrichStockHolding(item)))
            .then((stocks) => {
              if (cancelled || holdingsEpochRef.current !== epoch) return;
              setHoldings((prev) => {
                const brokers = (prev || []).filter((h): h is BrokerHolding => h?.kind === "broker");
                return sortHoldingsByOrder([...stocks, ...brokers], readHoldingOrder());
              });
            })
            .catch(() => {});
          if (cachedStocks.length > 0) markUpdated();
          return;
        }
        if (items.length === 0 && cached && (cached.items || []).length > 0) {
          const stocks = await Promise.all((cached.items || []).map((item) => enrichStockHolding(item)));
          if (cancelled || holdingsEpochRef.current !== epoch) return;
          setHoldings((prev) => {
            const brokers = (prev || []).filter((h): h is BrokerHolding => h?.kind === "broker");
            return sortHoldingsByOrder([...stocks, ...brokers], readHoldingOrder());
          });
          return;
        }
        const instant = holdingsFromApiItems(items);
        setHoldings((prev) => {
          const brokers = (prev || []).filter((h): h is BrokerHolding => h?.kind === "broker");
          return sortHoldingsByOrder([...instant, ...brokers], readHoldingOrder());
        });
        writePortfolioCache(items);
        if (instant.length > 0) markUpdated();
        const stocks = await Promise.all(items.map((item) => enrichStockHolding(item)));
        if (cancelled || holdingsEpochRef.current !== epoch) return;
        setHoldings((prev) => {
          const brokers = (prev || []).filter((h): h is BrokerHolding => h?.kind === "broker");
          return sortHoldingsByOrder([...stocks, ...brokers], readHoldingOrder());
        });
      } catch (err) {
        if (!cancelled && !cached) {
          setPortfolioError(err instanceof Error ? err.message : "Couldn't load portfolio");
          setHoldings((prev) => (prev || []).filter((h): h is BrokerHolding => h?.kind === "broker"));
        } else if (!cancelled && cached) {
          const stocks = await Promise.all((cached.items || []).map((item) => enrichStockHolding(item)));
          if (cancelled || holdingsEpochRef.current !== epoch) return;
          setHoldings((prev) => {
            const brokers = (prev || []).filter((h): h is BrokerHolding => h?.kind === "broker");
            return sortHoldingsByOrder([...stocks, ...brokers], readHoldingOrder());
          });
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

  // Live stock search — remote first, catalog/typed-ticker fallback so add never dead-ends.
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

    const local = localTickerMatches(query);
    setSearchResults(local);
    setSearchError(null);
    setSearchLoading(true);

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      try {
        const data = await fetchStockSearch(query, controller.signal);

        // Prefer primary US listings (no exchange suffix like ".TO"/".SW") when available.
        const primary = data.filter((r) => !r.symbol.includes("."));
        const remote = (primary.length > 0 ? primary : data).slice(0, 8);
        setSearchResults(remote.length > 0 ? remote : local);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setSearchResults(local);
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

  const allocationExtra =
    typeof belowAllocation === "function"
      ? belowAllocation({ holdings: safeHoldings, cashBalance })
      : belowAllocation;
  const hasHoldings = safeHoldings.length > 0;
  const investmentValue = useMemo(
    () => (stocks ?? []).reduce((sum, h) => sum + (Number(holdingValue(h)) || 0), 0),
    [stocks]
  );
  const brokerCash = useMemo(
    () =>
      (safeHoldings ?? [])
        .filter((h) => h?.kind === "broker")
        .reduce((sum, h) => sum + (Number(holdingValue(h)) || 0), 0),
    [safeHoldings]
  );
  const cashValue = brokerCash + Math.max(0, cashBalance);
  const totalValue = investmentValue + cashValue;

  const allocationSlices = useMemo(() => {
    const items = (stocks || [])
      .filter((h): h is StockHolding => Boolean(h))
      .map((h) => ({
        bucket: classifyHolding({
          kind: "stock",
          symbol: h.symbol,
          name: h.description,
          type: h.instrumentType,
          industry: h.industry,
        }),
        value: Number(holdingValue(h)) || 0,
        holdingId: h.id,
        holdingLabel: h.symbol,
        holdingDetail: h.account === "verified" ? `${h.description} · Verified` : `${h.description} · Paper`,
      }))
      .filter((item) => item.bucket !== "Cash" && item.value > 0);
    return buildAllocationSlices(items);
  }, [stocks]);

  const holdingOrderKey = (safeHoldings ?? []).map((h) => h?.id).filter(Boolean).join("\0");
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
    const weightedSum = safeHoldings.reduce((sum, h) => {
      const dp = h?.kind === "stock" ? toFiniteNumber(h?.dayChangePct, 0) : 0;
      return sum + holdingValue(h) * dp;
    }, 0);
    return weightedSum / totalValue;
  }, [safeHoldings, totalValue]);

  const stockSymbolsKey = useMemo(
    () =>
      (stocks ?? [])
        .map((h) => h?.symbol)
        .filter(Boolean)
        .sort()
        .join(","),
    [stocks]
  );

  useEffect(() => {
    let cancelled = false;
    const unique = stockSymbolsKey ? stockSymbolsKey.split(",") : [];
    if (unique.length === 0) {
      setHoldingCandles(new Map());
      setSpCandles([]);
      setBenchmarkLoading(false);
      return;
    }

    (async () => {
      if (benchmarkOn) setBenchmarkLoading(true);
      try {
        const [sp, holdingEntries] = await Promise.all([
          benchmarkOn ? fetchSp500Candles(range) : Promise.resolve([] as ChartCandle[]),
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
    const sanitizePoint = (p: {
      value?: number;
      portfolioValue?: number;
      portfolioPct?: number;
      spPct?: number;
      t?: number;
      label?: string;
      [key: string]: unknown;
    }) => ({
      ...p,
      value: toFiniteNumber(p?.value, 0),
      portfolioValue: toFiniteNumber(p?.portfolioValue ?? p?.value, 0),
      portfolioPct: toFiniteNumber(p?.portfolioPct, 0),
      spPct: toFiniteNumber(p?.spPct, 0),
      t: toFiniteNumber(p?.t, 0),
      label: typeof p?.label === "string" ? p.label : "",
    });

    const fallback = () => {
      const first = Number(simulatedChartData?.[0]?.value) || 0;
      return (simulatedChartData ?? []).map((p) =>
        sanitizePoint({
          ...p,
          portfolioValue: Number(p?.value) || 0,
          portfolioPct: first > 0 ? (((Number(p?.value) || 0) - first) / first) * 100 : 0,
        })
      );
    };

    const liveCandles = [...holdingCandles.values()].filter((pts) => pts.length > 0);
    const timestamps = canonicalTimestamps(
      benchmarkReady ? spCandles : undefined,
      liveCandles
    );
    if (timestamps.length < 2) return fallback();

    const stockLots = (stocks || [])
      .filter((h): h is StockHolding => Boolean(h))
      .map((h) => ({
        symbol: h.symbol,
        quantity: Number(h?.quantity) || 0,
        currentPrice: Number(h?.currentPrice) || 0,
      }));
    const reconstructed = reconstructPortfolioValues(stockLots, holdingCandles, cashValue, timestamps);
    const hasLivePath = reconstructed.some((v) => v > 0);
    if (!hasLivePath) return fallback();

    const portfolioValues = reconstructed;
    if (totalValue > 0) {
      portfolioValues[portfolioValues.length - 1] = totalValue;
    }
    const spPrices = pricesOnTimestamps(spCandles, timestamps);
    const built = buildBenchmarkChartData({ range, timestamps, portfolioValues, spPrices });
    if (benchmarkReady) return built.map(sanitizePoint);
    return built.map((p) => sanitizePoint({ ...p, value: p.portfolioValue }));
  }, [
    benchmarkReady,
    simulatedChartData,
    spCandles,
    holdingCandles,
    stocks,
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

  const startPortfolioValue = Number(chartData[0]?.portfolioValue ?? chartData[0]?.value) || 0;
  const displayValue =
    Number(benchmarkReady ? (hoverPoint?.portfolioValue ?? totalValue) : (hoverPoint?.value ?? totalValue)) ||
    0;
  const displayGainAbs = Number(
    hoverPoint ? (hoverPoint.portfolioValue ?? hoverPoint.value) - startPortfolioValue : gainAbs
  ) || 0;
  const displayGainPct = toFiniteNumber(
    hoverPoint
      ? hoverPoint.portfolioPct ??
        (startPortfolioValue
          ? ((toFiniteNumber(hoverPoint?.value, 0) - startPortfolioValue) / startPortfolioValue) * 100
          : 0)
      : gainPct,
    0
  );
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
    () =>
      new Set(
        (safeHoldings ?? [])
          .filter((h): h is BrokerHolding => h?.kind === "broker")
          .map((h) => h?.name)
          .filter(Boolean)
      ),
    [safeHoldings]
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
    setPurchaseDate(isoToUsDate(todayISODate()));
    setHistoryLoading(false);
    setHistoryMeta(null);
    priceTouchedRef.current = false;
  };

  const openModal = (tab: "connect" | "manual" = "connect") => {
    setModalTab(tab);
    resetManualForm();
    setModalOpen(true);
  };

  const closeModal = () => {
    clearPaperTickerIntent();
    setModalOpen(false);
  };

  const fillCostForDate = async (symbol: string, date: string, live?: StockQuote | null) => {
    const seq = ++historySeqRef.current;
    setHistoryLoading(true);
    const today = todayISODate();
    const iso = parseToIsoDate(date) ?? (/^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null);
    const useDate = iso && iso <= today ? iso : today;

    const applyLive = (reason: "live" | "fallback") => {
      if (!(live && live.c > 0)) return false;
      const livePrice = Number(live.c) || 0;
      if (!priceTouchedRef.current) setPurchasePrice(livePrice.toFixed(2));
      setHistoryMeta({ requestedDate: useDate, sessionDate: today, source: reason, closePrice: livePrice });
      setQuoteError(null);
      return true;
    };

    if (useDate >= today) {
      if (seq === historySeqRef.current) {
        if (!applyLive("live")) setHistoryMeta(null);
        setHistoryLoading(false);
      }
      return;
    }

    try {
      const hist = await fetchHistoricalPrice(symbol, useDate);
      if (seq !== historySeqRef.current) return;
      if (hist && hist.source !== "fallback") {
        const closePrice = Number(hist.price) || 0;
        if (!priceTouchedRef.current) setPurchasePrice(closePrice.toFixed(2));
        setHistoryMeta({
          requestedDate: useDate,
          sessionDate: hist.date,
          source: "history",
          closePrice,
        });
        setQuoteError(null);
      } else if (hist) {
        const closePrice = Number(hist.price) || 0;
        if (!priceTouchedRef.current) setPurchasePrice(closePrice.toFixed(2));
        setHistoryMeta({
          requestedDate: useDate,
          sessionDate: hist.date,
          source: "fallback",
          closePrice,
        });
        setQuoteError(null);
      } else if (!applyLive("fallback")) {
        setHistoryMeta(null);
        setQuoteError("Couldn't find a close for that date. Enter your price per share.");
      }
    } catch {
      if (seq !== historySeqRef.current) return;
      if (!applyLive("fallback")) {
        setHistoryMeta(null);
        setQuoteError("Couldn't fetch the historical price. Enter your price per share.");
      }
    } finally {
      if (seq === historySeqRef.current) setHistoryLoading(false);
    }
  };

  const applyPurchaseDate = (nextText: string, live?: StockQuote | null) => {
    const masked = maskUsDateInput(nextText);
    let iso = parseToIsoDate(masked);
    const today = todayISODate();
    if (iso && iso > today) {
      iso = today;
      setPurchaseDate(isoToUsDate(today));
    } else {
      setPurchaseDate(masked);
    }
    if (!iso) return;
    priceTouchedRef.current = false;
    if (selectedTicker) {
      void fillCostForDate(selectedTicker.symbol, iso, live ?? selectedQuote);
    }
  };

  const resolveSearchPick = (raw?: string | null): StockSearchResult | null => {
    const query = (raw ?? searchQuery).trim();
    if (!query) return searchResults[0] ?? null;
    return (
      searchResults.find((row) => (row.displaySymbol || row.symbol).toUpperCase() === query.toUpperCase()) ||
      searchResults[0] ||
      localTickerMatches(query)[0] ||
      null
    );
  };

  const selectTicker = async (result: StockSearchResult, costDate = parseToIsoDate(purchaseDate) ?? todayISODate()) => {
    const symbol = (result.displaySymbol || result.symbol || "").trim().toUpperCase();
    if (!symbol) return;
    setSelectedTicker({ symbol, description: result.description || symbol, type: result.type });
    setSearchQuery("");
    setSearchResults([]);
    setPurchasePrice("");
    priceTouchedRef.current = false;
    setSelectedQuote(null);
    setSelectedProfile(null);
    setQuoteError(null);
    setQuoteLoading(true);

    const [quoteResult, profileResult] = await Promise.allSettled([
      fetchStockQuote(symbol),
      fetchStockProfile(symbol),
    ]);

    const liveQuote =
      quoteResult.status === "fulfilled" && quoteResult.value
        ? normalizeToStockQuote(quoteResult.value, symbol)
        : null;
    const existingMark = holdingsRef.current.find(
      (h): h is StockHolding => h?.kind === "stock" && String(h.symbol || "").toUpperCase() === symbol
    )?.currentPrice;
    const quote =
      liveQuote && liveQuote.c > 0
        ? liveQuote
        : normalizeToStockQuote(
            mockQuoteForSymbol(symbol, existingMark && existingMark > 0 ? existingMark : undefined),
            symbol
          );
    if (quote) {
      setSelectedQuote(quote);
      if (!liveQuote || !(liveQuote.c > 0)) {
        setQuoteError("Using an estimated price. Enter your fill if this isn't right.");
      }
    } else {
      setQuoteError("Couldn't fetch the live price. You can enter it manually.");
    }

    if (profileResult.status === "fulfilled" && profileResult.value) {
      setSelectedProfile(profileResult.value);
    }

    setQuoteLoading(false);
    await fillCostForDate(symbol, costDate, quote);
  };

  const openAddForHolding = (holding: StockHolding) => {
    setModalTab("manual");
    resetManualForm();
    setModalOpen(true);
    void selectTicker(
      {
        symbol: holding.symbol,
        displaySymbol: holding.symbol,
        description: holding.description,
        type: holding.instrumentType || "",
      },
      todayISODate()
    );
  };

  useEffect(() => {
    const intent = peekPaperTickerIntent();
    if (!intent) return;
    setModalTab("manual");
    resetManualForm();
    setModalOpen(true);
    void selectTicker({
      symbol: intent.symbol,
      displaySymbol: intent.symbol,
      description: intent.description,
      type: "ETF",
    });
    // Open once when the dashboard remounts after a lesson CTA.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clearSelectedTicker = () => {
    setSelectedTicker(null);
    setSelectedQuote(null);
    setSelectedProfile(null);
    setQuoteError(null);
    setQuoteLoading(false);
    setPurchasePrice("");
    setHistoryMeta(null);
    priceTouchedRef.current = false;
    historySeqRef.current += 1;
  };

  const parsedQuantity = Number(quantity) || 0;
  const parsedPrice = Number(purchasePrice) || 0;
  const manualValue =
    Number.isFinite(parsedQuantity) && Number.isFinite(parsedPrice) ? parsedQuantity * parsedPrice : 0;
  const liveMark = selectedQuote && selectedQuote.c > 0 ? Number(selectedQuote.c) || 0 : null;
  const previewMarketValue =
    liveMark != null && Number.isFinite(parsedQuantity) && parsedQuantity > 0 ? parsedQuantity * liveMark : 0;
  const previewReturnAbs =
    liveMark != null && parsedPrice > 0 && parsedQuantity > 0 ? (liveMark - parsedPrice) * parsedQuantity : null;
  const previewReturnPct = liveMark != null && parsedPrice > 0 ? ((liveMark - parsedPrice) / parsedPrice) * 100 : null;
  const canSubmitManual = !!selectedTicker && parsedQuantity > 0 && parsedPrice > 0;

  const submitManualAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingAsset) return;
    if (!selectedTicker) {
      const pick = resolveSearchPick();
      if (pick) {
        void selectTicker(pick);
      } else {
        setSearchError("Search a ticker or company name, then pick a result.");
      }
      return;
    }

    // Never pass unparsed form strings into state/API — coerce explicitly.
    const shares = parseFloat(quantity) || 0;
    const price = parseFloat(purchasePrice) || 0;
    if (shares <= 0 || price <= 0) {
      setQuoteError("Enter a valid share quantity and price greater than zero.");
      return;
    }

    const purchaseIso = parseToIsoDate(purchaseDate) || (purchaseDate.trim() ? null : todayISODate());
    if (purchaseDate.trim() && !purchaseIso) {
      setQuoteError("Enter a valid purchase date as MM/DD/YYYY.");
      return;
    }

    setSavingAsset(true);
    setQuoteError(null);
    try {
      // Mandatory sanitizer before any DB write or React state update.
      const safeStock = sanitizeSafeStock({
        symbol: selectedTicker.symbol,
        ticker: selectedTicker.symbol,
        name: selectedTicker.description || selectedProfile?.name,
        companyName: selectedProfile?.name,
        price: Number(price) || 0,
        current_price: Number(selectedQuote?.c) || 0,
        buy_price: Number(price) || 0,
        close: Number(selectedQuote?.c) || 0,
        c: Number(selectedQuote?.c) || 0,
        change: Number(selectedQuote?.d) || 0,
        d: Number(selectedQuote?.d) || 0,
        change_percent: Number(selectedQuote?.dp) || 0,
        dp: Number(selectedQuote?.dp) || 0,
        high: Number(selectedQuote?.h) || 0,
        h: Number(selectedQuote?.h) || 0,
        low: Number(selectedQuote?.l) || 0,
        l: Number(selectedQuote?.l) || 0,
        shares: Number(shares) || 0,
        total_value: (Number(shares) || 0) * (Number(price) || 0),
      });
      const draft = normalizeStockData(safeStock);

      if (!draft.symbol) {
        setQuoteError("Couldn't save this asset — missing ticker symbol.");
        return;
      }

      const safeShares = Number(draft.shares) || 0;
      // Cost basis comes from the form fill — not draft.price (live mark after sanitize).
      const safeBuyPrice = Number(safeStock.buy_price || price) || 0;
      const saved = await createPortfolioItem({
        symbol: draft.symbol,
        shares: safeShares,
        buyPrice: safeBuyPrice,
        purchasedAt: purchaseIso || null,
      });

      const existing = holdings.find((h) => isPaperTicker(h, draft.symbol));
      const quote = normalizeToStockQuote(selectedQuote, draft.symbol);
      const liveMark =
        Number(
          quote && quote.c > 0
            ? quote.c
            : existing?.currentPrice && existing.currentPrice > 0
              ? existing.currentPrice
              : safeStock.current_price > 0
                ? safeStock.current_price
                : 0
        ) || 0;
      const markSafe = sanitizeSafeStock({
        ...safeStock,
        ...draft,
        symbol: saved?.symbol || draft.symbol,
        name:
          existing?.description ||
          selectedTicker.description ||
          selectedProfile?.name ||
          draft.name,
        shares: Number(saved?.shares ?? safeShares) || 0,
        buy_price: Number(saved?.buyPrice ?? safeBuyPrice) || 0,
        buyPrice: Number(saved?.buyPrice ?? safeBuyPrice) || 0,
        price: liveMark > 0 ? liveMark : safeBuyPrice,
        current_price: liveMark > 0 ? liveMark : safeBuyPrice,
        change: Number(quote?.d ?? existing?.dayChangeAbs ?? draft.change) || 0,
        change_percent: Number(quote?.dp ?? existing?.dayChangePct ?? draft.change_percent) || 0,
        high: Number(quote?.h ?? existing?.high ?? draft.high) || 0,
        low: Number(quote?.l ?? existing?.low ?? draft.low) || 0,
        c: Number(quote?.c) || 0,
        d: Number(quote?.d) || 0,
        dp: Number(quote?.dp) || 0,
        h: Number(quote?.h) || 0,
        l: Number(quote?.l) || 0,
        total_value:
          (Number(saved?.shares ?? safeShares) || 0) * (liveMark > 0 ? liveMark : safeBuyPrice),
      });
      const markData = normalizeStockData(markSafe);
      const buyPrice = Number(saved?.buyPrice ?? markSafe.buy_price ?? safeBuyPrice) || 0;
      const currentPrice =
        Number(markData.price > 0 ? markData.price : markSafe.current_price ?? buyPrice) || 0;

      // ONLY sanitized safeStock output enters React state / chart paths.
      // shares / buy_price / current_price / total_value are all finite before setState.
      const holding = sanitizeStockHolding({
        id: saved?.id || `lot-${Date.now()}`,
        kind: "stock",
        symbol: markData.symbol,
        description: markData.name || markData.symbol || "Unknown Stock",
        quantity: Number(markData.shares) || 0,
        avgCost: buyPrice,
        currentPrice,
        dayChangePct: markData.change_percent ?? 0,
        dayChangeAbs: markData.change ?? 0,
        open: toFiniteNumber(quote?.o ?? existing?.open ?? currentPrice, currentPrice),
        high: markData.high > 0 ? markData.high : currentPrice,
        low: markData.low > 0 ? markData.low : currentPrice,
        prevClose: toFiniteNumber(quote?.pc ?? existing?.prevClose ?? currentPrice, currentPrice),
        logo: selectedProfile?.logo ?? existing?.logo,
        domain: selectedProfile?.domain ?? extractDomain(selectedProfile?.weburl) ?? existing?.domain,
        marketCap: selectedProfile?.marketCapitalization ?? existing?.marketCap,
        instrumentType: selectedTicker.type || existing?.instrumentType,
        industry: selectedProfile?.finnhubIndustry ?? existing?.industry,
        dividendYield: quote?.dividendYield ?? existing?.dividendYield ?? null,
        purchasedAt: isoDateFromApi(saved?.purchasedAt) ?? purchaseIso ?? existing?.purchasedAt ?? null,
        account: "paper",
      });

      // Upsert keeps one paper row per ticker; still guard empty/undefined prev.
      setHoldings((prev) => upsertPaperHolding([...(prev || [])], holding));
      setSelectedHolding((prev) =>
        prev &&
        String(prev.symbol || "").toUpperCase() === holding.symbol.toUpperCase()
          ? sanitizeStockHolding({ ...prev, ...holding })
          : prev
      );
      markUpdated();
      resetManualForm();
      setJustAddedId(holding.id);
      clearPaperTickerIntent();
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
        const list = prev || [];
        const from = list.findIndex((item) => item?.id === dragId);
        const to = list.findIndex((item) => item?.id === overId);
        if (from < 0 || to < 0 || from === to) return list;
        if (from < to && clientY < mid) return list;
        if (from > to && clientY > mid) return list;
        return moveItemToIndex(list, dragId, to);
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

    const fromHandle = Boolean(target.closest("[data-drag-handle]"));
    // Touch: only the grip starts a drag so the asset list can scroll freely.
    if (e.pointerType === "touch" && !fromHandle) return;

    if (fromHandle) {
      e.preventDefault();
      startHoldingDrag(id, e.pointerId);
      return;
    }

    setPressingId(id);
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
      const list = prev || [];
      const index = list.findIndex((h) => h?.id === id);
      return moveItemToIndex(list, id, index + direction);
    });
  };

  const removeHolding = async (id: string) => {
    const target = holdings.find((h) => h.id === id);
    if (!target || removingId) return;

    if (target.kind === "broker") {
      setHoldings((prev) => (prev || []).filter((h) => h?.id !== id));
      if (selectedHolding?.id === id) setSelectedHolding(null);
      return;
    }

    setRemovingId(id);
    try {
      await deletePortfolioItem(id);
      setHoldings((prev) => (prev || []).filter((h) => h?.id !== id));
      if (selectedHolding?.id === id) setSelectedHolding(null);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Couldn't remove this asset");
    } finally {
      setRemovingId(null);
    }
  };

  const sellHolding = async (
    holding: StockHolding,
    shares: number,
    sellPrice: number
  ): Promise<{ remainingShares: number }> => {
    const result = await sellPortfolioItem(holding.id, { shares, sellPrice });
    if (result.deleted) {
      setHoldings((prev) => (prev || []).filter((h) => h?.id !== holding.id));
      if (selectedHolding?.id === holding.id) setSelectedHolding(null);
      return { remainingShares: 0 };
    }

    const remaining = Number(result?.item?.shares) || 0;
    const avgCost = Number(result?.item?.buyPrice) || 0;
    setHoldings((prev) =>
      (prev || []).map((h) =>
        h?.kind === "stock" && h.id === holding.id ? { ...h, quantity: remaining, avgCost } : h
      )
    );
    setSelectedHolding((prev) =>
      prev && prev.id === holding.id
        ? sanitizeStockHolding({ ...prev, quantity: remaining, avgCost })
        : prev
    );
    return { remainingShares: remaining };
  };

  // Strict render guard: never paint charts/tables until portfolio bootstrap finishes
  // (or we already have cached holdings to show).
  if (portfolioLoading && safeHoldings.length === 0) {
    return <LoadingSpinner label="Loading your portfolio…" />;
  }

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
            {privacySignedMoney(privacyMode, displayGainAbs)} ({formatSignedPct(displayGainPct)})
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
          {allocationExtra}
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
                  <BarChart3 size={11} aria-hidden="true" />
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
                {RANGE_OPTIONS.map((opt) => {
                  if (!opt) return null;
                  return (
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
                  );
                })}
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
              {chartData && chartData.length > 0 ? (
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
                    tickFormatter={(v: any) => {
                      const val = Number(v) || 0;
                      return benchmarkReady
                        ? formatSignedPct(val, Math.abs(val) < 10 ? 1 : 0)
                        : privacyAxis(privacyMode, formatAxisMoney(val));
                    }}
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
                    tickFormatter={(t: any) => chartData[Number(t ?? 0)]?.label ?? ""}
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
              ) : (
                <EmptyChartPlaceholder
                  title="Portfolio chart unavailable"
                  message="Chart data will appear once your portfolio finishes loading."
                />
              )}
            </div>
          </div>

          <AllocationRing slices={allocationSlices} privacyMode={privacyMode} />
          {allocationExtra}

          {/* Asset list — Midas style */}
          <div className="mt-5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                {hasHoldings ? <PortfolioOriginBadges holdings={holdings} className="flex-shrink-0" /> : null}
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
                    {(safeHoldings ?? []).length}
                  </span>
                  {holdingsExpanded ? (
                    <ChevronUp size={16} className="text-[#9CA3AF]" />
                  ) : (
                    <ChevronDown size={16} className="text-[#9CA3AF]" />
                  )}
                </button>
              </div>
              <div
                role="group"
                aria-label="Asset performance period"
                className="flex flex-shrink-0 rounded-full border border-[#1F2937] bg-[#0A0A0A] p-0.5"
              >
                {(["daily", "total"] as const).map((mode) => {
                  if (!mode) return null;
                  const active = assetsPerfMode === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      title={
                        mode === "daily"
                          ? "Today's gain/loss"
                          : "Total return vs. purchase price since your buy date"
                      }
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
                  ? "mt-2 max-h-[min(52vh,420px)] overflow-hidden opacity-100 md:max-h-[2000px]"
                  : "max-h-0 overflow-hidden opacity-0"
              }`}
            >
              <div
                ref={holdingsListRef}
                className={`matter-touch-scroll divide-y divide-[#1F2937] select-none overflow-y-auto overscroll-contain ${
                  draggingId ? "cursor-grabbing touch-none" : "touch-pan-y"
                }`}
                onPointerDown={handleHoldingsPointerDown}
                onPointerMove={handleHoldingsPointerMove}
                onPointerUp={handleHoldingsPointerEnd}
                onPointerCancel={handleHoldingsPointerEnd}
                onContextMenu={(e) => {
                  if (draggingIdRef.current || pendingDragRef.current) e.preventDefault();
                }}
              >
                {(safeHoldings ?? []).map((h = {} as any) => {
                  if (!h) return null;
                  const raw = h as any;
                  const highlight = h.id === justAddedId;
                  const price = Number(raw?.price ?? raw?.current_price ?? raw?.currentPrice) || 0;
                  const shares = Number(raw?.shares ?? raw?.quantity) || 0;
                  const buyPrice = Number(raw?.buy_price ?? raw?.buyPrice ?? raw?.avgCost) || 0;
                  const change = Number(raw?.change ?? raw?.change_percent ?? raw?.dayChangePct) || 0;
                  const quantity = h.kind === "stock" ? shares : 0;
                  const currentPrice = h.kind === "stock" ? price : 0;
                  const avgCost = h.kind === "stock" ? buyPrice : 0;
                  const prevClose = h.kind === "stock" ? Number(raw?.prevClose) || 0 : 0;
                  const dayChangeAbs = h.kind === "stock" ? Number(raw?.dayChangeAbs) || 0 : 0;
                  const dayChangePct = h.kind === "stock" ? change : 0;
                  const totalValue =
                    Number(raw?.total_value ?? raw?.totalValue ?? raw?.value ?? price * shares) ||
                    Number(holdingValue(h)) ||
                    0;
                  const value = h.kind === "stock" ? totalValue : Number(holdingValue(h)) || 0;
                  const isStock = h.kind === "stock";
                  let perfAbs: number | null = null;
                  let perfPct: number | null = null;
                  if (isStock) {
                    if (assetsPerfMode === "total") {
                      if (avgCost > 0) {
                        perfAbs = (currentPrice - avgCost) * quantity;
                        perfPct = ((currentPrice - avgCost) / avgCost) * 100;
                      }
                    } else if (prevClose > 0) {
                      perfAbs = (currentPrice - prevClose) * quantity;
                      perfPct = ((currentPrice - prevClose) / prevClose) * 100;
                    } else {
                      perfAbs = dayChangeAbs * quantity;
                      perfPct = dayChangePct;
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
                          if (isStock) setSelectedHolding(sanitizeStockHolding(h as StockHolding));
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
                                {h.description} · {privacyShares(privacyMode, quantity)}
                              </p>
                            </>
                          ) : (
                            <>
                              <p className="truncate text-sm font-bold text-white">{h.name}</p>
                              <p className="text-[11px] text-[#9CA3AF]">
                                {h.account === "verified" ? "Verified brokerage account" : "Paper cash account"}
                              </p>
                            </>
                          )}
                        </div>
                        {isStock ? (
                          <Sparkline
                            values={
                              getCachedSpark(h.symbol) ??
                              sparklineValues(h.symbol, currentPrice, dayChangePct)
                            }
                            width={56}
                            height={26}
                            color={dayColor}
                          />
                        ) : null}
                        <div className="flex-shrink-0 text-right">
                          <p className="text-sm font-bold tabular-nums text-white">
                            {privacyMoney(privacyMode, value)}
                          </p>
                          {isStock && (
                            <p className="text-[11px] font-bold tabular-nums" style={{ color: dayColor }}>
                              {perfAbs == null || perfPct == null
                                ? "—"
                                : `${privacySignedMoney(privacyMode, perfAbs)} (${formatSignedPct(perfPct, 2)})`}
                              {h.kind === "stock" &&
                              assetsPerfMode === "total" &&
                              h.purchasedAt ? (
                                <span className="font-semibold text-[#6B7280]">
                                  {" "}
                                  since {formatSessionDate(h.purchasedAt)}
                                </span>
                              ) : null}
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

      {typeof belowHoldings === "function"
        ? belowHoldings({ onAddHolding: openAddForHolding, onSellHolding: sellHolding })
        : belowHoldings}

      {modalOpen && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
          onClick={closeModal}
          role="presentation"
        >
          <div
            className="matter-pop matter-touch-scroll w-full max-w-md overflow-y-auto overscroll-contain rounded-2xl border border-[#1F1F1F] bg-[#0A0A0A] p-5 max-h-[min(88vh,720px)]"
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
                    {modalTab === "manual" ? "Add to Paper Account" : "Connect Broker"}
                  </h3>
                  <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
                    {modalTab === "manual"
                      ? "Manual lots are tagged Paper Account. Investment badges unlock only from API-verified brokerage data."
                      : "Verified Brokerage Portfolio requires an API-linked account. Partner links do not import holdings."}
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
                <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/8 p-3">
                  <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-emerald-300">
                    Connect with Plaid
                  </p>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-slate-300">
                    Open Plaid Link and import live sandbox balances and any investment holdings the
                    institution returns.
                  </p>
                  <PlaidConnectButton className="mt-3" />
                </div>
                <div className="rounded-xl border border-amber-500/25 bg-amber-500/8 px-3 py-2.5 text-[11px] leading-relaxed text-amber-100/90">
                  Partner links open the broker in a new tab. They do not import a Verified Brokerage
                  Portfolio, so investment achievement badges stay locked until API sync is connected.
                </div>
                {BROKER_PLATFORMS.map((platform) => {
                  if (!platform) return null;
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
                <div className="flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/8 px-3 py-2.5">
                  <AccountKindBadge kind="paper" />
                  <p className="text-[11px] leading-relaxed text-amber-100/85">
                    This lot is saved to your Paper Account. Portfolio milestone and ticker badges
                    require a verified brokerage import.
                  </p>
                </div>
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
                          onChange={(e) => {
                            setSearchQuery(e.target.value);
                            setSearchError(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key !== "Enter") return;
                            e.preventDefault();
                            const pick = resolveSearchPick(searchQuery);
                            if (pick) void selectTicker(pick);
                          }}
                          placeholder="Search by ticker or company (e.g. AAPL, Tesla)"
                          autoComplete="off"
                          className="w-full bg-transparent text-xs font-semibold text-white outline-none placeholder:text-slate-600"
                        />
                      </div>

                      {searchResults.length > 0 && (
                        <div className="mt-1.5 max-h-52 overflow-y-auto rounded-xl border border-[#1F1F1F] bg-black/40">
                          {(searchResults ?? []).map((result = {} as any) => {
                            if (!result) return null;
                            const symbol = result.displaySymbol || result.symbol || "";
                            return (
                            <button
                              key={result.symbol || symbol}
                              type="button"
                              onClick={() => void selectTicker(result)}
                              className="flex w-full items-center justify-between gap-2 border-b border-[#1F1F1F]/60 px-3 py-2 text-left transition last:border-b-0 hover:bg-emerald-500/10"
                            >
                              <div className="flex min-w-0 items-center gap-2">
                                <StockLogo symbol={symbol} size={32} />
                                <span className="flex-shrink-0 rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-extrabold text-emerald-300">
                                  {symbol}
                                </span>
                                <span className="truncate text-[11px] text-slate-300">{result.description}</span>
                              </div>
                            </button>
                            );
                          })}
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
                            domain={selectedProfile?.domain ?? extractDomain(selectedProfile?.weburl)}
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
                      {historyLoading && !quoteLoading && (
                        <p className="text-[11px] text-slate-500">Looking up the close for that date…</p>
                      )}
                      {!quoteLoading && !historyLoading && historyMeta?.source === "live" && historyMeta.closePrice ? (
                        <p className="text-[11px] font-semibold text-emerald-300">
                          Live price: ${toFiniteNumber(historyMeta?.closePrice, 0).toFixed(2)}
                          {selectedQuote && (
                            <span
                              className={
                                toFiniteNumber(selectedQuote?.dp, 0) >= 0
                                  ? "text-emerald-300"
                                  : "text-rose-400"
                              }
                            >
                              {" "}
                              ({toFiniteNumber(selectedQuote?.dp, 0) >= 0 ? "+" : ""}
                              {toFiniteNumber(selectedQuote?.dp, 0).toFixed(2)}% today)
                            </span>
                          )}
                        </p>
                      ) : null}
                      {!quoteLoading && !historyLoading && historyMeta?.source === "history" && historyMeta.closePrice ? (
                        <p className="text-[11px] font-semibold text-emerald-300">
                          Close on {formatSessionDate(historyMeta.sessionDate)}: $
                          {toFiniteNumber(historyMeta?.closePrice, 0).toFixed(2)}
                          {historyMeta.sessionDate !== historyMeta.requestedDate ? (
                            <span className="font-medium text-slate-500">
                              {" "}
                              · nearest session (markets closed that day)
                            </span>
                          ) : null}
                        </p>
                      ) : null}
                      {!quoteLoading && !historyLoading && historyMeta?.source === "fallback" && historyMeta.closePrice ? (
                        <p className="text-[11px] font-semibold text-amber-300">
                          No close for {formatSessionDate(historyMeta.requestedDate)} (weekend, holiday, or data gap).
                          Using ${toFiniteNumber(historyMeta?.closePrice, 0).toFixed(2)} — enter your price per share if that isn&apos;t your fill.
                        </p>
                      ) : null}
                      {quoteError && <p className="mt-1 text-[11px] text-rose-400">{quoteError}</p>}
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
                      name="paper-trading-quantity-unique"
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      autoCorrect="off"
                      spellCheck={false}
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value.replace(/[^0-9.]/g, ""))}
                      placeholder="10"
                      className="mt-1 w-full rounded-xl border border-[#1F1F1F] bg-black/20 px-3 py-2 text-xs font-semibold text-white outline-none placeholder:text-slate-600 focus:border-emerald-500/50"
                    />
                  </div>
                  <div>
                    <label id="asset-date-label" htmlFor="asset-date" className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      Purchase Date
                    </label>
                    <div className="mt-1 flex items-center gap-2 rounded-xl border border-[#1F1F1F] bg-black/20 px-3 py-2 focus-within:border-emerald-500/50">
                      <input
                        id="asset-date"
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        placeholder="MM/DD/YYYY"
                        maxLength={10}
                        value={purchaseDate}
                        onChange={(e) => applyPurchaseDate(e.target.value)}
                        onBlur={() => {
                          const iso = parseToIsoDate(purchaseDate);
                          if (iso) setPurchaseDate(isoToUsDate(iso));
                        }}
                        className="w-full bg-transparent text-xs font-semibold tabular-nums text-white outline-none placeholder:text-slate-600"
                      />
                      <DarkCalendar
                        value={parseToIsoDate(purchaseDate) ?? ""}
                        min="1970-01-01"
                        max={todayISODate()}
                        labelledBy="asset-date-label"
                        onChange={(iso) => applyPurchaseDate(isoToUsDate(iso))}
                      />
                    </div>
                    <p className="mt-1 text-[10px] text-slate-500">Type MM/DD/YYYY or pick from the calendar.</p>
                  </div>
                </div>

                <div>
                  <label htmlFor="asset-price" className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    Price Per Share
                  </label>
                  <div className="mt-1 flex items-center gap-2 rounded-xl border border-[#1F1F1F] bg-black/20 px-3 py-2 focus-within:border-emerald-500/50">
                    <Banknote size={14} className="flex-shrink-0 text-slate-500" />
                    <input
                      id="asset-price"
                      type="text"
                      inputMode="decimal"
                      value={purchasePrice}
                      onChange={(e) => {
                        priceTouchedRef.current = true;
                        setPurchasePrice(e.target.value.replace(/[^0-9.]/g, ""));
                      }}
                      placeholder="185.50"
                      className="w-full bg-transparent text-xs font-semibold text-white outline-none placeholder:text-slate-600"
                    />
                  </div>
                  <p className="mt-1 text-[10px] text-slate-500">
                    Auto-filled from the close on your purchase date. Override with your average fill if needed.
                  </p>
                </div>

                {selectedTicker && manualValue > 0 && (
                  <div className="space-y-0.5 rounded-xl border border-[#1F1F1F] bg-black/30 px-3 py-2.5">
                    <p className="text-[11px] font-semibold text-white">
                      Cost basis: {privacyMoney(privacyMode, manualValue)}
                      <span className="font-medium text-slate-500">
                        {" "}
                        · {privacyShares(privacyMode, parsedQuantity)} × ${formatMoney(parsedPrice)}
                      </span>
                    </p>
                    {previewMarketValue > 0 && previewReturnAbs != null && previewReturnPct != null && (
                      <>
                        <p className="text-[11px] text-slate-400">
                          Market value: {privacyMoney(privacyMode, previewMarketValue)}
                        </p>
                        <p
                          className={`text-[11px] font-bold ${
                            previewReturnPct > 0
                              ? "text-emerald-300"
                              : previewReturnPct < 0
                                ? "text-rose-400"
                                : "text-slate-400"
                          }`}
                        >
                          Total return: {privacySignedMoney(privacyMode, previewReturnAbs)} (
                          {(Number(previewReturnPct) || 0) > 0 ? "+" : ""}
                          {(Number(previewReturnPct) || 0).toFixed(2)}%)
                          {purchaseDate && parseToIsoDate(purchaseDate)
                            ? ` since ${formatSessionDate(parseToIsoDate(purchaseDate)!)}`
                            : ""}
                        </p>
                      </>
                    )}
                  </div>
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
                  {savingAsset ? "Saving…" : "Add to Paper Account"}
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
          onAddMore={openAddForHolding}
          onSell={
            selectedHolding.quantity > 0 && selectedHolding.account !== "verified"
              ? sellHolding
              : undefined
          }
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
