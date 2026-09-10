import { classifyHolding } from "./allocation";
import { isEtfAsset } from "./etfIcons";
import type { Holding, StockHolding } from "../components/InvestmentPortfolioCard";

export type HealthTone = "good" | "moderate" | "elevated" | "high";

export type PortfolioHealthReport = {
  score: number;
  rating: string;
  tone: HealthTone;
  color: string;
  empty: boolean;
  diversification: {
    label: string;
    meter: number;
    detail: string;
  };
  volatility: {
    label: string;
    meter: number;
    beta: number;
    detail: string;
  };
  defensive: {
    label: string;
    meter: number;
    cushionPct: number;
    etfPct: number;
    dividendPct: number;
    detail: string;
  };
  insights: string[];
};

const TONE_META: Record<HealthTone, { rating: string; color: string }> = {
  good: { rating: "Good Risk Balance", color: "#10B981" },
  moderate: { rating: "Moderate Risk Balance", color: "#F59E0B" },
  elevated: { rating: "Elevated Risk", color: "#F97316" },
  high: { rating: "High Volatility", color: "#EF4444" },
};

/** Approximate equity betas vs the S&P 500 for common tickers. */
const TICKER_BETA: Record<string, number> = {
  SPY: 1.0,
  VOO: 1.0,
  IVV: 1.0,
  VTI: 1.0,
  ITOT: 1.0,
  SCHB: 1.0,
  SPTM: 1.0,
  QQQ: 1.18,
  QQQM: 1.18,
  XLK: 1.22,
  VGT: 1.25,
  SMH: 1.45,
  SOXX: 1.48,
  ARKK: 1.85,
  ARKW: 1.8,
  ARKG: 1.7,
  IWM: 1.18,
  DIA: 0.95,
  SCHD: 0.82,
  VIG: 0.85,
  VYM: 0.84,
  DVY: 0.86,
  DGRO: 0.88,
  JEPI: 0.62,
  JEPQ: 0.78,
  HDV: 0.72,
  NOBL: 0.86,
  SPYD: 0.9,
  BND: 0.18,
  AGG: 0.16,
  SCHZ: 0.17,
  TLT: 0.22,
  BIL: 0.02,
  SGOV: 0.02,
  SHV: 0.03,
  GLD: 0.12,
  IAU: 0.12,
  VNQ: 0.95,
  AAPL: 1.18,
  MSFT: 1.12,
  NVDA: 1.72,
  AMZN: 1.28,
  GOOGL: 1.15,
  GOOG: 1.15,
  META: 1.32,
  TSLA: 1.92,
  AMD: 1.68,
  AVGO: 1.35,
  PLTR: 1.62,
  NFLX: 1.22,
  COIN: 2.15,
  MSTR: 2.4,
  SMCI: 1.95,
  GME: 1.8,
  SOFI: 1.75,
  NIO: 1.7,
  RIVN: 1.85,
  JNJ: 0.55,
  PG: 0.48,
  KO: 0.52,
  PEP: 0.55,
  XOM: 0.92,
  CVX: 0.88,
  JPM: 1.08,
  BRK: 0.82,
  UNH: 0.72,
  LLY: 0.68,
  IBM: 0.78,
};

const SPECULATIVE = new Set([
  "TSLA",
  "NVDA",
  "PLTR",
  "AMD",
  "COIN",
  "MARA",
  "ARKK",
  "ARKW",
  "ARKG",
  "SMCI",
  "MSTR",
  "GME",
  "AMC",
  "SOFI",
  "NIO",
  "RIVN",
  "HOOD",
  "UPST",
  "AI",
]);

const BROAD_INDEX = new Set(["SPY", "VOO", "IVV", "VTI", "ITOT", "SCHB", "SPTM", "VV"]);

const BUCKET_BETA: Record<string, number> = {
  Cash: 0.02,
  "Dividend ETFs": 0.8,
  ETFs: 1.0,
  "Tech/AI": 1.32,
  Energy: 1.12,
  Healthcare: 0.82,
  Financials: 1.08,
  Consumer: 0.92,
  Industrials: 1.06,
  Other: 1.1,
};

