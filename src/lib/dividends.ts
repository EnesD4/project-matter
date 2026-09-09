export type DividendFrequency = "monthly" | "quarterly" | "semiannual" | "annual" | "unknown";

export type DividendDetails = {
  symbol: string;
  dividendYield: number | null;
  dividendRate: number | null;
  trailingAnnualDividendRate: number | null;
  trailingAnnualDividendYield: number | null;
  exDividendDate: string | null;
  dividendDate: string | null;
  lastDividendAmount: number | null;
  frequency: DividendFrequency;
  paymentsPerYear: number;
  nextExDividendDate: string | null;
  nextPaymentDate: string | null;
  estimatedDividendPerShare: number | null;
  status: "confirmed" | "estimated";
};

export type DividendPosition = {
  symbol: string;
  name: string;
  shares: number;
  price: number;
  logo?: string;
  domain?: string;
};

export type UpcomingPayout = {
  id: string;
  symbol: string;
  name: string;
  logo?: string;
  domain?: string;
  date: string;
  dateKind: "payment" | "ex-dividend";
  amount: number;
  shares: number;
  dividendPerShare: number;
  status: "confirmed" | "estimated";
  frequency: DividendFrequency;
};

const FREQUENCY_LABEL: Record<DividendFrequency, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  semiannual: "Semiannual",
  annual: "Annual",
  unknown: "Variable",
};

export function frequencyLabel(frequency: DividendFrequency): string {
  return FREQUENCY_LABEL[frequency] || "Variable";
}

export function annualDividendIncome(position: DividendPosition, meta: DividendDetails | undefined): number {
  if (!meta) return 0;
  const rate =
    meta.dividendRate ??
    meta.trailingAnnualDividendRate ??
    (meta.estimatedDividendPerShare && meta.paymentsPerYear
      ? meta.estimatedDividendPerShare * meta.paymentsPerYear
      : null);
  if (rate != null && rate > 0) return position.shares * rate;
  if (meta.dividendYield != null && meta.dividendYield > 0 && position.price > 0) {
    return position.shares * position.price * meta.dividendYield;
  }
  return 0;
}

function addMonthsIso(isoDate: string, months: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return isoDate;
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCMonth(date.getUTCMonth() + months);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function buildUpcomingPayouts(
  positions: DividendPosition[],
  metaBySymbol: Record<string, DividendDetails>,
  horizonMonths = 12
): UpcomingPayout[] {
  const today = todayIso();
  const horizon = addMonthsIso(today, horizonMonths);
  const payouts: UpcomingPayout[] = [];

  for (const position of positions) {
    const meta = metaBySymbol[position.symbol];
    if (!meta) continue;
    const perShare =
      meta.estimatedDividendPerShare ??
      (meta.dividendRate && meta.paymentsPerYear > 0 ? meta.dividendRate / meta.paymentsPerYear : null);
    if (perShare == null || perShare <= 0 || position.shares <= 0) continue;

    const dateKind: UpcomingPayout["dateKind"] = meta.nextPaymentDate ? "payment" : "ex-dividend";
    const startDate = meta.nextPaymentDate || meta.nextExDividendDate;
    if (!startDate) continue;

    const perYear = Math.max(1, meta.paymentsPerYear || 4);
    const stepMonths = Math.max(1, Math.round(12 / perYear));
    const occurrences = Math.max(1, Math.round(horizonMonths / stepMonths));

    for (let i = 0; i < occurrences; i++) {
      const date = i === 0 ? startDate : addMonthsIso(startDate, i * stepMonths);
      if (date < today || date > horizon) continue;
      payouts.push({
        id: `${position.symbol}-${date}-${i}`,
        symbol: position.symbol,
        name: position.name,
        logo: position.logo,
        domain: position.domain,
        date,
        dateKind,
        amount: position.shares * perShare,
        shares: position.shares,
        dividendPerShare: perShare,
        status: i === 0 ? meta.status : "estimated",
        frequency: meta.frequency,
      });
    }
  }

  return payouts.sort((a, b) => a.date.localeCompare(b.date) || a.symbol.localeCompare(b.symbol));
}

export function formatPayoutDate(isoDate: string): string {
  const parsed = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatMonthHeading(isoDate: string): string {
  const parsed = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return parsed.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}
