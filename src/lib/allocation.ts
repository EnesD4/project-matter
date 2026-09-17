import { isEtfAsset } from "./etfIcons";

export type AllocationHolding = {
  id: string;
  label: string;
  detail?: string;
  value: number;
  pct: number;
};

export type AllocationSlice = {
  key: string;
  label: string;
  value: number;
  color: string;
  pct: number;
  holdings: AllocationHolding[];
};

export type AllocationItem = {
  bucket: string;
  value: number;
  holdingId?: string;
  holdingLabel?: string;
  holdingDetail?: string;
};

export const OTHER_BUCKET = "Other";
export const OTHER_COLOR = "#6B7280";
export const TOP_ALLOCATION_SLICES = 4;

/** Matte dark, high-contrast palette for allocation slices. "Other" is always muted gray. */
export const ALLOCATION_PALETTE = [
  "#10B981", // Emerald Green
  "#06B6D4", // Electric Teal
  "#6366F1", // Deep Indigo/Blue
  "#F59E0B", // Amber/Gold
  "#8B5CF6", // Violet/Purple
] as const;

export const DIVIDEND_ETFS = new Set([
  "SCHD",
  "VIG",
  "VYM",
  "DVY",
  "DGRO",
  "SDY",
  "JEPI",
  "JEPQ",
  "SPYD",
  "HDV",
  "NOBL",
  "VIGI",
  "IDV",
  "DVYE",
  "SCHY",
  "DHS",
]);

/** True for known dividend-focused ETF tickers used across portfolio / calendar UI. */
export function isDividendEtf(symbol: string | null | undefined): boolean {
  const ticker = String(symbol || "")
    .trim()
    .toUpperCase();
  return Boolean(ticker) && DIVIDEND_ETFS.has(ticker);
}

const TECH_ETFS = new Set([
  "QQQ",
  "QQQM",
  "XLK",
  "VGT",
  "SMH",
  "SOXX",
  "ARKK",
  "ARKW",
  "WCLD",
  "IGV",
  "FTEC",
  "IYW",
  "BOTZ",
  "ROBO",
  "AIQ",
  "IRBO",
]);

const ENERGY_ETFS = new Set(["XLE", "VDE", "IYE", "XOP", "OIH", "AMLP", "XES", "IEZ", "FCG", "IXC"]);

const TECH_TICKERS = new Set([
  "AAPL",
  "MSFT",
  "NVDA",
  "GOOGL",
  "GOOG",
  "META",
  "AMZN",
  "AMD",
  "AVGO",
  "TSM",
  "CRM",
  "ORCL",
  "INTC",
  "QCOM",
  "ADBE",
  "CSCO",
  "NOW",
  "SNOW",
  "PLTR",
  "TSLA",
  "NFLX",
  "INTU",
  "AMAT",
  "MU",
  "PANW",
  "SNPS",
  "KLAC",
  "LRCX",
  "ADI",
  "TXN",
  "IBM",
  "SHOP",
  "UBER",
  "ABNB",
]);

const ENERGY_TICKERS = new Set([
  "XOM",
  "CVX",
  "COP",
  "SLB",
  "EOG",
  "MPC",
  "PSX",
  "OXY",
  "WMB",
  "KMI",
  "HES",
  "VLO",
  "HAL",
  "BKR",
  "DVN",
  "FANG",
]);

const BUCKET_COLORS: Record<string, string> = {
  "Tech/AI": ALLOCATION_PALETTE[0],
  "Dividend ETFs": ALLOCATION_PALETTE[1],
  ETFs: ALLOCATION_PALETTE[2],
  Energy: ALLOCATION_PALETTE[3],
  Healthcare: ALLOCATION_PALETTE[4],
  Financials: ALLOCATION_PALETTE[0],
  Consumer: ALLOCATION_PALETTE[1],
  Industrials: ALLOCATION_PALETTE[2],
  Cash: ALLOCATION_PALETTE[3],
  [OTHER_BUCKET]: OTHER_COLOR,
};

function industryBucket(industry?: string): string | null {
  if (!industry) return null;
  const s = industry.toLowerCase();
  if (/semi|software|internet|tech|electronic|computer|telecom|media|communication|\bai\b|chip|information/.test(s)) {
    return "Tech/AI";
  }
  if (/oil|gas|energy|coal|renewable|solar|pipeline|petroleum/.test(s)) return "Energy";
  if (/health|pharma|biotech|drug|medical|hospital|life science/.test(s)) return "Healthcare";
  if (/bank|financ|insur|capital|credit|asset manage|broker/.test(s)) return "Financials";
  if (/retail|consumer|food|beverage|apparel|restaurant|auto|staple|discretionary/.test(s)) {
    return "Consumer";
  }
  if (/industrial|aerospace|defense|machinery|manufactur|transport|airline/.test(s)) {
    return "Industrials";
  }
  return null;
}