/** Sleeves that are diversified by construction — not a single-sector bet. */
const CORE_BUCKETS = new Set(["ETFs", "Dividend ETFs", "Cash"]);

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function holdingValue(h: Holding): number {
  return h.kind === "stock" ? Math.max(0, h.quantity * h.currentPrice) : Math.max(0, h.balance);
}

function isStock(h: Holding): h is StockHolding {
  return h.kind === "stock";
}

function bucketOf(h: Holding): string {
  if (h.kind === "broker") return classifyHolding({ kind: "broker" });
  return classifyHolding({
    kind: "stock",
    symbol: h.symbol,
    name: h.description,
    type: h.instrumentType,
    industry: h.industry,
  });
}

function isEtfHolding(h: StockHolding): boolean {
  return isEtfAsset(h.symbol, { name: h.description, type: h.instrumentType });
}

function paysDividend(h: StockHolding): boolean {
  if (bucketOf(h) === "Dividend ETFs") return true;
  const y = h.dividendYield;
  return y != null && Number.isFinite(y) && y >= 0.012;
}

function betaOf(h: Holding): number {
  if (h.kind === "broker") return 0.02;
  const symbol = h.symbol.trim().toUpperCase();
  if (TICKER_BETA[symbol] != null) return TICKER_BETA[symbol];
  const bucket = bucketOf(h);
  if (isEtfHolding(h) && bucket !== "Tech/AI") return BUCKET_BETA[bucket] ?? 1.0;
  return BUCKET_BETA[bucket] ?? 1.1;
}

function toneForScore(score: number): HealthTone {
  if (score >= 75) return "good";
  if (score >= 55) return "moderate";
  if (score >= 35) return "elevated";
  return "high";
}

function emptyReport(): PortfolioHealthReport {
  const tone: HealthTone = "moderate";
  return {
    score: 0,
    rating: "No holdings yet",
    tone,
    color: "#9CA3AF",
    empty: true,
    diversification: {
      label: "Needs holdings",
      meter: 0,
      detail: "Add stocks or ETFs to score sector mix",
    },
    volatility: {
      label: "— vs S&P 500",
      meter: 0,
      beta: 1,
      detail: "Beta appears once positions are on the book",
    },
    defensive: {
      label: "None",
      meter: 0,
      cushionPct: 0,
      etfPct: 0,
      dividendPct: 0,
      detail: "No SCHD / VIG / Oxy coverage yet",
    },
    insights: [
      "Add a broad index ETF such as VOO or VTI as a core sleeve before concentrating in single names.",
      "Pair growth tickers with a dividend ETF (SCHD, VIG) so the book has an income cushion.",
      "Keep cash as dry powder, then deploy it across at least three sectors to lift diversification.",
    ],
  };
}