export function classifyHolding(opts: {
  kind: "stock" | "broker" | "cash";
  symbol?: string;
  name?: string;
  type?: string;
  industry?: string;
}): string {
  if (opts.kind === "broker" || opts.kind === "cash") return "Cash";
  const symbol = (opts.symbol ?? "").trim().toUpperCase();
  if (DIVIDEND_ETFS.has(symbol)) return "Dividend ETFs";
  if (TECH_ETFS.has(symbol) || TECH_TICKERS.has(symbol)) return "Tech/AI";
  if (ENERGY_ETFS.has(symbol) || ENERGY_TICKERS.has(symbol)) return "Energy";
  const fromIndustry = industryBucket(opts.industry);
  if (fromIndustry) return fromIndustry;
  if (isEtfAsset(symbol, { name: opts.name, type: opts.type })) return "ETFs";
  return "Other";
}

export function colorForBucket(label: string, index: number): string {
  if (label === OTHER_BUCKET) return OTHER_COLOR;
  return BUCKET_COLORS[label] ?? ALLOCATION_PALETTE[index % ALLOCATION_PALETTE.length];
}

function holdingIdFor(item: AllocationItem, index: number): string {
  return item.holdingId || `${item.bucket}:${item.holdingLabel ?? "holding"}:${index}`;
}

export function buildAllocationSlices(items: AllocationItem[]): AllocationSlice[] {
  const totals = new Map<string, number>();
  const members = new Map<string, AllocationItem[]>();

  items.forEach((item, index) => {
    if (!(item.value > 0)) return;
    totals.set(item.bucket, (totals.get(item.bucket) ?? 0) + item.value);
    const list = members.get(item.bucket) ?? [];
    list.push({ ...item, holdingId: holdingIdFor(item, index) });
    members.set(item.bucket, list);
  });

  const grand = [...totals.values()].reduce((sum, v) => sum + v, 0);
  if (grand <= 0) return [];

  let paletteIndex = 0;
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => {
      const isOther = label === OTHER_BUCKET;
      const color = isOther ? OTHER_COLOR : ALLOCATION_PALETTE[paletteIndex++ % ALLOCATION_PALETTE.length];
      const holdings = (members.get(label) ?? [])
        .slice()
        .sort((a, b) => b.value - a.value)
        .map((item) => ({
          id: item.holdingId || label,
          label: item.holdingLabel || label,
          detail: item.holdingDetail,
          value: item.value,
          pct: grand > 0 ? (item.value / grand) * 100 : 0,
        }));

      return {
        key: label,
        label,
        value,
        color,
        pct: (value / grand) * 100,
        holdings,
      };
    });
}

/** Keep the top N slices by weight and fold the rest into a single "Other" slice. */
export function collapseToTopN(
  slices: AllocationSlice[],
  n = TOP_ALLOCATION_SLICES
): AllocationSlice[] {
  if (slices.length <= n) return slices;

  const grand = slices.reduce((sum, s) => sum + s.value, 0);
  const head = slices.slice(0, n);
  const tail = slices.slice(n);
  const tailValue = tail.reduce((sum, s) => sum + s.value, 0);
  const tailHoldings = tail.flatMap((s) => s.holdings);
  const tailPct = grand > 0 ? (tailValue / grand) * 100 : 0;

  const otherIndex = head.findIndex((s) => s.key === OTHER_BUCKET || s.label === OTHER_BUCKET);
  if (otherIndex >= 0) {
    const existing = head[otherIndex];
    const mergedValue = existing.value + tailValue;
    const merged: AllocationSlice = {
      ...existing,
      value: mergedValue,
      pct: grand > 0 ? (mergedValue / grand) * 100 : 0,
      color: OTHER_COLOR,
      holdings: [...existing.holdings, ...tailHoldings],
    };
    return head.map((slice, i) => (i === otherIndex ? merged : slice));
  }

  return [
    ...head,
    {
      key: OTHER_BUCKET,
      label: OTHER_BUCKET,
      value: tailValue,
      pct: tailPct,
      color: OTHER_COLOR,
      holdings: tailHoldings,
    },
  ];
}