export function analyzePortfolioHealth(holdings: Holding[], cashBalance = 0): PortfolioHealthReport {
  const cash = Math.max(0, cashBalance);
  const positions = holdings.filter((h) => holdingValue(h) > 0);
  const invested = positions.reduce((sum, h) => sum + holdingValue(h), 0) + cash;
  if (invested <= 0) return emptyReport();

  const stocks = positions.filter(isStock);
  const sectorWeights = new Map<string, number>();
  if (cash > 0) sectorWeights.set("Cash", cash);
  for (const h of positions) {
    const bucket = bucketOf(h);
    sectorWeights.set(bucket, (sectorWeights.get(bucket) ?? 0) + holdingValue(h));
  }

  let maxSector = "Other";
  let maxSectorValue = 0;
  let maxConcentrated = "Other";
  let maxConcentratedValue = 0;
  for (const [label, value] of sectorWeights) {
    if (value > maxSectorValue) {
      maxSector = label;
      maxSectorValue = value;
    }
    if (!CORE_BUCKETS.has(label) && value > maxConcentratedValue) {
      maxConcentrated = label;
      maxConcentratedValue = value;
    }
  }
  const maxSectorPct = (maxSectorValue / invested) * 100;
  const maxConcentratedPct = (maxConcentratedValue / invested) * 100;
  const sectorCount = [...sectorWeights.values()].filter((v) => v / invested >= 0.04).length;
  const concentratedHhi = [...sectorWeights.entries()].reduce((sum, [label, value]) => {
    if (CORE_BUCKETS.has(label)) return sum;
    const w = value / invested;
    return sum + w * w;
  }, 0);

  const rankedHoldings = [...positions].sort((a, b) => holdingValue(b) - holdingValue(a));
  const top = rankedHoldings[0];
  const topPct = top ? (holdingValue(top) / invested) * 100 : 0;
  const topLabel = top?.kind === "stock" ? top.symbol : top?.kind === "broker" ? top.name : "Cash";
  const topIsSingleStock = top?.kind === "stock" && !isEtfHolding(top);

  let diversificationMeter = clamp(100 - Math.max(0, maxConcentratedPct - 24) * 1.55, 18, 100);
  if (topIsSingleStock) diversificationMeter -= Math.max(0, topPct - 22) * 1.05;
  diversificationMeter += Math.min(14, (sectorCount - 1) * 4);
  diversificationMeter -= concentratedHhi * 70;
  diversificationMeter = clamp(Math.round(diversificationMeter), 4, 100);

  let diversificationLabel = "Balanced";
  if (stocks.length <= 1 && cash / invested < 0.4 && topIsSingleStock) diversificationLabel = "Concentrated";
  else if (maxSector === "Cash" && maxSectorPct >= 55) diversificationLabel = "Cash Heavy";
  else if (maxConcentrated === "Tech/AI" && maxConcentratedPct >= 42) diversificationLabel = "Tech Heavy";
  else if (maxConcentratedPct >= 48) diversificationLabel = `${maxConcentrated} Heavy`;
  else if (topIsSingleStock && topPct >= 40) diversificationLabel = "Name Heavy";
  else if (sectorCount >= 3 || maxConcentratedPct < 40) diversificationLabel = "Balanced";

  const weightedBeta =
    (positions.reduce((sum, h) => sum + holdingValue(h) * betaOf(h), 0) + cash * 0.02) / invested;
  const weightedAbsDay =
    stocks.reduce((sum, h) => sum + holdingValue(h) * Math.abs(h.dayChangePct || 0), 0) / invested;
  // Typical S&P 500 session is ~0.7% absolute; scale live chop into beta.
  const liveBump = weightedAbsDay > 1.6 ? clamp((weightedAbsDay - 1.6) * 0.12, 0, 0.35) : 0;
  const beta = round1(clamp(weightedBeta + liveBump, 0.02, 2.8));

  const volatilityMeter = clamp(Math.round((beta / 2) * 100), 4, 100);
  let volatilityLabel = `${beta.toFixed(2)}× S&P 500`;
  if (beta < 0.85) volatilityLabel = `${beta.toFixed(2)}× · Defensive`;
  else if (beta <= 1.15) volatilityLabel = `${beta.toFixed(2)}× · In line`;
  else if (beta <= 1.4) volatilityLabel = `${beta.toFixed(2)}× · Above market`;
  else volatilityLabel = `${beta.toFixed(2)}× · High beta`;

  const etfValue = stocks.filter(isEtfHolding).reduce((sum, h) => sum + holdingValue(h), 0);
  const dividendValue = stocks.filter(paysDividend).reduce((sum, h) => sum + holdingValue(h), 0);
  const brokerCash = positions.filter((h) => h.kind === "broker").reduce((sum, h) => sum + holdingValue(h), 0);
  const cashValue = brokerCash + cash;
  const defensiveSet = new Set<string>();
  let cushionValue = cashValue;
  for (const h of stocks) {
    if (isEtfHolding(h) || paysDividend(h)) {
      if (defensiveSet.has(h.id)) continue;
      defensiveSet.add(h.id);
      cushionValue += holdingValue(h);
    }
  }
  const etfPct = (etfValue / invested) * 100;
  const dividendPct = (dividendValue / invested) * 100;
  const singleStockValue = stocks.filter((h) => !isEtfHolding(h)).reduce((sum, h) => sum + holdingValue(h), 0);
  const singleStockPct = (singleStockValue / invested) * 100;
  const cushionPct = (cushionValue / invested) * 100;
  const etfVsStockScore = clamp(100 - singleStockPct * 0.85 + etfPct * 0.35, 8, 100);
  const defensiveMeter = clamp(Math.round(cushionPct * 1.15 * 0.55 + etfVsStockScore * 0.45), 4, 100);

  let defensiveLabel = "Thin";
  if (cushionPct >= 58) defensiveLabel = "Strong";
  else if (cushionPct >= 38) defensiveLabel = "Adequate";
  else if (cushionPct >= 20) defensiveLabel = "Building";

  const volatilityScore = clamp(100 - Math.max(0, beta - 0.92) * 78, 6, 100);
  const etfRatioScore = clamp(etfPct * 1.35 + (100 - singleStockPct) * 0.25, 4, 100);
  const score = clamp(
    Math.round(diversificationMeter * 0.4 + volatilityScore * 0.35 + etfRatioScore * 0.25),
    1,
    99
  );
  const tone = toneForScore(score);
  const meta = TONE_META[tone];

  const insights = buildInsights({
    stocks,
    invested,
    maxSector: maxConcentratedValue > 0 ? maxConcentrated : maxSector,
    maxSectorPct: maxConcentratedValue > 0 ? maxConcentratedPct : maxSectorPct,
    top,
    topLabel,
    topPct,
    topIsSingleStock,
    beta,
    etfPct,
    dividendPct,
    cushionPct,
    cashValue,
    singleStockPct,
    diversificationLabel,
    sectorCount,
  });

  return {
    score,
    rating: meta.rating,
    tone,
    color: meta.color,
    empty: false,
    diversification: {
      label: diversificationLabel,
      meter: diversificationMeter,
      detail:
        maxConcentratedValue > 0
          ? `${maxConcentrated} ${maxConcentratedPct.toFixed(0)}% · ${sectorCount} sleeve${sectorCount === 1 ? "" : "s"}`
          : `Core mix ${maxSectorPct.toFixed(0)}% · ${sectorCount} sleeve${sectorCount === 1 ? "" : "s"}`,
    },
    volatility: {
      label: volatilityLabel,
      meter: volatilityMeter,
      beta,
      detail: `Estimated beta vs the S&P 500`,
    },
    defensive: {
      label: defensiveLabel,
      meter: defensiveMeter,
      cushionPct,
      etfPct,
      dividendPct,
      detail: `${etfPct.toFixed(0)}% ETFs · ${dividendPct.toFixed(0)}% SCHD/VIG/Oxy coverage`,
    },
    insights,
  };
}

function buildInsights(ctx: {
  stocks: StockHolding[];
  invested: number;
  maxSector: string;
  maxSectorPct: number;
  top: Holding | undefined;
  topLabel: string;
  topPct: number;
  topIsSingleStock: boolean;
  beta: number;
  etfPct: number;
  dividendPct: number;
  cushionPct: number;
  cashValue: number;
  singleStockPct: number;
  diversificationLabel: string;
  sectorCount: number;
}): string[] {
  const {
    stocks,
    invested,
    maxSector,
    maxSectorPct,
    top,
    topLabel,
    topPct,
    topIsSingleStock,
    beta,
    etfPct,
    dividendPct,
    cushionPct,
    cashValue,
    singleStockPct,
    diversificationLabel,
    sectorCount,
  } = ctx;

  const ranked = [...stocks].sort((a, b) => holdingValue(b) - holdingValue(a));
  const growthNames = ranked.filter((h) => SPECULATIVE.has(h.symbol.toUpperCase()) || bucketOf(h) === "Tech/AI");
  const growthValue = growthNames.reduce((sum, h) => sum + holdingValue(h), 0);
  const growthPct = (growthValue / invested) * 100;
  const growthTickers = growthNames.slice(0, 3).map((h) => h.symbol).join(", ");
  const hasIndexCore = stocks.some((h) => BROAD_INDEX.has(h.symbol.toUpperCase()));
  const cashPct = (cashValue / invested) * 100;

  const items: { priority: number; text: string }[] = [];

  if (maxSector === "Tech/AI" && maxSectorPct >= 42) {
    items.push({
      priority: 95,
      text: `Tech/AI is ${maxSectorPct.toFixed(0)}% of the book${growthTickers ? ` (${growthTickers})` : ""} — that is a growth bet, not a baseline index holding. A VOO or SPY sleeve would cut sector concentration.`,
    });
  } else if (maxSectorPct >= 50 && !CORE_BUCKETS.has(maxSector)) {
    items.push({
      priority: 90,
      text: `${maxSector} is ${maxSectorPct.toFixed(0)}% of assets. Spreading into a second and third sector would lift the diversification meter out of “${diversificationLabel}”.`,
    });
  }

  if (top && topIsSingleStock && topPct >= 28) {
    items.push({
      priority: 88,
      text: `${topLabel} is ${topPct.toFixed(0)}% of the portfolio — idiosyncratic risk is high if that name gaps down. Cap any single stock closer to 15–20%.`,
    });
  }

  if (beta >= 1.25) {
    items.push({
      priority: 86,
      text: `Volatility beta is ${beta.toFixed(2)}× the S&P 500, so a 10% index drop could mean ~${(beta * 10).toFixed(0)}% here. Adding SCHD, a bond ETF, or cash would lower drawdowns.`,
    });
  } else if (beta <= 0.7 && cashPct < 50) {
    items.push({
      priority: 40,
      text: `Beta is a muted ${beta.toFixed(2)}× vs the S&P 500. The book is defensive; a modest broad-market ETF would participate if equities grind higher.`,
    });
  }

  if (etfPct < 25 && singleStockPct >= 50) {
    items.push({
      priority: 84,
      text: `Only ${etfPct.toFixed(0)}% sits in ETFs versus ${singleStockPct.toFixed(0)}% in single stocks. A core index sleeve is the fastest way to stabilize beta versus the S&P 500.`,
    });
  } else if (!hasIndexCore && stocks.length > 0 && etfPct < 40) {
    items.push({
      priority: 70,
      text: `There is no broad S&P 500 / total-market ETF (VOO, SPY, VTI) on the book. That baseline holding is what Mater AI uses as the risk anchor.`,
    });
  }

  if (cushionPct < 28 || dividendPct < 8) {
    items.push({
      priority: 80,
      text: `Defensive cushion is ${cushionPct.toFixed(0)}% (${dividendPct.toFixed(0)}% dividend coverage). A dividend ETF such as SCHD or VIG would add income ballast without adding much beta.`,
    });
  }

  if (growthPct >= 35 && growthTickers) {
    items.push({
      priority: 78,
      text: `${growthTickers} look like speculative growth versus a baseline index. Keep the high-beta sleeve, but fund it from a diversified core rather than letting it become the core.`,
    });
  }

  if (cashPct >= 45) {
    items.push({
      priority: 72,
      text: `Cash is ${cashPct.toFixed(0)}% — excellent ballast, but idle cash loses to inflation. Deploy a slice into a low-cost index ETF when you are ready to take market risk.`,
    });
  }

  if (etfPct >= 30 && beta <= 1.15 && maxSectorPct < 45) {
    items.push({
      priority: 30,
      text: `Allocation looks balanced across ${sectorCount} sleeve${sectorCount === 1 ? "" : "s"} with an ETF core and beta near 1× the S&P 500. Rebalance if a single stock drifts above ~20% of the book.`,
    });
  }

  if (cushionPct >= 40 && dividendPct >= 8) {
    items.push({
      priority: 27,
      text: `Defensive cushion is ${cushionPct.toFixed(0)}% with ${dividendPct.toFixed(0)}% dividend coverage — enough ballast if growth names sell off.`,
    });
  }

  if (hasIndexCore && etfPct >= 40) {
    items.push({
      priority: 25,
      text: `A broad index sleeve is already on the book (${etfPct.toFixed(0)}% ETFs). That is the right baseline — keep satellite growth names smaller than the core.`,
    });
  }

  if (items.length < 2 && stocks.length > 0) {
    items.push({
      priority: 20,
      text: `Holdings span ${sectorCount} sector sleeve${sectorCount === 1 ? "" : "s"} with ${etfPct.toFixed(0)}% in ETFs. Keep adding uncorrelated names rather than doubling down on the current leaders.`,
    });
  }

  const unique = items
    .sort((a, b) => b.priority - a.priority)
    .filter((item, i, arr) => arr.findIndex((x) => x.text === item.text) === i);

  return unique.slice(0, 3).map((item) => item.text);
}
